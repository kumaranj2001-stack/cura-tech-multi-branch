/**
 * Robust validation and normalization utility to verify pharmaceutical batch numbers
 * and ensure that row serial numbers, HSN/SAC codes, or item numbers are not
 * mistakenly assigned as batch numbers.
 */

export interface BatchValidationResult {
  isValid: boolean;
  isSerialAsBatch: boolean;
  isHsnAsBatch: boolean;
  cleanBatch: string;
  warning?: string;
  extractedFromText?: string | null;
}

/**
 * Validates an extracted batch number against common OCR/LLM errors where
 * the row sequence number (S.No, Sl.No, Sr.No, 1, 2, 3...) or an HSN code
 * was incorrectly captured instead of the genuine manufacturer batch.
 */
export function validateBatchNumber({
  batch,
  rowIdx = 0,
  productName = "",
  totalRows = 1,
  allBatches = [],
}: {
  batch: unknown;
  rowIdx?: number;
  productName?: string;
  totalRows?: number;
  allBatches?: unknown[];
}): BatchValidationResult {
  const rawBatch = String(batch ?? "").trim();
  let isSerialAsBatch = false;
  let isHsnAsBatch = false;
  let warning = "";
  let cleanBatch = rawBatch;

  const rowNumberStr = String(rowIdx + 1);
  const rowNumberPad = String(rowIdx + 1).padStart(2, "0");
  const isExactRowIndex =
    rawBatch === rowNumberStr ||
    rawBatch === rowNumberPad ||
    rawBatch === String(rowIdx);

  // Check if multiple items in table have sequential numbers: ["1", "2", "3", ...]
  const isSequentialSerial =
    allBatches.length > 1 &&
    allBatches.every((b, i) => {
      const s = String(b ?? "").trim();
      return s === String(i + 1) || s === String(i + 1).padStart(2, "0");
    });

  // Small single or double digit pure integer without letters (e.g. "1", "2", "01")
  const isPureSmallInteger = /^[0-9]{1,2}$/.test(rawBatch);

  // Common serial number prefixes or labels like "S.No-1", "Sr1", "ITEM-1", "#1"
  const isSerialLabel = /^(?:s\.?no|sl\.?no|sr\.?no|item|itemno|#)[\s.:#-]*\d+$/i.test(rawBatch);

  // HSN / SAC codes in Indian pharma (e.g., 3004, 300490, 30049000, 30049099, or pure 8-digit codes)
  if (/^300[34]\d{0,6}$/.test(rawBatch) || /^\d{8}$/.test(rawBatch)) {
    isHsnAsBatch = true;
  }

  if (
    isExactRowIndex ||
    (isPureSmallInteger && (totalRows > 1 || rawBatch === "1")) ||
    isSequentialSerial ||
    isSerialLabel
  ) {
    isSerialAsBatch = true;
  }

  let extractedFromText: string | null = null;

  // If flagged as serial number or HSN or empty, attempt to recover true batch from product name
  if (isSerialAsBatch || isHsnAsBatch || !rawBatch) {
    // Check for explicit batch tags like "B.No: B2401", "Batch: LOT-99", "B/N: 2408A", "Lot: 45A1"
    const explicitBatchMatch = productName.match(
      /(?:b\.?no|batch|lot|b\/n|bno)[\s.:#-]+([a-z0-9/-]{3,15})/i
    );
    if (explicitBatchMatch && !/^\d{1,2}$/.test(explicitBatchMatch[1])) {
      extractedFromText = explicitBatchMatch[1].trim();
      cleanBatch = extractedFromText;
      isSerialAsBatch = false;
      isHsnAsBatch = false;
    } else {
      // Look for alphanumeric token inside product name that matches pharma lot pattern
      // Avoid common units like "625MG", "100ML", "10TAB", "10S"
      const tokenMatch = productName.match(/\b([A-Z]{1,3}\d{3,8}[A-Z0-9]*)\b/i);
      if (tokenMatch && !/^(MG|ML|GM|TAB|CAP|VIAL|AMP|IU|USP|BP|IP)/i.test(tokenMatch[1])) {
        extractedFromText = tokenMatch[1].trim();
        cleanBatch = extractedFromText;
        isSerialAsBatch = false;
        isHsnAsBatch = false;
      }
    }
  }

  if (isSerialAsBatch) {
    warning = `Serial number ("${rawBatch}") was detected as batch number. Genuine manufacturer batch required.`;
    cleanBatch = "";
  } else if (isHsnAsBatch) {
    warning = `HSN/SAC code ("${rawBatch}") was detected as batch number. Genuine manufacturer batch required.`;
    cleanBatch = "";
  }

  return {
    isValid: !isSerialAsBatch && !isHsnAsBatch && cleanBatch.length > 0,
    isSerialAsBatch,
    isHsnAsBatch,
    cleanBatch,
    warning,
    extractedFromText,
  };
}
