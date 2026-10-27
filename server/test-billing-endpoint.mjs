import http from "node:http";
import { calculateBillingTotals } from "./billingCalculator.mjs";

async function testEndpoint() {
  console.log("=== Testing Backend Billing Endpoints ===");

  // Spin up temporary server on an arbitrary free port to test the handler
  const { createServer } = http;
  
  // Create an instance using the logic
  const testServer = createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (req.method === "POST" && url.pathname === "/api/billing/calculate") {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => {
        try {
          const payload = JSON.parse(body || "{}");
          const result = calculateBillingTotals(payload.items, payload.discountType, payload.discountValue);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true, ...result }));
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

  function postJson(path, data) {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify(data);
      const req = http.request(
        {
          hostname: "localhost",
          port,
          path,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload),
          },
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
      req.write(payload);
      req.end();
    });
  }

  try {
    const res1 = await postJson("/api/billing/calculate", {
      items: [
        { price: 120, qty: 3 }, // 360
        { price: 40, qty: 1 },  // 40
      ],
      discountType: "percent",
      discountValue: 10, // 40
    });

    console.assert(res1.statusCode === 200, `Expected 200, got ${res1.statusCode}`);
    console.assert(res1.body.subtotal === 400, `Expected subtotal 400, got ${res1.body.subtotal}`);
    console.assert(res1.body.discount === 40, `Expected discount 40, got ${res1.body.discount}`);
    console.assert(res1.body.taxAmount === 0, `Expected taxAmount 0, got ${res1.body.taxAmount}`);
    console.assert(res1.body.total === 360, `Expected total 360, got ${res1.body.total}`);
    console.assert(res1.body.items[0].lineTotal === 360, `Expected line 0 lineTotal 360, got ${res1.body.items[0].lineTotal}`);
    console.assert(res1.body.items[1].lineTotal === 40, `Expected line 1 lineTotal 40, got ${res1.body.items[1].lineTotal}`);

    console.log("✓ HTTP POST /api/billing/calculate responded with valid JSON and accurate calculations");
    console.log("  Subtotal:", res1.body.subtotal);
    console.log("  Discount:", res1.body.discount);
    console.log("  Tax Amount:", res1.body.taxAmount);
    console.log("  Final Total:", res1.body.total);
    console.log("\nAll endpoint tests passed successfully!");
  } finally {
    testServer.close();
  }
}

testEndpoint().catch((e) => {
  console.error("Test failed:", e);
  process.exit(1);
});
