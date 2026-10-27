import jsQR from "jsqr";
import type { PurchaseItem } from "../store/types";

export interface ParsedQrInvoice {
  supplierName: string;
  invoiceNumber: string;
  purchaseDate: string;
  items: PurchaseItem[];
  agencyDiscountPct: number;
  specialDiscount: number;
  finalBillAmount: number | null;
  rawText: string;
}

const ITEM_NAME_KEYS = ["name", "medicine", "medicinename", "product", "productname", "itemname", "description", "productdescription", "itemdescription", "drugname"];
const BATCH_KEYS = ["batch", "batchnumber", "batchno", "batch_number", "batch_no", "lot", "lotno", "lot_no"];
const STRIPS_KEYS = ["strips", "strip", "noofstrips", "numberofstrips", "no_of_strips"];
const TABS_KEYS = ["tabsperstrip", "tabs", "tabletsperstrip", "tabinstrip", "numberoftabinstrip", "numberoftabsinstrip", "piecesperstrip", "unitsperstrip"];
const FREE_KEYS = ["freestrips", "free", "freestrip", "freeqty", "free_qty", "bonus"];
const QTY_KEYS = ["qty", "quantity", "totalqty", "units", "totalquantity", "total_quantity"];
const BUY_KEYS = ["purchaseprice", "buyprice", "buy", "mrpbuy", "rate", "ptr", "purchaserate", "purchase_rate", "buyrate"];
const SELL_KEYS = ["sellingprice", "sellprice", "sell", "mrp", "saleprice", "retailprice", "selling_rate", "sellrate"];
const EXPIRY_KEYS = ["expiry", "expirydate", "expdate", "exp", "expiry_date"];
const IGST_KEYS = ["igst", "igstpct", "igstpercent", "igst_rate", "igstrate"];
const CGST_KEYS = ["cgst", "cgstpct", "cgstpercent", "cgst_rate", "cgstrate"];
const SGST_KEYS = ["sgst", "sgstpct", "sgstpercent", "sgst_rate", "sgstrate"];
const GST_KEYS = ["gst", "tax", "gstrate", "gst_rate", "taxrate"];

const emptyItem = (): PurchaseItem => ({
  name: "",
  batch: "",
  qty: 0,
  strips: 0,
  tabsPerStrip: 10,
  freeStrips: 0,
  purchasePrice: 0,
  sellingPrice: 0,
  expiry: "",
  igst: 0,
  cgst: 0,
  sgst: 0,
});

function normalizeKey(value: string) {
  return value.replace(/[^a-z0-9_]/gi, "").toLowerCase();
}

function normalizeDate(input: unknown): string {
  if (!input) return "";
  const value = String(input).trim();
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const slash = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slash) {
    const day = slash[1].padStart(2, "0");
    const month = slash[2].padStart(2, "0");
    const year = slash[3].length === 2 ? `20${slash[3]}` : slash[3];
    return `${year}-${month}-${day}`;
  }

  const dt = new Date(value);
  if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  return "";
}

function num(value: unknown, fallback = 0): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  const cleaned = String(value ?? "").replace(/₹/g, "").replace(/,/g, "").trim();
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readValue(record: Record<string, unknown>, keys: string[]): unknown {
  const entries = Object.entries(record);
  for (const key of keys) {
    const wanted = normalizeKey(key);
    const found = entries.find(([k]) => normalizeKey(k) === wanted);
    if (found) return found[1];
  }
  return undefined;
}

function findFirstDeep(source: unknown, keys: string[]): unknown {
  if (!source || typeof source !== "object") return undefined;
  if (Array.isArray(source)) {
    for (const item of source) {
      const found = findFirstDeep(item, keys);
      if (found !== undefined) return found;
    }
    return undefined;
  }

  const record = source as Record<string, unknown>;
  const direct = readValue(record, keys);
  if (direct !== undefined) return direct;

  for (const value of Object.values(record)) {
    if (value && typeof value === "object") {
      const found = findFirstDeep(value, keys);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

function looksLikeItemRecord(record: Record<string, unknown>) {
  const keys = Object.keys(record).map(normalizeKey);
  return keys.some((k) => ITEM_NAME_KEYS.includes(k)) || keys.some((k) => BATCH_KEYS.includes(k)) || keys.some((k) => STRIPS_KEYS.includes(k)) || keys.some((k) => BUY_KEYS.includes(k));
}

function findItemArraysDeep(source: unknown, acc: Record<string, unknown>[][] = []): Record<string, unknown>[][] {
  if (!source || typeof source !== "object") return acc;
  if (Array.isArray(source)) {
    const objects = source.filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x));
    if (objects.length && objects.some(looksLikeItemRecord)) acc.push(objects);
    source.forEach((item) => findItemArraysDeep(item, acc));
    return acc;
  }

  Object.values(source as Record<string, unknown>).forEach((value) => {
    if (value && typeof value === "object") findItemArraysDeep(value, acc);
  });
  return acc;
}

function extractSupplierName(source: Record<string, unknown>): string {
  const direct = findFirstDeep(source, ["supplierName", "vendorName", "sellerName", "partyName", "agencyName"]);
  if (direct) return String(direct).trim();

  const supplierObj = findFirstDeep(source, ["supplier", "vendor", "seller", "party", "agency"]);
  if (supplierObj && typeof supplierObj === "object" && !Array.isArray(supplierObj)) {
    const nested = readValue(supplierObj as Record<string, unknown>, ["name", "supplierName", "vendorName", "sellerName", "partyName"]);
    if (nested) return String(nested).trim();
  }

  if (typeof supplierObj === "string") return supplierObj.trim();
  return "";
}

function toItem(record: Record<string, unknown>): PurchaseItem {
  const item = emptyItem();
  item.name = String(readValue(record, ITEM_NAME_KEYS) ?? "").trim();
  item.batch = String(readValue(record, BATCH_KEYS) ?? "").trim();
  item.strips = num(readValue(record, STRIPS_KEYS));
  item.tabsPerStrip = num(readValue(record, TABS_KEYS), 10);
  item.freeStrips = num(readValue(record, FREE_KEYS));
  item.qty = num(readValue(record, QTY_KEYS), item.strips * item.tabsPerStrip);
  if (!item.qty && item.strips && item.tabsPerStrip) item.qty = item.strips * item.tabsPerStrip;
  item.purchasePrice = num(readValue(record, BUY_KEYS));
  item.sellingPrice = num(readValue(record, SELL_KEYS));
  item.expiry = normalizeDate(readValue(record, EXPIRY_KEYS));
  item.igst = num(readValue(record, IGST_KEYS));
  item.cgst = num(readValue(record, CGST_KEYS));
  item.sgst = num(readValue(record, SGST_KEYS));

  const gst = num(readValue(record, GST_KEYS));
  if (!item.igst && !item.cgst && !item.sgst && gst) {
    item.cgst = gst / 2;
    item.sgst = gst / 2;
  }

  if (!item.sellingPrice && item.purchasePrice) item.sellingPrice = item.purchasePrice;
  return item;
}

function parseJsonPayload(text: string): ParsedQrInvoice | null {
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const arrays = findItemArraysDeep(parsed);
    const bestArray = arrays.sort((a, b) => b.length - a.length)[0] || [];
    const items = bestArray.map((x) => toItem(x)).filter((x) => x.name || x.batch || x.qty || x.purchasePrice);

    return {
      supplierName: extractSupplierName(parsed),
      invoiceNumber: String(findFirstDeep(parsed, ["invoiceNumber", "invoiceNo", "invoice_no", "billNo", "billNumber", "bill_no", "invoiceid"]) ?? "").trim(),
      purchaseDate: normalizeDate(findFirstDeep(parsed, ["purchaseDate", "billDate", "bill_date", "date", "invoiceDate", "invoice_date"])),
      items,
      agencyDiscountPct: num(findFirstDeep(parsed, ["agencyDiscountPct", "agencyDiscount", "agencyDiscountPercent", "discountPct", "discount_percent"])),
      specialDiscount: num(findFirstDeep(parsed, ["specialDiscount", "specialDiscountAmount", "special_discount", "otherDiscount"])),
      finalBillAmount: (() => {
        const amount = findFirstDeep(parsed, ["finalBillAmount", "billAmount", "grandTotal", "grand_total", "total", "totalAmount", "total_amount", "netAmount", "net_total", "invoiceTotal"]);
        return amount === undefined ? null : num(amount);
      })(),
      rawText: text,
    };
  } catch {
    return null;
  }
}

function parseKeyValuePayload(text: string): ParsedQrInvoice | null {
  const lines = text.split(/\r?\n|;/).map((x) => x.trim()).filter(Boolean);
  const root: Record<string, string> = {};
  const items: PurchaseItem[] = [];

  for (const line of lines) {
    if (/^item\s*[:=]/i.test(line)) {
      const raw = line.replace(/^item\s*[:=]/i, "");
      const parts = raw.split("|").map((x) => x.trim());
      const record: Record<string, unknown> = {
        name: parts[0] || "",
        batch: parts[1] || "",
        strips: parts[2] || 0,
        tabsPerStrip: parts[3] || 10,
        freeStrips: parts[4] || 0,
        qty: parts[5] || 0,
        purchasePrice: parts[6] || 0,
        sellingPrice: parts[7] || 0,
        expiry: parts[8] || "",
        igst: parts[9] || 0,
        cgst: parts[10] || 0,
        sgst: parts[11] || 0,
      };
      const item = toItem(record);
      if (item.name) items.push(item);
      continue;
    }
    const match = line.match(/^([^:=]+)[:=](.+)$/);
    if (match) root[match[1].trim()] = match[2].trim();
  }

  if (!Object.keys(root).length && !items.length) return null;
  return {
    supplierName: String(readValue(root, ["supplier", "supplierName", "vendor", "seller"]) ?? "").trim(),
    invoiceNumber: String(readValue(root, ["invoiceNumber", "invoiceNo", "billNo", "billNumber"]) ?? "").trim(),
    purchaseDate: normalizeDate(readValue(root, ["purchaseDate", "billDate", "date", "invoiceDate"])),
    items,
    agencyDiscountPct: num(readValue(root, ["agencyDiscountPct", "agencyDiscount", "agencyDiscountPercent"])),
    specialDiscount: num(readValue(root, ["specialDiscount", "specialDiscountAmount"])),
    finalBillAmount: (() => {
      const amount = readValue(root, ["finalBillAmount", "billAmount", "grandTotal", "total", "netAmount"]);
      return amount === undefined ? null : num(amount);
    })(),
    rawText: text,
  };
}

function parseUrlPayload(text: string): ParsedQrInvoice | null {
  try {
    const url = new URL(text);
    const q = url.searchParams;
    const rawItems = q.get("items") || q.get("medicines") || "";
    const items = rawItems
      ? rawItems.split("~").map((row) => row.split("|").map((x) => x.trim())).map((parts) => toItem({
          name: parts[0],
          batch: parts[1],
          strips: parts[2],
          tabsPerStrip: parts[3],
          freeStrips: parts[4],
          qty: parts[5],
          purchasePrice: parts[6],
          sellingPrice: parts[7],
          expiry: parts[8],
          igst: parts[9],
          cgst: parts[10],
          sgst: parts[11],
        })).filter((x) => x.name)
      : [];

    return {
      supplierName: q.get("supplier") || q.get("supplierName") || q.get("vendor") || "",
      invoiceNumber: q.get("invoiceNumber") || q.get("invoiceNo") || q.get("billNo") || "",
      purchaseDate: normalizeDate(q.get("purchaseDate") || q.get("billDate") || q.get("date") || ""),
      items,
      agencyDiscountPct: num(q.get("agencyDiscountPct") || q.get("agencyDiscount") || 0),
      specialDiscount: num(q.get("specialDiscount") || 0),
      finalBillAmount: q.get("finalBillAmount") || q.get("total") || q.get("grandTotal") ? num(q.get("finalBillAmount") || q.get("total") || q.get("grandTotal")) : null,
      rawText: text,
    };
  } catch {
    return null;
  }
}

export function parseQrInvoicePayload(text: string): ParsedQrInvoice {
  const normalized = text.trim();
  const parsed = parseJsonPayload(normalized) || parseUrlPayload(normalized) || parseKeyValuePayload(normalized) || {
    supplierName: "",
    invoiceNumber: "",
    purchaseDate: "",
    items: [],
    agencyDiscountPct: 0,
    specialDiscount: 0,
    finalBillAmount: null,
    rawText: normalized,
  };

  return {
    ...parsed,
    supplierName: parsed.supplierName.trim(),
    invoiceNumber: parsed.invoiceNumber.trim(),
    purchaseDate: parsed.purchaseDate || "",
    items: parsed.items.map((item) => ({
      ...emptyItem(),
      ...item,
      qty: item.qty || ((item.strips || 0) * (item.tabsPerStrip || 0)),
      tabsPerStrip: item.tabsPerStrip || 10,
      sellingPrice: item.sellingPrice || item.purchasePrice || 0,
    })),
  };
}

export async function decodeQrFromImageFile(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read image file"));
    reader.readAsDataURL(file);
  });

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Invalid image"));
    img.src = dataUrl;
  });

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported in this browser");

  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "attemptBoth" });
  if (!code?.data) throw new Error("QR code not detected. Upload a clear invoice QR image.");
  return code.data;
}
