import http from "node:http";
import { validateMedicinePayload, createMedicine, updateMedicine, deleteMedicine } from "./medicineHandler.mjs";

async function testMedicineEndpoints() {
  console.log("=== Testing Backend Medicine Inventory Endpoints ===");

  const { createServer } = http;
  let inMemoryMedicines = [];

  const testServer = createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    const sendJson = (status, data) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };

    // Validation endpoint
    if (req.method === "POST" && (url.pathname === "/api/inventory/medicine/validate" || url.pathname === "/api/medicines/validate")) {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => {
        try {
          const payload = JSON.parse(body || "{}");
          const validation = validateMedicinePayload(payload);
          if (!validation.isValid) {
            return sendJson(400, { success: false, isValid: false, errors: validation.errors, error: validation.message });
          }
          return sendJson(200, { success: true, isValid: true, cleanData: validation.cleanData });
        } catch (err) {
          return sendJson(400, { success: false, error: err.message });
        }
      });
      return;
    }

    // Create endpoint
    if (req.method === "POST" && (url.pathname === "/api/inventory/medicine" || url.pathname === "/api/medicines")) {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => {
        try {
          const payload = JSON.parse(body || "{}");
          const medicineData = payload.medicine || payload;
          const result = createMedicine(medicineData, inMemoryMedicines);
          inMemoryMedicines = result.medicines;
          return sendJson(201, result);
        } catch (err) {
          return sendJson(err.statusCode || 400, { success: false, error: err.message, errors: err.errors });
        }
      });
      return;
    }

    // List endpoint
    if (req.method === "GET" && (url.pathname === "/api/inventory/medicines" || url.pathname === "/api/medicines")) {
      return sendJson(200, { success: true, count: inMemoryMedicines.length, medicines: inMemoryMedicines });
    }

    // Update endpoint
    if (req.method === "PUT" && (url.pathname.startsWith("/api/inventory/medicine/") || url.pathname.startsWith("/api/medicines/"))) {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => {
        try {
          const id = url.pathname.split("/").pop();
          const payload = JSON.parse(body || "{}");
          const result = updateMedicine(id, payload.patch || payload, inMemoryMedicines);
          inMemoryMedicines = result.medicines;
          return sendJson(200, result);
        } catch (err) {
          return sendJson(err.statusCode || 400, { success: false, error: err.message });
        }
      });
      return;
    }

    // Delete endpoint
    if (req.method === "DELETE" && (url.pathname.startsWith("/api/inventory/medicine/") || url.pathname.startsWith("/api/medicines/"))) {
      try {
        const id = url.pathname.split("/").pop();
        const result = deleteMedicine(id, inMemoryMedicines);
        inMemoryMedicines = result.medicines;
        return sendJson(200, result);
      } catch (err) {
        return sendJson(err.statusCode || 400, { success: false, error: err.message });
      }
    }

    sendJson(404, { success: false, error: "Not found" });
  });

  await new Promise((resolve) => testServer.listen(0, resolve));
  const port = testServer.address().port;

  function makeRequest(method, path, body = null) {
    return new Promise((resolve, reject) => {
      const payload = body ? JSON.stringify(body) : null;
      const req = http.request(
        {
          hostname: "localhost",
          port,
          path,
          method,
          headers: payload
            ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
            : {},
        },
        (res) => {
          let out = "";
          res.on("data", (chunk) => { out += chunk; });
          res.on("end", () => {
            resolve({ statusCode: res.statusCode, body: JSON.parse(out) });
          });
        }
      );
      req.on("error", reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  try {
    // 1. Validation test: Blank quantity
    console.log("1. Testing validation endpoint with blank Quantity...");
    const resBlankQty = await makeRequest("POST", "/api/inventory/medicine/validate", {
      name: "Metformin 500mg",
      supplier: "Sun Pharma",
      stock: "",
      purchasePrice: 20,
      sellingPrice: 35,
      expiry: "2027-01-01",
      mfgDate: "2026-01-01",
    });
    console.assert(resBlankQty.statusCode === 400, `Expected 400, got ${resBlankQty.statusCode}`);
    console.assert(resBlankQty.body.errors.some((e) => e.includes("Quantity is required and cannot be blank")));
    console.log("✓ Validation endpoint rejected blank Quantity (400 Bad Request)");

    // 2. Validation test: Blank Buying Price
    console.log("\n2. Testing validation endpoint with blank Buying Price...");
    const resBlankBuying = await makeRequest("POST", "/api/inventory/medicine/validate", {
      name: "Metformin 500mg",
      supplier: "Sun Pharma",
      stock: 100,
      purchasePrice: "",
      sellingPrice: 35,
      expiry: "2027-01-01",
      mfgDate: "2026-01-01",
    });
    console.assert(resBlankBuying.statusCode === 400, `Expected 400, got ${resBlankBuying.statusCode}`);
    console.assert(resBlankBuying.body.errors.some((e) => e.includes("Buying price is required and cannot be blank")));
    console.log("✓ Validation endpoint rejected blank Buying Price (400 Bad Request)");

    // 3. Validation test: Blank Selling Price
    console.log("\n3. Testing validation endpoint with blank Selling Price...");
    const resBlankSelling = await makeRequest("POST", "/api/inventory/medicine/validate", {
      name: "Metformin 500mg",
      supplier: "Sun Pharma",
      stock: 100,
      purchasePrice: 20,
      sellingPrice: "",
      expiry: "2027-01-01",
      mfgDate: "2026-01-01",
    });
    console.assert(resBlankSelling.statusCode === 400, `Expected 400, got ${resBlankSelling.statusCode}`);
    console.assert(resBlankSelling.body.errors.some((e) => e.includes("Selling price is required and cannot be blank")));
    console.log("✓ Validation endpoint rejected blank Selling Price (400 Bad Request)");

    // 4. Create Medicine with manually entered values
    console.log("\n4. Testing create endpoint with valid manual inputs...");
    const resCreate = await makeRequest("POST", "/api/inventory/medicine", {
      name: "Ibuprofen 400mg",
      supplier: "Cipla Health",
      batch: "IBU-102",
      stock: "250",
      purchasePrice: "14.50",
      sellingPrice: "22.00",
      expiry: "2027-06-30",
      mfgDate: "2026-01-15",
      gst: "12",
      narcotic: false,
      minStock: "20",
    });
    console.assert(resCreate.statusCode === 201, `Expected 201, got ${resCreate.statusCode}`);
    console.assert(resCreate.body.success === true);
    console.assert(resCreate.body.medicine.stock === 250);
    console.assert(resCreate.body.medicine.purchasePrice === 14.5);
    console.assert(resCreate.body.medicine.sellingPrice === 22);
    console.log("✓ Medicine created successfully with clean numbers (201 Created)");

    const createdId = resCreate.body.medicine.id;

    // 5. List Medicines
    console.log("\n5. Testing GET /api/inventory/medicines...");
    const resList = await makeRequest("GET", "/api/inventory/medicines");
    console.assert(resList.statusCode === 200);
    console.assert(resList.body.count === 1);
    console.log("✓ Listed inventory medicines successfully");

    // 6. Update Medicine
    console.log("\n6. Testing PUT /api/inventory/medicine/:id...");
    const resUpdate = await makeRequest("PUT", `/api/inventory/medicine/${createdId}`, {
      stock: 300,
      sellingPrice: 25.00,
    });
    console.assert(resUpdate.statusCode === 200);
    console.assert(resUpdate.body.medicine.stock === 300);
    console.assert(resUpdate.body.medicine.sellingPrice === 25);
    console.log("✓ Medicine updated successfully");

    // 7. Delete Medicine
    console.log("\n7. Testing DELETE /api/inventory/medicine/:id...");
    const resDelete = await makeRequest("DELETE", `/api/inventory/medicine/${createdId}`);
    console.assert(resDelete.statusCode === 200);
    console.assert(resDelete.body.medicines.length === 0);
    console.log("✓ Medicine deleted successfully");

    console.log("\nAll backend medicine endpoint tests passed successfully!");
  } finally {
    testServer.close();
  }
}

testMedicineEndpoints().catch((e) => {
  console.error("Test failed:", e);
  process.exit(1);
});
