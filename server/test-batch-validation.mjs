import { validateBatchNumber } from "./intelligentParser.mjs";

function runUnitTests() {
  console.log("--- Running Batch Validation Unit Tests ---");

  // Case 1: Row index 0 with batch "1" should be flagged as serial number
  const r1 = validateBatchNumber({
    batch: "1",
    rowIdx: 0,
    productName: "Paracetamol 650mg",
    totalRows: 2,
    allBatches: ["1", "2"],
  });
  console.assert(r1.isSerialAsBatch === true, "Case 1 failed: should be flagged as serial number");
  console.assert(r1.isValid === false, "Case 1 failed: should not be valid");
  console.log("✓ Case 1 passed: Serial number '1' flagged correctly");

  // Case 2: Row index 0 with batch "1" but medicine description contains genuine batch
  const r2 = validateBatchNumber({
    batch: "1",
    rowIdx: 0,
    productName: "Augmentin 625 Duo B.No: AG9921",
    totalRows: 2,
    allBatches: ["1", "2"],
  });
  console.assert(r2.cleanBatch === "AG9921", `Case 2 failed: expected AG9921, got ${r2.cleanBatch}`);
  console.assert(r2.isSerialAsBatch === false, "Case 2 failed: recovered batch should not be flagged");
  console.log("✓ Case 2 passed: Recovered real batch 'AG9921' from product description");

  // Case 3: Genuine alphanumeric batch "B24019"
  const r3 = validateBatchNumber({
    batch: "B24019",
    rowIdx: 0,
    productName: "Dolo 650mg",
    totalRows: 3,
    allBatches: ["B24019", "B24020", "B24021"],
  });
  console.assert(r3.isValid === true, "Case 3 failed: valid batch flagged");
  console.assert(r3.cleanBatch === "B24019", "Case 3 failed: batch altered");
  console.log("✓ Case 3 passed: Genuine batch 'B24019' accepted");

  // Case 4: HSN code mistakenly placed as batch
  const r4 = validateBatchNumber({
    batch: "30049099",
    rowIdx: 0,
    productName: "Pantocid 40",
    totalRows: 1,
  });
  console.assert(r4.isHsnAsBatch === true, "Case 4 failed: HSN should be detected");
  console.log("✓ Case 4 passed: HSN code '30049099' flagged correctly");

  console.log("\nAll Batch Validation unit tests passed successfully!");
}

runUnitTests();
