import { filterMedicines } from "./inventoryFilter.mjs";

function runTests() {
  console.log("=== Running Inventory Narcotic Drugs Filter Tests ===");

  const sampleMedicines = [
    { id: "m1", name: "Paracetamol 500mg", stock: 50, narcotic: false },
    { id: "m2", name: "Morphine Sulfate 10mg", stock: 20, narcotic: true },
    { id: "m3", name: "Amoxicillin 250mg", stock: 0, narcotic: false },
    { id: "m4", name: "Fentanyl Patch 25mcg", stock: 8, narcotic: true },
    { id: "m5", name: "Cetirizine 10mg", stock: 100 },
  ];

  // Test 1: Narcotic filter should only return medicines where narcotic === true
  const narcotics = filterMedicines(sampleMedicines, "narcotic");
  console.assert(narcotics.length === 2, `Expected 2 narcotic drugs, got ${narcotics.length}`);
  console.assert(narcotics.every((m) => m.narcotic === true), "All items must have narcotic === true");
  console.assert(narcotics[0].id === "m2", "First narcotic should be m2");
  console.assert(narcotics[1].id === "m4", "Second narcotic should be m4");
  console.log("✓ Test 1 passed: Correctly filtered only narcotic and controlled substances (2 of 5)");

  // Test 2: Out of stock filter
  const outOfStock = filterMedicines(sampleMedicines, "out");
  console.assert(outOfStock.length === 1 && outOfStock[0].id === "m3", "Expected 1 out of stock medicine");
  console.log("✓ Test 2 passed: Out of stock filter works properly");

  // Test 3: Empty input handling
  const emptyResult = filterMedicines([], "narcotic");
  console.assert(emptyResult.length === 0, "Empty list should return empty array");
  console.log("✓ Test 3 passed: Empty inventory handles gracefully");

  console.log("\nAll inventory filter tests passed successfully!");
}

runTests();
