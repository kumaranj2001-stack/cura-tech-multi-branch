import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function grnIntelligentParserPlugin(): Plugin {
  return {
    name: "vite-plugin-grn-intelligent-parser",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || "", "http://localhost");

        if (url.pathname === "/api/health" && req.method === "GET") {
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              status: "ok",
              service: "Guru Pharma GRN Document Parsing (Vite Middleware)",
              timestamp: new Date().toISOString(),
            })
          );
          return;
        }

        if (url.pathname === "/api/parse-invoice" && req.method === "POST") {
          let body = "";
          req.on("data", (chunk) => {
            body += chunk;
          });
          req.on("end", async () => {
            try {
              const payload = JSON.parse(body || "{}");
              const { parseInvoiceDocument } = await import("./server/intelligentParser.mjs");
              const {
                fileData,
                fileName,
                mimeType,
                existingMedicines = [],
                existingSuppliers = [],
                apiKey,
              } = payload;

              if (!fileData) {
                res.statusCode = 400;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ success: false, error: "Missing fileData (base64 string required)" }));
                return;
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

              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify(result));
            } catch (err) {
              console.error("[Vite Middleware Parser Error]", err);
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(
                JSON.stringify({
                  success: false,
                  error: err instanceof Error ? err.message : "Document parse failed",
                })
              );
            }
          });
          return;
        }

        if (url.pathname === "/api/inventory/narcotic" && req.method === "GET") {
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              success: true,
              filter: "narcotic",
              label: "Narcotic Drugs",
              description: "Medicines categorized as narcotic or controlled substances",
              medicines: [],
            })
          );
          return;
        }

        if ((url.pathname === "/api/inventory/narcotic" || url.pathname === "/api/inventory/filter") && req.method === "POST") {
          let body = "";
          req.on("data", (chunk) => {
            body += chunk;
          });
          req.on("end", async () => {
            try {
              const payload = JSON.parse(body || "{}");
              const { filterMedicines } = await import("./server/inventoryFilter.mjs");
              const { filter = "narcotic", medicines = [] } = payload;
              const filtered = filterMedicines(medicines, filter);
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ success: true, filter, count: filtered.length, medicines: filtered }));
            } catch (err) {
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ success: false, error: err instanceof Error ? err.message : "Filter failed" }));
            }
          });
          return;
        }

        // Inventory Medicine Validation middleware
        if ((url.pathname === "/api/inventory/medicine/validate" || url.pathname === "/api/medicines/validate") && req.method === "POST") {
          let body = "";
          req.on("data", (chunk) => { body += chunk; });
          req.on("end", async () => {
            try {
              const payload = JSON.parse(body || "{}");
              const { validateMedicinePayload } = await import("./server/medicineHandler.mjs");
              const medicineData = payload.medicine || payload;
              const validation = validateMedicinePayload(medicineData, {
                requirePurchaseDetails: payload.requirePurchaseDetails ?? true,
              });

              if (!validation.isValid) {
                res.statusCode = 400;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ success: false, isValid: false, errors: validation.errors, error: validation.message }));
                return;
              }

              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ success: true, isValid: true, cleanData: validation.cleanData }));
            } catch (err) {
              res.statusCode = 400;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ success: false, error: err instanceof Error ? err.message : "Validation failed" }));
            }
          });
          return;
        }

        // Inventory Medicine List & Search middleware
        if ((url.pathname === "/api/inventory/medicines" || url.pathname === "/api/medicines" || url.pathname === "/api/inventory/search") && req.method === "GET") {
          try {
            const { db, COLLECTIONS } = await import("./server/firebase.mjs");
            const { searchMedicines, getInMemoryMedicines } = await import("./server/medicineHandler.mjs");
            const { getDocs, collection } = await import("firebase/firestore");
            let firestoreDocs: any[] = [];
            try {
              const snap = await Promise.race([
                getDocs(collection(db, COLLECTIONS.medicines)),
                new Promise<any>((_, reject) => setTimeout(() => reject(new Error("Firestore fetch timeout")), 1200))
              ]);
              firestoreDocs = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
            } catch (dbErr) {
              console.warn("[Vite Firestore fetch warning]", (dbErr as Error).message);
            }
            const memDocs = getInMemoryMedicines ? getInMemoryMedicines() : [];
            const combined = [...firestoreDocs];
            const existingIds = new Set(combined.map((m) => m.id));
            memDocs.forEach((m: any) => {
              if (!existingIds.has(m.id)) combined.push(m);
            });
            const q = url.searchParams.get("q") || url.searchParams.get("search") || "";
            const branchId = url.searchParams.get("branchId") || "";
            const result = searchMedicines(combined, { q, branchId });
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ success: true, source: firestoreDocs.length ? "firestore" : "local", count: result.length, medicines: result }));
          } catch (err) {
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ success: true, source: "local", count: 0, medicines: [], warning: (err as Error).message }));
          }
          return;
        }

        if (url.pathname === "/api/inventory/search" && req.method === "POST") {
          let body = "";
          req.on("data", (chunk) => { body += chunk; });
          req.on("end", async () => {
            try {
              const payload = body ? JSON.parse(body) : {};
              const { searchMedicines, getInMemoryMedicines } = await import("./server/medicineHandler.mjs");
              let { medicines = [], q = "", search = "", branchId = "" } = payload;
              if (!medicines || medicines.length === 0) {
                try {
                  const { db, COLLECTIONS } = await import("./server/firebase.mjs");
                  const { getDocs, collection } = await import("firebase/firestore");
                  const snap = await Promise.race([
                    getDocs(collection(db, COLLECTIONS.medicines)),
                    new Promise<any>((_, reject) => setTimeout(() => reject(new Error("Firestore fetch timeout")), 1200))
                  ]);
                  medicines = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
                } catch {}
              }
              const memDocs = getInMemoryMedicines ? getInMemoryMedicines() : [];
              const combined = [...medicines];
              const existingIds = new Set(combined.map((m) => m.id));
              memDocs.forEach((m: any) => {
                if (!existingIds.has(m.id)) combined.push(m);
              });
              const result = searchMedicines(combined, { q: q || search, branchId });
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ success: true, count: result.length, medicines: result }));
            } catch (err) {
              res.statusCode = 400;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ success: false, error: (err as Error).message }));
            }
          });
          return;
        }

        // Inventory Medicine Create middleware
        if ((url.pathname === "/api/inventory/medicine" || url.pathname === "/api/medicines") && req.method === "POST") {
          let body = "";
          req.on("data", (chunk) => { body += chunk; });
          req.on("end", async () => {
            try {
              const payload = JSON.parse(body || "{}");
              const { createMedicine } = await import("./server/medicineHandler.mjs");
              const { medicine, medicines = [], requirePurchaseDetails = true } = payload;
              const result = createMedicine(medicine || payload, medicines, { requirePurchaseDetails });

              // Persist without holding the GRN modal open. Memory is updated first
              // so product search can read the new medicine immediately.
              void (async () => {
                try {
                  const { db, COLLECTIONS } = await import("./server/firebase.mjs");
                  const { doc, setDoc } = await import("firebase/firestore");
                  const cleanData: Record<string, unknown> = {};
                  for (const [k, v] of Object.entries(result.medicine)) {
                    if (v !== undefined) cleanData[k] = v;
                  }
                  await Promise.race([
                    setDoc(doc(db, COLLECTIONS.medicines, result.medicine.id), cleanData),
                    new Promise((_, reject) => setTimeout(() => reject(new Error("Firestore write timed out")), 2500))
                  ]);
                } catch (dbErr) {
                  console.warn("[Vite medicine Firestore save warning]", (dbErr as Error).message);
                }
              })();

              res.statusCode = 201;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ success: true, medicine: result.medicine }));
            } catch (err: unknown) {
              const errorObj = err as { statusCode?: number; message?: string; errors?: string[] };
              res.statusCode = errorObj.statusCode || 400;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({
                success: false,
                error: errorObj.message || "Failed to create medicine",
                errors: errorObj.errors || [errorObj.message || "Invalid payload"],
              }));
            }
          });
          return;
        }

        // Inventory Medicine Batch Create middleware
        if ((url.pathname === "/api/inventory/medicines/batch" || url.pathname === "/api/inventory/medicine/batch") && req.method === "POST") {
          let body = "";
          req.on("data", (chunk) => { body += chunk; });
          req.on("end", async () => {
            try {
              const payload = JSON.parse(body || "{}");
              const { createMedicineBatch } = await import("./server/medicineHandler.mjs");
              const items = payload.items || payload.medicines || (Array.isArray(payload) ? payload : []);
              const { medicines = [], requirePurchaseDetails = true, supplier = "" } = payload;
              const result = createMedicineBatch(items, medicines, { requirePurchaseDetails, supplier });

              // Persist batch to Firestore non-blocking with writeBatch
              void (async () => {
                try {
                  const { db, COLLECTIONS } = await import("./server/firebase.mjs");
                  const { doc, writeBatch } = await import("firebase/firestore");
                  const batch = writeBatch(db);
                  for (const med of result.created) {
                    const cleanData: Record<string, unknown> = {};
                    for (const [k, v] of Object.entries(med)) {
                      if (v !== undefined) cleanData[k] = v;
                    }
                    batch.set(doc(db, COLLECTIONS.medicines, med.id), cleanData);
                  }
                  await Promise.race([
                    batch.commit(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error("Firestore batch commit timed out")), 2500))
                  ]);
                } catch (dbErr) {
                  console.warn("[Vite batch medicine Firestore save warning]", (dbErr as Error).message);
                }
              })();

              res.statusCode = 201;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify(result));
            } catch (err: unknown) {
              const errorObj = err as { statusCode?: number; message?: string; errors?: string[] };
              res.statusCode = errorObj.statusCode || 400;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({
                success: false,
                error: errorObj.message || "Failed to create medicine batch",
                errors: errorObj.errors || [errorObj.message || "Invalid batch payload"],
              }));
            }
          });
          return;
        }

        // Inventory Medicine Update middleware
        if (((url.pathname.startsWith("/api/inventory/medicine/") && req.method === "PUT") ||
             (url.pathname.startsWith("/api/medicines/") && req.method === "PUT") ||
             ((url.pathname === "/api/inventory/medicine/update" || url.pathname === "/api/medicines/update") && req.method === "POST"))) {
          let body = "";
          req.on("data", (chunk) => { body += chunk; });
          req.on("end", async () => {
            try {
              const payload = JSON.parse(body || "{}");
              const { updateMedicine } = await import("./server/medicineHandler.mjs");
              const pathParts = url.pathname.split("/");
              const urlId = url.pathname.includes("/update") ? null : pathParts[pathParts.length - 1];
              const id = payload.id || urlId;
              const role = payload.role || (req.headers["x-user-role"] as string) || "";
              const { patch, medicines = [] } = payload;
              const result = updateMedicine(id, patch || payload, medicines, role);

              // Sync to Firestore non-blocking with 1.2s timeout
              (async () => {
                try {
                  const { db, COLLECTIONS } = await import("./server/firebase.mjs");
                  const { doc, setDoc } = await import("firebase/firestore");
                  const cleanData: Record<string, unknown> = {};
                  for (const [k, v] of Object.entries(result.medicine)) {
                    if (v !== undefined) cleanData[k] = v;
                  }
                  await Promise.race([
                    setDoc(doc(db, COLLECTIONS.medicines, result.medicine.id), cleanData, { merge: true }),
                    new Promise((_, reject) => setTimeout(() => reject(new Error("Firestore update timed out")), 1200))
                  ]);
                } catch (dbErr) {
                  console.warn("[Vite medicine Firestore update warning]", (dbErr as Error).message);
                }
              })().catch(() => {});

              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify(result));
            } catch (err: unknown) {
              const errorObj = err as { statusCode?: number; message?: string };
              res.statusCode = errorObj.statusCode || 400;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ success: false, error: errorObj.message || "Update failed" }));
            }
          });
          return;
        }

        // Inventory Medicine Delete middleware
        if (((url.pathname.startsWith("/api/inventory/medicine/") && req.method === "DELETE") ||
             (url.pathname.startsWith("/api/medicines/") && req.method === "DELETE") ||
             ((url.pathname === "/api/inventory/medicine/delete" || url.pathname === "/api/medicines/delete") && req.method === "POST"))) {
          let body = "";
          req.on("data", (chunk) => { body += chunk; });
          req.on("end", async () => {
            try {
              const payload = body ? JSON.parse(body) : {};
              const { deleteMedicine } = await import("./server/medicineHandler.mjs");
              const pathParts = url.pathname.split("/");
              const urlId = url.pathname.includes("/delete") ? null : pathParts[pathParts.length - 1];
              const id = payload.id || urlId;
              const { medicines = [] } = payload;
              const result = deleteMedicine(id, medicines);

              // Delete from Firestore non-blocking with 1.2s timeout
              (async () => {
                try {
                  const { db, COLLECTIONS } = await import("./server/firebase.mjs");
                  const { doc, deleteDoc } = await import("firebase/firestore");
                  await Promise.race([
                    deleteDoc(doc(db, COLLECTIONS.medicines, id)),
                    new Promise((_, reject) => setTimeout(() => reject(new Error("Firestore delete timed out")), 1200))
                  ]);
                } catch (dbErr) {
                  console.warn("[Vite medicine Firestore delete warning]", (dbErr as Error).message);
                }
              })().catch(() => {});

              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify(result));
            } catch (err: unknown) {
              const errorObj = err as { statusCode?: number; message?: string };
              res.statusCode = errorObj.statusCode || 400;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ success: false, error: errorObj.message || "Delete failed" }));
            }
          });
          return;
        }

        // Inventory Medicine Min-Stock Patch middleware
        if ((req.method === "PATCH" || req.method === "POST" || req.method === "PUT") &&
            (url.pathname.includes("/min-stock") && (url.pathname.startsWith("/api/inventory/medicine/") || url.pathname.startsWith("/api/medicines/")))) {
          let body = "";
          req.on("data", (chunk) => { body += chunk; });
          req.on("end", async () => {
            try {
              const payload = JSON.parse(body || "{}");
              const pathParts = url.pathname.split("/").filter(Boolean);
              const id = payload.id || pathParts[pathParts.length - 2];
              const role = payload.role || (req.headers["x-user-role"] as string) || "";
              const minStock = payload.minStock;
              const medicines = payload.medicines || [];

              const { updateMedicineMinStock } = await import("./server/medicineHandler.mjs");
              const result = updateMedicineMinStock(id, minStock, role, medicines);

              // Update minStock in Firestore non-blocking with 1.2s timeout
              (async () => {
                try {
                  const { db, COLLECTIONS } = await import("./server/firebase.mjs");
                  const { doc, setDoc } = await import("firebase/firestore");
                  await Promise.race([
                    setDoc(doc(db, COLLECTIONS.medicines, id), { minStock: result.medicine.minStock }, { merge: true }),
                    new Promise((_, reject) => setTimeout(() => reject(new Error("Firestore minStock timeout")), 1200))
                  ]);
                } catch (dbErr) {
                  console.warn("[Vite minStock Firestore update warning]", (dbErr as Error).message);
                }
              })().catch(() => {});

              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify(result));
            } catch (err: unknown) {
              const errorObj = err as { statusCode?: number; message?: string };
              res.statusCode = errorObj.statusCode || 400;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ success: false, error: errorObj.message || "Min stock update failed" }));
            }
          });
          return;
        }

        // Inventory Control Settings middleware
        if (url.pathname === "/api/inventory/settings" && req.method === "GET") {
          try {
            const { db, COLLECTIONS } = await import("./server/firebase.mjs");
            const { doc, getDoc } = await import("firebase/firestore");
            const metaSnap = await getDoc(doc(db, COLLECTIONS.meta, "app"));
            const flags = metaSnap.exists() ? (metaSnap.data()?.featureFlags || {}) : {};
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({
              success: true,
              flags: { minStockFeature: flags.minStockFeature !== false },
            }));
          } catch (err) {
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({
              success: true,
              flags: { minStockFeature: true },
              warning: (err as Error).message,
            }));
          }
          return;
        }

        if (url.pathname === "/api/inventory/settings" && req.method === "POST") {
          let body = "";
          req.on("data", (chunk) => { body += chunk; });
          req.on("end", async () => {
            try {
              const payload = JSON.parse(body || "{}");
              const role = payload.role || (req.headers["x-user-role"] as string) || "";
              const { isAuthorizedForMinStock } = await import("./server/medicineHandler.mjs");
              if (!isAuthorizedForMinStock(role)) {
                res.statusCode = 403;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({
                  success: false,
                  error: "Access Denied: Only Developer and Admin roles can modify Minimum Stock settings.",
                }));
                return;
              }

              const minStockFeature = Boolean(payload.minStockFeature);
              try {
                const { db, COLLECTIONS } = await import("./server/firebase.mjs");
                const { doc, setDoc } = await import("firebase/firestore");
                await setDoc(doc(db, COLLECTIONS.meta, "app"), { featureFlags: { minStockFeature } }, { merge: true });
              } catch (dbErr) {
                console.warn("[Vite flags update warning]", (dbErr as Error).message);
              }

              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({
                success: true,
                message: "Inventory control settings updated successfully",
                minStockFeature,
              }));
            } catch (err: unknown) {
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ success: false, error: (err as Error).message }));
            }
          });
          return;
        }

        // Approved GRN middleware (Developer role only)
        if (url.pathname === "/api/grn/approved" && req.method === "GET") {
          const { isDeveloperRole } = await import("./server/approvedGrnHandler.mjs");
          const role = (req.headers["x-user-role"] as string) || url.searchParams.get("role") || "";
          if (!isDeveloperRole(role)) {
            res.statusCode = 403;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ success: false, error: "Access Denied: Only Developer role can access approved GRN records." }));
            return;
          }
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ success: true, message: "Developer authorized", role }));
          return;
        }

        if ((url.pathname === "/api/grn/approved/list" || url.pathname === "/api/grn/approved/filter") && req.method === "POST") {
          let body = "";
          req.on("data", (chunk) => { body += chunk; });
          req.on("end", async () => {
            try {
              const payload = JSON.parse(body || "{}");
              const { listApprovedGrns } = await import("./server/approvedGrnHandler.mjs");
              const role = payload.role || (req.headers["x-user-role"] as string) || "";
              const { grns = [], search = "", startDate, endDate } = payload;
              const filtered = listApprovedGrns(grns, { search, startDate, endDate }, role);
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ success: true, count: filtered.length, grns: filtered }));
            } catch (err) {
              res.statusCode = err instanceof Error && err.message.includes("Access Denied") ? 403 : 500;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ success: false, error: err instanceof Error ? err.message : "Approved GRN list failed" }));
            }
          });
          return;
        }

        if (((url.pathname.startsWith("/api/grn/approved/") && req.method === "PUT") || (url.pathname === "/api/grn/approved/update" && req.method === "POST"))) {
          let body = "";
          req.on("data", (chunk) => { body += chunk; });
          req.on("end", async () => {
            try {
              const payload = JSON.parse(body || "{}");
              const { updateApprovedGrn } = await import("./server/approvedGrnHandler.mjs");
              const urlId = url.pathname.startsWith("/api/grn/approved/") && url.pathname !== "/api/grn/approved/update"
                ? url.pathname.replace("/api/grn/approved/", "")
                : null;
              const grnId = payload.grnId || urlId;
              const role = payload.role || (req.headers["x-user-role"] as string) || "";
              const { patchData, grns = [], medicines = [], adjustStock = true } = payload;
              const result = updateApprovedGrn(grnId, patchData || payload, grns, medicines, role, adjustStock);
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify(result));
            } catch (err) {
              res.statusCode = err instanceof Error && err.message.includes("Access Denied") ? 403 : 400;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ success: false, error: err instanceof Error ? err.message : "Update failed" }));
            }
          });
          return;
        }

        if (((url.pathname.startsWith("/api/grn/approved/") && req.method === "DELETE") || (url.pathname === "/api/grn/approved/delete" && req.method === "POST"))) {
          let body = "";
          req.on("data", (chunk) => { body += chunk; });
          req.on("end", async () => {
            try {
              const payload = body ? JSON.parse(body) : {};
              const { deleteApprovedGrn } = await import("./server/approvedGrnHandler.mjs");
              const urlId = url.pathname.startsWith("/api/grn/approved/") && url.pathname !== "/api/grn/approved/delete"
                ? url.pathname.replace("/api/grn/approved/", "")
                : null;
              const grnId = payload.grnId || urlId;
              const role = payload.role || (req.headers["x-user-role"] as string) || url.searchParams.get("role") || "";
              const { grns = [], medicines = [], reverseStock = true } = payload;
              const result = deleteApprovedGrn(grnId, grns, medicines, role, reverseStock);
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify(result));
            } catch (err) {
              res.statusCode = err instanceof Error && err.message.includes("Access Denied") ? 403 : 400;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ success: false, error: err instanceof Error ? err.message : "Delete failed" }));
            }
          });
          return;
        }

        // Doctor management middleware
        if (url.pathname === "/api/doctors" && req.method === "GET") {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ success: true, doctors: [] }));
          return;
        }

        if ((url.pathname === "/api/doctors/list" || url.pathname === "/api/doctors/filter") && req.method === "POST") {
          let body = "";
          req.on("data", (chunk) => { body += chunk; });
          req.on("end", async () => {
            try {
              const payload = JSON.parse(body || "{}");
              const { listDoctors } = await import("./server/doctorHandler.mjs");
              const { doctors = [], q = "", search = "" } = payload;
              const result = listDoctors(doctors, { q: q || search });
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ success: true, count: result.length, doctors: result }));
            } catch (err) {
              res.statusCode = 400;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ success: false, error: err instanceof Error ? err.message : "Filter failed" }));
            }
          });
          return;
        }

        if (url.pathname === "/api/doctors" && req.method === "POST") {
          let body = "";
          req.on("data", (chunk) => { body += chunk; });
          req.on("end", async () => {
            try {
              const payload = JSON.parse(body || "{}");
              const { createDoctor } = await import("./server/doctorHandler.mjs");
              const { doctor, doctors = [] } = payload;
              const result = createDoctor(doctor || payload, doctors);

              try {
                const { db, COLLECTIONS } = await import("./server/firebase.mjs");
                const { doc, setDoc } = await import("firebase/firestore");
                const cleanData = {};
                for (const [k, v] of Object.entries(result.doctor)) {
                  if (v !== undefined) cleanData[k] = v;
                }
                await setDoc(doc(db, COLLECTIONS.doctors, result.doctor.id), cleanData);
              } catch (dbErr) {
                console.warn("[Vite doctor Firestore save warning]", (dbErr as Error).message);
              }

              res.statusCode = 201;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify(result));
            } catch (err) {
              res.statusCode = 400;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ success: false, error: err instanceof Error ? err.message : "Creation failed" }));
            }
          });
          return;
        }

        if (((url.pathname.startsWith("/api/doctors/") && req.method === "PUT") || (url.pathname === "/api/doctors/update" && req.method === "POST"))) {
          let body = "";
          req.on("data", (chunk) => { body += chunk; });
          req.on("end", async () => {
            try {
              const payload = JSON.parse(body || "{}");
              const { updateDoctor } = await import("./server/doctorHandler.mjs");
              const urlId = url.pathname.startsWith("/api/doctors/") && url.pathname !== "/api/doctors/update"
                ? url.pathname.replace("/api/doctors/", "")
                : null;
              const id = payload.id || urlId;
              const { patch, doctors = [] } = payload;
              const result = updateDoctor(id, patch || payload, doctors);

              try {
                const { db, COLLECTIONS } = await import("./server/firebase.mjs");
                const { doc, setDoc } = await import("firebase/firestore");
                const cleanData = {};
                for (const [k, v] of Object.entries(result.doctor)) {
                  if (v !== undefined) cleanData[k] = v;
                }
                await setDoc(doc(db, COLLECTIONS.doctors, result.doctor.id), cleanData, { merge: true });
              } catch (dbErr) {
                console.warn("[Vite doctor Firestore update warning]", (dbErr as Error).message);
              }

              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify(result));
            } catch (err) {
              res.statusCode = 400;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ success: false, error: err instanceof Error ? err.message : "Update failed" }));
            }
          });
          return;
        }

        if (((url.pathname.startsWith("/api/doctors/") && req.method === "DELETE") || (url.pathname === "/api/doctors/delete" && req.method === "POST"))) {
          let body = "";
          req.on("data", (chunk) => { body += chunk; });
          req.on("end", async () => {
            try {
              const payload = body ? JSON.parse(body) : {};
              const { deleteDoctor } = await import("./server/doctorHandler.mjs");
              const urlId = url.pathname.startsWith("/api/doctors/") && url.pathname !== "/api/doctors/delete"
                ? url.pathname.replace("/api/doctors/", "")
                : null;
              const id = payload.id || urlId;
              const { doctors = [] } = payload;
              const result = deleteDoctor(id, doctors);

              try {
                const { db, COLLECTIONS } = await import("./server/firebase.mjs");
                const { doc, deleteDoc } = await import("firebase/firestore");
                await deleteDoc(doc(db, COLLECTIONS.doctors, id));
              } catch (dbErr) {
                console.warn("[Vite doctor Firestore delete warning]", (dbErr as Error).message);
              }

              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify(result));
            } catch (err) {
              res.statusCode = 400;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ success: false, error: err instanceof Error ? err.message : "Delete failed" }));
            }
          });
          return;
        }

        // System Data Purge Endpoint (Developer only)
        if ((url.pathname === "/api/system/purge" || url.pathname === "/api/data/purge") && req.method === "POST") {
          let body = "";
          req.on("data", (chunk) => { body += chunk; });
          req.on("end", async () => {
            try {
              const payload = body ? JSON.parse(body) : {};
              const role = payload.role || req.headers["x-user-role"] || "";
              if (role !== "developer") {
                res.statusCode = 403;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ success: false, error: "Access Denied: Only Developer can purge system data." }));
                return;
              }

              const { clearInMemoryMedicines } = await import("./server/medicineHandler.mjs");
              if (typeof clearInMemoryMedicines === "function") {
                clearInMemoryMedicines();
              }

              const now = new Date().toISOString();
              try {
                const { db, COLLECTIONS } = await import("./server/firebase.mjs");
                const { doc, setDoc } = await import("firebase/firestore");
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
                console.warn("[Vite system purge Firestore warning]", (dbErr as Error).message);
              }

              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({
                success: true,
                message: "All old invoices, inventory tablets, audit logs, and report records purged successfully.",
                purgedAt: now,
              }));
            } catch (err) {
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ success: false, error: err instanceof Error ? err.message : "Purge failed" }));
            }
          });
          return;
        }

        next();
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile(), grnIntelligentParserPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
