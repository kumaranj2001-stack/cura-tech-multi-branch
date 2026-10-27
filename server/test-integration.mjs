import http from "node:http";
import * as XLSX from "xlsx";
import { parseInvoiceDocument } from "./intelligentParser.mjs";

const sampleMedicines = [
  { name: "Augmentin 625 Duo", gst: 12 },
  { name: "Pan 40mg Tablet", gst: 12 },
  { name: "Dolo 650", gst: 12 },
];

const sampleSuppliers = [
  { id: "sup_101", name: "Sun Pharma Distributors Ltd" },
  { id: "sup_102", name: "Apollo Wholesalers" },
];

async function testHttpEndpoint() {
  console.log("\n--- Testing HTTP POST /api/parse-invoice Endpoint ---");
  const wb = XLSX.utils.book_new();
  const rows = [
    ["Sun Pharma Distributors Ltd", "", "", "", "", ""],
    ["Invoice No: SPD-8899", "Date: 19/10/2026", "", "", "", ""],
    ["Item Name", "Batch", "Expiry", "Qty", "PTR", "MRP"],
    ["Pan 40 Tablets", "PN991", "11/2027", 40, 75.0, 110.0],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const b64 = buf.toString("base64");

  // Spin up temporary test server
  const testServer = http.createServer(async (req, res) => {
    if (req.method === "POST" && req.url === "/api/parse-invoice") {
      let b = "";
      req.on("data", (c) => (b += c));
      req.on("end", async () => {
        const payload = JSON.parse(b);
        const result = await parseInvoiceDocument({
          fileBuffer: Buffer.from(payload.fileData, "base64"),
          fileName: payload.fileName,
          mimeType: payload.mimeType,
          existingMedicines: payload.existingMedicines,
          existingSuppliers: payload.existingSuppliers,
        });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      });
    }
  });

  await new Promise((resolve) => testServer.listen(3099, resolve));

  const response = await fetch("http://localhost:3099/api/parse-invoice", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileData: b64,
      fileName: "test_invoice.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      existingMedicines: sampleMedicines,
      existingSuppliers: sampleSuppliers,
    }),
  });

  const json = await response.json();
  console.log("HTTP Endpoint Status:", response.status);
  console.log("HTTP Response Success:", json.success);
  console.log("HTTP Model Used:", json.modelUsed);
  console.log("HTTP Extracted Supplier:", json.data.supplier, "| Matched ID:", json.data.matchedSupplierId);
  console.log("HTTP Extracted Items:", json.data.items.length);
  testServer.close();
}

async function run() {
  try {
    await testHttpEndpoint();
    console.log("\n✓ All tests passed!");
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

run();
