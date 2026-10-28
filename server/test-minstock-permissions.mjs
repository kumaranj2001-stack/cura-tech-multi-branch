import assert from "node:assert/strict";
import {
  isAuthorizedForMinStock,
  updateMedicineMinStock,
  updateMedicine,
} from "./medicineHandler.mjs";

console.log("==================================================");
console.log("TESTING MINIMUM STOCK ROLE PERMISSIONS & LOGIC");
console.log("==================================================\n");

// 1. Role authorization check
console.log("1. Checking role authorization permissions...");
assert.equal(isAuthorizedForMinStock("developer"), true, "Developer should be authorized");
assert.equal(isAuthorizedForMinStock("admin"), true, "Admin should be authorized");
assert.equal(isAuthorizedForMinStock("superadmin"), true, "Superadmin should be authorized");
assert.equal(isAuthorizedForMinStock("staff"), false, "Staff should NOT be authorized");
assert.equal(isAuthorizedForMinStock(""), false, "Empty role should NOT be authorized");
console.log("✓ Role authorization checks passed (Developer & Admin allowed, Staff blocked)");

// 2. Testing increment / decrement by exactly one
console.log("\n2. Testing increment and decrement by exactly 1...");
const medicines = [
  { id: "m_1", name: "Paracetamol", supplier: "Sun Pharma", minStock: 10, stock: 50 },
];

// Developer increments by 1: 10 -> 11
const resInc = updateMedicineMinStock("m_1", 10 + 1, "developer", medicines);
assert.equal(resInc.medicine.minStock, 11);
console.log("✓ Increment by exactly 1 works (10 -> 11)");

// Admin decrements by 1: 11 -> 10
const resDec = updateMedicineMinStock("m_1", 11 - 1, "admin", resInc.medicines);
assert.equal(resDec.medicine.minStock, 10);
console.log("✓ Decrement by exactly 1 works (11 -> 10)");

// Manual keyboard entry (e.g. user typed 25)
const resManual = updateMedicineMinStock("m_1", 25, "developer", resDec.medicines);
assert.equal(resManual.medicine.minStock, 25);
console.log("✓ Manual keyboard entry works (set to 25)");

// 3. Testing Staff rejection (403 Forbidden)
console.log("\n3. Testing Staff restriction on customizing Minimum Stock...");
assert.throws(
  () => {
    updateMedicineMinStock("m_1", 30, "staff", resManual.medicines);
  },
  (err) => {
    assert.equal(err.statusCode, 403);
    assert.ok(err.message.includes("Access Denied: Only Developer and Admin roles can customize Minimum Stock"));
    return true;
  }
);
console.log("✓ Staff attempt was blocked with 403 Access Denied");

// 4. Testing updateMedicine with staff role attempting minStock change
assert.throws(
  () => {
    updateMedicine("m_1", { minStock: 40 }, resManual.medicines, "staff");
  },
  (err) => {
    assert.equal(err.statusCode, 403);
    return true;
  }
);
console.log("✓ updateMedicine blocked staff from changing minStock with 403");

console.log("\nALL MINIMUM STOCK PERMISSION & LOGIC TESTS PASSED!");
