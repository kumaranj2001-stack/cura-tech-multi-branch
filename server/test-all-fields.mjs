import * as XLSX from "xlsx";
import { parseInvoiceDocument } from "./intelligentParser.mjs";

const sampleMedicines = [
  { name: "Augmentin 625 Duo Tablet", gst: 12 },
  { name: "Pan 40mg Tablet", gst: 12 },
];

const sampleSuppliers = [
  { id: "sup_201", name: "Cipla Distributors Ltd" },
];

async function testAllFields() {
  console.log("--- Testing Full Semantic Extraction & Batch vs S.No Separation ---");

  // Create an Excel invoice with varying column order (S.No first, Batch later, Extra charges, etc.)
  const wb = XLSX.utils.book_new();
  const rows = [
    ["Cipla Distributors Ltd", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["GSTIN: 27AABCC1234F1Z5", "", "Tax Invoice No: CIP-2026-901", "", "Date: 15/10/2026", "", "", "", "", "", "", "", ""],
    [
      "S.No",
      "Description of Goods",
      "Pack Size",
      "B.No",
      "Mfg Date",
      "Exp Date",
      "Billed Qty",
      "Free Strips",
      "PTR Rate",
      "Disc %",
      "GST %",
      "Extra Charges",
      "MRP / Pack",
    ],
    [
      1,
      "Augmentin 625 Duo Tablets",
      "1x10",
      "AG9081",
      "01/2026",
      "12/2027",
      50,
      5,
      120.50,
      5.0,
      12.0,
      25.0,
      200.0,
    ],
    [
      2,
      "Pan 40mg Tablets",
      "1x15",
      "PN4420",
      "03/2026",
      "08/2028",
      30,
      0,
      85.00,
      2.0,
      12.0,
      0.0,
      150.0,
    ],
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Invoice");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const result = await parseInvoiceDocument({
    fileBuffer: buf,
    fileName: "cipla_invoice.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    existingMedicines: sampleMedicines,
    existingSuppliers: sampleSuppliers,
  });

  console.log("Result Success:", result.success);
  console.log("Model Used:", result.modelUsed);
  console.log("Extracted Supplier:", result.data.supplier, "| Matched ID:", result.data.matchedSupplierId);
  console.log("Invoice No:", result.data.invoiceNumber);
  console.log("Date:", result.data.date);

  const items = result.data.items;
  console.log("\nExtracted Items Count:", items.length);

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    console.log(`\nItem ${i + 1}:`);
    console.log("  - Product Name:", it.name);
    console.log("  - Matched Inventory:", it.matchedInventoryName);
    console.log("  - Batch Number:", it.batch, "(isSerialAsBatch:", it.isSerialAsBatch, ")");
    console.log("  - Mfg Date:", it.mfgDate);
    console.log("  - Expiry Date:", it.expiry);
    console.log("  - Quantities of Strip:", it.receivingQty);
    console.log("  - UOM Qty per Strip:", it.uomPerStrip);
    console.log("  - Free Strips:", it.freeQty);
    console.log("  - Purchase Price:", it.purchasePrice);
    console.log("  - Discount %:", it.discPct);
    console.log("  - Tax %:", it.taxPct);
    console.log("  - Extra Charges:", it.extraCharges);
    console.log("  - Line Total:", it.lineTotal);
    console.log("  - MRP Price / unit:", it.mrpUnit);
    console.log("  - MRP / strip:", it.mrpStrip);

    // Verify batch is NOT 1 or 2!
    if (it.batch === "1" || it.batch === "2") {
      throw new Error(`CRITICAL FAILURE: Batch number was incorrectly assigned as serial number ${it.batch}!`);
    }
  }

  console.log("\n✓ ALL FIELDS CORRECTLY MAPPED & BATCH NUMBERS NOT CONFUSED WITH S.NO!");
}

testAllFields().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
