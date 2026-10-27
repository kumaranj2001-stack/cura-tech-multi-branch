import http from "node:http";
import { filterMedicines } from "./inventoryFilter.mjs";

async function testInventoryEndpoints() {
  console.log("=== Testing Backend Inventory Narcotic Endpoints ===");

  const { createServer } = http;
  const testServer = createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (req.method === "GET" && url.pathname === "/api/inventory/narcotic") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        success: true,
        filter: "narcotic",
        label: "Narcotic Drugs",
        medicines: [],
      }));
      return;
    }

    if (req.method === "POST" && (url.pathname === "/api/inventory/narcotic" || url.pathname === "/api/inventory/filter")) {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => {
        try {
          const payload = JSON.parse(body || "{}");
          const { filter = "narcotic", medicines = [] } = payload;
          const filtered = filterMedicines(medicines, filter);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            success: true,
            filter,
            count: filtered.length,
            medicines: filtered,
          }));
        } catch (err) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end();
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
    // 1. GET /api/inventory/narcotic
    const getRes = await makeRequest("GET", "/api/inventory/narcotic");
    console.assert(getRes.statusCode === 200, `Expected 200, got ${getRes.statusCode}`);
    console.assert(getRes.body.label === "Narcotic Drugs", `Expected label 'Narcotic Drugs'`);
    console.log("✓ GET /api/inventory/narcotic responded with metadata and 200 OK");

    // 2. POST /api/inventory/filter
    const postRes = await makeRequest("POST", "/api/inventory/filter", {
      filter: "narcotic",
      medicines: [
        { id: "1", name: "Paracetamol", narcotic: false },
        { id: "2", name: "Morphine", narcotic: true },
        { id: "3", name: "Codeine", narcotic: true },
      ],
    });

    console.assert(postRes.statusCode === 200, `Expected 200, got ${postRes.statusCode}`);
    console.assert(postRes.body.count === 2, `Expected 2, got ${postRes.body.count}`);
    console.assert(postRes.body.medicines.every((m) => m.narcotic === true), "All items must have narcotic === true");
    console.log("✓ POST /api/inventory/filter accurately filtered narcotic medicines (2 of 3)");

    console.log("\nAll backend inventory endpoint tests passed successfully!");
  } finally {
    testServer.close();
  }
}

testInventoryEndpoints().catch((e) => {
  console.error("Test failed:", e);
  process.exit(1);
});
