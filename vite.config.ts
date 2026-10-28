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

        // Inventory Medicine List middleware
        if ((url.pathname === "/api/inventory/medicines" || url.pathname === "/api/medicines") && req.method === "GET") {
          try {
            const { db, COLLECTIONS } = await import("./server/firebase.mjs");
            const { getDocs, collection } = await import("firebase/firestore");
            const snap = await getDocs(collection(db, COLLECTIONS.medicines));
            const firestoreDocs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ success: true, source: "firestore", count: firestoreDocs.length, medicines: firestoreDocs }));
          } catch (err) {
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ success: true, source: "local", count: 0, medicines: [], warning: (err as Error).message }));
          }
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

              try {
                const { db, COLLECTIONS } = await import("./server/firebase.mjs");
                const { doc, setDoc } = await import("firebase/firestore");
                const cleanData: Record<string, unknown> = {};
                for (const [k, v] of Object.entries(result.medicine)) {
                  if (v !== undefined) cleanData[k] = v;
                }
                await setDoc(doc(db, COLLECTIONS.medicines, result.medicine.id), cleanData);
              } catch (dbErr) {
                console.warn("[Vite medicine Firestore save warning]", (dbErr as Error).message);
              }

              res.statusCode = 201;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify(result));
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
              const { patch, medicines = [] } = payload;
              const result = updateMedicine(id, patch || payload, medicines);

              try {
                const { db, COLLECTIONS } = await import("./server/firebase.mjs");
                const { doc, setDoc } = await import("firebase/firestore");
                const cleanData: Record<string, unknown> = {};
                for (const [k, v] of Object.entries(result.medicine)) {
                  if (v !== undefined) cleanData[k] = v;
                }
                await setDoc(doc(db, COLLECTIONS.medicines, result.medicine.id), cleanData, { merge: true });
              } catch (dbErr) {
                console.warn("[Vite medicine Firestore update warning]", (dbErr as Error).message);
              }

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

              try {
                const { db, COLLECTIONS } = await import("./server/firebase.mjs");
                const { doc, deleteDoc } = await import("firebase/firestore");
                await deleteDoc(doc(db, COLLECTIONS.medicines, id));
              } catch (dbErr) {
                console.warn("[Vite medicine Firestore delete warning]", (dbErr as Error).message);
              }

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
