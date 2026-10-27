import assert from "node:assert/strict";
import {
  isDeveloperRole,
  recalcApprovedGrn,
  listApprovedGrns,
  updateApprovedGrn,
  deleteApprovedGrn,
} from "./approvedGrnHandler.mjs";

console.log("==========================================");
console.log("RUNNING APPROVED GRN BACKEND TESTS");
console.log("==========================================\n");

// 1. Role verification
console.log("1. Testing Developer Role Checks...");
assert.equal(isDeveloperRole("developer"), true, "Developer should be allowed");
assert.equal(isDeveloperRole("superadmin"), true, "Superadmin should be allowed");
assert.equal(isDeveloperRole("DEVELOPER"), true, "Case-insensitive developer allowed");
assert.equal(isDeveloperRole("admin"), false, "Admin must be blocked");
assert.equal(isDeveloperRole("staff"), false, "Staff must be blocked");
assert.equal(isDeveloperRole(""), false, "Empty role must be blocked");
assert.equal(isDeveloperRole(null), false, "Null role must be blocked");
console.log("✓ Role checks passed.\n");

// Test data
const sampleApprovedGrn = {
  id: "grn_101",
  number: "GRN-101",
  date: "2026-10-20",
  supplierName: "Apex Pharma Ltd",
  invoiceNumber: "INV-APEX-9981",
  status: "approved",
  approvedBy: "superadmin",
  approvedAt: "2026-10-21T10:00:00.000Z",
  agencyDiscountPct: 5,
  specialDiscount: 50,
  items: [
    {
      name: "Amoxicillin 500mg",
      batch: "AMX-2026-A",
      qty: 100,
      strips: 10,
      tabsPerStrip: 10,
      freeStrips: 1,
      purchasePrice: 20,
      sellingPrice: 30,
      expiry: "2027-05",
      igst: 0,
      cgst: 6,
      sgst: 6,
    },
    {
      name: "Paracetamol 650mg",
      batch: "PCM-2026-B",
      qty: 200,
      strips: 20,
      tabsPerStrip: 10,
      freeStrips: 0,
      purchasePrice: 10,
      sellingPrice: 15,
      expiry: "2027-10",
      igst: 0,
      cgst: 6,
      sgst: 6,
    },
  ],
};

const samplePendingGrn = {
  id: "grn_102",
  number: "GRN-102",
  date: "2026-10-25",
  supplierName: "MedLife Distribution",
  invoiceNumber: "MED-5544",
  status: "pending",
  items: [],
};

const allGrns = [sampleApprovedGrn, samplePendingGrn];

// 2. Listing and Search Tests
console.log("2. Testing listApprovedGrns...");
assert.throws(
  () => listApprovedGrns(allGrns, {}, "admin"),
  /Access Denied/,
  "Admin should not be able to list approved GRNs"
);
assert.throws(
  () => listApprovedGrns(allGrns, {}, "staff"),
  /Access Denied/,
  "Staff should not be able to list approved GRNs"
);

const devList = listApprovedGrns(allGrns, {}, "developer");
assert.equal(devList.length, 1, "Only approved GRNs should be returned");
assert.equal(devList[0].id, "grn_101");

// Filter by search query
const searchBySupplier = listApprovedGrns(allGrns, { search: "Apex" }, "developer");
assert.equal(searchBySupplier.length, 1);

const searchByMedicine = listApprovedGrns(allGrns, { search: "Amoxicillin" }, "developer");
assert.equal(searchByMedicine.length, 1);

const searchNoMatch = listApprovedGrns(allGrns, { search: "NonExistentDrug" }, "developer");
assert.equal(searchNoMatch.length, 0);

console.log("✓ Listing and filtering passed.\n");

// 3. Recalculation Tests
console.log("3. Testing recalcApprovedGrn...");
const totals = recalcApprovedGrn(sampleApprovedGrn);
// Subtotal = 100 * 20 + 200 * 10 = 2000 + 2000 = 4000
assert.equal(totals.subtotal, 4000);
// Agency discount = 5% of 4000 = 200
assert.equal(totals.agencyDiscountAmt, 200);
// After agency = 4000 - 200 - 50 = 3750
// Tax = 12% of 3750 = 450
assert.equal(totals.taxAmount, 450);
// Total = 3750 + 450 = 4200
assert.equal(totals.total, 4200);
console.log("✓ Monetary calculations passed.\n");

// 4. Update Approved GRN & Inventory Sync
console.log("4. Testing updateApprovedGrn with Inventory Sync...");
const initialMedicines = [
  {
    id: "m_1",
    name: "Amoxicillin 500mg",
    batch: "AMX-2026-A",
    stock: 110, // 100 qty + 1 free strip * 10 = 110 units
    purchasePrice: 20,
    sellingPrice: 30,
    expiry: "2027-05",
  },
  {
    id: "m_2",
    name: "Paracetamol 650mg",
    batch: "PCM-2026-B",
    stock: 200,
    purchasePrice: 10,
    sellingPrice: 15,
    expiry: "2027-10",
  },
];

assert.throws(
  () => updateApprovedGrn("grn_101", {}, allGrns, initialMedicines, "admin"),
  /Access Denied/,
  "Admin must not be allowed to update approved GRN"
);

// Developer modifies quantity of Amoxicillin from 100 to 150 (strips 15 + 1 free = 160 units)
const updatedGrnData = {
  ...sampleApprovedGrn,
  items: [
    {
      ...sampleApprovedGrn.items[0],
      strips: 15,
      qty: 150,
      freeStrips: 1,
    },
    sampleApprovedGrn.items[1],
  ],
};

const updateResult = updateApprovedGrn(
  "grn_101",
  updatedGrnData,
  allGrns,
  initialMedicines,
  "developer",
  true
);

assert.equal(updateResult.success, true);
assert.equal(updateResult.updatedGrn.items[0].qty, 150);
// Old total units for Amoxicillin was 110, new is 150 + 10 = 160 (delta +50).
const updatedAmx = updateResult.medicines.find((m) => m.name === "Amoxicillin 500mg");
assert.equal(updatedAmx.stock, 160, "Medicine stock should be updated by +50 units");
console.log("✓ Approved GRN update and inventory sync passed.\n");

// 5. Delete Approved GRN & Stock Reversal
console.log("5. Testing deleteApprovedGrn with Stock Reversal...");
assert.throws(
  () => deleteApprovedGrn("grn_101", allGrns, initialMedicines, "staff"),
  /Access Denied/,
  "Staff must not be allowed to delete approved GRN"
);

const deleteResult = deleteApprovedGrn(
  "grn_101",
  allGrns,
  initialMedicines,
  "developer",
  true
);

assert.equal(deleteResult.success, true);
assert.equal(deleteResult.grns.length, 1, "Approved GRN should be removed");
assert.equal(deleteResult.grns[0].id, "grn_102");

// Amoxicillin stock had 110 units from GRN 101; stock should be reversed to 0
const reversedAmx = deleteResult.medicines.find((m) => m.name === "Amoxicillin 500mg");
assert.equal(reversedAmx.stock, 0, "Medicine stock should be reversed by 110 units");

// Paracetamol had 200 units from GRN 101; stock should be reversed to 0
const reversedPcm = deleteResult.medicines.find((m) => m.name === "Paracetamol 650mg");
assert.equal(reversedPcm.stock, 0, "Medicine stock should be reversed by 200 units");

console.log("✓ Approved GRN deletion and stock reversal passed.\n");

console.log("==========================================");
console.log("ALL APPROVED GRN TESTS PASSED SUCCESSFULLY");
console.log("==========================================");
