import * as XLSX from "xlsx";

/* ── shared shape ─────────────────────────────────────────────────────── */
export interface ImportedLine {
  serialNo?: number;
  name: string;
  receivingQty: number;
  uomPerStrip: number;
  freeQty: number;
  purchasePrice: number;
  discPct: number;
  taxPct: number;
  extraCharges?: number;
  mrpUnit: number;
  sellingPrice: number;
  batch: string;
  mfgDate: string;
  expiry: string;
}

export interface ParsedImport {
  supplier?: string;
  invoiceNumber?: string;
  date?: string;
  items: ImportedLine[];
  source: "excel" | "pdf";
}

const blank = (): ImportedLine => ({
  name: "", receivingQty: 0, uomPerStrip: 1, freeQty: 0, purchasePrice: 0,
  discPct: 0, taxPct: 12, extraCharges: 0, mrpUnit: 0, sellingPrice: 0, batch: "", mfgDate: "", expiry: "",
});

/* ── helpers ──────────────────────────────────────────────────────────── */
const norm = (v: unknown) => String(v ?? "").toLowerCase().replace(/[^a-z0-9%]/g, "");

const num = (v: unknown): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = Number(String(v ?? "").replace(/[₹,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const cleanMoney = (s: string) => Number(s.replace(/[₹,\s]/g, ""));
const isDateLike = (s: string) => /^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}$/.test(s.trim());
const isPureNum = (s: string) => /^\d+(?:\.\d+)?$/.test(s.replace(/,/g, ""));
const skipWord = /total|grand|sub\s*total|amount|hsn|sac|sgst|cgst|igst|gstin|signature|thank|page|supplier|invoice|bill|date|terms|bank|rupees/i;

export const toDateStr = (v: unknown): string => {
  if (!v) return "";
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    const yy = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${yy}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};

/* column matchers */
const isSNo = (h: string) => /^(s\.?no|sl\.?no|sr\.?no|item\.?no|seq|#)$/i.test(h);
const isName = (h: string) => /product|item|medicine|description|particular|name|drug/.test(h) && !/gst|tax|qty|mrp|rate|price|batch|s\.?no/i.test(h);
const isQty = (h: string) => /qty|quantity|strip|pack|box|pcs/i.test(h) && !/per|free/i.test(h);
const isUom = (h: string) => /tab|tablet|perstrip|units?per|pcsper|pack\s*size|pkg|uom/i.test(h);
const isFree = (h: string) => /free|bonus|f\.?qty|scheme|promo/i.test(h);
const isBatch = (h: string) => /batch|lot|b\.?no/i.test(h) && !isSNo(h);
const isExp = (h: string) => /exp/i.test(h) && !/mfg|manuf/i.test(h);
const isMfg = (h: string) => /mfg|manuf/i.test(h);
const isMrp = (h: string) => /mrp/.test(h);
const isRate = (h: string) => /rate|ptr|purchase|buy|cost|netrate/.test(h) && !/mrp|sell/.test(h);
const isSell = (h: string) => /sell|sale|rsp|saleprice/.test(h);
const isGst = (h: string) => /gst|tax|igst|vat/.test(h);
const isDisc = (h: string) => /disc/.test(h);
const isExtra = (h: string) => /extra|cess|handling|freight|charge/.test(h);

function findCol(headers: string[], test: (h: string) => boolean): number {
  return headers.findIndex((h) => test(norm(h)));
}

/* Given an ordered list of numbers from a line, guess qty / rate / mrp */
function assignNumbers(line: ImportedLine, vals: number[]) {
  if (vals.length === 0) return;
  line.receivingQty = Math.round(vals[0]) || vals[0];
  if (vals.length === 1) return;
  if (vals.length === 2) {
    // qty + one price → treat as purchase rate and mirror to MRP
    line.purchasePrice = vals[1];
    line.mrpUnit = vals[1];
    line.sellingPrice = vals[1];
    return;
  }
  // 3+ numbers: [qty, rate, ..., mrp-or-total]
  const first = vals[0];
  const second = vals[1];
  const last = vals[vals.length - 1];
  line.purchasePrice = second;
  // if last ≈ qty × second, it's the line total → MRP unknown; else last is MRP
  if (Math.abs(last - first * second) < Math.max(1, Math.abs(last) * 0.02)) {
    line.mrpUnit = second;
  } else {
    line.mrpUnit = last;
  }
  line.sellingPrice = line.mrpUnit || second;
}

/* ── Excel / CSV ──────────────────────────────────────────────────────── */
export async function parseExcelFile(file: File): Promise<ParsedImport> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

  // locate header row: first row with 2+ recognizable columns (or 1 name-ish)
  let headerIdx = -1;
  for (let i = 0; i < Math.min(raw.length, 25); i++) {
    const hs = (raw[i] || []).map((c) => norm(c));
    const hits = [isName, isQty, isBatch, isMrp, isRate].filter((t) => hs.some((h) => h && t(h))).length;
    if (hits >= 2 || (hits === 1 && hs.some((h) => isName(h)))) { headerIdx = i; break; }
  }

  const meta: ParsedImport = { items: [], source: "excel" };

  // metadata from rows above (or including) the header
  const headScan = raw.slice(0, Math.max(headerIdx, 0) + 1);
  for (const row of headScan) {
    const line = row.map((c) => String(c ?? "")).join(" ");
    if (!meta.supplier) {
      const s = line.match(/(?:supplier|from|vendor|sold\s*by)\s*[:\-]?\s*([A-Za-z0-9 .&'-]{3,})/i);
      if (s) meta.supplier = s[1].trim();
      else if (/pvt|ltd|llp|pharma|agencies|enterprises|medicals/i.test(line)) meta.supplier = line.trim().slice(0, 60);
    }
    if (!meta.invoiceNumber) {
      const n = line.match(/(?:inv(?:oice)?[\s_.#-]*no\.?|invoice[\s#]*|bill[\s#]*no\.?)\s*[:#]?\s*([A-Z0-9][A-Z0-9\/-]{2,})/i);
      if (n) meta.invoiceNumber = n[1];
    }
    if (!meta.date) {
      const d = line.match(/(?:date|d\.t\.?)\s*[:\-]?\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i) || line.match(/(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/);
      if (d) meta.date = toDateStr(d[1]);
    }
  }

  const dataRows = raw.slice(Math.max(headerIdx, -1) + 1);

  if (headerIdx >= 0) {
    const headers = (raw[headerIdx] || []).map((c) => String(c ?? ""));
    const c = {
      sNo: findCol(headers, isSNo),
      name: findCol(headers, isName),
      qty: findCol(headers, isQty),
      uom: findCol(headers, isUom),
      free: findCol(headers, isFree),
      batch: findCol(headers, isBatch),
      exp: findCol(headers, isExp),
      mfg: findCol(headers, isMfg),
      mrp: findCol(headers, isMrp),
      rate: findCol(headers, isRate),
      sell: findCol(headers, isSell),
      gst: findCol(headers, isGst),
      disc: findCol(headers, isDisc),
      extra: findCol(headers, isExtra),
    };
    // Ensure serial number column is never confused with batch
    if (c.batch >= 0 && c.batch === c.sNo) {
      c.batch = -1;
    }
    // fallback: if no name column matched, use the first column that holds text in data rows
    if (c.name < 0) {
      for (let col = 0; col < headers.length; col++) {
        if (col === c.sNo) continue;
        const hasText = dataRows.some((r) => {
          const v = String(r?.[col] ?? "").trim();
          return v && !isPureNum(v) && !isDateLike(v);
        });
        if (hasText) { c.name = col; break; }
      }
    }

    let rowCount = 0;
    for (const row of dataRows) {
      if (!row || row.every((x) => String(x ?? "").trim() === "")) continue;
      const get = (i: number) => (i >= 0 ? row[i] : undefined);
      const name = String(get(c.name) ?? "").trim();
      if (!name || skipWord.test(name)) continue;
      rowCount++;
      const line = blank();
      line.serialNo = c.sNo >= 0 && num(get(c.sNo)) > 0 ? Math.round(num(get(c.sNo))) : rowCount;
      line.name = name;
      line.receivingQty = num(get(c.qty));
      if (c.uom >= 0 && num(get(c.uom)) > 0) line.uomPerStrip = Math.round(num(get(c.uom)));
      line.freeQty = num(get(c.free));
      
      const rawBatch = String(get(c.batch) ?? "").trim();
      // Check that batch is not the serial number (1, 2, 3...)
      const isSerialVal =
        rawBatch === String(line.serialNo) ||
        rawBatch === String(rowCount) ||
        /^[0-9]{1,2}$/.test(rawBatch);
      if (isSerialVal) {
        // Try to find alphanumeric batch in other text cells of the row
        const rowCells = row.map((x) => String(x ?? "").trim());
        const realBatch = rowCells.find(
          (v) =>
            /^[A-Z]{1,3}\d[A-Z0-9-]{1,}$/i.test(v) &&
            v !== name &&
            v !== rawBatch &&
            !/^\d+$/.test(v)
        );
        line.batch = realBatch || "";
      } else {
        line.batch = rawBatch;
      }

      line.expiry = toDateStr(get(c.exp));
      line.mfgDate = toDateStr(get(c.mfg));
      line.purchasePrice = num(get(c.rate));
      line.sellingPrice = num(get(c.sell));
      line.extraCharges = num(get(c.extra));
      const mrpRaw = num(get(c.mrp));
      line.taxPct = num(get(c.gst)) || 12;
      line.discPct = num(get(c.disc));
      if (mrpRaw > 0) {
        line.mrpUnit = mrpRaw / (line.uomPerStrip > 1 && mrpRaw > line.purchasePrice * line.uomPerStrip * 0.5 ? line.uomPerStrip : 1);
        if (!line.sellingPrice) line.sellingPrice = line.mrpUnit;
      }
      if (!line.purchasePrice && !line.mrpUnit) {
        // no mapped price columns — pull numbers positionally from the row
        const vals = row.map((v) => num(v)).filter((n) => n > 0);
        if (vals.length >= 2) { assignNumbers(line, vals.slice(line.receivingQty > 0 ? 1 : 0)); }
      }
      meta.items.push(line);
    }
  } else {
    // No header found — positional parse: any row with text + numbers is an item
    let posCount = 0;
    for (const row of dataRows) {
      const cells = (row || []).map((x) => String(x ?? "").trim());
      if (!cells.some(Boolean)) continue;
      const textIdx = cells.findIndex((v) => v && !isPureNum(v) && !isDateLike(v));
      if (textIdx === -1) continue;
      const name = cells[textIdx];
      if (name.length < 2 || skipWord.test(name)) continue;
      posCount++;
      const line = blank();
      line.serialNo = posCount;
      line.name = name;
      const dateIdx = cells.findIndex(isDateLike);
      if (dateIdx >= 0) line.expiry = toDateStr(cells[dateIdx]);
      const vals = cells.map(cleanMoney).filter((n) => Number.isFinite(n) && n > 0);
      assignNumbers(line, vals);
      const batchLike = cells.find(
        (v) =>
          /^[A-Z]{1,3}[\d][A-Z0-9-]{1,}$/i.test(v) &&
          v !== name &&
          v !== String(posCount) &&
          !/^\d+$/.test(v)
      );
      if (batchLike) line.batch = batchLike;
      meta.items.push(line);
    }
  }
  return meta;
}

/* ── PDF ──────────────────────────────────────────────────────────────── */
/* Runs pdf.js on the main thread via its "fake worker" so the library and
   its worker share one module instance — the separate inline-worker-port
   path can load a mismatched bundle and crash with "a.toHex is not a
   function". This mode is stable in a single-file build.                 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pdfjsReady: Promise<any> | null = null;
async function loadPdfJs() {
  if (!pdfjsReady) {
    pdfjsReady = (async () => {
      const lib = await import("pdfjs-dist");
      const g = globalThis as unknown as { pdfjsWorker?: unknown };
      if (!g.pdfjsWorker) {
        const workerMod = await import("pdfjs-dist/build/pdf.worker.min.mjs");
        g.pdfjsWorker = workerMod;
      }
      return lib;
    })();
  }
  return pdfjsReady;
}

export async function parsePdfFile(file: File): Promise<ParsedImport> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pdfjs: any;
  try {
    pdfjs = await loadPdfJs();
  } catch {
    throw new Error("PDF engine failed to load — try an Excel/CSV file instead");
  }
  const data = new Uint8Array(await file.arrayBuffer());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let doc: any;
  try {
    doc = await pdfjs.getDocument({ data, isEvalSupported: false, disableFontFace: true }).promise;
  } catch {
    throw new Error("This PDF could not be read — it may be scanned or protected. Try Excel/CSV or add items manually");
  }

  const lines: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const rows = new Map<number, string[]>();
    for (const it of content.items as Array<{ str?: string; transform?: number[] }>) {
      if (!it.str) continue;
      const y = Math.round((it.transform?.[5] ?? 0) / 3) * 3;
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y)!.push(it.str);
    }
    [...rows.entries()].sort((a, b) => b[0] - a[0]).forEach(([, txt]) => lines.push(txt.join(" ").replace(/\s+/g, " ").trim()));
  }

  const meta: ParsedImport = { items: [], source: "pdf" };

  for (const line of lines.slice(0, 30)) {
    if (!meta.supplier) {
      const s = line.match(/(?:supplier|from|vendor|sold\s*by)\s*[:\-]?\s*([A-Za-z0-9 .&'-]{3,})/i);
      if (s) meta.supplier = s[1].trim();
      else if (/pvt|ltd|llp|pharma|agencies|enterprises|medicals/i.test(line) && line.length < 70) meta.supplier = line;
    }
    if (!meta.invoiceNumber) {
      const n = line.match(/(?:inv(?:oice)?[\s_.#-]*no\.?|invoice[\s#]*|bill[\s#]*no\.?)\s*[:#]?\s*([A-Z0-9][A-Z0-9\/-]{2,})/i);
      if (n) meta.invoiceNumber = n[1];
    }
    if (!meta.date) {
      const d = line.match(/(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/);
      if (d) meta.date = toDateStr(d[1]);
    }
  }

  // Item rows — token-based so a single item parses exactly like eighty
  for (const line of lines) {
    if (skipWord.test(line)) continue;
    const tokens = line.split(/\s+/).filter(Boolean);
    if (tokens.length < 2) continue;

    // collect leading name tokens until the first pure-numeric token
    const nameTokens: string[] = [];
    let rest: string[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (isPureNum(t) && nameTokens.length >= 1) { rest = tokens.slice(i); break; }
      if (/^\d/.test(t) && nameTokens.length >= 1 && !/[a-z%]/i.test(t)) { rest = tokens.slice(i); break; }
      nameTokens.push(t);
      if (i === tokens.length - 1) rest = [];
    }
    const name = nameTokens.join(" ").trim();
    if (name.length < 3 || !/[A-Za-z]/.test(name)) continue;

    const vals: number[] = [];
    for (const t of rest) {
      const n = cleanMoney(t);
      if (Number.isFinite(n) && n > 0) vals.push(n);
      else {
        const d = toDateStr(t);
        if (d && !meta.items.length) { /* ignore */ }
      }
    }
    if (vals.length === 0) continue;

    const item = blank();
    item.name = name;
    assignNumbers(item, vals);
    const exp = line.match(/(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/);
    if (exp) item.expiry = toDateStr(exp[1]);
    const gst = line.match(/(\d{1,2})\s*%/);
    if (gst) item.taxPct = Number(gst[1]);
    const batch = line.match(/\b([A-Z]{1,3}\d[A-Z0-9-]{1,})\b/);
    if (batch && batch[1] !== name) item.batch = batch[1];
    meta.items.push(item);
  }
  return meta;
}

/* ── dispatcher ───────────────────────────────────────────────────────── */
export async function parseImportFile(file: File): Promise<ParsedImport> {
  const name = file.name.toLowerCase();
  const type = file.type;
  if (name.endsWith(".pdf") || type === "application/pdf") return parsePdfFile(file);
  if (name.endsWith(".xlsx") || name.endsWith(".xls") || name.endsWith(".csv") ||
      type.includes("spreadsheet") || type.includes("excel") || type === "text/csv") {
    return parseExcelFile(file);
  }
  throw new Error("Unsupported file. Upload a PDF, Excel (.xlsx/.xls) or CSV file.");
}
