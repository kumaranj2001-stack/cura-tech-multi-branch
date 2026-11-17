import React, { useMemo, useState, useEffect, useRef } from "react";
import { useStore, uid } from "../store/store";
import {
  PackagePlus, Trash2, Save, RotateCcw, Search, Plus, Minus, ReceiptText, Layers, Percent, IndianRupee,
  Upload, FileSpreadsheet, FileText, Loader2, Sparkles, Pencil, CheckCircle2, Eye, X, AlertCircle, PlusCircle,
} from "lucide-react";
import { Card, CardBody, Button, Input, Label, Select, Modal, Badge } from "../components/ui";
import { flashToast, fmtCurrency } from "../utils/helpers";
import { parseSupplierInvoice, type ExtractedGrnInvoice, type ExtractedGrnItem } from "../services/aiDocumentParser";
import { validateBatchNumber } from "../utils/batchValidation";
import type { GRN, PurchaseItem, GrnAdjustment, Medicine } from "../store/types";

/* ── formatting ── */
const n2 = (x: number) => (Number.isFinite(x) ? x : 0).toFixed(2);
const n3 = (x: number) => (Number.isFinite(x) ? x : 0).toFixed(3);
const cur = (x: number) => "₹" + n2(x);

/* ── line calculation engine (exact spec formulas) ── */
interface Line {
  id: string;
  name: string;
  receivingQty: number | "";
  uomPerStrip: number | "";
  freeQty: number | "";
  purchasePrice: number | "";
  discPct: number | "";
  taxPct: number;
  extraCharges: number | "";
  lineDed: number;
  lineAdd: number;
  mrpUnit: number | "";
  batch: string;
  mfgDate: string;
  expiry: string;
}

const blankLine = (): Line => ({
  id: uid("ln"),
  name: "",
  receivingQty: "",
  uomPerStrip: "",
  freeQty: "",
  purchasePrice: "",
  discPct: "",
  taxPct: 12,
  extraCharges: 0,
  lineDed: 0,
  lineAdd: 0,
  mrpUnit: "",
  batch: "",
  mfgDate: "",
  expiry: "",
});

function calcLine(l: Line) {
  const receivingStrips = Number(l.receivingQty) || 0;
  const uomPerStrip = Number(l.uomPerStrip) || 0;
  const freeStrips = Number(l.freeQty) || 0;
  const purchasePrice = Number(l.purchasePrice) || 0;
  const discPct = Number(l.discPct) || 0;
  const lineDed = Number(l.lineDed) || 0;
  const lineAdd = Number(l.lineAdd) || 0;
  const taxPct = Number(l.taxPct) || 0;
  const extraCharges = Number(l.extraCharges) || 0;
  const mrpUnit = Number(l.mrpUnit) || 0;

  const value = receivingStrips * purchasePrice;                                   // Base Amount
  const discountAmt = value * (discPct / 100);                                    // Discount Amount
  const gross = value - discountAmt;                                              // Gross
  const grossTaxable = gross - lineDed + lineAdd;                                 // Gross Taxable
  const taxValue = grossTaxable * (taxPct / 100);                                 // Tax Value
  const purchaseTotal = grossTaxable + taxValue + extraCharges;                   // Line Purchase Total
  const resaleQty = receivingStrips * uomPerStrip;                                // Resale Quantity (Paid units)
  const costPrice = resaleQty > 0 ? grossTaxable / resaleQty : 0;                 // Cost Price / Unit
  const mrpStrip = mrpUnit * uomPerStrip;                                         // MRP / Strip
  const salesTax = mrpUnit * (taxPct / (100 + taxPct));                           // tax inside MRP
  const resaleGross = mrpUnit - salesTax;                                         // pre-tax selling price
  const marginPct = resaleGross > 0 ? ((resaleGross - costPrice) / resaleGross) * 100 : 0;
  const resaleTotal = resaleQty * mrpUnit;                                        // Line Resale Total
  const shelfLifeDays = l.mfgDate && l.expiry
    ? Math.round((new Date(l.expiry).getTime() - new Date(l.mfgDate).getTime()) / 86400000)
    : null;
  // Free To Society calculation based strictly on number of strips:
  const freeUnits = freeStrips * uomPerStrip;
  const totalUnitsReceived = (receivingStrips + freeStrips) * uomPerStrip;
  return { value, discountAmt, gross, grossTaxable, taxValue, purchaseTotal, resaleQty, costPrice, mrpStrip, salesTax, resaleGross, marginPct, resaleTotal, shelfLifeDays, freeUnits, totalUnitsReceived };
}

const TAX_OPTIONS = [0, 5, 12, 18, 28];

const Purchases: React.FC = () => {
  const { data, setData, currentUser, currentBranch, log, flags } = useStore();

  const today = new Date().toISOString().slice(0, 10);

  /* header */
  const [supplierId, setSupplierId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [date, setDate] = useState(() => today);

  /* Row A + B form state */
  const [line, setLine] = useState<Line>(blankLine());
  const [productQuery, setProductQuery] = useState("");
  const [comboOpen, setComboOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const comboRef = useRef<HTMLDivElement | null>(null);

  /* Direct Add New Medicine Modal state */
  const [addMedOpen, setAddMedOpen] = useState(false);
  const [addMedForm, setAddMedForm] = useState({
    name: "",
    supplier: "",
    gst: 12,
    narcotic: false,
    minStock: 10,
  });
  const [addMedSubmitting, setAddMedSubmitting] = useState(false);
  const [addMedError, setAddMedError] = useState("");

  const openAddMedModal = (initialName?: string) => {
    const defaultSup =
      data.suppliers.find((s) => s.id === supplierId)?.name ||
      (data.suppliers.length > 0 ? data.suppliers[0].name : "");
    const qName = (initialName || productQuery || line.name || "").trim();
    setAddMedForm({
      name: qName,
      supplier: defaultSup,
      gst: line.taxPct || 12,
      narcotic: false,
      minStock: 10,
    });
    setAddMedError("");
    setAddMedOpen(true);
  };

  /* product list */
  const [lines, setLines] = useState<Line[]>([]);

  /* Remote medicines cache to ensure live backend synchronization */
  const [remoteMeds, setRemoteMeds] = useState<Medicine[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/inventory/medicines")
      .then((r) => r.json())
      .then((res) => {
        if (!cancelled && res.success && Array.isArray(res.medicines)) {
          setRemoteMeds(res.medicines);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  /* Close combobox on outside click */
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (comboRef.current && !comboRef.current.contains(e.target as Node)) {
        setComboOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  /* footer adjustments */
  const [deductions, setDeductions] = useState<GrnAdjustment[]>([]);
  const [additions, setAdditions] = useState<GrnAdjustment[]>([]);
  const [adjModal, setAdjModal] = useState<"ded" | "add" | null>(null);
  const [tradeDiscount, setTradeDiscount] = useState<number | "">("");
  const [addAfterDesc, setAddAfterDesc] = useState("");
  const [addAfterAmt, setAddAfterAmt] = useState<number | "">("");

  const [flash, setFlash] = useState("");
  const notify = (m: string) => { setFlash(m); window.setTimeout(() => setFlash(""), 2600); };

  /* ── AI Intelligent Invoice Parser (Multimodal LLM) state ── */
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [attachedFileName, setAttachedFileName] = useState("");
  const [isAiExtracted, setIsAiExtracted] = useState(false);
  const [aiModelUsed, setAiModelUsed] = useState("");
  const [extractedInvoice, setExtractedInvoice] = useState<ExtractedGrnInvoice | null>(null);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);

  /* Review dialog state */
  const [verifiedItems, setVerifiedItems] = useState<ExtractedGrnItem[]>([]);
  const [verifiedSupplierId, setVerifiedSupplierId] = useState("");
  const [verifiedInvoiceNumber, setVerifiedInvoiceNumber] = useState("");
  const [verifiedDate, setVerifiedDate] = useState("");

  /* Combined inventory medicines (local store + synced remote) */
  const allAvailableMeds = useMemo(() => {
    const combined = [...data.medicines];
    if (remoteMeds.length > 0) {
      const existingIds = new Set(combined.map((m) => m.id));
      remoteMeds.forEach((rm) => {
        if (!existingIds.has(rm.id)) combined.push(rm);
      });
    }
    return combined;
  }, [data.medicines, remoteMeds]);

  /* Distinct searchable index of medicines */
  const inventoryMedicines = useMemo(() => {
    const map = new Map<string, Medicine>();
    const sorted = [...allAvailableMeds].sort((a, b) => {
      const aScore = (a.purchasePrice > 0 ? 3 : 0) + (a.sellingPrice > 0 ? 2 : 0) + (a.batch ? 1 : 0);
      const bScore = (b.purchasePrice > 0 ? 3 : 0) + (b.sellingPrice > 0 ? 2 : 0) + (b.batch ? 1 : 0);
      if (bScore !== aScore) return bScore - aScore;
      return (b.createdAt || "").localeCompare(a.createdAt || "");
    });
    sorted.forEach((m) => {
      const key = (m.name || "").trim().toLowerCase();
      if (!key) return;
      if (!map.has(key)) {
        map.set(key, m);
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [allAvailableMeds]);

  const productMatches = useMemo(() => {
    const q = (productQuery || line.name || "").trim().toLowerCase();
    if (!q) return [];
    return inventoryMedicines
      .filter((m) => {
        const nameMatch = m.name.toLowerCase().includes(q);
        const batchMatch = Boolean(m.batch && m.batch.toLowerCase().includes(q));
        const supplierMatch = Boolean(m.supplier && m.supplier.toLowerCase().includes(q));
        return nameMatch || batchMatch || supplierMatch;
      })
      .slice(0, 15);
  }, [productQuery, line.name, inventoryMedicines]);

  /* Handle file upload using OpenRouter Multimodal LLM */
  const onFiles = async (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    setImporting(true);
    setImportStatus("Uploading & analyzing supplier invoice with Multimodal LLM...");

    try {
      const compactMeds = inventoryMedicines.map((m) => ({ name: m.name, gst: m.gst }));
      const compactSups = data.suppliers.map((s) => ({ id: s.id, name: s.name }));

      const parsed = await parseSupplierInvoice({
        file: f,
        existingMedicines: compactMeds,
        existingSuppliers: compactSups,
        onStatusChange: (statusText) => setImportStatus(statusText),
      });

      setExtractedInvoice(parsed);
      setVerifiedItems(parsed.items || []);
      setVerifiedInvoiceNumber(parsed.invoiceNumber || "");
      setVerifiedDate(parsed.date ? (parsed.date > today ? today : parsed.date) : today);

      // Auto-match supplier ID
      let supId = parsed.matchedSupplierId || "";
      if (!supId && parsed.supplier) {
        const found = data.suppliers.find((s) => s.name.toLowerCase() === parsed.supplier!.toLowerCase());
        if (found) supId = found.id;
      }
      setVerifiedSupplierId(supId);

      setAttachedFileName(f.name);
      setAiModelUsed(parsed.modelUsed || "Gemini 2.5 Flash");
      setIsAiExtracted(true);
      setReviewModalOpen(true);

      flashToast(`✓ ${parsed.items.length} items extracted from "${f.name}" using ${parsed.modelUsed || "Multimodal LLM"}`);
    } catch (err) {
      console.error("Document parsing error:", err);
      flashToast(err instanceof Error ? err.message : "Could not parse supplier invoice document", "warn");
    } finally {
      setImporting(false);
      setImportStatus("");
    }
  };

  /* Populate verified items into the main GRN product list */
  const confirmAndPopulate = () => {
    if (verifiedItems.length === 0) {
      notify("⚠ No line items to populate into GRN");
      return;
    }

    // Verify all batch numbers are genuine and not serial numbers or HSN codes
    for (let idx = 0; idx < verifiedItems.length; idx++) {
      const it = verifiedItems[idx];
      const batchVal = validateBatchNumber({
        batch: it.batch,
        rowIdx: idx,
        productName: it.name,
        totalRows: verifiedItems.length,
        allBatches: verifiedItems.map((x) => x.batch),
      });

      if (!it.batch.trim()) {
        notify(`⚠ Line #${idx + 1} "${it.name || 'Unnamed'}" is missing a Batch Number`);
        return;
      }
      if (batchVal.isSerialAsBatch) {
        notify(`⚠ Line #${idx + 1} "${it.name || 'Unnamed'}" has serial number ("${it.batch}") as batch. Please enter the genuine manufacturer batch.`);
        return;
      }
      if (batchVal.isHsnAsBatch) {
        notify(`⚠ Line #${idx + 1} "${it.name || 'Unnamed'}" has an HSN code as batch. Please enter the genuine manufacturer batch.`);
        return;
      }
    }

    if (verifiedSupplierId) setSupplierId(verifiedSupplierId);
    if (verifiedInvoiceNumber.trim()) setInvoiceNumber(verifiedInvoiceNumber.trim());
    if (verifiedDate) setDate(verifiedDate);

    const newLines: Line[] = verifiedItems.map((it) => {
      const finalName = it.matchedInventoryName || it.name;
      return {
        ...blankLine(),
        name: finalName,
        receivingQty: it.receivingQty || "",
        uomPerStrip: it.uomPerStrip || 10,
        freeQty: it.freeQty || "",
        purchasePrice: it.purchasePrice || "",
        discPct: it.discPct || "",
        taxPct: it.taxPct || 12,
        extraCharges: it.extraCharges || "",
        mrpUnit: it.mrpUnit || "",
        batch: it.batch.trim(),
        mfgDate: it.mfgDate && it.mfgDate > today ? today : it.mfgDate,
        expiry: it.expiry,
        id: uid("ln"),
      };
    });

    setLines((existing) => [...existing, ...newLines]);
    setReviewModalOpen(false);
    flashToast(`✓ Populated ${newLines.length} product lines into GRN for manual verification!`);
  };

  /* Helper to update an item within the review dialog */
  const updVerifiedItem = <K extends keyof ExtractedGrnItem>(idx: number, field: K, value: ExtractedGrnItem[K]) => {
    setVerifiedItems((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: value };
      return copy;
    });
  };

  /* Helper to remove an item from the review dialog */
  const rmVerifiedItem = (idx: number) => {
    setVerifiedItems((prev) => prev.filter((_, i) => i !== idx));
  };

  /* Helper to add a blank line inside the review dialog */
  const addVerifiedItem = () => {
    setVerifiedItems((prev) => [
      ...prev,
      {
        id: `rev_${Date.now()}`,
        serialNo: prev.length + 1,
        name: "",
        batch: "",
        expiry: "",
        mfgDate: "",
        receivingQty: 1,
        uomPerStrip: 10,
        freeQty: 0,
        purchasePrice: 0,
        mrpUnit: 0,
        mrpStrip: 0,
        discPct: 0,
        taxPct: 12,
        extraCharges: 0,
        lineTotal: 0,
        confidence: "high",
      },
    ]);
  };

  /* Sequential Enter navigation helper for GRN input fields */
  const focusGrnField = (fieldId: string) => {
    requestAnimationFrame(() => {
      const el = document.getElementById(fieldId);
      if (el) {
        el.focus();
        if (el instanceof HTMLInputElement && el.type !== "date" && el.type !== "button") {
          try {
            el.select?.();
          } catch {
            // ignore if not selectable
          }
        }
      }
    });
  };

  /* Handle direct creation of new medicine into inventory */
  const handleSaveNewMedicine = async () => {
    setAddMedError("");
    const name = addMedForm.name.trim();
    const supplier = addMedForm.supplier.trim();
    if (!name) {
      setAddMedError("Medicine name is mandatory.");
      return;
    }
    if (!supplier) {
      setAddMedError("Supplier / vendor is mandatory.");
      return;
    }

    setAddMedSubmitting(true);
    try {
      const nowIso = new Date().toISOString();
      const branchId = currentBranch?.id || currentUser?.branchId || "br_main";
      const newMedPayload: Medicine = {
        id: uid("m"),
        name,
        supplier,
        batch: "",
        stock: 0,
        purchasePrice: 0,
        sellingPrice: 0,
        expiry: "",
        mfgDate: "",
        gst: Number(addMedForm.gst) || 12,
        narcotic: Boolean(addMedForm.narcotic),
        minStock: Number(addMedForm.minStock) || 10,
        branchId,
        createdAt: nowIso,
      };

      const res = await fetch("/api/inventory/medicine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          medicine: newMedPayload,
          medicines: data.medicines,
          requirePurchaseDetails: false,
        }),
      });

      let createdMed: Medicine = newMedPayload;
      if (res.ok) {
        const json = await res.json();
        if (json.medicine) createdMed = json.medicine;
      } else {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || "Failed to create medicine in backend");
      }

      // If no supplier on header yet, auto-select this supplier
      if (!supplierId) {
        const supMatch = data.suppliers.find((s) => s.name.trim().toLowerCase() === supplier.toLowerCase());
        if (supMatch) setSupplierId(supMatch.id);
      }

      // Update store and remote state
      setData((d) => ({
        ...d,
        medicines: [createdMed, ...d.medicines.filter((m) => m.id !== createdMed.id)],
      }));
      setRemoteMeds((prev) => [createdMed, ...prev.filter((m) => m.id !== createdMed.id)]);

      log("MEDICINE_CREATE", `${createdMed.name} (Direct from GRN Entry)`);
      flashToast(`✓ "${createdMed.name}" added to inventory!`, "ok");

      setAddMedOpen(false);

      // Auto-select the newly created medicine into current GRN line and focus receiving quantity
      pickProduct(createdMed);
    } catch (err: any) {
      setAddMedError(err?.message || "Failed to add medicine. Please try again.");
    } finally {
      setAddMedSubmitting(false);
    }
  };

  /* Sequential Enter navigation helper with rigorous validation */
  const handleGrnFieldEnter = (fieldId: string, e: React.KeyboardEvent) => {
    if (e.key !== "Enter") return;
    e.preventDefault();

    // Shift + Enter: move backward to previous field
    if (e.shiftKey) {
      const prevMap: Record<string, string> = {
        "grn-invoice-no": "grn-supplier",
        "grn-receipt-date": "grn-invoice-no",
        "grn-product-name": "grn-receipt-date",
        "grn-rec-qty": "grn-product-name",
        "grn-uom": "grn-rec-qty",
        "grn-free-qty": "grn-uom",
        "grn-buy-price": "grn-free-qty",
        "grn-disc-pct": "grn-buy-price",
        "grn-tax-pct": "grn-disc-pct",
        "grn-mrp-unit": "grn-tax-pct",
        "grn-batch": "grn-mrp-unit",
        "grn-mfg-date": "grn-batch",
        "grn-expiry": "grn-mfg-date",
        "grn-add-btn": "grn-expiry",
      };
      if (prevMap[fieldId]) {
        focusGrnField(prevMap[fieldId]);
      }
      return;
    }

    // Rigorous validation: leaving mandatory fields empty blocks progression and retains focus
    switch (fieldId) {
      case "grn-supplier": {
        if (!supplierId || !supplierId.trim()) {
          notify("⚠ Supplier is mandatory. Please select a supplier before proceeding.");
          focusGrnField("grn-supplier");
          return;
        }
        focusGrnField("grn-invoice-no");
        return;
      }
      case "grn-invoice-no": {
        if (!invoiceNumber || !invoiceNumber.trim()) {
          notify("⚠ Supplier invoice number is mandatory. Please enter the invoice number.");
          focusGrnField("grn-invoice-no");
          return;
        }
        focusGrnField("grn-receipt-date");
        return;
      }
      case "grn-receipt-date": {
        if (!date || !date.trim()) {
          notify("⚠ Receipt date is mandatory. Please enter a valid date.");
          focusGrnField("grn-receipt-date");
          return;
        }
        if (date > today) {
          notify("⚠ Receipt date cannot be in the future.");
          focusGrnField("grn-receipt-date");
          return;
        }
        focusGrnField("grn-product-name");
        return;
      }
      case "grn-product-name": {
        const q = (productQuery || line.name || "").trim().toLowerCase();
        if (!q) {
          notify("⚠ Product name is mandatory. Please search and select an inventory medicine.");
          focusGrnField("grn-product-name");
          setComboOpen(true);
          return;
        }
        // If an item in combobox dropdown is currently highlighted via arrow keys:
        if (selectedIndex >= 0 && productMatches[selectedIndex]) {
          pickProduct(productMatches[selectedIndex]);
          return;
        }
        // If there is exactly 1 match in search results, auto-select it:
        if (productMatches.length === 1) {
          pickProduct(productMatches[0]);
          return;
        }
        // If there is an exact case-insensitive match in inventory:
        const exact = inventoryMedicines.find((m) => m.name.trim().toLowerCase() === q);
        if (exact) {
          pickProduct(exact);
          return;
        }
        // STRICT BLOCK: Item is unlisted or "No matching inventory found"
        notify("⚠ Unlisted item! Medicine not found in inventory. Progression blocked until selected or added.");
        setComboOpen(true);
        focusGrnField("grn-product-name");
        return;
      }
      case "grn-rec-qty": {
        if (line.receivingQty === "" || Number(line.receivingQty) <= 0 || isNaN(Number(line.receivingQty))) {
          notify("⚠ Receiving quantity (strips) is mandatory and must be greater than 0.");
          focusGrnField("grn-rec-qty");
          return;
        }
        focusGrnField("grn-uom");
        return;
      }
      case "grn-uom": {
        if (line.uomPerStrip === "" || Number(line.uomPerStrip) < 1 || isNaN(Number(line.uomPerStrip))) {
          notify("⚠ UOM quantity per strip is mandatory and must be at least 1.");
          focusGrnField("grn-uom");
          return;
        }
        focusGrnField("grn-free-qty");
        return;
      }
      case "grn-free-qty": {
        if (line.freeQty !== "" && Number(line.freeQty) < 0) {
          notify("⚠ Free quantity cannot be negative.");
          focusGrnField("grn-free-qty");
          return;
        }
        focusGrnField("grn-buy-price");
        return;
      }
      case "grn-buy-price": {
        if (line.purchasePrice === "" || Number(line.purchasePrice) <= 0 || isNaN(Number(line.purchasePrice))) {
          notify("⚠ Purchase price per unit is mandatory and must be greater than 0.");
          focusGrnField("grn-buy-price");
          return;
        }
        focusGrnField("grn-disc-pct");
        return;
      }
      case "grn-disc-pct": {
        if (line.discPct !== "" && (Number(line.discPct) < 0 || Number(line.discPct) > 100)) {
          notify("⚠ Discount % must be between 0 and 100.");
          focusGrnField("grn-disc-pct");
          return;
        }
        focusGrnField("grn-tax-pct");
        return;
      }
      case "grn-tax-pct": {
        focusGrnField("grn-mrp-unit");
        return;
      }
      case "grn-mrp-unit": {
        if (line.mrpUnit === "" || Number(line.mrpUnit) <= 0 || isNaN(Number(line.mrpUnit))) {
          notify("⚠ MRP price per unit is mandatory and must be greater than 0.");
          focusGrnField("grn-mrp-unit");
          return;
        }
        focusGrnField("grn-batch");
        return;
      }
      case "grn-batch": {
        if (!line.batch || !line.batch.trim()) {
          notify("⚠ Batch number is mandatory. Please enter a valid batch number.");
          focusGrnField("grn-batch");
          return;
        }
        const batchVal = validateBatchNumber({
          batch: line.batch,
          rowIdx: editingLineId ? lines.findIndex((x) => x.id === editingLineId) : lines.length,
          productName: line.name,
          totalRows: lines.length + 1,
          allBatches: lines.map((l) => l.batch),
        });
        if (batchVal.isSerialAsBatch) {
          notify("⚠ Batch number cannot be the item serial number (1, 2, 3...). Enter genuine manufacturer batch code.");
          focusGrnField("grn-batch");
          return;
        }
        if (batchVal.isHsnAsBatch) {
          notify("⚠ Batch number appears to be an HSN code. Enter genuine manufacturer batch code.");
          focusGrnField("grn-batch");
          return;
        }
        focusGrnField("grn-mfg-date");
        return;
      }
      case "grn-mfg-date": {
        if (line.mfgDate && line.mfgDate > today) {
          notify("⚠ Manufacturing date cannot be in the future.");
          focusGrnField("grn-mfg-date");
          return;
        }
        focusGrnField("grn-expiry");
        return;
      }
      case "grn-expiry": {
        if (!line.expiry || !line.expiry.trim()) {
          notify("⚠ Expiry date is mandatory. Please enter an expiry date.");
          focusGrnField("grn-expiry");
          return;
        }
        focusGrnField("grn-add-btn");
        return;
      }
      case "grn-add-btn": {
        addTogether();
        return;
      }
      default:
        return;
    }
  };

  /* Pick medicine from inventory combobox */
  const pickProduct = (m: Medicine) => {
    // If supplier is specified on medicine and not yet set on GRN header, auto-select it
    if (m.supplier && !supplierId) {
      const matchSup = data.suppliers.find(
        (s) => s.name.trim().toLowerCase() === m.supplier?.trim().toLowerCase()
      );
      if (matchSup) setSupplierId(matchSup.id);
    }

    const buyPrice = m.purchasePrice > 0 ? m.purchasePrice : line.purchasePrice;
    const sellPrice = m.sellingPrice > 0 ? m.sellingPrice : line.mrpUnit;
    const gstRate = TAX_OPTIONS.includes(m.gst) ? m.gst : (m.gst || 12);

    setLine((prev) => ({
      ...prev,
      name: m.name,
      purchasePrice: buyPrice,
      mrpUnit: sellPrice,
      taxPct: gstRate,
      batch: m.batch || prev.batch,
      expiry: m.expiry || prev.expiry,
      mfgDate: m.mfgDate || prev.mfgDate,
      uomPerStrip: prev.uomPerStrip || 10,
    }));
    setProductQuery(m.name);
    setComboOpen(false);
    setSelectedIndex(-1);
    flashToast(`✓ Loaded "${m.name}" — Buy: ₹${buyPrice || 0}, MRP: ₹${sellPrice || 0}, GST: ${gstRate}%`, "ok");
    focusGrnField("grn-rec-qty");
  };

  const L = calcLine(line);

  const addTogether = () => {
    if (!line.name.trim()) {
      focusGrnField("grn-product-name");
      return notify("⚠ Please enter or select a medicine name");
    }

    // Strict validation: must exist in inventory
    const matchInInv = inventoryMedicines.some(
      (m) => m.name.trim().toLowerCase() === line.name.trim().toLowerCase()
    );
    if (!matchInInv) {
      focusGrnField("grn-product-name");
      setComboOpen(true);
      return notify("⚠ Unlisted medicine! Please select an existing inventory item or click '+ Add New Medicine' first.");
    }

    if (!line.batch.trim()) {
      focusGrnField("grn-batch");
      return notify("⚠ Batch number is required");
    }

    // Robust validation: verify batch number is not serial number or HSN code
    const batchVal = validateBatchNumber({
      batch: line.batch,
      rowIdx: editingLineId ? lines.findIndex((x) => x.id === editingLineId) : lines.length,
      productName: line.name,
      totalRows: lines.length + 1,
      allBatches: lines.map((l) => l.batch),
    });

    if (batchVal.isSerialAsBatch) {
      focusGrnField("grn-batch");
      return notify("⚠ Batch number cannot be the item serial number (e.g. 1, 2, 3). Please enter the genuine manufacturer batch code.");
    }
    if (batchVal.isHsnAsBatch) {
      focusGrnField("grn-batch");
      return notify("⚠ Batch number appears to be an HSN code. Please enter the genuine manufacturer batch code.");
    }

    if (!line.expiry) {
      focusGrnField("grn-expiry");
      return notify("⚠ Expiry date is required");
    }
    if (line.mfgDate && line.mfgDate > today) {
      focusGrnField("grn-mfg-date");
      return notify("⚠ Manufacturing date cannot be in the future");
    }

    if (line.receivingQty === "" || Number(line.receivingQty) <= 0) {
      focusGrnField("grn-rec-qty");
      return notify("⚠ Receiving quantity (strips) must be greater than 0");
    }
    if (line.uomPerStrip === "" || Number(line.uomPerStrip) <= 0) {
      focusGrnField("grn-uom");
      return notify("⚠ UOM quantity / strip must be greater than 0");
    }
    if (line.purchasePrice === "" || Number(line.purchasePrice) <= 0) {
      focusGrnField("grn-buy-price");
      return notify("⚠ Purchase price must be greater than 0");
    }
    if (line.mrpUnit === "" || Number(line.mrpUnit) <= 0) {
      focusGrnField("grn-mrp-unit");
      return notify("⚠ MRP price / unit must be greater than 0");
    }

    if (editingLineId) {
      setLines((ls) => ls.map((x) => (x.id === editingLineId ? { ...line, id: editingLineId } : x)));
      setEditingLineId(null);
      setLine(blankLine());
      setProductQuery("");
      notify("✓ Line updated in list");
      focusGrnField("grn-product-name");
      return;
    }

    setLines((ls) => [...ls, { ...line, id: uid("ln") }]);
    setLine(blankLine());
    setProductQuery("");
    notify("✓ Line added to list");
    focusGrnField("grn-product-name");
  };

  /* aggregates */
  const agg = useMemo(() => {
    const cs = lines.map((l) => ({ l, c: calcLine(l) }));
    const sum = (f: (c: ReturnType<typeof calcLine>) => number) => cs.reduce((s, x) => s + f(x.c), 0);
    const totalProductAmount = sum((c) => c.purchaseTotal);
    const dedSum = deductions.reduce((s, d) => s + d.amount, 0);
    const addSum = additions.reduce((s, d) => s + d.amount, 0);
    const tdNum = Number(tradeDiscount) || 0;
    const addAfterNum = Number(addAfterAmt) || 0;
    const raw = totalProductAmount - dedSum + addSum - tdNum + addAfterNum;
    const roundOff = Math.round(raw * 100) / 100 - raw;
    const purchaseTotal = raw + roundOff;
    const resaleTotal = sum((c) => c.resaleTotal);
    const resaleGrossSum = sum((c) => c.resaleGross * c.resaleQty);
    const costSum = sum((c) => c.grossTaxable);
    const avgMargin = resaleGrossSum > 0 ? ((resaleGrossSum - costSum) / resaleGrossSum) * 100 : 0;
    const totals = {
      value: sum((c) => c.value),
      discountAmt: sum((c) => c.discountAmt),
      gross: sum((c) => c.gross),
      lineDed: cs.reduce((s, x) => s + x.l.lineDed, 0),
      lineAdd: cs.reduce((s, x) => s + x.l.lineAdd, 0),
      grossTaxable: sum((c) => c.grossTaxable),
      taxValue: sum((c) => c.taxValue),
      extraCharges: cs.reduce((s, x) => s + (Number(x.l.extraCharges) || 0), 0),
      purchaseTotalLine: totalProductAmount,
      resaleTotal,
    };
    return { totalProductAmount, dedSum, addSum, roundOff, purchaseTotal, resaleTotal, avgMargin, totals };
  }, [lines, deductions, additions, tradeDiscount, addAfterAmt]);

  const refreshAll = () => {
    if (lines.length > 0 && !confirm("Clear the entire GRN session?")) return;
    setLines([]);
    setLine(blankLine());
    setDeductions([]);
    setAdditions([]);
    setTradeDiscount("");
    setAddAfterDesc("");
    setAddAfterAmt("");
    setSupplierId("");
    setInvoiceNumber("");
    setDate(today);
    setAttachedFileName("");
    setIsAiExtracted(false);
    setAiModelUsed("");
    setExtractedInvoice(null);
    setEditingLineId(null);
    notify("Session refreshed");
  };

  const save = () => {
    if (!supplierId) return notify("⚠ Select a supplier");
    if (!invoiceNumber.trim()) return notify("⚠ Invoice number is required");
    if (!date) return notify("⚠ GRN date is required");
    if (date > today) return notify("⚠ GRN receipt date cannot be in the future");
    if (lines.length === 0) return notify("⚠ Add at least one product line");
    const sup = data.suppliers.find((s) => s.id === supplierId);

    const items: PurchaseItem[] = lines.map((l) => {
      const c = calcLine(l);
      const rQty = Number(l.receivingQty) || 0;
      const uom = Number(l.uomPerStrip) || 1;
      const fQty = Number(l.freeQty) || 0;
      const pPrice = Number(l.purchasePrice) || 0;
      const mrp = Number(l.mrpUnit) || 0;
      const disc = Number(l.discPct) || 0;
      const extra = Number(l.extraCharges) || 0;
      return {
        name: l.name.trim(),
        batch: l.batch.trim(),
        qty: c.resaleQty,
        strips: rQty,
        tabsPerStrip: uom,
        freeStrips: fQty,
        purchasePrice: Number(c.costPrice.toFixed(3)),
        sellingPrice: Number(mrp.toFixed(2)),
        expiry: l.expiry,
        igst: 0,
        cgst: l.taxPct / 2,
        sgst: l.taxPct / 2,
        discountPct: disc,
        discountAmt: c.discountAmt,
        gross: c.gross,
        grossTaxable: c.grossTaxable,
        taxPct: l.taxPct,
        taxValue: c.taxValue,
        extraCharges: extra,
        lineDeductions: l.lineDed,
        lineAdditions: l.lineAdd,
        purchaseTotal: c.purchaseTotal,
        resaleQty: c.resaleQty,
        costPrice: c.costPrice,
        marginPct: c.marginPct,
        mrpUnit: mrp,
        mrpStrip: c.mrpStrip,
        mfgDate: l.mfgDate,
        shelfLifeDays: c.shelfLifeDays ?? undefined,
        resaleGross: c.resaleGross,
        salesTax: c.salesTax,
        resaleTotal: c.resaleTotal,
        value: c.value,
        unit: "Strips",
      };
    });

    const newCounter = data.counters.grn + 1;
    const tdNum = Number(tradeDiscount) || 0;
    const grn: GRN = {
      id: uid("grn"),
      number: "GRN-" + newCounter,
      supplierId,
      supplierName: sup?.name || (extractedInvoice?.supplier || ""),
      invoiceNumber: invoiceNumber.trim(),
      date,
      items,
      subtotal: agg.totals.gross,
      agencyDiscountPct: 0,
      agencyDiscountAmt: 0,
      specialDiscount: tdNum,
      taxAmount: agg.totals.taxValue,
      total: agg.purchaseTotal,
      status: "pending",
      createdBy: currentUser?.username || "unknown",
      attachedInvoiceName: attachedFileName || undefined,
      aiExtracted: isAiExtracted,
      modelUsed: aiModelUsed || undefined,
      extractedAt: isAiExtracted ? new Date().toISOString() : undefined,
      createdAt: new Date().toISOString(),
    };

    setData((d) => ({ ...d, grns: [grn, ...d.grns], counters: { ...d.counters, grn: newCounter } }));
    log(
      "GRN_CREATE",
      `${grn.number} from ${sup?.name || grn.supplierName} — ${items.length} lines, total ${cur(agg.purchaseTotal)}${attachedFileName ? ` (AI Parsed: ${attachedFileName})` : ""}`
    );
    notify(`✓ ${grn.number} saved & sent for approval`);

    setLines([]);
    setLine(blankLine());
    setDeductions([]);
    setAdditions([]);
    setTradeDiscount("");
    setAddAfterDesc("");
    setAddAfterAmt("");
    setInvoiceNumber("");
    setAttachedFileName("");
    setIsAiExtracted(false);
    setAiModelUsed("");
    setExtractedInvoice(null);
    setEditingLineId(null);
  };

  /* adjustment modal helpers */
  const [adjDesc, setAdjDesc] = useState("");
  const [adjAmt, setAdjAmt] = useState<number | "">("");
  const adjRows = adjModal === "ded" ? deductions : additions;
  const setAdjRows = adjModal === "ded" ? setDeductions : setAdditions;
  const addAdj = () => {
    if (!adjDesc.trim() || Number(adjAmt) <= 0) return;
    setAdjRows((r) => [...r, { id: uid("adj"), desc: adjDesc.trim(), amount: Number(adjAmt) }]);
    setAdjDesc("");
    setAdjAmt("");
  };

  const inputCls =
    "w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-sky-400 tabular-nums";
  const roCls =
    "w-full px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-sm font-semibold text-slate-700 dark:text-slate-200 tabular-nums";

  return (
    <div className="space-y-5">
      {/* header */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-sky-600 via-sky-500 to-emerald-500 text-white shadow-lg">
        <div className="absolute inset-y-0 right-0 w-1/3 bg-gradient-to-l from-white/10 to-transparent" />
        <div className="relative px-5 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-white/15 flex items-center justify-center">
              <PackagePlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold tracking-tight">GRN Entry — Purchase Receipt</h2>
              <p className="text-xs text-sky-100">
                AI Multimodal Document Parsing · Auto-normalization · Manual verification before approval
              </p>
            </div>
          </div>
          {flash && (
            <span className="text-xs font-semibold bg-white/20 rounded-full px-3 py-1.5 backdrop-blur-sm animate-pulse">
              {flash}
            </span>
          )}
        </div>
      </div>

      {/* invoice header card */}
      <Card>
        <CardBody className="space-y-3">
          {/* file import drop zone */}
          {flags.grnAutoFill && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                onFiles(e.dataTransfer.files);
              }}
              className={`relative rounded-xl border-2 border-dashed transition-all duration-200 ${
                dragOver
                  ? "border-sky-500 bg-sky-50 dark:bg-sky-900/30 scale-[1.01]"
                  : "border-slate-300 dark:border-slate-600 bg-slate-50/70 dark:bg-slate-800/40 hover:border-sky-400 hover:bg-sky-50/40"
              }`}
            >
              <input
                type="file"
                id="grn-file-import"
                accept=".pdf,.xlsx,.xls,.csv,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                className="hidden"
                disabled={importing}
                onChange={(e) => {
                  onFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <label
                htmlFor="grn-file-import"
                className={`flex flex-col sm:flex-row items-start sm:items-center gap-4 px-4 py-3.5 cursor-pointer ${
                  importing ? "opacity-75 pointer-events-none" : ""
                }`}
              >
                <div
                  className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-colors shadow-sm ${
                    importing
                      ? "bg-amber-500 text-white"
                      : dragOver
                      ? "bg-sky-500 text-white"
                      : "bg-white dark:bg-slate-700 text-sky-600 dark:text-sky-300 border border-slate-200 dark:border-slate-600"
                  }`}
                >
                  {importing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5 text-amber-500" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                      {importing ? "AI Intelligent Invoice Parser Running..." : "Attach Supplier Invoice (PDF or Excel)"}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-sky-700 dark:text-sky-300 bg-sky-100 dark:bg-sky-900/50 px-2 py-0.5 rounded-full uppercase tracking-wider">
                      <Sparkles className="w-3 h-3 text-amber-500" /> Multimodal LLM
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    {importing
                      ? importStatus || "Processing document & extracting product lines..."
                      : "Drop a supplier invoice here or click to browse — multimodal LLM extracts & normalizes product line items automatically"}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-rose-600 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800 rounded-full px-2.5 py-1">
                    <FileText className="w-3.5 h-3.5" /> PDF
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-full px-2.5 py-1">
                    <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
                  </span>
                </div>
              </label>
            </div>
          )}

          {/* Attached invoice status badge */}
          {attachedFileName && (
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/80 dark:bg-emerald-950/30 p-3 flex flex-wrap items-center justify-between gap-3 animate-fadeIn">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-emerald-900 dark:text-emerald-200 flex items-center gap-2">
                    <span>Attached Invoice: {attachedFileName}</span>
                    {aiModelUsed && <Badge tone="green">{aiModelUsed}</Badge>}
                  </div>
                  <div className="text-[11px] text-emerald-700 dark:text-emerald-400">
                    Product line items extracted and normalized. Verify values below before saving the final GRN.
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {extractedInvoice && (
                  <Button size="sm" variant="secondary" onClick={() => setReviewModalOpen(true)}>
                    <Eye className="w-3.5 h-3.5" /> Re-open Verification
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (confirm("Detach this invoice? Extracted product lines in the table will remain.")) {
                      setAttachedFileName("");
                      setIsAiExtracted(false);
                      setAiModelUsed("");
                    }
                  }}
                >
                  <X className="w-3.5 h-3.5" /> Detach
                </Button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label>Supplier *</Label>
              <Select
                id="grn-supplier"
                tabIndex={1}
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                onKeyDown={(e) => handleGrnFieldEnter("grn-supplier", e)}
              >
                <option value="">Select supplier...</option>
                {data.suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Invoice Number *</Label>
              <Input
                id="grn-invoice-no"
                tabIndex={2}
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                onKeyDown={(e) => handleGrnFieldEnter("grn-invoice-no", e)}
                placeholder="Supplier invoice no"
              />
            </div>
            <div>
              <Label>Receipt Date *</Label>
              <Input
                id="grn-receipt-date"
                tabIndex={3}
                type="date"
                max={today}
                value={date}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val > today) {
                    notify("⚠ GRN receipt date cannot be in the future");
                    return;
                  }
                  setDate(val);
                }}
                onKeyDown={(e) => handleGrnFieldEnter("grn-receipt-date", e)}
              />
            </div>
          </div>
        </CardBody>
      </Card>

      {/* ── ROW A + ROW B input form ── */}
      <Card id="grn-line-editor">
        <CardBody className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
              <PackagePlus className="w-4 h-4 text-sky-600" />
              Product & Purchase Basics
            </div>
            <div className="flex items-center gap-2">
              {editingLineId && (
                <Badge tone="amber">Editing line from Product List</Badge>
              )}
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => openAddMedModal(productQuery || line.name)}
                className="text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 font-medium shadow-sm flex items-center gap-1.5"
                title="Add unlisted medicine directly to inventory"
              >
                <PlusCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>+ Add New Medicine</span>
              </Button>
            </div>
          </div>

          {/* product combobox — inventory medicines */}
          <div className="relative" ref={comboRef}>
            <div className="flex items-center justify-between mb-1">
              <Label className="mb-0">Product Name * (Select from Inventory)</Label>
              <div className="flex items-center gap-2">
                {inventoryMedicines.length > 0 && (
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    {inventoryMedicines.length} inventory item{inventoryMedicines.length === 1 ? "" : "s"} indexed
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => openAddMedModal(productQuery || line.name)}
                  className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 hover:underline flex items-center gap-1"
                >
                  <PlusCircle className="w-3 h-3" /> Add Unlisted Item
                </button>
              </div>
            </div>
            <div className="relative">
              <input
                id="grn-product-name"
                tabIndex={4}
                className={inputCls + " pr-9"}
                value={line.name || productQuery}
                placeholder="Search inventory by medicine name, batch, or supplier..."
                onChange={(e) => {
                  const v = e.target.value;
                  setProductQuery(v);
                  setLine((prev) => ({ ...prev, name: v }));
                  setComboOpen(true);
                  setSelectedIndex(-1);
                }}
                onFocus={() => {
                  setComboOpen(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && e.shiftKey) {
                    e.preventDefault();
                    focusGrnField("grn-receipt-date");
                    return;
                  }
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    if (!comboOpen) {
                      setComboOpen(true);
                    } else {
                      setSelectedIndex((prev) => (prev < productMatches.length - 1 ? prev + 1 : 0));
                    }
                    return;
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    if (!comboOpen) {
                      setComboOpen(true);
                    } else {
                      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : productMatches.length - 1));
                    }
                    return;
                  }
                  if (e.key === "Escape") {
                    setComboOpen(false);
                    setSelectedIndex(-1);
                    return;
                  }
                  if (e.key === "Enter") {
                    handleGrnFieldEnter("grn-product-name", e);
                  }
                }}
              />
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {comboOpen && (
              <div className="absolute z-50 left-0 right-0 mt-1 max-h-80 overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl divide-y divide-slate-100 dark:divide-slate-700/60">
                {productMatches.length > 0 ? (
                  <>
                    {productMatches.map((m, idx) => {
                      const isSelected = idx === selectedIndex;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => pickProduct(m)}
                          onMouseEnter={() => setSelectedIndex(idx)}
                          className={`w-full text-left px-3.5 py-2.5 transition flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 ${
                            isSelected
                              ? "bg-sky-50 dark:bg-sky-900/40 border-l-4 border-sky-600 pl-2.5"
                              : "hover:bg-slate-50 dark:hover:bg-slate-700/50"
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm text-slate-800 dark:text-slate-100">{m.name}</span>
                              {m.narcotic && (
                                <Badge tone="red" className="text-[10px] px-1.5 py-0.5">Narcotic</Badge>
                              )}
                              {m.batch && (
                                <span className="inline-flex items-center text-[11px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                                  Batch: {m.batch}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                              <span>Stock: <b className="text-slate-700 dark:text-slate-200">{m.stock}</b></span>
                              <span>•</span>
                              <span>Buy: <b className="text-emerald-700 dark:text-emerald-400">₹{m.purchasePrice}</b></span>
                              <span>•</span>
                              <span>MRP: <b className="text-sky-700 dark:text-sky-400">₹{m.sellingPrice}</b></span>
                              <span>•</span>
                              <span>GST: {m.gst}%</span>
                              {m.supplier && (
                                <>
                                  <span>•</span>
                                  <span className="truncate max-w-[140px] text-slate-400">Supplier: {m.supplier}</span>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="shrink-0 flex items-center gap-1.5 self-end sm:self-center">
                            <Badge tone="blue">Auto-fill ↵</Badge>
                          </div>
                        </button>
                      );
                    })}
                    <div className="p-2.5 bg-slate-50 dark:bg-slate-750 flex items-center justify-between text-xs">
                      <span className="text-slate-500 text-[11px]">Unlisted item not in results?</span>
                      <button
                        type="button"
                        onClick={() => openAddMedModal(productQuery || line.name)}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 hover:underline"
                      >
                        <PlusCircle className="w-3.5 h-3.5" /> + Add New Medicine to Inventory
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="p-4 text-center">
                    <div className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-rose-100 dark:bg-rose-900/40 text-rose-600 mb-2">
                      <AlertCircle className="w-5 h-5" />
                    </div>
                    <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                      No matching inventory medicine for &quot;{(productQuery || line.name).trim()}&quot;
                    </div>
                    <div className="text-[11px] text-rose-600 dark:text-rose-400 mt-0.5 font-medium max-w-sm mx-auto">
                      Unlisted item! Progression is blocked until this item exists in inventory.
                    </div>
                    <div className="mt-3">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => openAddMedModal(productQuery || line.name)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-sm inline-flex items-center gap-1.5"
                      >
                        <PlusCircle className="w-3.5 h-3.5" /> Add &quot;{(productQuery || line.name).trim() || 'Item'}&quot; to Inventory
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            <div>
              <Label>Receiving Quantity (Strips) *</Label>
              <input
                id="grn-rec-qty"
                tabIndex={5}
                type="number"
                min={0.01}
                step={0.01}
                className={inputCls}
                value={line.receivingQty}
                onChange={(e) =>
                  setLine({ ...line, receivingQty: e.target.value === "" ? "" : Number(e.target.value) })
                }
                onKeyDown={(e) => handleGrnFieldEnter("grn-rec-qty", e)}
                placeholder="Enter strips"
              />
            </div>
            <div>
              <Label>UOM Qty per Strip (Enter tabs/strip) *</Label>
              <input
                id="grn-uom"
                tabIndex={6}
                type="number"
                min={1}
                step={1}
                className={inputCls}
                value={line.uomPerStrip}
                onChange={(e) =>
                  setLine({ ...line, uomPerStrip: e.target.value === "" ? "" : Number(e.target.value) })
                }
                onKeyDown={(e) => handleGrnFieldEnter("grn-uom", e)}
                placeholder="Enter tabs/strip"
              />
            </div>
            <div>
              <Label>Free to Society (Strips)</Label>
              <input
                id="grn-free-qty"
                tabIndex={7}
                type="number"
                min={0}
                step={1}
                className={inputCls}
                value={line.freeQty}
                onChange={(e) =>
                  setLine({ ...line, freeQty: e.target.value === "" ? "" : Number(e.target.value) })
                }
                onKeyDown={(e) => handleGrnFieldEnter("grn-free-qty", e)}
                placeholder="Free strips"
              />
            </div>
            <div>
              <Label>Purchase Price per unit *</Label>
              <input
                id="grn-buy-price"
                tabIndex={8}
                type="number"
                min={0}
                step={0.001}
                className={inputCls}
                value={line.purchasePrice}
                onChange={(e) =>
                  setLine({ ...line, purchasePrice: e.target.value === "" ? "" : Number(e.target.value) })
                }
                onKeyDown={(e) => handleGrnFieldEnter("grn-buy-price", e)}
                placeholder="Enter buy price"
              />
            </div>
            <div>
              <Label>Discount %</Label>
              <input
                id="grn-disc-pct"
                tabIndex={9}
                type="number"
                min={0}
                max={100}
                step={0.01}
                className={inputCls}
                value={line.discPct}
                onChange={(e) =>
                  setLine({ ...line, discPct: e.target.value === "" ? "" : Number(e.target.value) })
                }
                onKeyDown={(e) => handleGrnFieldEnter("grn-disc-pct", e)}
                placeholder="Enter disc %"
              />
            </div>
            <div>
              <Label>Tax (%) *</Label>
              <select
                id="grn-tax-pct"
                tabIndex={10}
                className={inputCls}
                value={line.taxPct}
                onChange={(e) => setLine({ ...line, taxPct: Number(e.target.value) })}
                onKeyDown={(e) => handleGrnFieldEnter("grn-tax-pct", e)}
              >
                {TAX_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}%
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>MRP Price per unit *</Label>
              <input
                id="grn-mrp-unit"
                tabIndex={11}
                type="number"
                min={0}
                step={0.01}
                className={inputCls}
                value={line.mrpUnit}
                onChange={(e) =>
                  setLine({ ...line, mrpUnit: e.target.value === "" ? "" : Number(e.target.value) })
                }
                onKeyDown={(e) => handleGrnFieldEnter("grn-mrp-unit", e)}
                placeholder="Enter MRP/unit"
              />
            </div>
            <div>
              <Label>Total Units Received</Label>
              <input
                readOnly
                tabIndex={-1}
                className={roCls}
                value={n2(L.totalUnitsReceived)}
                title={`Total received: ${n2(L.totalUnitsReceived)} units`}
              />
            </div>
            <div>
              <Label>Shelf Life (Days)</Label>
              <input
                readOnly
                tabIndex={-1}
                className={roCls + (L.shelfLifeDays !== null && L.shelfLifeDays < 180 ? " !text-amber-600" : "")}
                value={L.shelfLifeDays === null ? "—" : String(L.shelfLifeDays)}
              />
            </div>
            <div>
              <Label>Batch Number *</Label>
              <Input
                id="grn-batch"
                tabIndex={12}
                value={line.batch}
                onChange={(e) => setLine({ ...line, batch: e.target.value })}
                onKeyDown={(e) => handleGrnFieldEnter("grn-batch", e)}
                placeholder="e.g. B1001"
              />
            </div>
            <div>
              <Label>Manufacture Date</Label>
              <Input
                id="grn-mfg-date"
                tabIndex={13}
                type="date"
                max={today}
                value={line.mfgDate}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val > today) {
                    notify("⚠ Manufacturing date cannot be in the future");
                    return;
                  }
                  setLine({ ...line, mfgDate: val });
                }}
                onKeyDown={(e) => handleGrnFieldEnter("grn-mfg-date", e)}
              />
            </div>
            <div>
              <Label>Expiry Date *</Label>
              <Input
                id="grn-expiry"
                tabIndex={14}
                type="date"
                value={line.expiry}
                onChange={(e) => setLine({ ...line, expiry: e.target.value })}
                onKeyDown={(e) => handleGrnFieldEnter("grn-expiry", e)}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            {editingLineId && (
              <Button
                variant="secondary"
                onClick={() => {
                  setLine(blankLine());
                  setEditingLineId(null);
                  setProductQuery("");
                }}
              >
                Cancel Edit
              </Button>
            )}
            <Button
              id="grn-add-btn"
              tabIndex={15}
              onClick={addTogether}
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.shiftKey) {
                  e.preventDefault();
                  focusGrnField("grn-expiry");
                }
              }}
              className="shadow-md focus:ring-2 focus:ring-offset-2 focus:ring-sky-500"
            >
              {editingLineId ? <Save className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {editingLineId ? "Update Line" : "Add To List"}
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* ── PRODUCT LIST GRID ── */}
      <Card>
        <CardBody className="p-0">
          <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-200 text-sm">
              <Layers className="w-4 h-4 text-sky-600" /> Product List (Manual Verification)
              <Badge tone="blue">{lines.length} line{lines.length === 1 ? "" : "s"}</Badge>
              {isAiExtracted && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                  <Sparkles className="w-3 h-3" /> Auto-populated from Invoice
                </span>
              )}
            </div>
            {lines.length > 0 && (
              <div className="text-xs text-slate-500">
                Tip: Click <Pencil className="w-3 h-3 inline text-sky-600" /> to edit any line values above
              </div>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]" style={{ minWidth: 2400 }}>
              <thead className="bg-sky-600 text-white">
                <tr>
                  {[
                    "S.No",
                    "Product Name",
                    "Rec. Qty (Strips)",
                    "UOM/Strip",
                    "Free (Strips)",
                    "MRP/Strip",
                    "MRP/unit",
                    "Batch",
                    "Mfg Date",
                    "Expiry",
                    "Shelf Life",
                    "Purch ₹/unit",
                    "Value",
                    "Disc %",
                    "Disc Amt",
                    "Gross",
                    "Deductions",
                    "Additions",
                    "Gross Taxable",
                    "Tax %",
                    "Tax Value",
                    "Purchase Total",
                    "Resale Total",
                    "Resale Qty",
                    "Cost Price",
                    "Margin %",
                    "Sales Gross",
                    "Sales Tax",
                    "Action",
                  ].map((h, i) => (
                    <th key={i} className="px-2 py-2 text-left font-semibold whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {lines.map((l, idx) => {
                  const c = calcLine(l);
                  const fStrips = Number(l.freeQty) || 0;
                  const uom = Number(l.uomPerStrip) || 1;
                  return (
                    <tr key={l.id} className="hover:bg-sky-50/60 dark:hover:bg-sky-900/10 transition-colors">
                      <td className="px-2 py-1.5 text-slate-500">{idx + 1}</td>
                      <td className="px-2 py-1.5 font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                        {l.name}
                      </td>
                      <td className="px-2 py-1.5">{n2(Number(l.receivingQty) || 0)}</td>
                      <td className="px-2 py-1.5">{uom}</td>
                      <td className="px-2 py-1.5">
                        {fStrips > 0 ? (
                          <span className="text-emerald-600 font-semibold">
                            +{fStrips} strips ({fStrips * uom} tabs)
                          </span>
                        ) : (
                          "0"
                        )}
                      </td>
                      <td className="px-2 py-1.5">{n2(c.mrpStrip)}</td>
                      <td className="px-2 py-1.5">{n2(l.mrpUnit)}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap font-mono">{l.batch}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{l.mfgDate || "—"}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap font-semibold">{l.expiry}</td>
                      <td className="px-2 py-1.5">{c.shelfLifeDays ?? "—"}</td>
                      <td className="px-2 py-1.5 font-semibold">{n3(l.purchasePrice)}</td>
                      <td className="px-2 py-1.5">{n2(c.value)}</td>
                      <td className="px-2 py-1.5">{n2(l.discPct)}</td>
                      <td className="px-2 py-1.5 text-rose-600">{n2(c.discountAmt)}</td>
                      <td className="px-2 py-1.5">{n2(c.gross)}</td>
                      <td className="px-2 py-1.5 text-rose-600">{n2(l.lineDed)}</td>
                      <td className="px-2 py-1.5 text-emerald-600">{n2(l.lineAdd)}</td>
                      <td className="px-2 py-1.5 font-semibold">{n2(c.grossTaxable)}</td>
                      <td className="px-2 py-1.5">{l.taxPct}%</td>
                      <td className="px-2 py-1.5">{n2(c.taxValue)}</td>
                      <td className="px-2 py-1.5 font-bold text-sky-700 dark:text-sky-300">
                        {n2(c.purchaseTotal)}
                      </td>
                      <td className="px-2 py-1.5 font-bold text-emerald-700 dark:text-emerald-300">
                        {n2(c.resaleTotal)}
                      </td>
                      <td className="px-2 py-1.5">{n2(c.resaleQty)}</td>
                      <td className="px-2 py-1.5">{n3(c.costPrice)}</td>
                      <td className="px-2 py-1.5">{n2(c.marginPct)}</td>
                      <td className="px-2 py-1.5">{n2(c.resaleGross)}</td>
                      <td className="px-2 py-1.5">{n2(c.salesTax)}</td>
                      <td className="px-2 py-1.5">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setLine({ ...l });
                              setEditingLineId(l.id);
                              setProductQuery(l.name);
                              document.getElementById("grn-line-editor")?.scrollIntoView({ behavior: "smooth" });
                              focusGrnField("grn-rec-qty");
                            }}
                            className="w-6 h-6 rounded-md bg-sky-100 dark:bg-sky-900/40 text-sky-600 dark:text-sky-300 hover:bg-sky-200 flex items-center justify-center transition"
                            title="Edit line in editor"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setLines((ls) => ls.filter((x) => x.id !== l.id))}
                            className="w-6 h-6 rounded-md bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-300 hover:bg-rose-200 flex items-center justify-center transition"
                            title="Remove line"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {lines.length === 0 && (
                  <tr>
                    <td colSpan={30} className="px-4 py-12 text-center text-slate-400 text-sm">
                      No lines yet — attach an invoice above or fill Row A & B and press “Add To List”.
                    </td>
                  </tr>
                )}
              </tbody>
              {lines.length > 0 && (
                <tfoot className="bg-slate-100 dark:bg-slate-700/50 font-bold text-slate-700 dark:text-slate-200">
                  <tr>
                    <td className="px-2 py-2" colSpan={12}>
                      Subtotal
                    </td>
                    <td className="px-2 py-2">{n2(agg.totals.value)}</td>
                    <td className="px-2 py-2"></td>
                    <td className="px-2 py-2 text-rose-600">{n2(agg.totals.discountAmt)}</td>
                    <td className="px-2 py-2">{n2(agg.totals.gross)}</td>
                    <td className="px-2 py-2 text-rose-600">{n2(agg.totals.lineDed)}</td>
                    <td className="px-2 py-2 text-emerald-600">{n2(agg.totals.lineAdd)}</td>
                    <td className="px-2 py-2">{n2(agg.totals.grossTaxable)}</td>
                    <td className="px-2 py-2"></td>
                    <td className="px-2 py-2">{n2(agg.totals.taxValue)}</td>
                    <td className="px-2 py-2 text-sky-700 dark:text-sky-300">{n2(agg.totals.purchaseTotalLine)}</td>
                    <td className="px-2 py-2 text-emerald-700 dark:text-emerald-300">{n2(agg.totals.resaleTotal)}</td>
                    <td className="px-2 py-2" colSpan={7}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </CardBody>
      </Card>

      {/* ── FOOTER ADJUSTMENTS & SUMMARY MATRIX ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Adjustments */}
        <Card className="lg:col-span-2">
          <CardBody className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-2">
              <span className="font-semibold text-sm text-slate-700 dark:text-slate-200">
                Invoice-Level Adjustments
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => setAdjModal("ded")}>
                  <Minus className="w-3.5 h-3.5 text-rose-500" /> Deduction
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setAdjModal("add")}>
                  <Plus className="w-3.5 h-3.5 text-emerald-500" /> Addition
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Trade Discount (₹)</Label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  className={inputCls}
                  value={tradeDiscount}
                  onChange={(e) =>
                    setTradeDiscount(e.target.value === "" ? "" : Number(e.target.value))
                  }
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label>Additional Charges (₹)</Label>
                <div className="flex gap-2">
                  <input
                    className={inputCls}
                    placeholder="Description"
                    value={addAfterDesc}
                    onChange={(e) => setAddAfterDesc(e.target.value)}
                  />
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    className={inputCls + " w-28"}
                    placeholder="Amount"
                    value={addAfterAmt}
                    onChange={(e) =>
                      setAddAfterAmt(e.target.value === "" ? "" : Number(e.target.value))
                    }
                  />
                </div>
              </div>
            </div>

            {/* list applied deductions / additions */}
            {(deductions.length > 0 || additions.length > 0) && (
              <div className="space-y-1 pt-2">
                {deductions.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center justify-between text-xs bg-rose-50 dark:bg-rose-900/20 px-3 py-1.5 rounded-lg text-rose-700 dark:text-rose-300"
                  >
                    <span>Deduction: {d.desc}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">- {cur(d.amount)}</span>
                      <button
                        onClick={() => setDeductions((ds) => ds.filter((x) => x.id !== d.id))}
                        className="hover:text-rose-900"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
                {additions.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between text-xs bg-emerald-50 dark:bg-emerald-900/20 px-3 py-1.5 rounded-lg text-emerald-700 dark:text-emerald-300"
                  >
                    <span>Addition: {a.desc}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">+ {cur(a.amount)}</span>
                      <button
                        onClick={() => setAdditions((as) => as.filter((x) => x.id !== a.id))}
                        className="hover:text-emerald-900"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        {/* Totals & Submit */}
        <Card className="bg-gradient-to-br from-slate-50 to-sky-50 dark:from-slate-800 dark:to-slate-800/80">
          <CardBody className="space-y-2 text-sm">
            <div className="flex justify-between text-slate-600 dark:text-slate-300">
              <span>Lines Subtotal</span>
              <span className="font-semibold tabular-nums">{cur(agg.totalProductAmount)}</span>
            </div>
            {agg.dedSum > 0 && (
              <div className="flex justify-between text-rose-600">
                <span>Deductions</span>
                <span className="tabular-nums">- {cur(agg.dedSum)}</span>
              </div>
            )}
            {agg.addSum > 0 && (
              <div className="flex justify-between text-emerald-600">
                <span>Additions</span>
                <span className="tabular-nums">+ {cur(agg.addSum)}</span>
              </div>
            )}
            {Number(tradeDiscount) > 0 && (
              <div className="flex justify-between text-rose-600">
                <span>Trade Discount</span>
                <span className="tabular-nums">- {cur(Number(tradeDiscount))}</span>
              </div>
            )}
            {Number(addAfterAmt) > 0 && (
              <div className="flex justify-between text-emerald-600">
                <span>Additional Charges</span>
                <span className="tabular-nums">+ {cur(Number(addAfterAmt))}</span>
              </div>
            )}
            <div className="flex justify-between text-slate-500 text-xs">
              <span>Round Off</span>
              <span className="tabular-nums">{cur(agg.roundOff)}</span>
            </div>
            <div className="flex justify-between items-baseline pt-2 border-t border-slate-200 dark:border-slate-700">
              <span className="font-bold text-base text-slate-800 dark:text-slate-100">Grand Total</span>
              <span className="font-extrabold text-2xl text-sky-700 dark:text-sky-300 tabular-nums">
                {cur(agg.purchaseTotal)}
              </span>
            </div>

            <div className="pt-3 flex gap-2">
              <Button variant="secondary" onClick={refreshAll} className="flex-1">
                <RotateCcw className="w-4 h-4" /> Reset
              </Button>
              <Button onClick={save} className="flex-[2] shadow-lg">
                <Save className="w-4 h-4" /> Save & Submit GRN
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* ━━━━━━ AI Document Verification & Normalization Modal ━━━━━━ */}
      <Modal
        open={reviewModalOpen}
        onClose={() => setReviewModalOpen(false)}
        title="AI Invoice Document Verification & Normalization"
        size="xl"
      >
        <div className="space-y-4">
          {/* Header Info */}
          <div className="rounded-xl bg-gradient-to-r from-sky-50 via-emerald-50 to-sky-50 dark:from-slate-800 dark:via-slate-800/80 dark:to-slate-800 border border-sky-100 dark:border-slate-700 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-500" />
                <span className="font-bold text-slate-800 dark:text-slate-100 text-sm">
                  {attachedFileName}
                </span>
                <Badge tone="green">{aiModelUsed || "Gemini 2.5 Flash"}</Badge>
                {extractedInvoice?.backendUsed && <Badge tone="blue">Backend Engine</Badge>}
              </div>
              <span className="text-xs text-slate-500">
                Semantic analysis performed. Verify extracted invoice fields and product line items before populating.
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label>Supplier *</Label>
                <Select
                  value={verifiedSupplierId}
                  onChange={(e) => setVerifiedSupplierId(e.target.value)}
                >
                  <option value="">Select supplier from system...</option>
                  {data.suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
                {extractedInvoice?.supplier && (
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">
                    Invoice Text: <span className="font-semibold">{extractedInvoice.supplier}</span>
                  </div>
                )}
              </div>
              <div>
                <Label>Invoice Number *</Label>
                <Input
                  value={verifiedInvoiceNumber}
                  onChange={(e) => setVerifiedInvoiceNumber(e.target.value)}
                  placeholder="e.g. INV-2026-001"
                />
              </div>
              <div>
                <Label>Invoice Date *</Label>
                <Input
                  type="date"
                  max={today}
                  value={verifiedDate}
                  onChange={(e) => setVerifiedDate(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Batch Number Warning Alert Banner if any items have serial number as batch */}
          {verifiedItems.some((it, idx) => {
            const v = validateBatchNumber({
              batch: it.batch,
              rowIdx: idx,
              productName: it.name,
              totalRows: verifiedItems.length,
              allBatches: verifiedItems.map((x) => x.batch),
            });
            return !it.batch.trim() || v.isSerialAsBatch || v.isHsnAsBatch;
          }) && (
            <div className="rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 p-3.5 flex items-center gap-3 text-rose-800 dark:text-rose-200 text-xs">
              <AlertCircle className="w-5 h-5 shrink-0 text-rose-600 dark:text-rose-400" />
              <div>
                <span className="font-bold">Batch Number Validation Alert:</span> One or more product lines have row serial numbers (e.g. 1, 2) or HSN codes mistakenly assigned as the batch number. Please enter genuine manufacturer batch numbers before populating.
              </div>
            </div>
          )}

          {/* Extracted Product Items Review Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-200">
                <Layers className="w-4 h-4 text-sky-600" />
                Extracted Product Lines ({verifiedItems.length})
              </div>
              <Button size="sm" variant="secondary" onClick={addVerifiedItem}>
                <Plus className="w-3.5 h-3.5" /> Add Line
              </Button>
            </div>

            <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-xl max-h-[46vh]">
              <table className="w-full text-xs" style={{ minWidth: 1540 }}>
                <thead className="bg-slate-100 dark:bg-slate-700/70 text-slate-700 dark:text-slate-200 sticky top-0 z-10">
                  <tr>
                    <th className="px-2 py-2 text-left font-semibold w-10">#</th>
                    <th className="px-2 py-2 text-left font-semibold" style={{ minWidth: 230 }}>
                      Medicine Name / Inventory Normalization
                    </th>
                    <th className="px-2 py-2 text-left font-semibold" style={{ minWidth: 140 }}>
                      Batch Number *
                    </th>
                    <th className="px-2 py-2 text-left font-semibold" style={{ minWidth: 115 }}>
                      Mfg Date
                    </th>
                    <th className="px-2 py-2 text-left font-semibold" style={{ minWidth: 125 }}>
                      Expiry Date *
                    </th>
                    <th className="px-2 py-2 text-right font-semibold" style={{ minWidth: 80 }}>
                      Strips *
                    </th>
                    <th className="px-2 py-2 text-right font-semibold" style={{ minWidth: 75 }}>
                      Tabs/Strip
                    </th>
                    <th className="px-2 py-2 text-right font-semibold" style={{ minWidth: 70 }}>
                      Free (Strips)
                    </th>
                    <th className="px-2 py-2 text-right font-semibold" style={{ minWidth: 90 }}>
                      Buy ₹/Strip *
                    </th>
                    <th className="px-2 py-2 text-right font-semibold" style={{ minWidth: 70 }}>
                      Disc %
                    </th>
                    <th className="px-2 py-2 text-right font-semibold" style={{ minWidth: 75 }}>
                      GST %
                    </th>
                    <th className="px-2 py-2 text-right font-semibold" style={{ minWidth: 110 }}>
                      Enter MRP/unit *
                    </th>
                    <th className="px-2 py-2 text-right font-semibold" style={{ minWidth: 100 }}>
                      Total Amount (Line)
                    </th>
                    <th className="px-2 py-2 text-center font-semibold w-12">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700 bg-white dark:bg-slate-800">
                  {verifiedItems.map((it, idx) => {
                    const rQty = Number(it.receivingQty) || 0;
                    const pPrice = Number(it.purchasePrice) || 0;
                    const disc = Number(it.discPct) || 0;
                    const tax = Number(it.taxPct) || 0;
                    const discAmt = rQty * pPrice * (disc / 100);
                    const grossTaxable = rQty * pPrice - discAmt;
                    const taxVal = grossTaxable * (tax / 100);
                    const computedLineTotal = grossTaxable + taxVal;

                    const isMatched = !!it.matchedInventoryName;

                    const batchVal = validateBatchNumber({
                      batch: it.batch,
                      rowIdx: idx,
                      productName: it.name,
                      totalRows: verifiedItems.length,
                      allBatches: verifiedItems.map((x) => x.batch),
                    });
                    const isBatchProblem = !it.batch.trim() || batchVal.isSerialAsBatch || batchVal.isHsnAsBatch;

                    return (
                      <tr key={it.id || idx} className="hover:bg-slate-50/80 dark:hover:bg-slate-700/40">
                        <td className="px-2 py-2 text-slate-400 font-medium">{idx + 1}</td>
                        <td className="px-2 py-2">
                          <div className="space-y-1">
                            <input
                              className="w-full px-2 py-1 text-xs border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 font-semibold"
                              value={it.name}
                              onChange={(e) => updVerifiedItem(idx, "name", e.target.value)}
                              placeholder="Product name"
                            />
                            <div className="flex items-center gap-1.5">
                              {isMatched ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                                  ✓ Matched: {it.matchedInventoryName}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800">
                                  ✨ New Item
                                </span>
                              )}
                              {/* Quick inventory mapper selector */}
                              <select
                                className="text-[10px] bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded px-1 py-0.5 text-slate-600 dark:text-slate-300 max-w-[140px]"
                                value={it.matchedInventoryName || ""}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  updVerifiedItem(idx, "matchedInventoryName", val || null);
                                  if (val) updVerifiedItem(idx, "name", val);
                                }}
                              >
                                <option value="">Map to inventory...</option>
                                {inventoryMedicines.map((m) => (
                                  <option key={m.id} value={m.name}>
                                    {m.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          <div className="space-y-1">
                            <input
                              className={`w-full px-2 py-1 text-xs font-mono border rounded ${
                                isBatchProblem
                                  ? "border-rose-500 bg-rose-50 dark:bg-rose-900/30 text-rose-800 dark:text-rose-100 ring-1 ring-rose-400"
                                  : "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700"
                              }`}
                              value={it.batch}
                              onChange={(e) => {
                                updVerifiedItem(idx, "batch", e.target.value);
                                updVerifiedItem(idx, "isSerialAsBatch", false);
                                updVerifiedItem(idx, "batchWarning", undefined);
                              }}
                              placeholder="e.g. B2401"
                            />
                            {isBatchProblem && (
                              <div className="text-[10px] text-rose-600 dark:text-rose-300 font-semibold flex items-center gap-1">
                                <AlertCircle className="w-3 h-3 shrink-0" />
                                {batchVal.isSerialAsBatch
                                  ? "Serial No. detected as Batch! Enter genuine lot."
                                  : batchVal.isHsnAsBatch
                                  ? "HSN Code detected! Enter genuine lot."
                                  : "Batch required"}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="date"
                            max={today}
                            className="w-full px-2 py-1 text-xs border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700"
                            value={it.mfgDate}
                            onChange={(e) => {
                              const val = e.target.value;
                              updVerifiedItem(idx, "mfgDate", val > today ? today : val);
                            }}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="date"
                            className="w-full px-2 py-1 text-xs border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700"
                            value={it.expiry}
                            onChange={(e) => updVerifiedItem(idx, "expiry", e.target.value)}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            min={0.01}
                            step={0.01}
                            className="w-full px-2 py-1 text-xs text-right tabular-nums border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 font-semibold"
                            value={it.receivingQty}
                            onChange={(e) => updVerifiedItem(idx, "receivingQty", Number(e.target.value))}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            min={1}
                            step={1}
                            className="w-full px-2 py-1 text-xs text-right tabular-nums border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700"
                            value={it.uomPerStrip}
                            onChange={(e) => updVerifiedItem(idx, "uomPerStrip", Math.max(1, Number(e.target.value)))}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            min={0}
                            step={1}
                            className="w-full px-2 py-1 text-xs text-right tabular-nums border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700"
                            value={it.freeQty}
                            onChange={(e) => updVerifiedItem(idx, "freeQty", Math.max(0, Number(e.target.value)))}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            className="w-full px-2 py-1 text-xs text-right tabular-nums border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 font-semibold"
                            value={it.purchasePrice}
                            onChange={(e) => updVerifiedItem(idx, "purchasePrice", Number(e.target.value))}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={0.01}
                            className="w-full px-2 py-1 text-xs text-right tabular-nums border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700"
                            value={it.discPct}
                            onChange={(e) => updVerifiedItem(idx, "discPct", Number(e.target.value))}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <select
                            className="w-full px-1.5 py-1 text-xs text-right tabular-nums border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700"
                            value={it.taxPct}
                            onChange={(e) => updVerifiedItem(idx, "taxPct", Number(e.target.value))}
                          >
                            {TAX_OPTIONS.map((t) => (
                              <option key={t} value={t}>
                                {t}%
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-2">
                          <div className="space-y-0.5">
                            <input
                              type="number"
                              min={0}
                              step={0.01}
                              className="w-full px-2 py-1 text-xs text-right tabular-nums border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 font-semibold"
                              value={it.mrpUnit}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                updVerifiedItem(idx, "mrpUnit", val);
                                updVerifiedItem(idx, "mrpStrip", Number((val * (it.uomPerStrip || 1)).toFixed(2)));
                              }}
                              placeholder="MRP/unit"
                            />
                            <div className="text-[10px] text-slate-400 text-right">
                              Strip: ₹{(Number(it.mrpUnit || 0) * Number(it.uomPerStrip || 1)).toFixed(2)}
                            </div>
                          </div>
                        </td>
                        <td className="px-2 py-2 text-right font-bold text-sky-700 dark:text-sky-300 tabular-nums">
                          {cur(computedLineTotal)}
                        </td>
                        <td className="px-2 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => rmVerifiedItem(idx)}
                            className="w-6 h-6 rounded bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-300 hover:bg-rose-200 inline-flex items-center justify-center transition"
                            title="Remove line"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {verifiedItems.length === 0 && (
                    <tr>
                      <td colSpan={14} className="px-4 py-8 text-center text-slate-400">
                        No items in extraction list — click “+ Add Line” to manually input items.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Review Summary & Action Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-slate-700">
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-slate-300">
              <div>
                Total Items: <b>{verifiedItems.length}</b>
              </div>
              <div>
                Total Strips: <b>{verifiedItems.reduce((s, i) => s + (Number(i.receivingQty) || 0), 0)}</b>
              </div>
              <div>
                Total Free (Strips): <b>{verifiedItems.reduce((s, i) => s + (Number(i.freeQty) || 0), 0)}</b>
              </div>
              <div>
                Estimated Line Sum:{" "}
                <b className="text-emerald-700 dark:text-emerald-300">
                  {cur(
                    verifiedItems.reduce((s, i) => {
                      const rQty = Number(i.receivingQty) || 0;
                      const pPrice = Number(i.purchasePrice) || 0;
                      const disc = Number(i.discPct) || 0;
                      const tax = Number(i.taxPct) || 0;
                      const discAmt = rQty * pPrice * (disc / 100);
                      const grossTaxable = rQty * pPrice - discAmt;
                      const taxVal = grossTaxable * (tax / 100);
                      return s + grossTaxable + taxVal;
                    }, 0)
                  )}
                </b>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => setReviewModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={confirmAndPopulate} className="shadow-md">
                <CheckCircle2 className="w-4 h-4" />
                Populate into GRN Product List ({verifiedItems.length} lines)
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Adjustments Modal */}
      {adjModal && (
        <Modal
          open
          onClose={() => setAdjModal(null)}
          title={`Add ${adjModal === "ded" ? "Deduction" : "Addition"}`}
        >
          <div className="space-y-3">
            <div>
              <Label>Description *</Label>
              <Input
                placeholder="e.g. Freight charge, cash discount, breakage"
                value={adjDesc}
                onChange={(e) => setAdjDesc(e.target.value)}
              />
            </div>
            <div>
              <Label>Amount (₹) *</Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                placeholder="0.00"
                value={adjAmt}
                onChange={(e) => setAdjAmt(e.target.value === "" ? "" : Number(e.target.value))}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setAdjModal(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  addAdj();
                  setAdjModal(null);
                }}
              >
                Add {adjModal === "ded" ? "Deduction" : "Addition"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ━━━━━━ Modal: Add New Medicine Directly to Inventory ━━━━━━ */}
      {addMedOpen && (
        <Modal
          open
          onClose={() => setAddMedOpen(false)}
          title="Add New Medicine to Inventory"
          size="md"
        >
          <div className="space-y-4">
            <div className="bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 rounded-lg p-3 text-xs text-sky-800 dark:text-sky-200 flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Direct GRN Inventory Intake</p>
                <p className="text-[11px] text-sky-700 dark:text-sky-300 mt-0.5">
                  Adding this unlisted item immediately indexes it into inventory and auto-selects it for this GRN line so you can continue entering batch, quantity, and pricing seamlessly.
                </p>
              </div>
            </div>

            {addMedError && (
              <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{addMedError}</span>
              </div>
            )}

            <div>
              <Label>Medicine Name *</Label>
              <Input
                autoFocus
                placeholder="e.g. Paracetamol 650mg, Amoxicillin 500mg"
                value={addMedForm.name}
                onChange={(e) => setAddMedForm({ ...addMedForm, name: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    document.getElementById("add-med-supplier")?.focus();
                  }
                }}
              />
            </div>

            <div>
              <Label>Supplier / Vendor *</Label>
              {data.suppliers.length > 0 ? (
                <div className="space-y-1.5">
                  <Select
                    id="add-med-supplier"
                    value={addMedForm.supplier}
                    onChange={(e) => setAddMedForm({ ...addMedForm, supplier: e.target.value })}
                  >
                    <option value="">-- Choose Existing Supplier --</option>
                    {data.suppliers.map((s) => (
                      <option key={s.id} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                  <p className="text-[11px] text-slate-400">
                    Or type a custom supplier name if not yet listed:
                  </p>
                  <Input
                    placeholder="Enter supplier name if different from list"
                    value={addMedForm.supplier}
                    onChange={(e) => setAddMedForm({ ...addMedForm, supplier: e.target.value })}
                  />
                </div>
              ) : (
                <Input
                  id="add-med-supplier"
                  placeholder="e.g. Apollo Pharma, Cipla Distributors"
                  value={addMedForm.supplier}
                  onChange={(e) => setAddMedForm({ ...addMedForm, supplier: e.target.value })}
                />
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Default GST Rate (%) *</Label>
                <Select
                  value={addMedForm.gst}
                  onChange={(e) => setAddMedForm({ ...addMedForm, gst: Number(e.target.value) })}
                >
                  {TAX_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {t}% GST
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <Label>Min Stock Alert Level</Label>
                <Input
                  type="number"
                  min={0}
                  value={addMedForm.minStock}
                  onChange={(e) => setAddMedForm({ ...addMedForm, minStock: e.target.value === "" ? 0 : Number(e.target.value) })}
                  placeholder="10"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="add-med-narcotic"
                checked={addMedForm.narcotic}
                onChange={(e) => setAddMedForm({ ...addMedForm, narcotic: e.target.checked })}
                className="w-4 h-4 text-sky-600 rounded border-slate-300 focus:ring-sky-500"
              />
              <label htmlFor="add-med-narcotic" className="text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
                Controlled / Narcotic Drug (Rx prescription mandatory)
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-700">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setAddMedOpen(false)}
                disabled={addMedSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSaveNewMedicine}
                disabled={addMedSubmitting}
                className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm flex items-center gap-1.5"
              >
                {addMedSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Adding...
                  </>
                ) : (
                  <>
                    <PlusCircle className="w-4 h-4" /> Save to Inventory &amp; Use in GRN
                  </>
                )}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default Purchases;
