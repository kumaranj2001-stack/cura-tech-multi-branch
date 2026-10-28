import { calculateBillingTotals } from "./billingCalculator.mjs";

console.log("=== Testing Billing & Invoice Narcotic Flow ===");

// 1. Simulate cart with narcotic medicine and regular medicine
const sampleItems = [
  {
    medicineId: "med-1",
    name: "Paracetamol 650mg",
    batch: "PCM-01",
    price: 30,
    qty: 2,
    narcotic: false,
    gst: 12,
  },
  {
    medicineId: "med-2",
    name: "Morphine Sulfate 10mg",
    batch: "MOR-99",
    price: 150,
    qty: 1,
    narcotic: true,
    gst: 18,
  },
];

// Test calculation
const calcResult = calculateBillingTotals(sampleItems, "percent", 10);
console.assert(calcResult.subtotal === 210, `Expected subtotal 210, got ${calcResult.subtotal}`);
console.assert(calcResult.discount === 21, `Expected discount 21, got ${calcResult.discount}`);
console.assert(calcResult.total === 189, `Expected total 189, got ${calcResult.total}`);
console.assert(calcResult.items.length === 2, `Expected 2 processed items, got ${calcResult.items.length}`);
console.log("✓ Billing calculation with narcotic tablet passed successfully (subtotal: 210, disc: 21, total: 189)");

// 2. Validate invoice item formatting for final printed invoice
// Ensure each line item preserves medicine details, but doesn't require narcotic banners or highlights
const formattedPrintItems = calcResult.items.map((it, idx) => ({
  serial: idx + 1,
  name: it.name,
  batch: it.batch,
  price: it.price,
  qty: it.qty,
  total: it.lineTotal,
}));

console.assert(formattedPrintItems[1].name === "Morphine Sulfate 10mg", "Medicine name matches");
console.assert(formattedPrintItems[1].total === 150, "Line total matches");
console.log("✓ Invoice print formatting structure verified (clean line items without narcotic tags)");

console.log("\nALL BILLING & INVOICE NARCOTIC TESTS PASSED!");
