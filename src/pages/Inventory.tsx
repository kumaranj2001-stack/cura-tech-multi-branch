import React, { useMemo, useState } from "react";
import { useStore, uid } from "../store/store";
import {
  FileDown, Minus, Plus, Pencil, Trash2, Layers, CheckCircle2,
  Building2, PackagePlus, ArrowRight, CornerDownLeft, Sparkles, X,
} from "lucide-react";
import { Card, CardBody, Input, Label, Button, Th, Td, Modal, Badge, EmptyState, Select } from "../components/ui";
import { fmtCurrency, isExpired, daysToExpiry, downloadPDF, flashToast } from "../utils/helpers";
import type { Medicine } from "../store/types";
import { minStockOf } from "../store/types";

export interface StagedBatchMedicine {
  id: string;
  name: string;
  batch: string;
  purchasePrice: number | string;
  sellingPrice: number | string;
  stock: number | string;
  expiry: string;
  mfgDate: string;
  gst: number | string;
  narcotic: boolean;
  minStock: number | string;
}

export interface MedicineFormState {
  name: string;
  batch: string;
  purchasePrice: number | string;
  sellingPrice: number | string;
  stock: number | string;
  supplier: string;
  expiry: string;
  mfgDate: string;
  gst: number | string;
  narcotic: boolean;
  minStock: number | string;
}

const empty: MedicineFormState = {
  name: "",
  batch: "",
  purchasePrice: "",
  sellingPrice: "",
  stock: "",
  supplier: "",
  expiry: "",
  mfgDate: "",
  gst: 5,
  narcotic: false,
  minStock: 10,
};

export type InventoryFilter = "all" | "out" | "narcotic" | "low" | "expired" | "exp30" | "exp60" | "exp90";

interface InventoryProps {
  initialFilter?: InventoryFilter | null;
  onConsumeFilter?: () => void;
}

interface MinStockInputCellProps {
  medicine: Medicine;
  canEdit: boolean;
  onUpdate: (m: Medicine, val: number) => void;
}

const MinStockInputCell: React.FC<MinStockInputCellProps> = ({ medicine, canEdit, onUpdate }) => {
  const currentMin = minStockOf(medicine);
  const [val, setVal] = useState<string>(String(currentMin));

  React.useEffect(() => {
    setVal(String(currentMin));
  }, [currentMin]);

  const commit = (inputStr: string) => {
    if (!canEdit) return;
    const parsed = parseInt(inputStr, 10);
    const finalVal = isNaN(parsed) || parsed < 0 ? 0 : Math.min(99999, parsed);
    setVal(String(finalVal));
    if (finalVal !== currentMin) {
      onUpdate(medicine, finalVal);
    }
  };

  const handleStep = (delta: number) => {
    if (!canEdit) {
      alert("Access restricted: Only Developer and Admin roles can customize Minimum Stock.");
      return;
    }
    const next = Math.max(0, currentMin + delta);
    setVal(String(next));
    onUpdate(medicine, next);
  };

  const isLow = medicine.stock <= currentMin;

  return (
    <div className="inline-flex items-center gap-1 group/min">
      <button
        type="button"
        disabled={!canEdit}
        onClick={() => handleStep(-1)}
        className={`w-6 h-6 rounded-md flex items-center justify-center transition-all ${
          canEdit
            ? "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-900/40 active:scale-90 cursor-pointer"
            : "bg-slate-100/50 dark:bg-slate-800/50 text-slate-400 dark:text-slate-600 cursor-not-allowed opacity-50"
        }`}
        title={canEdit ? "Decrease minimum stock by 1" : "Access restricted: Only Developer and Admin roles can customize Minimum Stock"}
        aria-label="Decrease minimum stock by 1"
      >
        <Minus className="w-3 h-3" />
      </button>

      <input
        type="number"
        min={0}
        max={99999}
        step={1}
        disabled={!canEdit}
        value={val}
        onChange={(e) => {
          if (!canEdit) return;
          setVal(e.target.value);
        }}
        onBlur={() => commit(val)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            (e.target as HTMLInputElement).blur();
          }
        }}
        className={`w-14 h-6 text-center text-xs font-bold tabular-nums rounded-md px-1 border transition-colors focus:outline-none focus:ring-2 focus:ring-sky-400 ${
          !canEdit
            ? "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 cursor-not-allowed select-none"
            : isLow
            ? "bg-amber-50 dark:bg-amber-900/30 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300"
            : "bg-slate-50 dark:bg-slate-700/40 border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200"
        }`}
        title={canEdit ? "Enter minimum stock threshold manually" : "Access restricted: Only Developer and Admin roles can customize Minimum Stock"}
        aria-label={`Minimum stock for ${medicine.name}`}
      />

      <button
        type="button"
        disabled={!canEdit}
        onClick={() => handleStep(1)}
        className={`w-6 h-6 rounded-md flex items-center justify-center transition-all ${
          canEdit
            ? "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-emerald-100 hover:text-emerald-600 dark:hover:bg-emerald-900/40 active:scale-90 cursor-pointer"
            : "bg-slate-100/50 dark:bg-slate-800/50 text-slate-400 dark:text-slate-600 cursor-not-allowed opacity-50"
        }`}
        title={canEdit ? "Increase minimum stock by 1" : "Access restricted: Only Developer and Admin roles can customize Minimum Stock"}
        aria-label="Increase minimum stock by 1"
      >
        <Plus className="w-3 h-3" />
      </button>
    </div>
  );
};

const Inventory: React.FC<InventoryProps> = ({ initialFilter, onConsumeFilter }) => {
  const { data, setData, log, flags, currentUser, currentBranch } = useStore();
  const isDevOrAdmin = currentUser?.role === "developer" || currentUser?.role === "superadmin" || currentUser?.role === "admin";
  const canCustomizeMinStock = Boolean(isDevOrAdmin);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<InventoryFilter>(initialFilter || "all");

  React.useEffect(() => {
    if (initialFilter) {
      setFilter(initialFilter);
      onConsumeFilter?.();
    }
  }, [initialFilter, onConsumeFilter]);

  // if a filter gets disabled remotely, fall back to "all"
  React.useEffect(() => {
    if (filter === "low" && !flags.filterLowStock) setFilter("all");
    if (filter === "exp30" && flags.filterExp30 === false) setFilter("all");
    if (filter === "exp60" && flags.filterExp60 === false) setFilter("all");
    if (filter === "exp90" && flags.filterExp90 === false) setFilter("all");
    if (filter === "expired" && !flags.filterExpired) setFilter("all");
    if (filter === "narcotic" && flags.filterNarcotic === false) setFilter("all");
  }, [filter, flags.filterLowStock, flags.filterExp30, flags.filterExp60, flags.filterExp90, flags.filterExpired, flags.filterNarcotic]);

  const [backendNarcotics, setBackendNarcotics] = useState<Medicine[] | null>(null);
  const [isFetchingNarcotics, setIsFetchingNarcotics] = useState(false);

  // Fetch narcotic medicines from backend when "narcotic" filter is selected
  React.useEffect(() => {
    if (filter !== "narcotic") {
      setBackendNarcotics(null);
      return;
    }

    let isMounted = true;
    setIsFetchingNarcotics(true);

    const fetchNarcotics = async () => {
      const candidateEndpoints = [
        "/api/inventory/narcotic",
        "http://localhost:3001/api/inventory/narcotic",
      ];

      for (const ep of candidateEndpoints) {
        try {
          const res = await fetch(ep, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filter: "narcotic", medicines: data.medicines }),
          });
          if (res.ok) {
            const json = await res.json();
            if (json.success && Array.isArray(json.medicines)) {
              if (isMounted) {
                setBackendNarcotics(json.medicines);
                setIsFetchingNarcotics(false);
              }
              return;
            }
          }
        } catch {
          // try next candidate
        }
      }

      if (isMounted) {
        setIsFetchingNarcotics(false);
      }
    };

    fetchNarcotics();

    return () => {
      isMounted = false;
    };
  }, [filter, data.medicines]);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Medicine | null>(null);
  const [form, setForm] = useState<typeof empty>(empty);
  const [supplierQuery, setSupplierQuery] = useState("");
  const [supplierMenuOpen, setSupplierMenuOpen] = useState(false);

  /* Multi-Product Batch Entry State (mirrors GRN Entry staged pipeline) */
  const [selectedSupplier, setSelectedSupplier] = useState("");
  const [stagedItems, setStagedItems] = useState<StagedBatchMedicine[]>([]);
  const [editingStagedId, setEditingStagedId] = useState<string | null>(null);
  const [isSavingBatch, setIsSavingBatch] = useState(false);
  const medNameInputRef = React.useRef<HTMLInputElement | null>(null);

  const supplierMatches = useMemo(() => {
    const sq = supplierQuery.trim().toLowerCase();
    if (!sq) return data.suppliers;
    return data.suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(sq) ||
        (s.contact && s.contact.toLowerCase().includes(sq)) ||
        (s.gstNumber && s.gstNumber.toLowerCase().includes(sq))
    );
  }, [supplierQuery, data.suppliers]);

  const filtered = useMemo(() => {
    const ql = q.toLowerCase();
    const sourceMedicines = (filter === "narcotic" && backendNarcotics !== null)
      ? backendNarcotics
      : data.medicines;

    return sourceMedicines.filter((m) => {
      if (q && !(m.name.toLowerCase().includes(ql) || m.batch.toLowerCase().includes(ql))) return false;
      if (filter === "narcotic" && !m.narcotic) return false;
      if (filter === "out" && m.stock !== 0) return false;
      if (filter === "low" && !(m.stock > 0 && m.stock <= minStockOf(m))) return false;
      if (filter === "expired" && !isExpired(m.expiry)) return false;
      if (filter === "exp30") {
        const d = daysToExpiry(m.expiry);
        if (!(d >= 1 && d <= 30)) return false;
      }
      if (filter === "exp60") {
        const d = daysToExpiry(m.expiry);
        if (!(d >= 31 && d <= 60)) return false;
      }
      if (filter === "exp90") {
        const d = daysToExpiry(m.expiry);
        if (!(d >= 61 && d <= 90)) return false;
      }
      return true;
    });
  }, [data.medicines, q, filter, backendNarcotics]);

  const openNew = () => {
    if (flags.grnModule) {
      alert("Direct medicine addition in Inventory is disabled while 'GRN Entry & Approvals' is active. Please add new medicines through the GRN Entry workflow.");
      return;
    }
    setEdit(null);
    setSelectedSupplier("");
    setStagedItems([]);
    setEditingStagedId(null);
    setForm(empty);
    setSupplierQuery("");
    setSupplierMenuOpen(false);
    setOpen(true);
  };

  const openEdit = (m: Medicine) => {
    setEdit(m);
    setForm({
      name: m.name,
      batch: m.batch || "",
      purchasePrice: m.purchasePrice ?? "",
      sellingPrice: m.sellingPrice ?? "",
      stock: m.stock ?? "",
      supplier: m.supplier || "",
      expiry: m.expiry || "",
      mfgDate: m.mfgDate || "",
      gst: m.gst ?? 5,
      narcotic: Boolean(m.narcotic),
      minStock: m.minStock ?? 10,
    });
    setSupplierQuery("");
    setSupplierMenuOpen(false);
    setOpen(true);
  };

  // When GRN Entry & Approvals is disabled, medicines must be added with full purchase details
  const grnOff = !flags.grnModule;

  /* quick-edit the low-stock threshold straight from the table */
  const setMinStock = async (m: Medicine, v: number) => {
    if (!canCustomizeMinStock) {
      alert("Access restricted: Only Developer and Admin roles can customize Minimum Stock.");
      return;
    }
    const next = Math.max(0, Math.min(99999, Math.round(v)));
    setData((d) => ({ ...d, medicines: d.medicines.map((x) => (x.id === m.id ? { ...x, minStock: next } : x)) }));
    flashToast(`Min stock for ${m.name} set to ${next}`, "ok");

    // Synchronize to backend
    try {
      await fetch(`/api/inventory/medicine/${m.id}/min-stock`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-user-role": currentUser?.role || "",
        },
        body: JSON.stringify({
          minStock: next,
          role: currentUser?.role || "",
          medicines: data.medicines,
        }),
      });
    } catch (apiErr) {
      console.warn("[Backend minStock update warning]", apiErr);
    }
  };

  const today = new Date().toISOString().slice(0, 10);

  /* Add or update a medicine in the in-form staged batch table */
  const addToStagedList = () => {
    if (!selectedSupplier.trim()) {
      alert("Please select a supplier first before adding medicines to the list.");
      return;
    }
    const name = form.name.trim();
    if (!name) {
      alert("Medicine name is required.");
      medNameInputRef.current?.focus();
      return;
    }
    if (form.stock === "" || form.stock === undefined || form.stock === null) {
      alert("Quantity is required and cannot be blank.");
      return;
    }
    const numStock = Number(form.stock);
    if (isNaN(numStock) || numStock <= 0) {
      alert("Quantity must be a valid number greater than 0.");
      return;
    }
    if (!form.mfgDate) {
      alert("Manufacturing date is required.");
      return;
    }
    if (form.mfgDate > today) {
      alert("Manufacturing date cannot be in the future.");
      return;
    }
    if (!form.expiry) {
      alert("Expiry date is required.");
      return;
    }
    if (form.purchasePrice === "" || form.purchasePrice === undefined || form.purchasePrice === null) {
      alert("Buying price is required and cannot be blank.");
      return;
    }
    const numBuying = Number(form.purchasePrice);
    if (isNaN(numBuying) || numBuying <= 0) {
      alert("Buying price must be greater than 0.");
      return;
    }
    if (form.sellingPrice === "" || form.sellingPrice === undefined || form.sellingPrice === null) {
      alert("Selling price is required and cannot be blank.");
      return;
    }
    const numSelling = Number(form.sellingPrice);
    if (isNaN(numSelling) || numSelling <= 0) {
      alert("Selling price must be greater than 0.");
      return;
    }
    if (numSelling < numBuying) {
      const confirmLower = window.confirm("Selling price is lower than buying price. Do you want to proceed?");
      if (!confirmLower) return;
    }

    const gstNum = form.gst === "" ? 5 : Number(form.gst);
    const minStockNum = form.minStock === "" ? 10 : Number(form.minStock);

    if (editingStagedId) {
      setStagedItems((prev) =>
        prev.map((item) =>
          item.id === editingStagedId
            ? {
                ...item,
                name,
                batch: form.batch.trim(),
                stock: numStock,
                purchasePrice: numBuying,
                sellingPrice: numSelling,
                mfgDate: form.mfgDate,
                expiry: form.expiry,
                gst: isNaN(gstNum) ? 5 : gstNum,
                narcotic: Boolean(form.narcotic),
                minStock: isNaN(minStockNum) ? 10 : minStockNum,
              }
            : item
        )
      );
      flashToast(`✓ Updated "${name}" in staged list`, "ok");
      setEditingStagedId(null);
    } else {
      const newItem: StagedBatchMedicine = {
        id: uid("stg"),
        name,
        batch: form.batch.trim(),
        stock: numStock,
        purchasePrice: numBuying,
        sellingPrice: numSelling,
        mfgDate: form.mfgDate,
        expiry: form.expiry,
        gst: isNaN(gstNum) ? 5 : gstNum,
        narcotic: Boolean(form.narcotic),
        minStock: isNaN(minStockNum) ? 10 : minStockNum,
      };
      setStagedItems((prev) => [...prev, newItem]);
      flashToast(`✓ Added "${name}" to staged list (${stagedItems.length + 1} queued)`, "ok");
    }

    // Clear medicine-level input fields while retaining the selected supplier
    setForm({
      name: "",
      batch: "",
      purchasePrice: "",
      sellingPrice: "",
      stock: "",
      supplier: selectedSupplier,
      expiry: "",
      mfgDate: "",
      gst: 5,
      narcotic: false,
      minStock: 10,
    });

    // Automatically focus the medicine name input for rapid sequential entry
    requestAnimationFrame(() => {
      medNameInputRef.current?.focus();
    });
  };

  const editStagedItem = (item: StagedBatchMedicine) => {
    setEditingStagedId(item.id);
    setForm({
      name: item.name,
      batch: item.batch,
      purchasePrice: item.purchasePrice,
      sellingPrice: item.sellingPrice,
      stock: item.stock,
      supplier: selectedSupplier,
      expiry: item.expiry,
      mfgDate: item.mfgDate,
      gst: item.gst,
      narcotic: item.narcotic,
      minStock: item.minStock,
    });
    requestAnimationFrame(() => {
      medNameInputRef.current?.focus();
    });
  };

  const cancelEditStagedItem = () => {
    setEditingStagedId(null);
    setForm({
      name: "",
      batch: "",
      purchasePrice: "",
      sellingPrice: "",
      stock: "",
      supplier: selectedSupplier,
      expiry: "",
      mfgDate: "",
      gst: 5,
      narcotic: false,
      minStock: 10,
    });
  };

  const removeStagedItem = (id: string) => {
    setStagedItems((prev) => prev.filter((item) => item.id !== id));
    if (editingStagedId === id) {
      cancelEditStagedItem();
    }
    flashToast("Item removed from staged list", "ok");
  };

  /* Batch Save Action: Validates entire list & commits all queued medicines under selected supplier in a single transaction */
  const saveBatch = async () => {
    if (!selectedSupplier.trim()) {
      alert("Supplier is required. Please select a supplier first.");
      return;
    }
    if (stagedItems.length === 0) {
      alert("No medicines queued. Please add at least one medicine to the list before saving.");
      return;
    }

    setIsSavingBatch(true);
    const nowIso = new Date().toISOString();
    const branchId = currentBranch?.id || currentUser?.branchId || "br_main";

    const preparedMeds: Medicine[] = stagedItems.map((item) => ({
      id: uid("m"),
      name: item.name.trim(),
      supplier: selectedSupplier.trim(),
      batch: item.batch.trim(),
      stock: Math.round(Number(item.stock) || 0),
      purchasePrice: Math.round((Number(item.purchasePrice) || 0) * 100) / 100,
      sellingPrice: Math.round((Number(item.sellingPrice) || 0) * 100) / 100,
      expiry: item.expiry,
      mfgDate: item.mfgDate,
      gst: Number(item.gst) || 5,
      narcotic: Boolean(item.narcotic),
      minStock: item.minStock === "" ? 10 : Math.round(Number(item.minStock)),
      branchId,
      createdAt: nowIso,
    }));

    // 1. Commit all queued medicines in a single transaction to the application store
    setData((d) => ({
      ...d,
      medicines: [...preparedMeds, ...d.medicines],
    }));

    // 2. Audit log entry
    log("MEDICINE_BATCH_CREATE", `Batch added ${preparedMeds.length} medicines under supplier "${selectedSupplier}"`);

    // 3. User feedback
    flashToast(`✓ Successfully added ${preparedMeds.length} medicine${preparedMeds.length === 1 ? "" : "s"} to inventory`, "ok");

    // 4. Cleanly close modal and reset state
    setOpen(false);
    setStagedItems([]);
    setSelectedSupplier("");
    setForm(empty);
    setEditingStagedId(null);
    setIsSavingBatch(false);

    // 5. Asynchronously synchronize batch to backend server endpoints in background
    void (async () => {
      const candidateEndpoints = [
        "/api/inventory/medicines/batch",
        "http://localhost:3001/api/inventory/medicines/batch",
      ];
      for (const ep of candidateEndpoints) {
        try {
          const controller = new AbortController();
          const t = setTimeout(() => controller.abort(), 4000);
          const res = await fetch(ep, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              items: preparedMeds,
              medicines: data.medicines,
              requirePurchaseDetails: true,
              supplier: selectedSupplier,
            }),
          });
          clearTimeout(t);
          if (res.ok) break;
        } catch {
          // ignore network failure; data is committed
        }
      }
    })();
  };

  /* Single Medicine Edit Save */
  const saveSingleEdit = async () => {
    if (!edit) return;
    if (!form.name.trim()) {
      alert("Medicine name is required");
      return;
    }
    if (!form.supplier.trim()) {
      alert("Supplier is required. Please select an existing supplier from the list.");
      return;
    }
    if (form.mfgDate && form.mfgDate > today) {
      alert("Manufacturing date cannot be in the future");
      return;
    }

    const parsedStock = form.stock === "" ? 0 : Math.round(Number(form.stock));
    const parsedPurchasePrice = form.purchasePrice === "" ? 0 : Number(form.purchasePrice);
    const parsedSellingPrice = form.sellingPrice === "" ? 0 : Number(form.sellingPrice);
    const parsedGst = form.gst === "" ? 0 : Number(form.gst);
    const parsedMinStock = form.minStock === "" ? 10 : Number(form.minStock);

    const nowIso = new Date().toISOString();
    const branchId = edit.branchId || currentBranch?.id || currentUser?.branchId || "br_main";

    const cleanMedicineData: Medicine = {
      id: edit.id,
      name: form.name.trim(),
      supplier: form.supplier.trim(),
      batch: form.batch.trim(),
      stock: parsedStock,
      purchasePrice: parsedPurchasePrice,
      sellingPrice: parsedSellingPrice,
      expiry: form.expiry,
      mfgDate: form.mfgDate,
      gst: parsedGst,
      narcotic: form.narcotic,
      minStock: parsedMinStock,
      branchId,
      createdAt: edit.createdAt || nowIso,
    };

    try {
      await fetch(`/api/inventory/medicine/${edit.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: edit.id, patch: cleanMedicineData }),
      });
    } catch (apiErr) {
      console.warn("[Backend Medicine Update Warning]", apiErr);
    }

    setData((d) => ({
      ...d,
      medicines: d.medicines.map((m) => (m.id === edit.id ? { ...m, ...cleanMedicineData } : m)),
    }));
    log("MEDICINE_UPDATE", `${cleanMedicineData.name} (${cleanMedicineData.batch})`);
    flashToast(`Medicine "${cleanMedicineData.name}" updated successfully`, "ok");
    setOpen(false);
    setEdit(null);
  };

  const handleCloseBatchModal = () => {
    if (stagedItems.length > 0) {
      if (!window.confirm(`You have ${stagedItems.length} queued medicine(s) waiting to be saved. Are you sure you want to discard them and close?`)) {
        return;
      }
    }
    setOpen(false);
    setStagedItems([]);
    setSelectedSupplier("");
    setEditingStagedId(null);
    setForm(empty);
  };

  const isPdfEnabled = useMemo(() => {
    if (filter === "narcotic") return flags.pdfFilterNarcotic !== false;
    if (filter === "low") return flags.pdfFilterLowStock !== false;
    if (filter === "exp30") return flags.pdfFilterExp30 !== false;
    if (filter === "exp60") return flags.pdfFilterExp60 !== false;
    if (filter === "exp90") return flags.pdfFilterExp90 !== false;
    if (filter === "expired") return flags.pdfFilterExpired !== false;
    return flags.pdfInventory !== false;
  }, [filter, flags.pdfFilterNarcotic, flags.pdfFilterLowStock, flags.pdfFilterExp30, flags.pdfFilterExp60, flags.pdfFilterExp90, flags.pdfFilterExpired, flags.pdfInventory]);

  const exportPDF = () => {
    if (!isPdfEnabled) return;
    const stockValue = filtered.reduce((s, m) => s + m.stock * m.purchasePrice, 0);
    const filterTitle = filter === "narcotic" ? "Narcotic Drugs" : filter;
    downloadPDF({
      filename: `inventory-${filter}-${Date.now()}.pdf`,
      title: filter === "narcotic" ? "Inventory Report — Narcotic & Controlled Drugs" : "Inventory / Stock Report",
      subtitle: `${filtered.length} medicine(s) · filter: ${filterTitle}`,
      columns: ["Name", "Batch", "Stock", "Purchase", "Selling", "GST%", "Supplier", "Expiry"],
      rows: filtered.map((m) => [m.name, m.batch, m.stock, fmtCurrency(m.purchasePrice), fmtCurrency(m.sellingPrice), `${m.gst}%`, m.supplier, m.expiry]),
      footer: [{ label: "Total Stock Value", value: fmtCurrency(stockValue) }],
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className={`grid grid-cols-1 ${isPdfEnabled ? "sm:grid-cols-4" : "sm:grid-cols-3"} gap-3`}>
          <Input placeholder="Search by name/batch..." value={q} onChange={(e) => setQ(e.target.value)} />
          <Select value={filter} onChange={(e) => setFilter(e.target.value as InventoryFilter)}>
            <option value="all">All Medicines</option>
            <option value="out">Out of stock</option>
            {flags.filterNarcotic !== false && <option value="narcotic">Narcotic Drugs</option>}
            {flags.filterLowStock && <option value="low">Below Minimum</option>}
            {flags.filterExp30 !== false && <option value="exp30">Expiring 1–30 days</option>}
            {flags.filterExp60 !== false && <option value="exp60">Expiring 31–60 days</option>}
            {flags.filterExp90 !== false && <option value="exp90">Expiring 61–90 days</option>}
            {flags.filterExpired && <option value="expired">Expired</option>}
          </Select>
          {isPdfEnabled && (
            <Button variant="secondary" onClick={exportPDF}><FileDown className="w-4 h-4" /> Download PDF</Button>
          )}
          {!flags.grnModule && (
            <Button onClick={openNew}>+ Add Medicine</Button>
          )}
        </CardBody>
      </Card>

      {filter === "narcotic" && (
        <div className="flex items-center justify-between p-3 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50/70 dark:bg-rose-950/30 text-rose-900 dark:text-rose-200">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-rose-600 text-white font-mono text-xs font-bold">Rx</span>
            <span className="text-sm font-semibold">Narcotic &amp; Controlled Substances Filter Active</span>
            <span className="text-xs text-rose-600 dark:text-rose-400">({filtered.length} medicine{filtered.length === 1 ? "" : "s"} found)</span>
          </div>
          {isFetchingNarcotics && (
            <span className="text-xs text-rose-500 animate-pulse">Syncing with backend...</span>
          )}
        </div>
      )}

      <Card>
        <CardBody className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <Th>Medicine</Th>
                  <Th>Batch</Th>
                  <Th>Stock</Th>
                  {flags.minStockFeature !== false && <Th>Min Level</Th>}
                  <Th>Purchase</Th>
                  <Th>Selling</Th>
                  <Th>GST</Th>
                  <Th>Expiry</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((m) => {
                  const exp = isExpired(m.expiry);
                  const dte = daysToExpiry(m.expiry);
                  return (
                    <tr key={m.id} className="hover:bg-slate-50">
                      <Td>
                        <div className="font-medium">{m.name}</div>
                        <div className="text-xs text-slate-500">{m.supplier}</div>
                        {m.narcotic && <Badge tone="red">NARCOTIC</Badge>}
                      </Td>
                      <Td>{m.batch || <span className="text-slate-400">—</span>}</Td>
                      <Td className={m.stock <= minStockOf(m) ? "text-rose-600 font-semibold" : ""}>{m.stock}</Td>
                      {flags.minStockFeature !== false && (
                        <Td>
                          <MinStockInputCell
                            medicine={m}
                            canEdit={canCustomizeMinStock}
                            onUpdate={setMinStock}
                          />
                        </Td>
                      )}
                      <Td>{fmtCurrency(m.purchasePrice)}</Td>
                      <Td>{fmtCurrency(m.sellingPrice)}</Td>
                      <Td>{m.gst}%</Td>
                      <Td>{m.expiry || <span className="text-slate-400">—</span>}</Td>
                      <Td>
                        {exp ? <Badge tone="red">EXPIRED</Badge> : dte <= 90 ? <Badge tone="amber">{dte}d</Badge> : <Badge tone="green">OK</Badge>}
                        {m.stock === 0 && <Badge tone="red">OUT</Badge>}
                        {m.stock > 0 && m.stock <= minStockOf(m) && <Badge tone="amber">LOW</Badge>}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <EmptyState
                message={
                  filter === "narcotic"
                    ? "No narcotic or controlled medicines found in inventory"
                    : "No medicines found"
                }
              />
            )}
          </div>
        </CardBody>
      </Card>

      {/* ── Single-Item Edit Medicine Modal (when editing an existing item from table) ── */}
      {open && edit && (
        <Modal open={open} onClose={() => { setOpen(false); setEdit(null); }} title="Edit Medicine" size="md">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4">
            <div className="col-span-1 sm:col-span-2">
              <Label>Medicine Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Paracetamol 500mg"
              />
            </div>

            <div>
              <Label>Batch</Label>
              <Input
                value={form.batch}
                onChange={(e) => setForm({ ...form, batch: e.target.value })}
                placeholder="e.g. BTH-8921"
              />
            </div>
            <div>
              <Label>Quantity *</Label>
              <Input
                type="number"
                min={1}
                step="1"
                value={form.stock}
                onChange={(e) => setForm({ ...form, stock: e.target.value })}
                placeholder="Enter quantity"
              />
            </div>
            <div>
              <Label>Manufacturing Date *</Label>
              <Input
                type="date"
                max={today}
                value={form.mfgDate}
                onChange={(e) => setForm({ ...form, mfgDate: e.target.value })}
              />
            </div>
            <div>
              <Label>Expiry Date *</Label>
              <Input
                type="date"
                value={form.expiry}
                onChange={(e) => setForm({ ...form, expiry: e.target.value })}
              />
            </div>
            <div>
              <Label>Buying Price ₹ *</Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                value={form.purchasePrice}
                onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })}
                placeholder="0.00"
              />
            </div>
            <div>
              <Label>Selling Price ₹ *</Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                value={form.sellingPrice}
                onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })}
                placeholder="0.00"
              />
            </div>
            <div>
              <Label>GST % *</Label>
              <Input
                type="number"
                min={0}
                value={form.gst}
                onChange={(e) => setForm({ ...form, gst: e.target.value })}
                placeholder="5"
              />
            </div>

            {flags.minStockFeature !== false && (
              <div>
                <Label>Minimum Stock *</Label>
                <Input
                  type="number"
                  min={0}
                  disabled={!canCustomizeMinStock}
                  value={form.minStock}
                  onChange={(e) => setForm({ ...form, minStock: e.target.value })}
                  placeholder="10"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  {canCustomizeMinStock
                    ? "Alerts trigger when stock falls to this level."
                    : "Default: 10. (Developer / Admin only)."}
                </p>
              </div>
            )}

            <div className="col-span-1 sm:col-span-2">
              <Label>Supplier *</Label>
              <Input
                value={form.supplier}
                onChange={(e) => setForm({ ...form, supplier: e.target.value })}
                placeholder="Supplier name"
              />
            </div>

            <div className="col-span-1 sm:col-span-2 flex items-center gap-2.5 rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50/60 dark:bg-rose-900/20 px-3 py-2.5">
              <input
                type="checkbox"
                id="narc-edit"
                checked={form.narcotic}
                onChange={(e) => setForm({ ...form, narcotic: e.target.checked })}
                className="accent-rose-600 w-4 h-4 cursor-pointer"
              />
              <label htmlFor="narc-edit" className="text-sm font-medium text-rose-700 dark:text-rose-300 cursor-pointer select-none">
                Narcotic / Controlled — prescription required
              </label>
            </div>

            <div className="col-span-1 sm:col-span-2 flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-700 mt-1">
              <Button variant="secondary" onClick={() => { setOpen(false); setEdit(null); }}>Cancel</Button>
              <Button onClick={saveSingleEdit}>Save Changes</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Multi-Product Batch Entry Modal (mirrors GRN staged pipeline) ── */}
      {open && !edit && (
        <Modal open={open} onClose={handleCloseBatchModal} title="Add Medicines (Batch Entry)" size="xl">
          <div className="space-y-5">
            {/* Top Level: Supplier Selection */}
            <div className="rounded-xl border border-sky-100 dark:border-sky-900/40 bg-sky-50/50 dark:bg-sky-950/20 p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-sky-800 dark:text-sky-300">
                    Primary Supplier (Required for Batch)
                  </span>
                </div>
                {selectedSupplier && (
                  <Badge tone="blue">Selected for this batch</Badge>
                )}
              </div>

              {selectedSupplier ? (
                <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg border border-sky-300 dark:border-sky-700 bg-white dark:bg-slate-800 shadow-sm">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-sky-600 text-white flex items-center justify-center shrink-0">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-sm text-slate-800 dark:text-slate-100 truncate">
                        {selectedSupplier}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                        <span>Registered Supplier</span>
                        {stagedItems.length > 0 && (
                          <>
                            <span>•</span>
                            <span className="text-sky-600 dark:text-sky-400 font-semibold">
                              {stagedItems.length} medicine{stagedItems.length === 1 ? "" : "s"} queued
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      if (stagedItems.length > 0) {
                        if (!confirm("Changing supplier will apply to all queued medicines in this session. Proceed?")) {
                          return;
                        }
                      }
                      setSelectedSupplier("");
                      setSupplierQuery("");
                      setSupplierMenuOpen(true);
                    }}
                  >
                    Change Supplier
                  </Button>
                </div>
              ) : (
                <div className="relative">
                  <div className="text-xs text-slate-600 dark:text-slate-400 mb-1.5">
                    Select a supplier once. All queued medicines entered below will be registered under this supplier.
                  </div>
                  <Input
                    value={supplierQuery}
                    onChange={(e) => {
                      setSupplierQuery(e.target.value);
                      setSupplierMenuOpen(true);
                    }}
                    onFocus={() => setSupplierMenuOpen(true)}
                    placeholder={data.suppliers.length > 0 ? "Search and select supplier from existing list..." : "No suppliers found in directory"}
                    autoComplete="off"
                  />
                  {supplierMenuOpen && (
                    <div className="absolute z-40 mt-1 left-0 right-0 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700/60">
                      {data.suppliers.length === 0 ? (
                        <div className="p-3 text-center text-xs text-rose-600 dark:text-rose-400 font-semibold">
                          No suppliers exist yet. Please add suppliers in the Suppliers section first.
                        </div>
                      ) : supplierMatches.length > 0 ? (
                        supplierMatches.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setSelectedSupplier(s.name);
                              setForm((f) => ({ ...f, supplier: s.name }));
                              setSupplierQuery("");
                              setSupplierMenuOpen(false);
                              requestAnimationFrame(() => {
                                medNameInputRef.current?.focus();
                              });
                            }}
                            className="w-full flex items-center justify-between px-3.5 py-2.5 hover:bg-sky-50 dark:hover:bg-sky-900/30 text-left text-xs transition-colors"
                          >
                            <div>
                              <div className="font-semibold text-slate-800 dark:text-slate-200 text-sm">{s.name}</div>
                              {s.contact && <div className="text-[11px] text-slate-400">Contact: {s.contact}</div>}
                            </div>
                            {s.gstNumber && (
                              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                                GST: {s.gstNumber}
                              </span>
                            )}
                          </button>
                        ))
                      ) : (
                        <div className="p-3.5 text-center text-xs text-slate-500 dark:text-slate-400">
                          No supplier matching &quot;{supplierQuery}&quot;. Suppliers must be added via the Suppliers module first.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Middle Section: Individual Medicine Details Entry Form */}
            <div className={`rounded-xl border p-4 transition-all ${
              editingStagedId
                ? "border-amber-300 dark:border-amber-700 bg-amber-50/40 dark:bg-amber-950/20"
                : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 shadow-sm"
            }`}>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3 border-b border-slate-100 dark:border-slate-700 pb-2">
                <div className="flex items-center gap-2">
                  <PackagePlus className="w-4 h-4 text-sky-600" />
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                    {editingStagedId ? "Edit Staged Medicine Details" : "Enter Medicine Details"}
                  </span>
                  {editingStagedId ? (
                    <Badge tone="amber">Editing Row</Badge>
                  ) : (
                    <span className="text-xs text-slate-400">Queue items into the staged list below</span>
                  )}
                </div>
                {editingStagedId && (
                  <Button size="sm" variant="ghost" onClick={cancelEditStagedItem} className="text-xs">
                    Cancel Edit
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-3.5">
                <div className="col-span-1 sm:col-span-2">
                  <Label>Medicine Name *</Label>
                  <Input
                    ref={medNameInputRef}
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Paracetamol 650mg Tablet"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addToStagedList();
                      }
                    }}
                  />
                </div>

                <div>
                  <Label>Batch Number</Label>
                  <Input
                    value={form.batch}
                    onChange={(e) => setForm({ ...form, batch: e.target.value })}
                    placeholder="e.g. BTH-8921"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addToStagedList();
                      }
                    }}
                  />
                </div>

                <div>
                  <Label>Classification *</Label>
                  <Select
                    value={form.narcotic ? "narcotic" : "non-narcotic"}
                    onChange={(e) => setForm({ ...form, narcotic: e.target.value === "narcotic" })}
                  >
                    <option value="non-narcotic">Non-Narcotic</option>
                    <option value="narcotic">Narcotic (Controlled)</option>
                  </Select>
                </div>

                <div>
                  <Label>Quantity (Units) *</Label>
                  <Input
                    type="number"
                    min={1}
                    step="1"
                    value={form.stock}
                    onChange={(e) => setForm({ ...form, stock: e.target.value === "" ? "" : Number(e.target.value) })}
                    placeholder="e.g. 100"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addToStagedList();
                      }
                    }}
                  />
                </div>

                <div>
                  <Label>Manufacturing Date *</Label>
                  <Input
                    type="date"
                    max={today}
                    value={form.mfgDate}
                    onChange={(e) => setForm({ ...form, mfgDate: e.target.value })}
                  />
                </div>

                <div>
                  <Label>Expiry Date *</Label>
                  <Input
                    type="date"
                    value={form.expiry}
                    onChange={(e) => setForm({ ...form, expiry: e.target.value })}
                  />
                </div>

                <div>
                  <Label>Buying Price (₹) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min={0.01}
                    value={form.purchasePrice}
                    onChange={(e) => setForm({ ...form, purchasePrice: e.target.value === "" ? "" : Number(e.target.value) })}
                    placeholder="0.00"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addToStagedList();
                      }
                    }}
                  />
                </div>

                <div>
                  <Label>Selling Price (₹) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min={0.01}
                    value={form.sellingPrice}
                    onChange={(e) => setForm({ ...form, sellingPrice: e.target.value === "" ? "" : Number(e.target.value) })}
                    placeholder="0.00"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addToStagedList();
                      }
                    }}
                  />
                </div>

                <div>
                  <Label>GST % *</Label>
                  <Select
                    value={String(form.gst)}
                    onChange={(e) => setForm({ ...form, gst: Number(e.target.value) })}
                  >
                    <option value="0">0%</option>
                    <option value="5">5%</option>
                    <option value="12">12%</option>
                    <option value="18">18%</option>
                    <option value="28">28%</option>
                  </Select>
                </div>

                <div>
                  <Label>Minimum Stock Level</Label>
                  <Input
                    type="number"
                    min={0}
                    step="1"
                    value={form.minStock}
                    onChange={(e) => setForm({ ...form, minStock: e.target.value === "" ? "" : Number(e.target.value) })}
                    placeholder="10"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addToStagedList();
                      }
                    }}
                  />
                </div>

                <div className="col-span-1 sm:col-span-2 md:col-span-3 lg:col-span-2 flex items-end">
                  <Button
                    type="button"
                    onClick={addToStagedList}
                    className={`w-full font-semibold shadow-md ${
                      editingStagedId ? "bg-amber-600 hover:bg-amber-700 text-white" : ""
                    }`}
                  >
                    {editingStagedId ? (
                      <>
                        <CheckCircle2 className="w-4 h-4" /> Update Staged Item
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4" /> Add to List
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>

            {/* Bottom Section: Staged Product Table (mirroring GRN Entry) */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden shadow-sm">
              <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/80 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-sky-600" />
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                    Staged Medicines Queue
                  </span>
                  <Badge tone="blue">{stagedItems.length} line{stagedItems.length === 1 ? "" : "s"}</Badge>
                </div>

                {stagedItems.length > 0 && (
                  <div className="flex items-center gap-3 text-xs flex-wrap">
                    <span className="text-slate-600 dark:text-slate-300">
                      Total Units: <b>{stagedItems.reduce((acc, i) => acc + (Number(i.stock) || 0), 0)}</b>
                    </span>
                    <span>•</span>
                    <span className="text-slate-600 dark:text-slate-300">
                      Total Cost: <b className="text-emerald-700 dark:text-emerald-400">
                        {fmtCurrency(stagedItems.reduce((acc, i) => acc + (Number(i.stock) || 0) * (Number(i.purchasePrice) || 0), 0))}
                      </b>
                    </span>
                    <span>•</span>
                    <span className="text-slate-600 dark:text-slate-300">
                      Total Resale: <b className="text-sky-700 dark:text-sky-400">
                        {fmtCurrency(stagedItems.reduce((acc, i) => acc + (Number(i.stock) || 0) * (Number(i.sellingPrice) || 0), 0))}
                      </b>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm("Clear all staged medicines from this list?")) {
                          setStagedItems([]);
                          cancelEditStagedItem();
                        }
                      }}
                      className="text-xs text-rose-600 hover:text-rose-700 dark:text-rose-400 font-semibold hover:underline ml-2"
                    >
                      Clear Queue
                    </button>
                  </div>
                )}
              </div>

              {stagedItems.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
                  <PackagePlus className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                  <div className="font-semibold text-slate-700 dark:text-slate-300 text-sm">No medicines queued yet</div>
                  <div className="mt-1">Fill in the medicine details above and click <b>&quot;Add to List&quot;</b> to queue items for batch submission.</div>
                </div>
              ) : (
                <div className="overflow-x-auto max-h-64 sm:max-h-72 overflow-y-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300 border-b border-slate-100 dark:border-slate-700 sticky top-0 z-10">
                      <tr>
                        <th className="px-3 py-2 font-semibold">#</th>
                        <th className="px-3 py-2 font-semibold">Medicine Name</th>
                        <th className="px-3 py-2 font-semibold">Batch</th>
                        <th className="px-3 py-2 font-semibold">Qty</th>
                        <th className="px-3 py-2 font-semibold">Buy (₹)</th>
                        <th className="px-3 py-2 font-semibold">Sell (₹)</th>
                        <th className="px-3 py-2 font-semibold">Margin %</th>
                        <th className="px-3 py-2 font-semibold">GST %</th>
                        <th className="px-3 py-2 font-semibold">Mfg Date</th>
                        <th className="px-3 py-2 font-semibold">Expiry</th>
                        <th className="px-3 py-2 font-semibold">Min Stock</th>
                        <th className="px-3 py-2 font-semibold">Total Cost</th>
                        <th className="px-3 py-2 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                      {stagedItems.map((item, idx) => {
                        const buy = Number(item.purchasePrice) || 0;
                        const sell = Number(item.sellingPrice) || 0;
                        const qty = Number(item.stock) || 0;
                        const lineTotal = buy * qty;
                        const margin = buy > 0 ? (((sell - buy) / buy) * 100).toFixed(1) : "0";
                        const isBeingEdited = editingStagedId === item.id;

                        return (
                          <tr
                            key={item.id}
                            className={`transition-colors ${
                              isBeingEdited
                                ? "bg-amber-50/70 dark:bg-amber-950/40"
                                : "hover:bg-sky-50/50 dark:hover:bg-slate-700/40"
                            }`}
                          >
                            <td className="px-3 py-2 text-slate-400">{idx + 1}</td>
                            <td className="px-3 py-2 font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <span>{item.name}</span>
                                {item.narcotic && (
                                  <Badge tone="red" className="text-[10px] px-1.5 py-0.2">Narcotic</Badge>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2 font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap">
                              {item.batch || "—"}
                            </td>
                            <td className="px-3 py-2 font-semibold text-slate-700 dark:text-slate-200">
                              {qty}
                            </td>
                            <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                              ₹{buy.toFixed(2)}
                            </td>
                            <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                              ₹{sell.toFixed(2)}
                            </td>
                            <td className="px-3 py-2">
                              <span className={Number(margin) >= 0 ? "text-emerald-600 dark:text-emerald-400 font-semibold" : "text-rose-600 font-semibold"}>
                                {margin}%
                              </span>
                            </td>
                            <td className="px-3 py-2 text-slate-500">
                              {item.gst}%
                            </td>
                            <td className="px-3 py-2 text-slate-500 whitespace-nowrap">
                              {item.mfgDate || "—"}
                            </td>
                            <td className="px-3 py-2 font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">
                              {item.expiry || "—"}
                            </td>
                            <td className="px-3 py-2 text-slate-500">
                              {item.minStock}
                            </td>
                            <td className="px-3 py-2 font-bold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                              {fmtCurrency(lineTotal)}
                            </td>
                            <td className="px-3 py-2 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => editStagedItem(item)}
                                  className="p-1 rounded text-sky-600 hover:bg-sky-50 dark:hover:bg-slate-700 transition"
                                  title="Edit this queued row"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeStagedItem(item.id)}
                                  className="p-1 rounded text-rose-600 hover:bg-rose-50 dark:hover:bg-slate-700 transition"
                                  title="Remove from queue"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Modal Footer / Batch Submit */}
            <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-700">
              <div className="text-xs text-slate-500 dark:text-slate-400 text-center sm:text-left">
                {stagedItems.length > 0 ? (
                  <span>
                    Ready to commit <b>{stagedItems.length}</b> medicine{stagedItems.length === 1 ? "" : "s"} under <b>{selectedSupplier}</b>
                  </span>
                ) : (
                  <span>Queue medicines above to enable batch saving</span>
                )}
              </div>

              <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                <Button variant="secondary" onClick={handleCloseBatchModal} disabled={isSavingBatch}>
                  Cancel
                </Button>
                <Button
                  onClick={saveBatch}
                  disabled={stagedItems.length === 0 || !selectedSupplier || isSavingBatch}
                  className="shadow-md"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Save {stagedItems.length > 0 ? `(${stagedItems.length})` : ""} to Inventory
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default Inventory;
