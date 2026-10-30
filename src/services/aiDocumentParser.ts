import * as XLSX from "xlsx";
import { parseImportFile } from "../utils/fileImport";
import { validateBatchNumber } from "../utils/batchValidation";

export const DEFAULT_OPENROUTER_KEY = "";

export const PRIMARY_MODEL = "google/gemini-2.5-flash";
export const FALLBACK_MODEL = "openai/gpt-4o-mini";

export interface ExtractedGrnItem {
  id: string;
  serialNo?: number;
  name: string;
  matchedInventoryName?: string | null;
  batch: string;
  isSerialAsBatch?: boolean;
  batchWarning?: string;
  expiry: string;
  mfgDate: string;
  receivingQty: number;
  uomPerStrip: number;
  freeQty: number;
  purchasePrice: number;
  mrpUnit: number;
  mrpStrip?: number;
  discPct: number;
  taxPct: number;
  extraCharges: number;
  lineTotal: number;
  confidence?: "high" | "medium" | "low";
}

export interface ExtractedGrnInvoice {
  supplier?: string;
  matchedSupplierId?: string | null;
  invoiceNumber?: string;
  date?: string;
  subtotal?: number | null;
  taxAmount?: number | null;
  total?: number | null;
  items: ExtractedGrnItem[];
  modelUsed?: string;
  source: "pdf" | "excel" | "image" | "heuristic";
  backendUsed: boolean;
}

export interface ParseInvoiceOptions {
  file: File;
  existingMedicines?: Array<{ name: string; gst?: number }>;
  existingSuppliers?: Array<{ id: string; name: string }>;
  apiKey?: string;
  onStatusChange?: (status: string) => void;
}

/**
 * Converts a browser File into a base64 string.
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

/**
 * Converts Excel sheets into tabular CSV text in the browser.
 */
export async function extractBrowserExcelContent(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const sheetSummaries: string[] = [];

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
 * Normalize date strings into YYYY-MM-DD.
 */
function normalizeDateStr(dStr: unknown, isExpiry = false): string {
  if (!dStr) return "";
  const s = String(dStr).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (dmyMatch) {
    const yy = dmyMatch[3].length === 2 ? `20${dmyMatch[3]}` : dmyMatch[3];
    return `${yy}-${dmyMatch[2].padStart(2, "0")}-${dmyMatch[1].padStart(2, "0")}`;
  }

  // MM/YY or MM/YYYY
  const myMatch = s.match(/^(\d{1,2})[\/\-](\d{2,4})$/);
  if (myMatch) {
    const month = parseInt(myMatch[1], 10);
    const year = myMatch[2].length === 2 ? parseInt(`20${myMatch[2]}`, 10) : parseInt(myMatch[2], 10);
    if (month >= 1 && month <= 12) {
      if (isExpiry) {
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
 * Direct client-side fallback calling OpenRouter with multimodal LLM.
 */
async function callOpenRouterDirectly(
  file: File,
  base64Data: string,
  existingMedicines: Array<{ name: string; gst?: number }> = [],
  existingSuppliers: Array<{ id: string; name: string }> = [],
  apiKey: string = DEFAULT_OPENROUTER_KEY,
  onStatusChange?: (status: string) => void
): Promise<ExtractedGrnInvoice> {
  if (!apiKey) {
    throw new Error("Direct client LLM requires an explicit user API key; routing to backend service.");
  }
  const isPdf = file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf";
  const isExcel =
    file.name.toLowerCase().endsWith(".xlsx") ||
    file.name.toLowerCase().endsWith(".xls") ||
    file.name.toLowerCase().endsWith(".csv") ||
    file.type.includes("spreadsheet") ||
    file.type.includes("excel") ||
    file.type === "text/csv";

  onStatusChange?.("Preparing document for multimodal LLM...");

  const compactSuppliers = existingSuppliers.slice(0, 100).map((s) => ({ id: s.id, name: s.name }));
  const compactMedicines = existingMedicines.slice(0, 300).map((m) => ({ name: m.name, gst: m.gst }));

  const today = new Date().toISOString().slice(0, 10);

  const contextPrompt = `
Known Registered Suppliers in Guru Pharma:
${JSON.stringify(compactSuppliers, null, 2)}

Known Inventory Medicines in Guru Pharma:
${JSON.stringify(compactMedicines, null, 2)}

Today's System Date: ${today}

INSTRUCTION: Please perform deep SEMANTIC ANALYSIS of all table headers and data fields across the document.
DO NOT assume fixed column positions.
Identify and map:
- select supplier / matchedSupplierId
- invoice number
- receipt date (YYYY-MM-DD, not future)
- product name / drug name / medicine name
- quantities of strip (invoiced count of packs/strips)
- UOM Qty in per Strip (e.g. 10, 15, or 1)
- Free To Society (Strips) (free/bonus strips)
- Purchase Price (PTR / buy rate per strip)
- Discount %
- Tax (%) (standard GST 0, 5, 12, 18, 28)
- Extra Charges
- Total Amount (Line)
- MRP Price / unit & Enter MRP/unit (MRP/strip)
- Batch Number (NEVER assign row serial numbers 1, 2, 3 as batch!)
- Manufacturer Date
- Expiry Date (convert MM/YY to last day of month)
`;

  let userContent: unknown[] = [];

  if (isExcel) {
    const tabularText = await extractBrowserExcelContent(file);
    userContent = [
      {
        type: "text",
        text: `${contextPrompt}\n\nHere is the raw tabular content from Excel file "${file.name}":\n\n${tabularText}`,
      },
    ];
  } else if (isPdf) {
    userContent = [
      { type: "text", text: `${contextPrompt}\n\nFile Name: ${file.name}. Parse all line items and metadata from this PDF:` },
      {
        type: "image_url",
        image_url: { url: base64Data },
      },
    ];
  } else {
    userContent = [
      { type: "text", text: `${contextPrompt}\n\nFile Name: ${file.name}. Parse all line items and metadata from this invoice image:` },
      {
        type: "image_url",
        image_url: { url: base64Data },
      },
    ];
  }

  const systemPrompt = `You are an expert pharmaceutical document parser and invoice normalization engine for Guru Pharma ERP.
You MUST perform SEMANTIC ANALYSIS of table headers and data fields instead of relying on fixed positions.

CRITICAL RULES:
1. NEVER confuse row serial numbers (1, 2, 3... S.No, Sl.No, Sr.No, Item #) or HSN codes with the Batch Number!
   Batch numbers are manufacturer lot codes (e.g., "B24019", "LOT-99", "AG7812"). Never output "1", "2", "3" as batch.
2. Normalize all fields:
   - supplier: Distributor/seller name. Match against Known Registered Suppliers to find matchedSupplierId.
   - invoiceNumber: Clean invoice number.
   - date: Strict YYYY-MM-DD (not future date).
   - items: Every product line:
     * serialNo: Row sequence number (1, 2, 3...)
     * name: Normalized medicine/drug name (e.g. "Augmentin 625 Duo Tablet")
     * matchedInventoryName: EXACT name from Known Inventory Medicines if matched, otherwise null
     * batch: Manufacturer lot code (never row serial number)
     * expiry: YYYY-MM-DD (convert MM/YY or MM/YYYY to last day of month)
     * mfgDate: YYYY-MM-DD or ""
     * receivingQty: Number of invoiced packs/strips
     * uomPerStrip: Tablets/units per strip (default 10 for strips, 1 for bottles/syrups)
     * freeQty: Bonus/free strips (0 if none)
     * purchasePrice: Net rate / PTR per strip
     * discPct: Discount % (0 if none)
     * taxPct: GST % (0, 5, 12, 18, 28)
     * extraCharges: Line extra fees (0 if none)
     * lineTotal: Total line amount including tax and extra charges
     * mrpUnit: MRP per unit/tablet
     * mrpStrip: MRP per pack/strip
     * confidence: "high" | "medium" | "low"

Output STRICTLY valid JSON:
{
  "supplier": string,
  "matchedSupplierId": string | null,
  "invoiceNumber": string,
  "date": string,
  "subtotal": number | null,
  "taxAmount": number | null,
  "total": number | null,
  "items": [...]
}`;

  onStatusChange?.("Querying multimodal LLM (Gemini 2.5 Flash via OpenRouter)...");

  async function queryModel(modelName: string) {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://gurupharma.local",
        "X-Title": "Guru Pharma GRN Parser",
      },
      body: JSON.stringify({
        model: modelName,
        max_tokens: 4000,
        temperature: 0.1,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenRouter (${res.status}): ${err}`);
    }
    const data = await res.json();
    return {
      content: data.choices?.[0]?.message?.content,
      modelUsed: data.model || modelName,
    };
  }

  let resultData;
  let modelUsed = PRIMARY_MODEL;

  try {
    const r = await queryModel(PRIMARY_MODEL);
    resultData = r.content;
    modelUsed = r.modelUsed;
  } catch (err) {
    console.warn("Primary client model failed, attempting fallback:", err);
    onStatusChange?.("Switching to secondary multimodal model...");
    const r = await queryModel(FALLBACK_MODEL);
    resultData = r.content;
    modelUsed = r.modelUsed;
  }

  let text = String(resultData || "").trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "");
    text = text.replace(/\s*```$/i, "");
  }

  const parsed = JSON.parse(text.trim());
  const rawItems = (parsed.items || []) as Array<Record<string, unknown>>;
  const allRawBatches = rawItems.map((it) => it.batch);

  const items: ExtractedGrnItem[] = rawItems.map((it, idx: number) => {
    const receivingQty = Math.max(0, Number(it.receivingQty) || 0);
    const uomPerStrip = Math.max(1, Math.round(Number(it.uomPerStrip) || 10));
    const freeQty = Math.max(0, Number(it.freeQty) || 0);
    const purchasePrice = Math.max(0, Number(it.purchasePrice) || 0);
    const discPct = Math.min(100, Math.max(0, Number(it.discPct) || 0));
    const taxPct = [0, 5, 12, 18, 28].includes(Number(it.taxPct)) ? Number(it.taxPct) : 12;
    const extraCharges = Math.max(0, Number(it.extraCharges) || 0);

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

    const lineDiscountAmt = receivingQty * purchasePrice * (discPct / 100);
    const lineGrossTaxable = receivingQty * purchasePrice - lineDiscountAmt;
    const lineTaxValue = lineGrossTaxable * (taxPct / 100);
    const calculatedLineTotal = lineGrossTaxable + lineTaxValue + extraCharges;
    const lineTotal = Number(it.lineTotal) > 0 ? Number(it.lineTotal) : Number(calculatedLineTotal.toFixed(2));

    const name = String(it.name || "").trim();

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
      id: `ai_cl_${Date.now()}_${idx}`,
      serialNo: idx + 1,
      name,
      matchedInventoryName: it.matchedInventoryName ? String(it.matchedInventoryName).trim() : null,
      batch: finalBatch,
      isSerialAsBatch: batchValidation.isSerialAsBatch,
      batchWarning: batchValidation.warning,
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
      confidence: (it.confidence as "high" | "medium" | "low") || (batchValidation.isSerialAsBatch ? "low" : "high"),
    };
  });

  const normalizedInvoiceDate = normalizeDateStr(parsed.date);

  return {
    supplier: parsed.supplier || "",
    matchedSupplierId: parsed.matchedSupplierId || null,
    invoiceNumber: parsed.invoiceNumber || "",
    date: normalizedInvoiceDate && normalizedInvoiceDate <= today ? normalizedInvoiceDate : today,
    subtotal: Number(parsed.subtotal) || null,
    taxAmount: Number(parsed.taxAmount) || null,
    total: Number(parsed.total) || null,
    items,
    modelUsed,
    source: isPdf ? "pdf" : isExcel ? "excel" : "image",
    backendUsed: false,
  };
}

/**
 * Main parser function:
 * 1. Tries the backend API endpoint (`/api/parse-invoice`).
 * 2. If backend endpoint is unavailable, falls back to direct browser OpenRouter call.
 * 3. If offline/error, falls back to local heuristic parser.
 */
export async function parseSupplierInvoice({
  file,
  existingMedicines = [],
  existingSuppliers = [],
  apiKey = DEFAULT_OPENROUTER_KEY,
  onStatusChange,
}: ParseInvoiceOptions): Promise<ExtractedGrnInvoice> {
  onStatusChange?.("Reading invoice document...");
  const base64Data = await fileToBase64(file);

  // 1. Try backend API endpoints first (Vite proxy / middleware, or standalone backend on port 3001)
  const candidateEndpoints = [
    "/api/parse-invoice",
    "http://localhost:3001/api/parse-invoice",
  ];

  for (const endpoint of candidateEndpoints) {
    try {
      onStatusChange?.(`Processing document via backend parser service (${endpoint})...`);
      const backendRes = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileData: base64Data,
          fileName: file.name,
          mimeType: file.type || (file.name.endsWith(".pdf") ? "application/pdf" : "application/octet-stream"),
          existingMedicines,
          existingSuppliers,
          apiKey,
        }),
      });

      if (backendRes.ok) {
        const json = await backendRes.json();
        if (json.success && json.data) {
          onStatusChange?.("✓ Successfully extracted & normalized line items via backend");
          return {
            ...json.data,
            modelUsed: json.modelUsed,
            source: json.source || (file.name.endsWith(".pdf") ? "pdf" : "excel"),
            backendUsed: true,
          };
        }
      }
    } catch {
      // Continue to next endpoint or client-side fallback
    }
  }

  // 2. Try direct client-side multimodal LLM call
  try {
    onStatusChange?.("Processing document with Multimodal LLM (Gemini 2.5 Flash)...");
    const result = await callOpenRouterDirectly(
      file,
      base64Data,
      existingMedicines,
      existingSuppliers,
      apiKey,
      onStatusChange
    );
    onStatusChange?.("✓ Successfully extracted line items");
    return result;
  } catch (clientAiErr) {
    console.error("Client AI parser failed:", clientAiErr);

    // 3. Fallback to heuristic parser
    onStatusChange?.("AI parsing unavailable, falling back to local document engine...");
    try {
      const localResult = await parseImportFile(file);
      const allBatches = localResult.items.map((it) => it.batch);

      const items: ExtractedGrnItem[] = localResult.items.map((it, idx) => {
        const uomPerStrip = it.uomPerStrip || 10;
        const purchasePrice = it.purchasePrice || 0;
        const receivingQty = it.receivingQty || 0;
        const discPct = it.discPct || 0;
        const taxPct = it.taxPct || 12;
        const extraCharges = it.extraCharges || 0;
        const mrpUnit = it.mrpUnit || it.sellingPrice || purchasePrice * 1.3;
        const mrpStrip = mrpUnit * uomPerStrip;

        const lineDiscountAmt = receivingQty * purchasePrice * (discPct / 100);
        const lineGrossTaxable = receivingQty * purchasePrice - lineDiscountAmt;
        const lineTaxValue = lineGrossTaxable * (taxPct / 100);
        const lineTotal = Number((lineGrossTaxable + lineTaxValue + extraCharges).toFixed(2));

        const batchValidation = validateBatchNumber({
          batch: it.batch,
          rowIdx: idx,
          productName: it.name,
          totalRows: localResult.items.length,
          allBatches,
        });

        return {
          id: `local_${Date.now()}_${idx}`,
          serialNo: idx + 1,
          name: it.name,
          matchedInventoryName:
            existingMedicines.find((m) => m.name.toLowerCase() === it.name.toLowerCase())?.name || null,
          batch: batchValidation.cleanBatch || (batchValidation.isValid ? String(it.batch).trim() : ""),
          isSerialAsBatch: batchValidation.isSerialAsBatch,
          batchWarning: batchValidation.warning,
          expiry: it.expiry || "",
          mfgDate: it.mfgDate || "",
          receivingQty,
          uomPerStrip,
          freeQty: it.freeQty || 0,
          purchasePrice,
          mrpUnit: Number(mrpUnit.toFixed(2)),
          mrpStrip: Number(mrpStrip.toFixed(2)),
          discPct,
          taxPct,
          extraCharges,
          lineTotal,
          confidence: "medium",
        };
      });

      return {
        supplier: localResult.supplier || "",
        matchedSupplierId:
          existingSuppliers.find((s) => s.name.toLowerCase() === localResult.supplier?.toLowerCase())?.id || null,
        invoiceNumber: localResult.invoiceNumber || "",
        date: localResult.date || "",
        items,
        source: "heuristic",
        backendUsed: false,
      };
    } catch {
      throw clientAiErr;
    }
  }
}
