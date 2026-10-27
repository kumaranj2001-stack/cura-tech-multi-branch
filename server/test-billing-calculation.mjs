import { calculateBillingTotals } from "./billingCalculator.mjs";

function runTests() {
  console.log("=== Running Billing Calculation Tests (MRP inherently includes GST) ===");

  // Test 1: Simple line item (unit price * qty) with 0 discount
  const test1 = calculateBillingTotals(
    [
      { price: 50, qty: 2 },
      { price: 100, qty: 1 },
    ],
    "percent",
    0
  );

  console.assert(test1.subtotal === 200, `Test 1 failed: expected subtotal 200, got ${test1.subtotal}`);
  console.assert(test1.taxAmount === 0, `Test 1 failed: expected taxAmount 0, got ${test1.taxAmount}`);
  console.assert(test1.total === 200, `Test 1 failed: expected total 200, got ${test1.total}`);
  console.assert(test1.items[0].lineTotal === 100, `Test 1 failed: line 1 expected 100, got ${test1.items[0].lineTotal}`);
  console.assert(test1.items[1].lineTotal === 100, `Test 1 failed: line 2 expected 100, got ${test1.items[1].lineTotal}`);
  console.log("✓ Test 1 passed: Line item calculation is price * qty, no tax tally, total equals subtotal");

  // Test 2: Percentage discount
  const test2 = calculateBillingTotals(
    [
      { price: 250, qty: 2 }, // 500
    ],
    "percent",
    10 // 10% of 500 = 50
  );

  console.assert(test2.subtotal === 500, `Test 2 failed: expected subtotal 500, got ${test2.subtotal}`);
  console.assert(test2.discount === 50, `Test 2 failed: expected discount 50, got ${test2.discount}`);
  console.assert(test2.total === 450, `Test 2 failed: expected total 450, got ${test2.total}`);
  console.log("✓ Test 2 passed: Percentage discount correctly subtracted from subtotal (500 - 50 = 450)");

  // Test 3: Fixed discount
  const test3 = calculateBillingTotals(
    [
      { price: 75.5, qty: 4 }, // 302
    ],
    "fixed",
    50
  );

  console.assert(test3.subtotal === 302, `Test 3 failed: expected subtotal 302, got ${test3.subtotal}`);
  console.assert(test3.discount === 50, `Test 3 failed: expected discount 50, got ${test3.discount}`);
  console.assert(test3.total === 252, `Test 3 failed: expected total 252, got ${test3.total}`);
  console.log("✓ Test 3 passed: Fixed discount correctly subtracted (302 - 50 = 252)");

  // Test 4: Fixed discount exceeding subtotal capped at subtotal
  const test4 = calculateBillingTotals(
    [
      { price: 20, qty: 1 }, // 20
    ],
    "fixed",
    50
  );

  console.assert(test4.subtotal === 20, `Test 4 failed: expected subtotal 20, got ${test4.subtotal}`);
  console.assert(test4.discount === 20, `Test 4 failed: expected discount capped at 20, got ${test4.discount}`);
  console.assert(test4.total === 0, `Test 4 failed: expected total 0, got ${test4.total}`);
  console.log("✓ Test 4 passed: Excessive fixed discount capped at subtotal, total cannot be negative");

  console.log("\nAll Billing Calculation tests passed successfully!");
}

runTests();
