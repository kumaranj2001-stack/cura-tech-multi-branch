import http from "node:http";
import { parseInvoiceDocument } from "./intelligentParser.mjs";
import { calculateBillingTotals } from "./billingCalculator.mjs";
import { filterMedicines } from "./inventoryFilter.mjs";
import { validateMedicinePayload, createMedicine, updateMedicine, deleteMedicine, updateMedicineMinStock, isAuthorizedForMinStock } from "./medicineHandler.mjs";
import { listApprovedGrns, updateApprovedGrn, deleteApprovedGrn, isDeveloperRole } from "./approvedGrnHandler.mjs";
import { listDoctors, createDoctor, updateDoctor, deleteDoctor } from "./doctorHandler.mjs";
import { listUsers, createUser, updateUser, deleteUser, validateUserPayload } from "./userHandler.mjs";
import { db, COLLECTIONS, firebaseConfig } from "./firebase.mjs";
import { collection, doc, getDoc, getDocs, setDoc, deleteDoc } from "firebase/firestore";

const PORT = process.env.PORT || 3001;

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, x-user-role");
}

function sendJson(res, statusCode, data) {
  setCorsHeaders(res);
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

let currentStaffPlan = 1;
let customStaffPlanLimits = { superadmin: 1, admin: 2, staff: 5 };

const server = http.createServer(async (req, res) => {
  setCorsHeaders(res);

  // Preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  // Health check
  if (req.method === "GET" && (url.pathname === "/api/health" || url.pathname === "/")) {
    return sendJson(res, 200, {
      status: "ok",
      service: "Guru Pharma GRN Document Parsing Backend",
      version: "1.0.0",
      firebase: {
        projectId: firebaseConfig.projectId,
        authDomain: firebaseConfig.authDomain,
        storageBucket: firebaseConfig.storageBucket,
        status: "connected",
      },
      timestamp: new Date().toISOString(),
    });
  }

  // Live Firebase connection status
  if (req.method === "GET" && url.pathname === "/api/firebase/status") {
    try {
      const metaSnap = await getDoc(doc(db, COLLECTIONS.meta, "app"));
      return sendJson(res, 200, {
        success: true,
        projectId: firebaseConfig.projectId,
        connected: true,
        metaExists: metaSnap.exists(),
        data: metaSnap.exists() ? metaSnap.data() : null,
      });
    } catch (err) {
      return sendJson(res, 500, {
        success: false,
        projectId: firebaseConfig.projectId,
        connected: false,
        error: err.message,
      });
    }
  }

  // Parse invoice endpoint
  if (req.method === "POST" && url.pathname === "/api/parse-invoice") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      // Safeguard against gigantic payloads (> 30MB)
      if (body.length > 30 * 1024 * 1024) {
        req.destroy();
      }
    });

    req.on("end", async () => {
      try {
        if (!body) {
          return sendJson(res, 400, { success: false, error: "Empty request body" });
        }

        const payload = JSON.parse(body);
        const {
          fileData,
          fileName,
          mimeType,
          existingMedicines = [],
          existingSuppliers = [],
          apiKey,
        } = payload;

        if (!fileData) {
          return sendJson(res, 400, { success: false, error: "Missing fileData (base64 string expected)" });
        }

        const cleanBase64 = fileData.includes(",") ? fileData.split(",")[1] : fileData;
        const fileBuffer = Buffer.from(cleanBase64, "base64");

        const result = await parseInvoiceDocument({
          fileBuffer,
          fileName: fileName || "invoice.pdf",
          mimeType: mimeType || "application/pdf",
          existingMedicines,
          existingSuppliers,
          apiKey,
        });

        return sendJson(res, 200, result);
      } catch (err) {
        console.error("[Backend Server Error]", err);
        return sendJson(res, 500, {
          success: false,
          error: err.message || "Failed to process document",
        });
      }
    });
    return;
  }

  // Staff plan API endpoints
  if (req.method === "GET" && url.pathname === "/api/staff-plan") {
    return sendJson(res, 200, {
      success: true,
      staffPlan: currentStaffPlan,
      customStaffPlanLimits,
      options: [
        { tier: 1, label: "Option 1 — One admin, two staff", limits: { superadmin: 0, admin: 1, staff: 2 } },
        { tier: 2, label: "Option 2 — Two admins, three staff", limits: { superadmin: 0, admin: 2, staff: 3 } },
        { tier: 3, label: "Option 3 — Two admins, four staff", limits: { superadmin: 0, admin: 2, staff: 4 } },
        { tier: 4, label: "Option 4 — Full roster", limits: { superadmin: 1, admin: 4, staff: "unlimited" } },
        { tier: 5, label: "Option 5 — Fully Customizable", limits: customStaffPlanLimits },
      ],
    });
  }

  if (req.method === "POST" && url.pathname === "/api/staff-plan") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) req.destroy();
    });

    req.on("end", () => {
      try {
        if (!body) return sendJson(res, 400, { success: false, error: "Empty request body" });
        const payload = JSON.parse(body);
        const { staffPlan, customLimits } = payload;

        if (staffPlan !== undefined) {
          const tier = Number(staffPlan);
          if (![1, 2, 3, 4, 5].includes(tier)) {
            return sendJson(res, 400, { success: false, error: "Invalid staff plan tier. Must be between 1 and 5." });
          }
          currentStaffPlan = tier;
        }

        if (customLimits && typeof customLimits === "object") {
          customStaffPlanLimits = {
            superadmin: customLimits.superadmin === "unlimited" ? "unlimited" : Math.max(0, Number(customLimits.superadmin) || 0),
            admin: customLimits.admin === "unlimited" ? "unlimited" : Math.max(0, Number(customLimits.admin) || 0),
            staff: customLimits.staff === "unlimited" ? "unlimited" : Math.max(0, Number(customLimits.staff) || 0),
          };
        }

        return sendJson(res, 200, {
          success: true,
          message: "Staff plan updated successfully",
          staffPlan: currentStaffPlan,
          customStaffPlanLimits,
        });
      } catch (err) {
        return sendJson(res, 500, { success: false, error: err.message || "Failed to update staff plan" });
      }
    });
    return;
  }

  // Billing calculation endpoint (unit price * qty, MRP includes GST, total = subtotal - discount)
  if (req.method === "POST" && (url.pathname === "/api/billing/calculate" || url.pathname === "/api/invoices/calculate")) {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) req.destroy();
    });

    req.on("end", () => {
      try {
        if (!body) return sendJson(res, 400, { success: false, error: "Empty request body" });
        const payload = JSON.parse(body);
        const { items = [], discountType = "percent", discountValue = 0 } = payload;

        const result = calculateBillingTotals(items, discountType, discountValue);

        return sendJson(res, 200, {
          success: true,
          ...result,
        });
      } catch (err) {
        return sendJson(res, 500, { success: false, error: err.message || "Failed to calculate bill totals" });
      }
    });
    return;
  }

  // Inventory filter endpoints (support Narcotic Drugs & controlled substances filter)
  if (req.method === "GET" && (url.pathname === "/api/inventory/narcotic" || (url.pathname === "/api/inventory" && url.searchParams.get("filter") === "narcotic"))) {
    return sendJson(res, 200, {
      success: true,
      filter: "narcotic",
      label: "Narcotic Drugs",
      description: "Medicines categorized as narcotic or controlled substances",
      medicines: [],
    });
  }

  if (req.method === "POST" && (url.pathname === "/api/inventory/narcotic" || url.pathname === "/api/inventory/filter")) {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 10 * 1024 * 1024) req.destroy();
    });

    req.on("end", () => {
      try {
        if (!body) return sendJson(res, 400, { success: false, error: "Empty request body" });
        const payload = JSON.parse(body);
        const { filter = "narcotic", medicines = [] } = payload;

        const filtered = filterMedicines(medicines, filter);

        return sendJson(res, 200, {
          success: true,
          filter,
          count: filtered.length,
          medicines: filtered,
        });
      } catch (err) {
        return sendJson(res, 500, { success: false, error: err.message || "Failed to filter inventory" });
      }
    });
    return;
  }

  // Inventory Medicine Validation Endpoint
  if (req.method === "POST" && (url.pathname === "/api/inventory/medicine/validate" || url.pathname === "/api/medicines/validate")) {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 10 * 1024 * 1024) req.destroy();
    });

    req.on("end", () => {
      try {
        if (!body) return sendJson(res, 400, { success: false, error: "Empty request body" });
        const payload = JSON.parse(body);
        const medicineData = payload.medicine || payload;
        const validation = validateMedicinePayload(medicineData, {
          requirePurchaseDetails: payload.requirePurchaseDetails ?? true,
        });

        if (!validation.isValid) {
          return sendJson(res, 400, {
            success: false,
            isValid: false,
            errors: validation.errors,
            error: validation.message,
          });
        }

        return sendJson(res, 200, {
          success: true,
          isValid: true,
          cleanData: validation.cleanData,
        });
      } catch (err) {
        return sendJson(res, 400, { success: false, error: err.message });
      }
    });
    return;
  }

  // Inventory Medicine List Endpoint
  if (req.method === "GET" && (url.pathname === "/api/inventory/medicines" || url.pathname === "/api/medicines")) {
    try {
      const snap = await getDocs(collection(db, COLLECTIONS.medicines));
      const firestoreDocs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      return sendJson(res, 200, {
        success: true,
        source: "firestore",
        count: firestoreDocs.length,
        medicines: firestoreDocs,
      });
    } catch (err) {
      return sendJson(res, 200, {
        success: true,
        source: "local",
        count: 0,
        medicines: [],
        warning: err.message,
      });
    }
  }

  // Inventory Medicine Creation Endpoint
  if (req.method === "POST" && (url.pathname === "/api/inventory/medicine" || url.pathname === "/api/medicines")) {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 10 * 1024 * 1024) req.destroy();
    });

    req.on("end", async () => {
      try {
        if (!body) return sendJson(res, 400, { success: false, error: "Empty request body" });
        const payload = JSON.parse(body);
        const { medicine, medicines = [], requirePurchaseDetails = true } = payload;
        const medicineData = medicine || payload;

        const result = createMedicine(medicineData, medicines, { requirePurchaseDetails });

        // Save to Firestore gp_medicines
        try {
          const docData = {};
          for (const [k, v] of Object.entries(result.medicine)) {
            if (v !== undefined) docData[k] = v;
          }
          await setDoc(doc(db, COLLECTIONS.medicines, result.medicine.id), docData);
        } catch (dbErr) {
          console.warn("[Firebase medicine save warning]", dbErr.message);
        }

        return sendJson(res, 201, result);
      } catch (err) {
        return sendJson(res, err.statusCode || 400, {
          success: false,
          error: err.message,
          errors: err.errors || [err.message],
        });
      }
    });
    return;
  }

  // Inventory Medicine Update Endpoint
  if ((req.method === "PUT" && (url.pathname.startsWith("/api/inventory/medicine/") || url.pathname.startsWith("/api/medicines/"))) ||
      (req.method === "POST" && (url.pathname === "/api/inventory/medicine/update" || url.pathname === "/api/medicines/update"))) {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 10 * 1024 * 1024) req.destroy();
    });

    req.on("end", async () => {
      try {
        if (!body) return sendJson(res, 400, { success: false, error: "Empty request body" });
        const payload = JSON.parse(body);
        const pathParts = url.pathname.split("/");
        const urlId = (url.pathname.includes("/update")) ? null : pathParts[pathParts.length - 1];
        const id = payload.id || urlId;
        const role = payload.role || req.headers["x-user-role"] || "";
        const { patch, medicines = [] } = payload;
        const result = updateMedicine(id, patch || payload, medicines, role);

        // Update in Firestore gp_medicines
        try {
          const docData = {};
          for (const [k, v] of Object.entries(result.medicine)) {
            if (v !== undefined) docData[k] = v;
          }
          await setDoc(doc(db, COLLECTIONS.medicines, result.medicine.id), docData, { merge: true });
        } catch (dbErr) {
          console.warn("[Firebase medicine update warning]", dbErr.message);
        }

        return sendJson(res, 200, result);
      } catch (err) {
        return sendJson(res, err.statusCode || 400, { success: false, error: err.message });
      }
    });
    return;
  }

  // Inventory Medicine Min-Stock Patch Endpoint
  if ((req.method === "PATCH" || req.method === "POST" || req.method === "PUT") &&
      (url.pathname.includes("/min-stock") && (url.pathname.startsWith("/api/inventory/medicine/") || url.pathname.startsWith("/api/medicines/")))) {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) req.destroy();
    });

    req.on("end", async () => {
      try {
        if (!body) return sendJson(res, 400, { success: false, error: "Empty request body" });
        const payload = JSON.parse(body);
        const pathParts = url.pathname.split("/").filter(Boolean);
        // e.g. ["api", "inventory", "medicine", "m_123", "min-stock"] -> id is index 3
        const id = payload.id || pathParts[pathParts.length - 2];
        const role = payload.role || req.headers["x-user-role"] || "";
        const minStock = payload.minStock;
        const medicines = payload.medicines || [];

        const result = updateMedicineMinStock(id, minStock, role, medicines);

        // Update in Firestore gp_medicines
        try {
          await setDoc(doc(db, COLLECTIONS.medicines, id), { minStock: result.medicine.minStock }, { merge: true });
        } catch (dbErr) {
          console.warn("[Firebase minStock update warning]", dbErr.message);
        }

        return sendJson(res, 200, result);
      } catch (err) {
        return sendJson(res, err.statusCode || 400, { success: false, error: err.message });
      }
    });
    return;
  }

  // Inventory Control Feature Settings
  if (req.method === "GET" && url.pathname === "/api/inventory/settings") {
    try {
      const metaSnap = await getDoc(doc(db, COLLECTIONS.meta, "app"));
      const flags = metaSnap.exists() ? metaSnap.data()?.featureFlags || {} : {};
      return sendJson(res, 200, {
        success: true,
        flags: { minStockFeature: flags.minStockFeature !== false },
      });
    } catch (err) {
      return sendJson(res, 200, {
        success: true,
        flags: { minStockFeature: true },
        warning: err.message,
      });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/inventory/settings") {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", async () => {
      try {
        if (!body) return sendJson(res, 400, { success: false, error: "Empty request body" });
        const payload = JSON.parse(body);
        const role = payload.role || req.headers["x-user-role"] || "";
        if (!isAuthorizedForMinStock(role)) {
          return sendJson(res, 403, {
            success: false,
            error: "Access Denied: Only Developer and Admin roles can modify Minimum Stock settings.",
          });
        }

        const minStockFeature = Boolean(payload.minStockFeature);
        try {
          await setDoc(doc(db, COLLECTIONS.meta, "app"), { featureFlags: { minStockFeature } }, { merge: true });
        } catch (dbErr) {
          console.warn("[Firebase flags update warning]", dbErr.message);
        }

        return sendJson(res, 200, {
          success: true,
          message: "Inventory control settings updated successfully",
          minStockFeature,
        });
      } catch (err) {
        return sendJson(res, 500, { success: false, error: err.message });
      }
    });
    return;
  }

  // Inventory Medicine Delete Endpoint
  if ((req.method === "DELETE" && (url.pathname.startsWith("/api/inventory/medicine/") || url.pathname.startsWith("/api/medicines/"))) ||
      (req.method === "POST" && (url.pathname === "/api/inventory/medicine/delete" || url.pathname === "/api/medicines/delete"))) {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 10 * 1024 * 1024) req.destroy();
    });

    req.on("end", async () => {
      try {
        const payload = body ? JSON.parse(body) : {};
        const pathParts = url.pathname.split("/");
        const urlId = (url.pathname.includes("/delete")) ? null : pathParts[pathParts.length - 1];
        const id = payload.id || urlId;
        const { medicines = [] } = payload;
        const result = deleteMedicine(id, medicines);

        // Delete from Firestore gp_medicines
        try {
          await deleteDoc(doc(db, COLLECTIONS.medicines, id));
        } catch (dbErr) {
          console.warn("[Firebase medicine delete warning]", dbErr.message);
        }

        return sendJson(res, 200, result);
      } catch (err) {
        return sendJson(res, err.statusCode || 400, { success: false, error: err.message });
      }
    });
    return;
  }

  // System Data Purge Endpoint (Developer / Super Admin)
  if (req.method === "POST" && (url.pathname === "/api/system/purge" || url.pathname === "/api/data/purge")) {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", async () => {
      try {
        const payload = body ? JSON.parse(body) : {};
        const role = payload.role || req.headers["x-user-role"] || "";
        if (role && role !== "developer" && role !== "superadmin") {
          return sendJson(res, 403, { success: false, error: "Access Denied: Only Developer or Super Admin can purge system data." });
        }

        const now = new Date().toISOString();
        try {
          await setDoc(doc(db, COLLECTIONS.meta, "app"), {
            auditClearedAt: now,
            invoicesClearedAt: now,
            medicinesClearedAt: now,
            grnsClearedAt: now,
            returnsClearedAt: now,
            counters: { invoice: 1000, grn: 500 },
            updatedAt: now,
          }, { merge: true });
        } catch (dbErr) {
          console.warn("[Firebase purge meta update warning]", dbErr.message);
        }

        return sendJson(res, 200, {
          success: true,
          message: "All old invoices, inventory tablets, audit logs, and report records purged successfully.",
          purgedAt: now,
        });
      } catch (err) {
        return sendJson(res, 500, { success: false, error: err.message });
      }
    });
    return;
  }

  // Approved GRN Management Endpoints (Developer role only)
  if (req.method === "GET" && url.pathname === "/api/grn/approved") {
    const role = req.headers["x-user-role"] || url.searchParams.get("role") || "";
    if (!isDeveloperRole(role)) {
      return sendJson(res, 403, {
        success: false,
        error: "Access Denied: Only Developer role can view or manage approved GRN entries.",
      });
    }

    return sendJson(res, 200, {
      success: true,
      message: "Developer authorized for approved GRN management",
      role,
    });
  }

  if (req.method === "POST" && (url.pathname === "/api/grn/approved/list" || url.pathname === "/api/grn/approved/filter")) {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 10 * 1024 * 1024) req.destroy();
    });

    req.on("end", () => {
      try {
        if (!body) return sendJson(res, 400, { success: false, error: "Empty request body" });
        const payload = JSON.parse(body);
        const role = payload.role || req.headers["x-user-role"] || "";
        const { grns = [], search = "", startDate, endDate } = payload;

        const filtered = listApprovedGrns(grns, { search, startDate, endDate }, role);

        return sendJson(res, 200, {
          success: true,
          count: filtered.length,
          grns: filtered,
        });
      } catch (err) {
        const statusCode = err.message?.includes("Access Denied") ? 403 : 500;
        return sendJson(res, statusCode, { success: false, error: err.message });
      }
    });
    return;
  }

  if ((req.method === "PUT" && url.pathname.startsWith("/api/grn/approved/")) || (req.method === "POST" && url.pathname === "/api/grn/approved/update")) {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 10 * 1024 * 1024) req.destroy();
    });

    req.on("end", () => {
      try {
        if (!body) return sendJson(res, 400, { success: false, error: "Empty request body" });
        const payload = JSON.parse(body);
        const urlId = url.pathname.startsWith("/api/grn/approved/") && url.pathname !== "/api/grn/approved/update"
          ? url.pathname.replace("/api/grn/approved/", "")
          : null;
        const grnId = payload.grnId || urlId;
        const role = payload.role || req.headers["x-user-role"] || "";
        const { patchData, grns = [], medicines = [], adjustStock = true } = payload;

        const result = updateApprovedGrn(grnId, patchData || payload, grns, medicines, role, adjustStock);
        return sendJson(res, 200, result);
      } catch (err) {
        const statusCode = err.message?.includes("Access Denied") ? 403 : 400;
        return sendJson(res, statusCode, { success: false, error: err.message });
      }
    });
    return;
  }

  if ((req.method === "DELETE" && url.pathname.startsWith("/api/grn/approved/")) || (req.method === "POST" && url.pathname === "/api/grn/approved/delete")) {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 10 * 1024 * 1024) req.destroy();
    });

    req.on("end", () => {
      try {
        const payload = body ? JSON.parse(body) : {};
        const urlId = url.pathname.startsWith("/api/grn/approved/") && url.pathname !== "/api/grn/approved/delete"
          ? url.pathname.replace("/api/grn/approved/", "")
          : null;
        const grnId = payload.grnId || urlId;
        const role = payload.role || req.headers["x-user-role"] || url.searchParams.get("role") || "";
        const { grns = [], medicines = [], reverseStock = true } = payload;

        const result = deleteApprovedGrn(grnId, grns, medicines, role, reverseStock);
        return sendJson(res, 200, result);
      } catch (err) {
        const statusCode = err.message?.includes("Access Denied") ? 403 : 400;
        return sendJson(res, statusCode, { success: false, error: err.message });
      }
    });
    return;
  }

  // Doctor Management Endpoints
  if (req.method === "GET" && url.pathname === "/api/doctors") {
    const q = url.searchParams.get("q") || url.searchParams.get("search") || "";
    try {
      const snap = await getDocs(collection(db, COLLECTIONS.doctors));
      const firestoreDocs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const result = listDoctors(firestoreDocs, { q });
      return sendJson(res, 200, {
        success: true,
        source: "firestore",
        count: result.length,
        query: q,
        doctors: result,
      });
    } catch (err) {
      return sendJson(res, 200, {
        success: true,
        source: "local",
        count: 0,
        query: q,
        doctors: [],
        warning: err.message,
      });
    }
  }

  if (req.method === "POST" && (url.pathname === "/api/doctors/list" || url.pathname === "/api/doctors/filter")) {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 10 * 1024 * 1024) req.destroy();
    });

    req.on("end", async () => {
      try {
        const payload = body ? JSON.parse(body) : {};
        let { doctors = [], q = "", search = "" } = payload;
        if (!doctors || doctors.length === 0) {
          try {
            const snap = await getDocs(collection(db, COLLECTIONS.doctors));
            doctors = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          } catch {
            // fallback
          }
        }
        const result = listDoctors(doctors, { q: q || search });
        return sendJson(res, 200, {
          success: true,
          count: result.length,
          doctors: result,
        });
      } catch (err) {
        return sendJson(res, 400, { success: false, error: err.message });
      }
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/doctors") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 10 * 1024 * 1024) req.destroy();
    });

    req.on("end", async () => {
      try {
        if (!body) return sendJson(res, 400, { success: false, error: "Empty request body" });
        const payload = JSON.parse(body);
        const { doctor, doctors = [] } = payload;
        const result = createDoctor(doctor || payload, doctors);

        // Store to Firestore gp_doctors
        try {
          const docData = {};
          for (const [k, v] of Object.entries(result.doctor)) {
            if (v !== undefined) docData[k] = v;
          }
          await setDoc(doc(db, COLLECTIONS.doctors, result.doctor.id), docData);
        } catch (dbErr) {
          console.warn("[Firebase doctor save warning]", dbErr.message);
        }

        return sendJson(res, 201, result);
      } catch (err) {
        return sendJson(res, 400, { success: false, error: err.message });
      }
    });
    return;
  }

  if ((req.method === "PUT" && url.pathname.startsWith("/api/doctors/")) || (req.method === "POST" && url.pathname === "/api/doctors/update")) {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 10 * 1024 * 1024) req.destroy();
    });

    req.on("end", async () => {
      try {
        if (!body) return sendJson(res, 400, { success: false, error: "Empty request body" });
        const payload = JSON.parse(body);
        const urlId = url.pathname.startsWith("/api/doctors/") && url.pathname !== "/api/doctors/update"
          ? url.pathname.replace("/api/doctors/", "")
          : null;
        const id = payload.id || urlId;
        const { patch, doctors = [] } = payload;
        const result = updateDoctor(id, patch || payload, doctors);

        // Update in Firestore gp_doctors
        try {
          const docData = {};
          for (const [k, v] of Object.entries(result.doctor)) {
            if (v !== undefined) docData[k] = v;
          }
          await setDoc(doc(db, COLLECTIONS.doctors, result.doctor.id), docData, { merge: true });
        } catch (dbErr) {
          console.warn("[Firebase doctor update warning]", dbErr.message);
        }

        return sendJson(res, 200, result);
      } catch (err) {
        return sendJson(res, 400, { success: false, error: err.message });
      }
    });
    return;
  }

  if ((req.method === "DELETE" && url.pathname.startsWith("/api/doctors/")) || (req.method === "POST" && url.pathname === "/api/doctors/delete")) {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 10 * 1024 * 1024) req.destroy();
    });

    req.on("end", async () => {
      try {
        const payload = body ? JSON.parse(body) : {};
        const urlId = url.pathname.startsWith("/api/doctors/") && url.pathname !== "/api/doctors/delete"
          ? url.pathname.replace("/api/doctors/", "")
          : null;
        const id = payload.id || urlId;
        const { doctors = [] } = payload;
        const result = deleteDoctor(id, doctors);

        // Delete from Firestore gp_doctors
        try {
          await deleteDoc(doc(db, COLLECTIONS.doctors, id));
        } catch (dbErr) {
          console.warn("[Firebase doctor delete warning]", dbErr.message);
        }

        return sendJson(res, 200, result);
      } catch (err) {
        return sendJson(res, 400, { success: false, error: err.message });
      }
    });
    return;
  }

  // User Management Endpoints
  if (req.method === "GET" && url.pathname === "/api/users") {
    const q = url.searchParams.get("q") || url.searchParams.get("search") || "";
    const branchId = url.searchParams.get("branchId") || "";
    const role = url.searchParams.get("role") || "";
    try {
      const snap = await getDocs(collection(db, COLLECTIONS.users));
      const firestoreDocs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const result = listUsers(firestoreDocs, { q, branchId, role });
      return sendJson(res, 200, {
        success: true,
        source: "firestore",
        count: result.length,
        users: result,
      });
    } catch (err) {
      return sendJson(res, 200, {
        success: true,
        source: "local",
        count: 0,
        users: [],
        warning: err.message,
      });
    }
  }

  if (req.method === "POST" && (url.pathname === "/api/users" || url.pathname === "/api/users/create")) {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 10 * 1024 * 1024) req.destroy();
    });

    req.on("end", async () => {
      try {
        if (!body) return sendJson(res, 400, { success: false, error: "Empty request body" });
        const payload = JSON.parse(body);
        let existingUsers = payload.users || [];
        if (!existingUsers || existingUsers.length === 0) {
          try {
            const snap = await getDocs(collection(db, COLLECTIONS.users));
            existingUsers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          } catch {}
        }

        const result = createUser(payload.user || payload, existingUsers);

        // Store to Firestore gp_users
        try {
          const docData = {};
          for (const [k, v] of Object.entries(result.user)) {
            if (v !== undefined) docData[k] = v;
          }
          await setDoc(doc(db, COLLECTIONS.users, result.user.id), docData);
        } catch (dbErr) {
          console.warn("[Firebase user save warning]", dbErr.message);
        }

        return sendJson(res, 201, result);
      } catch (err) {
        return sendJson(res, err.statusCode || 400, { success: false, error: err.message });
      }
    });
    return;
  }

  if ((req.method === "PUT" && url.pathname.startsWith("/api/users/")) || (req.method === "POST" && url.pathname === "/api/users/update")) {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 10 * 1024 * 1024) req.destroy();
    });

    req.on("end", async () => {
      try {
        if (!body) return sendJson(res, 400, { success: false, error: "Empty request body" });
        const payload = JSON.parse(body);
        const urlId = url.pathname.startsWith("/api/users/") && url.pathname !== "/api/users/update"
          ? url.pathname.replace("/api/users/", "")
          : null;
        const id = payload.id || urlId;
        let existingUsers = payload.users || [];
        if (!existingUsers || existingUsers.length === 0) {
          try {
            const snap = await getDocs(collection(db, COLLECTIONS.users));
            existingUsers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          } catch {}
        }

        const result = updateUser(id, payload.patch || payload, existingUsers);

        // Update in Firestore gp_users
        try {
          const docData = {};
          for (const [k, v] of Object.entries(result.user)) {
            if (v !== undefined) docData[k] = v;
          }
          await setDoc(doc(db, COLLECTIONS.users, result.user.id), docData, { merge: true });
        } catch (dbErr) {
          console.warn("[Firebase user update warning]", dbErr.message);
        }

        return sendJson(res, 200, result);
      } catch (err) {
        return sendJson(res, err.statusCode || 400, { success: false, error: err.message });
      }
    });
    return;
  }

  if ((req.method === "DELETE" && url.pathname.startsWith("/api/users/")) || (req.method === "POST" && url.pathname === "/api/users/delete")) {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 10 * 1024 * 1024) req.destroy();
    });

    req.on("end", async () => {
      try {
        const payload = body ? JSON.parse(body) : {};
        const urlId = url.pathname.startsWith("/api/users/") && url.pathname !== "/api/users/delete"
          ? url.pathname.replace("/api/users/", "")
          : null;
        const id = payload.id || urlId;
        let existingUsers = payload.users || [];
        if (!existingUsers || existingUsers.length === 0) {
          try {
            const snap = await getDocs(collection(db, COLLECTIONS.users));
            existingUsers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          } catch {}
        }

        const result = deleteUser(id, existingUsers);

        // Delete from Firestore gp_users
        try {
          await deleteDoc(doc(db, COLLECTIONS.users, id));
        } catch (dbErr) {
          console.warn("[Firebase user delete warning]", dbErr.message);
        }

        return sendJson(res, 200, result);
      } catch (err) {
        return sendJson(res, err.statusCode || 400, { success: false, error: err.message });
      }
    });
    return;
  }

  // Not found
  sendJson(res, 404, { success: false, error: `Route not found: ${req.method} ${url.pathname}` });
});

server.listen(PORT, () => {
  console.log(`[GRN Parser Backend] Server running on http://localhost:${PORT}`);
  console.log(`[GRN Parser Backend] Health check: http://localhost:${PORT}/api/health`);
  console.log(`[GRN Parser Backend] Parse endpoint: http://localhost:${PORT}/api/parse-invoice`);
});
