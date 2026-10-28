import assert from "node:assert/strict";
import {
  validateMedicinePayload,
  createMedicine,
  updateMedicine,
  deleteMedicine,
} from "./medicineHandler.mjs";

console.log("==========================================");
console.log("RUNNING MEDICINE HANDLER UNIT TESTS");
console.log("==========================================\n");

// 1. Validation: Blank Quantity, Buying Price, Selling Price rejection
console.log("1. Testing validation when Quantity, Buying Price, or Selling Price are blank...");

const blankQuantity = validateMedicinePayload({
  name: "Paracetamol 500mg",
  supplier: "MedSupply Co",
  stock: "", // Blank by default
  purchasePrice: 10,
  sellingPrice: 15,
  expiry: "2027-12-31",
  mfgDate: "2026-01-01",
});
assert.equal(blankQuantity.isValid, false);
assert.ok(blankQuantity.errors.some((e) => e.includes("Quantity is required and cannot be blank")));
console.log("✓ Blank quantity was rejected as expected");

const blankBuyingPrice = validateMedicinePayload({
  name: "Paracetamol 500mg",
  supplier: "MedSupply Co",
  stock: 100,
  purchasePrice: "", // Blank by default
  sellingPrice: 15,
  expiry: "2027-12-31",
  mfgDate: "2026-01-01",
});
assert.equal(blankBuyingPrice.isValid, false);
assert.ok(blankBuyingPrice.errors.some((e) => e.includes("Buying price is required and cannot be blank")));
console.log("✓ Blank buying price was rejected as expected");

const blankSellingPrice = validateMedicinePayload({
  name: "Paracetamol 500mg",
  supplier: "MedSupply Co",
  stock: 100,
  purchasePrice: 10,
  sellingPrice: "", // Blank by default
  expiry: "2027-12-31",
  mfgDate: "2026-01-01",
});
assert.equal(blankSellingPrice.isValid, false);
assert.ok(blankSellingPrice.errors.some((e) => e.includes("Selling price is required and cannot be blank")));
console.log("✓ Blank selling price was rejected as expected");

// 2. Validation: Zero / Negative values
console.log("\n2. Testing validation when Quantity, Buying Price, or Selling Price are 0 or negative...");
const zeroStock = validateMedicinePayload({
  name: "Amoxicillin 250mg",
  supplier: "MedSupply Co",
  stock: 0,
  purchasePrice: 20,
  sellingPrice: 30,
  expiry: "2027-12-31",
  mfgDate: "2026-01-01",
});
assert.equal(zeroStock.isValid, false);
assert.ok(zeroStock.errors.some((e) => e.includes("Quantity must be a valid number greater than 0")));
console.log("✓ Zero quantity was rejected as expected");

const zeroBuying = validateMedicinePayload({
  name: "Amoxicillin 250mg",
  supplier: "MedSupply Co",
  stock: 50,
  purchasePrice: 0,
  sellingPrice: 30,
  expiry: "2027-12-31",
  mfgDate: "2026-01-01",
});
assert.equal(zeroBuying.isValid, false);
assert.ok(zeroBuying.errors.some((e) => e.includes("Buying price must be a valid positive amount greater than 0")));
console.log("✓ Zero buying price was rejected as expected");

// 3. Validation: Valid manual input
console.log("\n3. Testing valid manual user inputs...");
const validPayload = {
  name: "Azithromycin 500mg",
  supplier: "Apex Healthcare",
  batch: "AZ-2026",
  stock: "50", // Entered as string from input
  purchasePrice: "85.50", // Entered as string from input
  sellingPrice: "120.00", // Entered as string from input
  expiry: "2028-05-15",
  mfgDate: "2026-02-10",
  gst: "12",
  narcotic: false,
  minStock: "15",
};

const validResult = validateMedicinePayload(validPayload);
assert.equal(validResult.isValid, true);
assert.equal(validResult.cleanData.stock, 50);
assert.equal(validResult.cleanData.purchasePrice, 85.5);
assert.equal(validResult.cleanData.sellingPrice, 120);
assert.equal(validResult.cleanData.gst, 12);
assert.equal(validResult.cleanData.minStock, 15);
console.log("✓ Valid manual values cleanly parsed to numbers");

// 4. Create, Update, Delete operations
console.log("\n4. Testing createMedicine, updateMedicine, and deleteMedicine...");
const existingMedicines = [
  { id: "m_1", name: "Paracetamol", supplier: "Global Pharma", stock: 100, purchasePrice: 5, sellingPrice: 8 },
];

const created = createMedicine(validPayload, existingMedicines);
assert.equal(created.success, true);
assert.equal(created.medicines.length, 2);
assert.equal(created.medicine.name, "Azithromycin 500mg");
console.log("✓ Medicine created successfully");

const updated = updateMedicine(created.medicine.id, { stock: 75, sellingPrice: 125 }, created.medicines);
assert.equal(updated.success, true);
assert.equal(updated.medicine.stock, 75);
assert.equal(updated.medicine.sellingPrice, 125);
console.log("✓ Medicine updated successfully");

const deleted = deleteMedicine(created.medicine.id, updated.medicines);
assert.equal(deleted.success, true);
assert.equal(deleted.medicines.length, 1);
assert.equal(deleted.medicines[0].id, "m_1");
console.log("✓ Medicine deleted successfully");

console.log("\nALL MEDICINE HANDLER UNIT TESTS PASSED!");
