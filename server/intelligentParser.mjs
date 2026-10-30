import * as XLSX from "xlsx";
import { config } from "./config.mjs";

export const PRIMARY_MODEL = "google/gemini-2.5-flash";
export const FALLBACK_MODEL = "openai/gpt-4o-mini";

/**
 * Validates extracted batch against serial numbers, row indices, and HSN codes.
 */
export function validateBatchNumber({
  batch,
  rowIdx = 0,
  productName = "",
  totalRows = 1,
  allBatches = [],
}) {
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

  // HSN / SAC codes in Indian pharma (e.g., 3004, 300490, 30049000, 30049099)
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

  let extractedFromText = null;

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

/**
 * Multimodal LLM prompt explicitly commanding semantic analysis of column headers,
 * field values, layout patterns, and strict anti-confusion rules for batch vs serial numbers.
 */
function buildSystemPrompt() {
  return `You are an expert pharmaceutical document parser and invoice normalization engine for a hospital/pharmacy ERP system (Guru Pharma).
Your mission is to accurately extract invoice header details and normalize all product line items from the attached supplier invoice document.

### CRITICAL ARCHITECTURAL DIRECTIVE - SEMANTIC ANALYSIS OVER FIXED POSITIONS:
1. You MUST perform deep SEMANTIC ANALYSIS of column headers, row labels, abbreviations, visual table columns, and data values.
2. DO NOT rely on fixed column positions or assume any standard column ordering! Real-world pharmaceutical invoices have wildly diverse layouts:
   - For example: S.No might be in Column 1 or absent; Batch might be before Expiry, or in the same cell as Expiry, or after Qty; PTR might appear before MRP or after MRP; Tax/GST might appear in individual columns (CGST + SGST) or as a combined IGST column; Free Qty might be labeled "Free", "Bonus", "Scheme", or "Sch Qty".
   - You must deduce the true meaning of each column and value by understanding pharmaceutical domain terminology and table headers rather than relying on column index.

### COMPREHENSIVE FIELD MAPPINGS & SEMANTIC RULES:

1. INVOICE HEADER DETAILS:
   - supplier (Select Supplier): The distributor, wholesaler, or manufacturer issuing the bill. Look for "Sold By", "Billed From", "Consignor", "From", "Distributor", or top letterhead company name. Cross-reference with the provided "Known Registered Suppliers" list.
   - matchedSupplierId: If the supplier matches one from the provided registered suppliers list (by name or alias), output its exact "id". Otherwise null.
   - invoiceNumber: The supplier's invoice/bill number. Synonyms: "Invoice No", "Bill No", "Inv #", "Tax Invoice No", "Doc No", "Memo No". Strip prefixes like "INV:", "Bill No:".
   - date (Receipt Date): Invoice billing/receipt date. Synonyms: "Invoice Date", "Bill Date", "Dated", "Doc Date". Convert any format (DD/MM/YYYY, DD-MMM-YYYY, MM/DD/YYYY) into strict YYYY-MM-DD. Must not be in the future.
   - subtotal: Stated invoice subtotal or null.
   - taxAmount: Total invoice tax / GST amount or null.
   - total: Grand total invoice amount or null.

2. PRODUCT LINE ITEMS EXTRACTION:
   Extract EVERY single pharmaceutical product / medicine listed in the invoice table. DO NOT omit any item!
   For each line item, extract and normalize:
   - serialNo: The row sequence number printed on the invoice table (1, 2, 3...) or row index.
   - name (Product Name / Drug Name / Medicine Name): Clean, normalized medicine name including strength and form (e.g., "Augmentin 625 Duo Tablet", "Pan 40mg Tab", "Dolo 650mg", "Azithromycin 500mg"). Synonyms: "Description of Goods", "Particulars", "Drug Name", "Product Description", "Item Name". Strip row numbers (e.g. leading "1. "), strip separate HSN codes, and remove internal noise.
   - matchedInventoryName: If there is an exact or near match in the provided Known Inventory Medicines list, output the exact name from inventory. Otherwise null.
   - batch (Batch Number): Alphanumeric manufacturer lot code (e.g. "B24019", "AG7812", "L-9023", "24B012").
     >>> STRICT VALIDATION - BATCH NUMBER VS SERIAL NUMBER:
     NEVER EVER assign the row serial number (e.g. 1, 2, 3... Sl.No, S.No, Sr.No, Item #) as the Batch Number!
     The serial number is simply a row counter (1, 2, 3...). The Batch Number is the manufacturer's batch code.
     If the invoice has an S.No column with 1, 2, 3 and a Batch column with alphanumeric codes, ALWAYS take the Batch column.
     If no batch number is visible in the table, look for "B.No:" or "Lot:" in the description, or output empty string (""). NEVER fill in "1", "2", "3"!
     Never assign an HSN code (e.g., 3004, 30049099) as the batch number.
   - mfgDate (Manufacturer Date): Standardized date in YYYY-MM-DD format if available, or empty string (""). Synonyms: "Mfg Date", "Mfd", "M.Date", "DOM". Cannot be in the future.
   - expiry (Expiry Date): Expiration date standardized in strict YYYY-MM-DD format. Synonyms: "Exp Date", "Expiry", "Exp", "E.Date", "Use Before". Pharmaceutical invoices frequently show MM/YY or MM/YYYY like "05/27" or "11/2026"; convert to the LAST calendar day of that month (e.g. "2027-05-31" or "2026-11-30").
   - receivingQty (Quantities of Strip): Number of physical packs/strips/bottles invoiced. Synonyms: "Qty", "Quantity", "Billed Qty", "Rec Qty", "Packs", "Strips", "Box". Must be a positive number.
   - uomPerStrip (UOM Qty in per Strip): Number of tablets, capsules, or units in ONE single strip/pack. Synonyms: "Pack Size", "Packing", "Pkg", "Pack", "UOM", "Tabs/Strip", "1x10", "10's", "10T", "15's", "1x15", "1x1", "100ml". If standard strip of 10 tablets, output 10. If 15 tablets, 15. If syrup/liquid/cream/bottle/tube, output 1. Default to 10 for tablets/capsules if unspecified, 1 for liquids/single units.
   - freeQty (Free To Society / Free Strips): Bonus or free strips/packs provided by supplier (number). Synonyms: "Free", "Free Qty", "Bonus", "Scheme", "Sch Qty", "F.Qty", "Free Strips". Output 0 if none.
   - purchasePrice (Purchase Price): Net rate / PTR / purchase price per pack/strip (number) before tax and discount. Synonyms: "Rate", "PTR", "P.Rate", "Purchase Price", "Price to Retailer", "Unit Rate", "Cost", "Net Rate", "Buy Price".
   - discPct (Discount %): Product-level discount percentage (number between 0 and 100). Synonyms: "Disc %", "Dis %", "CD %", "Cash Disc %", "Trade Disc %", "Scheme %", "Less %". Output 0 if none.
   - taxPct (Tax %): Total GST / tax percentage for the item (standard Indian pharma slabs: 0, 5, 12, 18, 28). If CGST 6% and SGST 6% are shown in separate columns, sum them to 12. If IGST 12% is shown, output 12.
   - extraCharges (Extra Charges): Any line-level extra fees, cess, handling, or freight charges (number, 0 if none).
   - lineTotal (Total Amount Line): Total line purchase amount including taxes, discounts, and extra charges. Verify: (receivingQty * purchasePrice * (1 - discPct/100)) * (1 + taxPct/100) + extraCharges.
   - mrpUnit (MRP Price / unit): Maximum Retail Price per individual unit/tablet (number). If invoice prints MRP per strip (e.g. ₹110 for strip of 10), mrpUnit is 11.00 (110 / 10). If printed per unit, output that value.
   - mrpStrip (Enter MRP/unit / MRP per Strip): Maximum Retail Price per full strip/pack (number, e.g. 110.00). If mrpUnit is known, mrpStrip = mrpUnit * uomPerStrip.
   - confidence: "high", "medium", or "low".

3. ACCURACY & OUTPUT HYGIENE:
   - DO NOT hallucinate extra items. Only extract actual product rows.
   - Ignore header/footer summary lines, freight totals, GST summaries, or bank details as line items.
   - Return ONLY a valid JSON object matching this schema.

OUTPUT SCHEMA:
{
  "supplier": string,
  "matchedSupplierId": string | null,
  "invoiceNumber": string,
  "date": string,
  "subtotal": number | null,
  "taxAmount": number | null,
  "total": number | null,
  "items": [
    {
      "serialNo": number,
      "name": string,
      "matchedInventoryName": string | null,
      "batch": string,
      "mfgDate": string,
      "expiry": string,
      "receivingQty": number,
      "uomPerStrip": number,
      "freeQty": number,
      "purchasePrice": number,
      "discPct": number,
      "taxPct": number,
      "extraCharges": number,
      "lineTotal": number,
      "mrpUnit": number,
      "mrpStrip": number,
      "confidence": "high" | "medium" | "low"
    }
  ]
}`;
}

/**
 * Normalizes text extracted from JSON response.
 */
function cleanJsonResponse(raw) {
  if (!raw) return "";
  let text = String(raw).trim();
  // Strip markdown code fences if present
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "");
    text = text.replace(/\s*```$/i, "");
  }
  return text.trim();
}

/**
 * Extracts tabular text from an Excel / CSV buffer.
 */
export function extractExcelContent(buffer) {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetSummaries = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const csv = XLSX.utils.sheet_to_csv(ws, { blankrows: false });
    if (csv && csv.trim()) {
      sheetSummaries.push(`--- SHEET: ${sheetName} ---\n${csv.trim()}`);
    }
  }

  return sheetSummaries.join("\n\n");
}

/**
 * Standardize dates into YYYY-MM-DD format.
 */
function normalizeDateStr(dStr, isExpiry = false) {
  if (!dStr) return "";
  const s = String(dStr).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (dmyMatch) {
    const yy = dmyMatch[3].length === 2 ? `20${dmyMatch[3]}` : dmyMatch[3];
    return `${yy}-${dmyMatch[2].padStart(2, "0")}-${dmyMatch[1].padStart(2, "0")}`;
  }

  // MM/YY or MM/YYYY (common for pharma expiry)
  const myMatch = s.match(/^(\d{1,2})[\/\-](\d{2,4})$/);
  if (myMatch) {
    const month = parseInt(myMatch[1], 10);
    const year = myMatch[2].length === 2 ? parseInt(`20${myMatch[2]}`, 10) : parseInt(myMatch[2], 10);
    if (month >= 1 && month <= 12) {
      if (isExpiry) {
        // Last day of month
        const lastDay = new Date(year, month, 0).getDate();
        return `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      }
      return `${year}-${String(month).padStart(2, "0")}-01`;
    }
  }

  const d = new Date(s);
  return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

/**
 * Main parser function to process an invoice document with OpenRouter multimodal LLM.
 */
export async function parseInvoiceDocument({
  fileBuffer,
  fileName = "invoice.pdf",
  mimeType = "application/pdf",
  existingMedicines = [],
  existingSuppliers = [],
  apiKey,
  model = PRIMARY_MODEL,
}) {
  const effectiveKey = apiKey || config.openRouter.apiKey;
  if (!effectiveKey) {
    throw new Error("OpenRouter API key is not configured. Please set OPENROUTER_API_KEY in the server environment (.env).");
  }
  const isPdf = fileName.toLowerCase().endsWith(".pdf") || mimeType === "application/pdf";
  const isExcel =
    fileName.toLowerCase().endsWith(".xlsx") ||
    fileName.toLowerCase().endsWith(".xls") ||
    fileName.toLowerCase().endsWith(".csv") ||
    mimeType.includes("spreadsheet") ||
    mimeType.includes("excel") ||
    mimeType === "text/csv";
  const isImage =
    fileName.toLowerCase().endsWith(".png") ||
    fileName.toLowerCase().endsWith(".jpg") ||
    fileName.toLowerCase().endsWith(".jpeg") ||
    fileName.toLowerCase().endsWith(".webp") ||
    mimeType.startsWith("image/");

  const compactSuppliers = (existingSuppliers || []).slice(0, 100).map((s) => ({
    id: s.id,
    name: s.name,
  }));

  const compactMedicines = (existingMedicines || []).slice(0, 300).map((m) => ({
    name: m.name,
    gst: m.gst,
  }));

  const today = new Date().toISOString().slice(0, 10);

  const contextPrompt = `
Known Registered Suppliers in Guru Pharma System:
${JSON.stringify(compactSuppliers, null, 2)}

Known Inventory Medicines in Guru Pharma System:
${JSON.stringify(compactMedicines, null, 2)}

Today's System Date: ${today}

INSTRUCTION: Please perform SEMANTIC ANALYSIS of the attached document. Do NOT assume fixed column positions.
Correctly map all column headers and data fields for:
- select supplier
- invoice number
- receipt date (YYYY-MM-DD, not future)
- product name / drug name / medicine name
- quantities of strip (invoiced count of packs/strips)
- UOM Qty in per Strip (units/tabs per pack, e.g. 10 or 15)
- Free To Society (Strips) (bonus/free strips)
- Purchase Price (PTR / buy rate per strip)
- Discount %
- Tax (%) (standard GST 0, 5, 12, 18, 28)
- Extra Charges
- Total Amount (Line)
- MRP Price / unit & Enter MRP/unit (MRP/strip)
- Batch Number (NEVER assign row serial number 1, 2, 3 as batch!)
- Manufacturer Date
- Expiry Date (convert MM/YY to last day of month)
`;

  let userMessageContent = [];

  if (isExcel) {
    const tabularText = extractExcelContent(fileBuffer);
    if (!tabularText || tabularText.trim().length === 0) {
      throw new Error("Excel document appears to be empty or contains no readable sheets.");
    }
    userMessageContent = [
      {
        type: "text",
        text: `${contextPrompt}\n\nHere is the raw tabular content extracted from Excel file "${fileName}":\n\n${tabularText}`,
      },
    ];
  } else if (isPdf) {
    const base64Pdf = Buffer.isBuffer(fileBuffer)
      ? fileBuffer.toString("base64")
      : Buffer.from(fileBuffer).toString("base64");
    userMessageContent = [
      { type: "text", text: `${contextPrompt}\n\nFile Name: ${fileName}. Parse all line items and metadata from this PDF:` },
      {
        type: "image_url",
        image_url: {
          url: `data:application/pdf;base64,${base64Pdf}`,
        },
      },
    ];
  } else if (isImage) {
    const imgMime = mimeType.startsWith("image/") ? mimeType : "image/jpeg";
    const base64Img = Buffer.isBuffer(fileBuffer)
      ? fileBuffer.toString("base64")
      : Buffer.from(fileBuffer).toString("base64");
    userMessageContent = [
      { type: "text", text: `${contextPrompt}\n\nFile Name: ${fileName}. Parse all line items and metadata from this invoice image:` },
      {
        type: "image_url",
        image_url: {
          url: `data:${imgMime};base64,${base64Img}`,
        },
      },
    ];
  } else {
    try {
      const tabularText = extractExcelContent(fileBuffer);
      userMessageContent = [
        {
          type: "text",
          text: `${contextPrompt}\n\nTabular content from "${fileName}":\n\n${tabularText}`,
        },
      ];
    } catch {
      throw new Error(`Unsupported document format: ${fileName}. Please provide a PDF or Excel (.xlsx/.xls) file.`);
    }
  }

  // Helper to query OpenRouter
  async function callOpenRouter(selectedModel) {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${effectiveKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://gurupharma.local",
        "X-Title": "Guru Pharma GRN Intelligent Parser",
      },
      body: JSON.stringify({
        model: selectedModel,
        max_tokens: 4000,
        temperature: 0.1,
        messages: [
          { role: "system", content: buildSystemPrompt() },
          { role: "user", content: userMessageContent },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      let errMsg = `OpenRouter API error (status ${res.status})`;
      try {
        const errJson = JSON.parse(errText);
        errMsg = errJson.error?.message || errMsg;
      } catch {
        errMsg = `${errMsg}: ${errText.slice(0, 150)}`;
      }
      throw new Error(errMsg);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("No response content received from multimodal LLM.");
    }

    return { content, modelUsed: data.model || selectedModel };
  }

  let rawResult;
  let modelUsed = model;

  try {
    const response = await callOpenRouter(model);
    rawResult = response.content;
    modelUsed = response.modelUsed;
  } catch (primaryErr) {
    console.warn(`[IntelligentParser] Primary model (${model}) failed:`, primaryErr.message);
    if (model !== FALLBACK_MODEL) {
      console.log(`[IntelligentParser] Attempting fallback to ${FALLBACK_MODEL}...`);
      const fallbackResponse = await callOpenRouter(FALLBACK_MODEL);
      rawResult = fallbackResponse.content;
      modelUsed = fallbackResponse.modelUsed;
    } else {
      throw primaryErr;
    }
  }

  const cleanedJson = cleanJsonResponse(rawResult);
  let parsedData;
  try {
    parsedData = JSON.parse(cleanedJson);
  } catch (parseErr) {
    console.error("[IntelligentParser] Failed to parse LLM JSON:", cleanedJson);
    throw new Error(`LLM produced invalid JSON structure: ${parseErr.message}`);
  }

  const rawItems = parsedData.items || [];
  const allRawBatches = rawItems.map((it) => it.batch);

  // Sanitize, normalize, and run robust batch validation on every item
  const sanitizedItems = rawItems.map((it, idx) => {
    const receivingQty = Math.max(0, Number(it.receivingQty) || 0);
    const uomPerStrip = Math.max(1, Math.round(Number(it.uomPerStrip) || 10));
    const freeQty = Math.max(0, Number(it.freeQty) || 0);
    const purchasePrice = Math.max(0, Number(it.purchasePrice) || 0);
    const discPct = Math.min(100, Math.max(0, Number(it.discPct) || 0));
    const taxPct = [0, 5, 12, 18, 28].includes(Number(it.taxPct))
      ? Number(it.taxPct)
      : 12;
    const extraCharges = Math.max(0, Number(it.extraCharges) || 0);

    // MRP Normalization: calculate both MRP/unit and MRP/strip
    let mrpUnit = Number(it.mrpUnit) || 0;
    let mrpStrip = Number(it.mrpStrip) || 0;
    if (mrpStrip > 0 && (!mrpUnit || mrpUnit === mrpStrip)) {
      mrpUnit = mrpStrip / uomPerStrip;
    } else if (mrpUnit > 0 && !mrpStrip) {
      mrpStrip = mrpUnit * uomPerStrip;
    } else if (!mrpUnit && !mrpStrip) {
      mrpUnit = purchasePrice > 0 ? purchasePrice * 1.3 : 10;
      mrpStrip = mrpUnit * uomPerStrip;
    }

    // Line Total computation and validation
    const lineDiscountAmt = receivingQty * purchasePrice * (discPct / 100);
    const lineGrossTaxable = receivingQty * purchasePrice - lineDiscountAmt;
    const lineTaxValue = lineGrossTaxable * (taxPct / 100);
    const calculatedLineTotal = lineGrossTaxable + lineTaxValue + extraCharges;
    const lineTotal = Number(it.lineTotal) > 0 ? Number(it.lineTotal) : Number(calculatedLineTotal.toFixed(2));

    const name = String(it.name || "").trim();

    // ROBUST VALIDATION: Batch Number vs Serial Number
    const batchValidation = validateBatchNumber({
      batch: it.batch,
      rowIdx: idx,
      productName: name,
      totalRows: rawItems.length,
      allBatches: allRawBatches,
    });

    const finalBatch = batchValidation.cleanBatch || (batchValidation.isValid ? String(it.batch).trim() : "");
    const mfgDate = normalizeDateStr(it.mfgDate);
    const expiry = normalizeDateStr(it.expiry, true);

    return {
      id: `ai_${Date.now()}_${idx}`,
      serialNo: idx + 1,
      name,
      matchedInventoryName: it.matchedInventoryName ? String(it.matchedInventoryName).trim() : null,
      batch: finalBatch,
      isSerialAsBatch: batchValidation.isSerialAsBatch,
      batchWarning: batchValidation.warning || undefined,
      expiry,
      mfgDate: mfgDate > today ? today : mfgDate,
      receivingQty,
      uomPerStrip,
      freeQty,
      purchasePrice,
      mrpUnit: Number(mrpUnit.toFixed(2)),
      mrpStrip: Number(mrpStrip.toFixed(2)),
      discPct,
      taxPct,
      extraCharges,
      lineTotal,
      confidence: it.confidence || (batchValidation.isSerialAsBatch ? "low" : "high"),
    };
  });

  const normalizedInvoiceDate = normalizeDateStr(parsedData.date);

  return {
    success: true,
    modelUsed,
    source: isPdf ? "pdf" : isExcel ? "excel" : "image",
    data: {
      supplier: String(parsedData.supplier || "").trim(),
      matchedSupplierId: parsedData.matchedSupplierId || null,
      invoiceNumber: String(parsedData.invoiceNumber || "").trim(),
      date: normalizedInvoiceDate && normalizedInvoiceDate <= today ? normalizedInvoiceDate : today,
      subtotal: Number(parsedData.subtotal) || null,
      taxAmount: Number(parsedData.taxAmount) || null,
      total: Number(parsedData.total) || null,
      items: sanitizedItems,
    },
  };
}
