import React, { useMemo, useState } from "react";
import { useStore, uid } from "../store/store";
import { FileDown, Minus, Plus, Gauge } from "lucide-react";
import { Card, CardBody, Input, Label, Button, Th, Td, Modal, Badge, EmptyState, Select } from "../components/ui";
import { fmtCurrency, isExpired, daysToExpiry, downloadPDF, flashToast } from "../utils/helpers";
import type { Medicine } from "../store/types";
import { minStockOf } from "../store/types";

const empty = { name: "", batch: "", purchasePrice: 0, sellingPrice: 0, stock: 0, supplier: "", expiry: "", mfgDate: "", gst: 5, narcotic: false, minStock: 10 };

export type InventoryFilter = "all" | "out" | "narcotic" | "low" | "expired" | "exp30" | "exp60" | "exp90";

interface InventoryProps {
  initialFilter?: InventoryFilter | null;
  onConsumeFilter?: () => void;
}

const Inventory: React.FC<InventoryProps> = ({ initialFilter, onConsumeFilter }) => {
  const { data, setData, log, flags } = useStore();
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
    setEdit(null);
    setForm(empty);
    setSupplierQuery("");
    setSupplierMenuOpen(false);
    setOpen(true);
  };

  // When GRN Entry & Approvals is disabled, medicines must be added with full purchase details
  const grnOff = !flags.grnModule;

  /* quick-edit the low-stock threshold straight from the table */
  const setMinStock = (m: Medicine, v: number) => {
    const next = Math.max(0, Math.min(9999, Math.round(v)));
    setData((d) => ({ ...d, medicines: d.medicines.map((x) => (x.id === m.id ? { ...x, minStock: next } : x)) }));
    flashToast(`Min stock for ${m.name} set to ${next}`);
  };

  const today = new Date().toISOString().slice(0, 10);

  const save = () => {
    if (!form.name.trim()) {
      alert("Medicine name is required");
      return;
    }
    if (!form.supplier.trim()) {
      alert("Supplier is required. Please select an existing supplier from the list.");
      return;
    }
    const supplierExists = data.suppliers.some(
      (s) => s.name.trim().toLowerCase() === form.supplier.trim().toLowerCase()
    );
    if (!supplierExists) {
      alert("Selected supplier does not exist in the Suppliers list. New suppliers must be added through the 'Suppliers' section first.");
      return;
    }
    if (form.mfgDate && form.mfgDate > today) {
      alert("Manufacturing date cannot be in the future");
      return;
    }
    if (!edit && grnOff) {
      if (form.stock <= 0) return alert("Quantity must be greater than 0");
      if (!form.expiry) return alert("Expiry date is required");
      if (!form.mfgDate) return alert("Manufacturing date is required");
      if (form.purchasePrice <= 0) return alert("Buying price must be greater than 0");
      if (form.sellingPrice <= 0) return alert("Selling price must be greater than 0");
    }
    if (edit) {
      setData((d) => ({ ...d, medicines: d.medicines.map((m) => (m.id === edit.id ? { ...m, ...form } : m)) }));
      log("MEDICINE_UPDATE", `${form.name} (${form.batch})`);
    } else {
      const nm: Medicine = { id: uid("m"), ...form };
      setData((d) => ({ ...d, medicines: [nm, ...d.medicines] }));
      log("MEDICINE_CREATE", `${form.name} (${form.batch})`);
    }
    setOpen(false);
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
          <Button onClick={openNew}>+ Add Medicine</Button>
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
                  <Th>Min Level</Th>
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
                      <Td>
                        <div className="inline-flex items-center gap-1 group/min">
                          <button
                            onClick={() => setMinStock(m, minStockOf(m) - (minStockOf(m) >= 50 ? 10 : 5))}
                            className="w-6 h-6 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-900/40 active:scale-90 transition-all"
                            title="Lower minimum"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className={`min-w-[2.25rem] text-center text-xs font-bold tabular-nums rounded-md px-1.5 py-1 border transition-colors ${m.stock <= minStockOf(m) ? "bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300" : "bg-slate-50 dark:bg-slate-700/40 border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200"}`}>
                            <Gauge className="w-3 h-3 inline -mt-0.5 mr-0.5" />{minStockOf(m)}
                          </span>
                          <button
                            onClick={() => setMinStock(m, minStockOf(m) + (minStockOf(m) >= 50 ? 10 : 5))}
                            className="w-6 h-6 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center hover:bg-emerald-100 hover:text-emerald-600 dark:hover:bg-emerald-900/40 active:scale-90 transition-all"
                            title="Raise minimum"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </Td>
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

      <Modal open={open} onClose={() => setOpen(false)} title={edit ? "Edit Medicine" : "Add Medicine"} size="md">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label>Medicine Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Paracetamol 500mg" /></div>

          {/* Full purchase fields: always when GRN module is off (no GRN intake), else only when editing */}
          {(edit || grnOff) && (
            <>
              <div><Label>Batch</Label><Input value={form.batch} onChange={(e) => setForm({ ...form, batch: e.target.value })} /></div>
              <div><Label>Quantity *</Label><Input type="number" min={0} value={form.stock} onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })} /></div>
              <div><Label>Manufacturing Date *</Label><Input type="date" max={today} value={form.mfgDate} onChange={(e) => setForm({ ...form, mfgDate: e.target.value })} /></div>
              <div><Label>Expiry Date *</Label><Input type="date" value={form.expiry} onChange={(e) => setForm({ ...form, expiry: e.target.value })} /></div>
              <div><Label>Buying Price ₹ *</Label><Input type="number" step="0.01" min={0} value={form.purchasePrice} onChange={(e) => setForm({ ...form, purchasePrice: Number(e.target.value) })} /></div>
              <div><Label>Selling Price ₹ *</Label><Input type="number" step="0.01" min={0} value={form.sellingPrice} onChange={(e) => setForm({ ...form, sellingPrice: Number(e.target.value) })} /></div>
              <div><Label>GST % *</Label><Input type="number" min={0} value={form.gst} onChange={(e) => setForm({ ...form, gst: Number(e.target.value) })} /></div>
            </>
          )}

          <div>
            <Label>Minimum Stock *</Label>
            <Input type="number" min={0} value={form.minStock} onChange={(e) => setForm({ ...form, minStock: Number(e.target.value) })} />
            <p className="text-[11px] text-slate-400 mt-1">Alerts trigger when stock falls to this level. Set 2–5 for small-pack drugs, 50+ for fast movers.</p>
          </div>
          <div className="relative">
            <Label>Supplier * (Existing Suppliers List Only)</Label>
            {form.supplier ? (
              <div className="flex items-center justify-between p-2 rounded-lg border-2 border-sky-400 bg-sky-50 dark:bg-sky-900/30 text-sky-900 dark:text-sky-100 text-sm">
                <div className="min-w-0 pr-2">
                  <div className="font-semibold truncate">{form.supplier}</div>
                  <div className="text-[11px] text-sky-600 dark:text-sky-300">Registered supplier</div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setForm({ ...form, supplier: "" });
                    setSupplierQuery("");
                    setSupplierMenuOpen(true);
                  }}
                  className="text-xs font-semibold px-2.5 py-1 rounded-md bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600 transition shadow-sm shrink-0"
                >
                  Change
                </button>
              </div>
            ) : (
              <div className="relative">
                <Input
                  value={supplierQuery}
                  onChange={(e) => {
                    setSupplierQuery(e.target.value);
                    setSupplierMenuOpen(true);
                  }}
                  onFocus={() => setSupplierMenuOpen(true)}
                  placeholder={data.suppliers.length > 0 ? "Search and select supplier..." : "No suppliers found"}
                  autoComplete="off"
                />
                {supplierMenuOpen && (
                  <div className="absolute z-30 mt-1 w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-xl max-h-48 overflow-y-auto">
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
                            setForm({ ...form, supplier: s.name });
                            setSupplierQuery("");
                            setSupplierMenuOpen(false);
                          }}
                          className="w-full flex items-center justify-between px-3 py-2 hover:bg-sky-50 dark:hover:bg-sky-900/20 text-left text-xs transition-colors border-b border-slate-100 dark:border-slate-700 last:border-0"
                        >
                          <div>
                            <div className="font-semibold text-slate-800 dark:text-slate-200">{s.name}</div>
                            {s.contact && <div className="text-[10px] text-slate-400">Contact: {s.contact}</div>}
                          </div>
                          {s.gstNumber && <span className="text-[10px] font-mono text-slate-400">{s.gstNumber}</span>}
                        </button>
                      ))
                    ) : (
                      <div className="p-3 text-center text-xs text-slate-500 dark:text-slate-400">
                        No supplier found matching "{supplierQuery}".
                        <div className="text-rose-600 dark:text-rose-400 font-semibold mt-1">
                          Suppliers must be added through the 'Suppliers' section first.
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            <p className="text-[11px] text-slate-400 mt-1">
              Select from existing suppliers only. If not listed, add via the <b>Suppliers</b> section first.
            </p>
          </div>

          <div className="col-span-2 flex items-center gap-2 rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50/60 dark:bg-rose-900/20 px-3 py-2.5">
            <input type="checkbox" id="narc" checked={form.narcotic} onChange={(e) => setForm({ ...form, narcotic: e.target.checked })} className="accent-rose-600 w-4 h-4" />
            <label htmlFor="narc" className="text-sm font-medium text-rose-700 dark:text-rose-300">Narcotic / Controlled — prescription required</label>
          </div>

          {!edit && !grnOff && (
            <p className="col-span-2 text-[11px] text-slate-400">Batch, pricing, GST and stock are captured automatically when you receive this medicine through GRN Entry.</p>
          )}
          {grnOff && !edit && (
            <p className="col-span-2 text-[11px] text-amber-600 dark:text-amber-400">GRN Entry &amp; Approvals is disabled, so full purchase details are required here.</p>
          )}

          <div className="col-span-2 flex justify-end gap-2 pt-3">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save}>{edit ? "Save Changes" : "Add Medicine"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Inventory;
