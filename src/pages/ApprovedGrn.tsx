import React, { useState, useMemo } from "react";
import { useStore } from "../store/store";
import { Card, CardBody, Button, Th, Td, Badge, EmptyState, Modal, Input, Label, Select } from "../components/ui";
import { fmtCurrency, fmtDate, flashToast } from "../utils/helpers";
import type { GRN as GRNType, Medicine, PurchaseItem } from "../store/types";
import { isOverseer } from "../store/types";
import { Pencil, Trash2, Search, Plus, AlertTriangle, ShieldCheck, CheckCircle2, RotateCcw } from "lucide-react";

/* Total GST for a purchase item */
const totalGst = (it: { igst: number; cgst: number; sgst: number }) =>
  (it.igst || 0) + (it.cgst || 0) + (it.sgst || 0);

/* Recompute GRN monetary totals from its items */
const recalc = (g: GRNType) => {
  const subtotal = g.items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.purchasePrice) || 0), 0);
  const agencyDiscountAmt = (subtotal * (Number(g.agencyDiscountPct) || 0)) / 100;
  const afterAgency = Math.max(0, subtotal - agencyDiscountAmt - (Number(g.specialDiscount) || 0));
  const taxAmount = g.items.reduce((s, i) => {
    const itemTotal = (Number(i.qty) || 0) * (Number(i.purchasePrice) || 0);
    const ratio = subtotal > 0 ? itemTotal / subtotal : 0;
    return s + (afterAgency * ratio * totalGst(i)) / 100;
  }, 0);
  return { subtotal, agencyDiscountAmt, taxAmount, total: afterAgency + taxAmount };
};

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
  cgst: 6,
  sgst: 6,
});

export const ApprovedGrn: React.FC = () => {
  const { data, setData, currentUser, log } = useStore();

  const isDev = isOverseer(currentUser?.role);

  // Search & Filter state
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Modals state
  const [viewGrn, setViewGrn] = useState<GRNType | null>(null);
  const [editDraft, setEditDraft] = useState<GRNType | null>(null);
  const [adjustStockOnEdit, setAdjustStockOnEdit] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<GRNType | null>(null);
  const [reverseStockOnDelete, setReverseStockOnDelete] = useState(true);

  const todayStr = new Date().toISOString().slice(0, 10);

  // If not Developer role, deny access
  if (!isDev) {
    return (
      <Card>
        <CardBody className="text-center text-slate-500 dark:text-slate-400 py-16 space-y-3">
          <div className="text-4xl">⛔</div>
          <div className="text-lg font-bold text-slate-800 dark:text-slate-100">Developer Access Required</div>
          <p className="text-sm max-w-md mx-auto text-slate-600 dark:text-slate-400">
            Approved GRN management (viewing, editing, and deleting approved stock entries) is strictly restricted to the <b>Developer</b> role.
          </p>
        </CardBody>
      </Card>
    );
  }

  // Filter approved GRNs
  const approvedGrns = useMemo(() => {
    return data.grns
      .filter((g) => g.status === "approved")
      .sort((a, b) => new Date(b.approvedAt || b.date).getTime() - new Date(a.approvedAt || a.date).getTime());
  }, [data.grns]);

  const filteredGrns = useMemo(() => {
    const q = search.trim().toLowerCase();
    return approvedGrns.filter((g) => {
      if (startDate && g.date < startDate) return false;
      if (endDate && g.date > endDate) return false;
      if (!q) return true;
      return (
        g.number.toLowerCase().includes(q) ||
        g.supplierName.toLowerCase().includes(q) ||
        g.invoiceNumber.toLowerCase().includes(q) ||
        (g.approvedBy && g.approvedBy.toLowerCase().includes(q)) ||
        g.items.some((it) => it.name.toLowerCase().includes(q) || it.batch.toLowerCase().includes(q))
      );
    });
  }, [approvedGrns, search, startDate, endDate]);

  // Summary Metrics
  const metrics = useMemo(() => {
    const totalCount = filteredGrns.length;
    const totalValue = filteredGrns.reduce((s, g) => s + (g.total || 0), 0);
    const totalItems = filteredGrns.reduce((s, g) => s + g.items.length, 0);
    const totalStrips = filteredGrns.reduce(
      (s, g) => s + g.items.reduce((si, i) => si + (Number(i.strips) || 0) + (Number(i.freeStrips) || 0), 0),
      0
    );
    return { totalCount, totalValue, totalItems, totalStrips };
  }, [filteredGrns]);

  // Edit Handlers
  const openEdit = (g: GRNType) => {
    setEditDraft(JSON.parse(JSON.stringify(g)) as GRNType);
    setAdjustStockOnEdit(true);
  };

  const updDraftItem = (index: number, key: keyof PurchaseItem, val: string | number) => {
    if (!editDraft) return;
    const items = [...editDraft.items];
    items[index] = { ...items[index], [key]: val };
    if (key === "strips" || key === "tabsPerStrip") {
      items[index].qty = (Number(items[index].strips) || 0) * (Number(items[index].tabsPerStrip) || 0);
    }
    setEditDraft({ ...editDraft, items });
  };

  const addDraftItem = () => {
    if (!editDraft) return;
    setEditDraft({ ...editDraft, items: [...editDraft.items, emptyItem()] });
  };

  const removeDraftItem = (index: number) => {
    if (!editDraft) return;
    setEditDraft({ ...editDraft, items: editDraft.items.filter((_, x) => x !== index) });
  };

  const saveEdit = () => {
    if (!editDraft) return;
    if (!editDraft.supplierName.trim() || !editDraft.invoiceNumber.trim()) {
      return alert("Supplier and invoice number are required");
    }
    if (!editDraft.date) return alert("Purchase date is required");
    if (editDraft.date > todayStr) return alert("Purchase date cannot be in the future");
    if (editDraft.items.length === 0) return alert("At least one item is required");
    if (editDraft.items.some((i) => !i.name.trim() || !i.batch.trim() || !i.expiry || Number(i.qty) <= 0)) {
      return alert("Every item needs a name, batch, expiry, and quantity above 0");
    }

    const originalGrn = data.grns.find((g) => g.id === editDraft.id);
    const updatedGrn: GRNType = {
      ...editDraft,
      supplierName: editDraft.supplierName.trim(),
      invoiceNumber: editDraft.invoiceNumber.trim(),
      ...recalc(editDraft),
    };

    setData((d) => {
      let meds = [...d.medicines];

      // If developer wants stock adjusted according to changes between original and updated GRN
      if (adjustStockOnEdit && originalGrn) {
        // Calculate original quantities added
        const oldMap = new Map<string, number>();
        originalGrn.items.forEach((it) => {
          const key = `${it.name.toLowerCase()}:::${it.batch}`;
          const tps = it.tabsPerStrip || 1;
          const oldQty = it.qty + (it.freeStrips || 0) * tps;
          oldMap.set(key, (oldMap.get(key) || 0) + oldQty);
        });

        // Calculate new quantities
        const newMap = new Map<string, number>();
        updatedGrn.items.forEach((it) => {
          const key = `${it.name.toLowerCase()}:::${it.batch}`;
          const tps = it.tabsPerStrip || 1;
          const newQty = it.qty + (it.freeStrips || 0) * tps;
          newMap.set(key, (newMap.get(key) || 0) + newQty);
        });

        // Apply net delta to inventory
        const allKeys = new Set([...oldMap.keys(), ...newMap.keys()]);
        allKeys.forEach((key) => {
          const [name, batch] = key.split(":::");
          const oldQ = oldMap.get(key) || 0;
          const newQ = newMap.get(key) || 0;
          const delta = newQ - oldQ;

          const idx = meds.findIndex((m) => m.name.toLowerCase() === name && m.batch === batch);
          if (idx >= 0) {
            meds[idx] = {
              ...meds[idx],
              stock: Math.max(0, meds[idx].stock + delta),
            };
          } else if (newQ > 0) {
            const it = updatedGrn.items.find((x) => x.name.toLowerCase() === name && x.batch === batch);
            if (it) {
              meds.push({
                id: "m_" + Date.now() + Math.random().toString(36).slice(2, 5),
                name: it.name,
                batch: it.batch,
                stock: newQ,
                purchasePrice: it.purchasePrice,
                sellingPrice: it.sellingPrice,
                expiry: it.expiry,
                gst: totalGst(it),
                supplier: updatedGrn.supplierName,
              });
            }
          }
        });
      }

      return {
        ...d,
        medicines: meds,
        grns: d.grns.map((x) => (x.id === updatedGrn.id ? updatedGrn : x)),
      };
    });

    log("APPROVED_GRN_EDIT", `Developer edited Approved GRN ${updatedGrn.number} (${fmtCurrency(updatedGrn.total)})`);
    flashToast(`Approved GRN ${updatedGrn.number} updated successfully`);
    setEditDraft(null);
    if (viewGrn?.id === updatedGrn.id) {
      setViewGrn(updatedGrn);
    }
  };

  // Delete Handlers
  const confirmDelete = () => {
    if (!deleteTarget) return;

    setData((d) => {
      let meds = [...d.medicines];

      if (reverseStockOnDelete) {
        deleteTarget.items.forEach((it) => {
          const tps = it.tabsPerStrip || 1;
          const addedQty = it.qty + (it.freeStrips || 0) * tps;
          const idx = meds.findIndex((m) => m.name.toLowerCase() === it.name.toLowerCase() && m.batch === it.batch);
          if (idx >= 0) {
            meds[idx] = {
              ...meds[idx],
              stock: Math.max(0, meds[idx].stock - addedQty),
            };
          }
        });
      }

      return {
        ...d,
        medicines: meds,
        grns: d.grns.filter((x) => x.id !== deleteTarget.id),
      };
    });

    log(
      "APPROVED_GRN_DELETE",
      `Developer deleted Approved GRN ${deleteTarget.number} (${fmtCurrency(deleteTarget.total)})${
        reverseStockOnDelete ? " with inventory stock reversal" : " without stock adjustment"
      }`
    );
    flashToast(`Approved GRN ${deleteTarget.number} deleted`);
    setDeleteTarget(null);
    if (viewGrn?.id === deleteTarget.id) {
      setViewGrn(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-gradient-to-r from-slate-900 to-indigo-950 p-6 rounded-2xl text-white shadow-lg">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">📦</span>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight">Approved GRN Management</h1>
            <Badge tone="purple">Developer Access Only</Badge>
          </div>
          <p className="text-sm text-slate-300 mt-1 max-w-2xl">
            Audit, inspect, modify, or purge previously approved Goods Received Notes. Any quantity edits or deletions provide automated inventory stock synchronization.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs bg-white/10 border border-white/20 px-3 py-2 rounded-xl backdrop-blur-sm self-start md:self-auto">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Authenticated as <b>{currentUser?.username}</b> ({currentUser?.role})</span>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card className="border-l-4 border-l-emerald-500">
          <CardBody className="p-4">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Approved GRNs</div>
            <div className="text-2xl font-bold text-slate-800 dark:text-slate-100 mt-1">{metrics.totalCount}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">Total approved entries</div>
          </CardBody>
        </Card>
        <Card className="border-l-4 border-l-sky-500">
          <CardBody className="p-4">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Value</div>
            <div className="text-2xl font-bold text-sky-700 dark:text-sky-400 mt-1">{fmtCurrency(metrics.totalValue)}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">Sum of approved invoices</div>
          </CardBody>
        </Card>
        <Card className="border-l-4 border-l-purple-500">
          <CardBody className="p-4">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Items</div>
            <div className="text-2xl font-bold text-purple-700 dark:text-purple-400 mt-1">{metrics.totalItems}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">Distinct medicine line items</div>
          </CardBody>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardBody className="p-4">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Strips</div>
            <div className="text-2xl font-bold text-amber-700 dark:text-amber-400 mt-1">{metrics.totalStrips}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">Including bonus/free strips</div>
          </CardBody>
        </Card>
      </div>

      {/* Filters Bar */}
      <Card>
        <CardBody className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="lg:col-span-2 relative">
              <Label className="text-xs">Search Approved GRNs</Label>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search by GRN #, supplier, invoice, medicine, or approved by..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">From Date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">To Date</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          {(search || startDate || endDate) && (
            <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100 dark:border-slate-700 text-xs text-slate-500">
              <span>Showing {filteredGrns.length} of {approvedGrns.length} approved records</span>
              <button
                type="button"
                onClick={() => { setSearch(""); setStartDate(""); setEndDate(""); }}
                className="text-sky-600 hover:text-sky-800 font-medium flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" /> Clear filters
              </button>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Approved GRNs List */}
      <Card>
        <CardBody className="p-0">
          <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-700 font-semibold flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span>Approved GRN Registry</span>
              <Badge tone="green">{filteredGrns.length}</Badge>
            </div>
            <span className="text-xs text-slate-500">Sorted by approval date (newest first)</span>
          </div>

          {/* Mobile view */}
          <div className="lg:hidden p-3 space-y-3">
            {filteredGrns.length === 0 && <EmptyState message="No approved GRN entries found" />}
            {filteredGrns.map((g) => (
              <Card key={g.id} className="border border-slate-200 dark:border-slate-700">
                <CardBody className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sky-700 dark:text-sky-400">{g.number}</span>
                    <Badge tone="green">APPROVED</Badge>
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
                    <div><span className="text-slate-400">Supplier:</span> {g.supplierName}</div>
                    <div><span className="text-slate-400">Invoice:</span> {g.invoiceNumber} · {fmtDate(g.date)}</div>
                    <div><span className="text-slate-400">Approved by:</span> {g.approvedBy || "Admin"} {g.approvedAt && `(${fmtDate(g.approvedAt)})`}</div>
                    <div><span className="text-slate-400">Items:</span> {g.items.length}</div>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-700">
                    <span className="font-bold text-sky-700 dark:text-sky-400">{fmtCurrency(g.total)}</span>
                    <div className="flex items-center gap-1.5">
                      <Button size="sm" variant="secondary" onClick={() => setViewGrn(g)}>👁 View</Button>
                      <Button size="sm" variant="secondary" onClick={() => openEdit(g)} title="Developer Edit">
                        <Pencil className="w-3.5 h-3.5 text-amber-600" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(g)} title="Developer Delete">
                        <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                      </Button>
                    </div>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>

          {/* Desktop Table */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <Th>GRN #</Th>
                  <Th>Date</Th>
                  <Th>Supplier</Th>
                  <Th>Invoice #</Th>
                  <Th>Items</Th>
                  <Th>Total (₹)</Th>
                  <Th>Approved By</Th>
                  <Th className="text-right">Developer Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                {filteredGrns.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center py-10 text-slate-400 text-sm">
                      No approved GRN entries found matching criteria
                    </td>
                  </tr>
                )}
                {filteredGrns.map((g) => (
                  <tr key={g.id} className="hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors">
                    <Td className="font-semibold text-sky-700 dark:text-sky-400">{g.number}</Td>
                    <Td className="text-slate-600 dark:text-slate-300">{fmtDate(g.date)}</Td>
                    <Td className="font-medium text-slate-800 dark:text-slate-200">{g.supplierName}</Td>
                    <Td>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs">{g.invoiceNumber}</span>
                        {g.aiExtracted && <Badge tone="blue">AI</Badge>}
                      </div>
                    </Td>
                    <Td>{g.items.length}</Td>
                    <Td className="font-semibold text-slate-800 dark:text-slate-200">{fmtCurrency(g.total)}</Td>
                    <Td>
                      <div className="text-xs">
                        <span className="font-semibold text-emerald-700 dark:text-emerald-400">{g.approvedBy || "Admin"}</span>
                        {g.approvedAt && <div className="text-[10px] text-slate-400">{fmtDate(g.approvedAt)}</div>}
                      </div>
                    </Td>
                    <Td className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button size="sm" variant="secondary" onClick={() => setViewGrn(g)}>
                          👁 View
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => openEdit(g)}
                          title="Edit Approved GRN (Developer role)"
                          className="hover:border-amber-400"
                        >
                          <Pencil className="w-3.5 h-3.5 text-amber-600" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDeleteTarget(g)}
                          title="Delete Approved GRN (Developer role)"
                          className="hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      {/* ━━━━━━ Modal 1: View Details ━━━━━━ */}
      <Modal open={!!viewGrn} onClose={() => setViewGrn(null)} title={`Approved GRN Details — ${viewGrn?.number}`} size="lg">
        {viewGrn && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-slate-50 dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
              <div>
                <span className="text-slate-400">Supplier:</span>
                <div className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">{viewGrn.supplierName}</div>
              </div>
              <div>
                <span className="text-slate-400">Invoice Number:</span>
                <div className="font-semibold font-mono text-slate-800 dark:text-slate-200 mt-0.5">{viewGrn.invoiceNumber}</div>
              </div>
              <div>
                <span className="text-slate-400">Purchase Date:</span>
                <div className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">{fmtDate(viewGrn.date)}</div>
              </div>
              <div>
                <span className="text-slate-400">Approved By:</span>
                <div className="font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">
                  {viewGrn.approvedBy || "Admin"}
                </div>
              </div>
            </div>

            {viewGrn.attachedInvoiceName && (
              <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg p-2.5 flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-300">
                <div className="flex items-center gap-2">
                  <span>📄 Supplier Invoice File:</span>
                  <span className="font-mono font-semibold">{viewGrn.attachedInvoiceName}</span>
                </div>
                {viewGrn.aiExtracted && <Badge tone="green">AI Processed</Badge>}
              </div>
            )}

            {/* Items Breakdown */}
            <div>
              <div className="font-semibold text-sm mb-2 flex items-center justify-between">
                <span>Line Items ({viewGrn.items.length})</span>
                <span className="text-xs text-slate-500">Includes strip conversion & tax rates</span>
              </div>
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {viewGrn.items.map((it, idx) => (
                  <div key={idx} className="border border-slate-200 dark:border-slate-700 rounded-xl p-3 bg-white dark:bg-slate-800 text-xs">
                    <div className="flex items-start justify-between mb-1.5">
                      <div>
                        <span className="font-semibold text-sm text-slate-800 dark:text-slate-100">{it.name}</span>
                        <div className="text-slate-500">Batch: <span className="font-mono font-medium">{it.batch}</span> · Expiry: {it.expiry}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-sky-700 dark:text-sky-400 text-sm">{fmtCurrency(it.qty * it.purchasePrice)}</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-750 p-2 rounded-lg">
                      <div>Strips: <b>{it.strips}</b></div>
                      <div>Tabs/Strip: <b>{it.tabsPerStrip}</b></div>
                      <div>Free: {it.freeStrips > 0 ? <span className="text-emerald-600 font-bold">+{it.freeStrips}</span> : "0"}</div>
                      <div>Total Qty: <b className="text-sky-700 dark:text-sky-400">{it.qty}</b></div>
                      <div>Purchase: <b>{fmtCurrency(it.purchasePrice)}</b></div>
                      <div>Selling: <b>{fmtCurrency(it.sellingPrice)}</b></div>
                    </div>
                    <div className="flex items-center gap-4 text-[11px] text-slate-500 mt-1.5 pt-1 border-t border-slate-100 dark:border-slate-700">
                      <span>IGST: {it.igst}%</span>
                      <span>CGST: {it.cgst}%</span>
                      <span>SGST: {it.sgst}%</span>
                      <span className="font-medium text-slate-700 dark:text-slate-300">Total GST: {totalGst(it)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Financial Summary */}
            <div className="bg-sky-50 dark:bg-sky-950/40 border border-sky-100 dark:border-sky-900 rounded-xl p-3 text-xs space-y-1">
              <div className="flex justify-between"><span>Subtotal</span><span>{fmtCurrency(viewGrn.subtotal)}</span></div>
              {Number(viewGrn.agencyDiscountPct) > 0 && (
                <div className="flex justify-between text-rose-600">
                  <span>Agency Discount ({viewGrn.agencyDiscountPct}%)</span>
                  <span>- {fmtCurrency(viewGrn.agencyDiscountAmt || 0)}</span>
                </div>
              )}
              {Number(viewGrn.specialDiscount) > 0 && (
                <div className="flex justify-between text-rose-600">
                  <span>Special Discount</span>
                  <span>- {fmtCurrency(viewGrn.specialDiscount)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Total Tax Amount</span>
                <span>{fmtCurrency(viewGrn.taxAmount)}</span>
              </div>
              <div className="flex justify-between font-bold text-sm border-t border-sky-200 dark:border-sky-800 pt-2 mt-1">
                <span>Grand Total</span>
                <span className="text-sky-700 dark:text-sky-300 text-base">{fmtCurrency(viewGrn.total)}</span>
              </div>
            </div>

            {/* Developer Action Footer */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Status: Approved & Added to Inventory</span>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Button variant="secondary" size="sm" onClick={() => setViewGrn(null)}>Close</Button>
                <Button variant="secondary" size="sm" onClick={() => { const g = viewGrn; setViewGrn(null); openEdit(g); }}>
                  <Pencil className="w-3.5 h-3.5 text-amber-600" /> Edit (Dev)
                </Button>
                <Button variant="danger" size="sm" onClick={() => { const g = viewGrn; setViewGrn(null); setDeleteTarget(g); }}>
                  <Trash2 className="w-3.5 h-3.5" /> Delete (Dev)
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* ━━━━━━ Modal 2: Developer Edit Modal ━━━━━━ */}
      {editDraft && (
        <Modal open onClose={() => setEditDraft(null)} title={`Developer Edit — ${editDraft.number}`} size="lg">
          <div className="space-y-4">
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
              <div>
                <b>Developer Override:</b> You are editing an already-approved GRN. Updating quantities or prices can automatically sync with current inventory stock below.
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label>Supplier *</Label>
                <Select
                  value={editDraft.supplierId || data.suppliers.find((s) => s.name === editDraft.supplierName)?.id || ""}
                  onChange={(e) => {
                    const sup = data.suppliers.find((s) => s.id === e.target.value);
                    setEditDraft({ ...editDraft, supplierId: e.target.value, supplierName: sup?.name || editDraft.supplierName });
                  }}
                >
                  <option value="">Select supplier...</option>
                  {data.suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Invoice Number *</Label>
                <Input
                  value={editDraft.invoiceNumber}
                  onChange={(e) => setEditDraft({ ...editDraft, invoiceNumber: e.target.value })}
                />
              </div>
              <div>
                <Label>Purchase Date *</Label>
                <Input
                  type="date"
                  max={todayStr}
                  value={editDraft.date}
                  onChange={(e) => setEditDraft({ ...editDraft, date: e.target.value })}
                />
              </div>
            </div>

            {/* Line Items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="mb-0">Items ({editDraft.items.length})</Label>
                <Button size="sm" variant="secondary" onClick={addDraftItem}>
                  <Plus className="w-3.5 h-3.5" /> Add Item
                </Button>
              </div>

              <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {editDraft.items.map((it, i) => (
                  <div key={i} className="border border-slate-200 dark:border-slate-700 rounded-xl p-3 bg-slate-50 dark:bg-slate-800 relative">
                    <button
                      type="button"
                      onClick={() => removeDraftItem(i)}
                      className="absolute top-2 right-2 w-6 h-6 rounded-full bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-300 flex items-center justify-center hover:bg-rose-200 transition"
                      title="Remove item"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                    <div className="text-[11px] font-semibold text-slate-400 mb-2">ITEM #{i + 1}</div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
                      <div>
                        <Label className="text-[11px]">Medicine Name *</Label>
                        <Input value={it.name} onChange={(e) => updDraftItem(i, "name", e.target.value)} />
                      </div>
                      <div>
                        <Label className="text-[11px]">Batch *</Label>
                        <Input value={it.batch} onChange={(e) => updDraftItem(i, "batch", e.target.value)} />
                      </div>
                      <div>
                        <Label className="text-[11px]">Expiry *</Label>
                        <Input type="month" value={it.expiry} onChange={(e) => updDraftItem(i, "expiry", e.target.value)} />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-xs">
                      <div>
                        <Label className="text-[11px]">Strips</Label>
                        <Input type="number" min={0} value={it.strips} onChange={(e) => updDraftItem(i, "strips", Number(e.target.value))} />
                      </div>
                      <div>
                        <Label className="text-[11px]">Tabs/Strip</Label>
                        <Input type="number" min={1} value={it.tabsPerStrip} onChange={(e) => updDraftItem(i, "tabsPerStrip", Number(e.target.value))} />
                      </div>
                      <div>
                        <Label className="text-[11px]">Free Strips</Label>
                        <Input type="number" min={0} value={it.freeStrips} onChange={(e) => updDraftItem(i, "freeStrips", Number(e.target.value))} />
                      </div>
                      <div>
                        <Label className="text-[11px]">Total Qty</Label>
                        <Input type="number" min={0} value={it.qty} onChange={(e) => updDraftItem(i, "qty", Number(e.target.value))} />
                      </div>
                      <div>
                        <Label className="text-[11px]">Purchase Price</Label>
                        <Input type="number" step={0.01} value={it.purchasePrice} onChange={(e) => updDraftItem(i, "purchasePrice", Number(e.target.value))} />
                      </div>
                      <div>
                        <Label className="text-[11px]">Selling Price</Label>
                        <Input type="number" step={0.01} value={it.sellingPrice} onChange={(e) => updDraftItem(i, "sellingPrice", Number(e.target.value))} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Discounts & Recalculation */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Agency Discount (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={editDraft.agencyDiscountPct || 0}
                  onChange={(e) => setEditDraft({ ...editDraft, agencyDiscountPct: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Special Discount (₹)</Label>
                <Input
                  type="number"
                  min={0}
                  value={editDraft.specialDiscount || 0}
                  onChange={(e) => setEditDraft({ ...editDraft, specialDiscount: Number(e.target.value) })}
                />
              </div>
            </div>

            {/* Recalculated Preview */}
            {(() => {
              const preview = recalc(editDraft);
              return (
                <div className="bg-sky-50 dark:bg-sky-950/40 rounded-xl p-3 text-xs space-y-1">
                  <div className="flex justify-between"><span>Recalculated Subtotal:</span><span>{fmtCurrency(preview.subtotal)}</span></div>
                  <div className="flex justify-between"><span>Recalculated Tax:</span><span>{fmtCurrency(preview.taxAmount)}</span></div>
                  <div className="flex justify-between font-bold text-sm border-t border-sky-200 dark:border-sky-800 pt-1 mt-1">
                    <span>New Grand Total:</span>
                    <span className="text-sky-700 dark:text-sky-300">{fmtCurrency(preview.total)}</span>
                  </div>
                </div>
              );
            })()}

            {/* Inventory Synchronization Option */}
            <div className="p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={adjustStockOnEdit}
                  onChange={(e) => setAdjustStockOnEdit(e.target.checked)}
                  className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500"
                />
                <span>Automatically sync inventory stock based on quantity differences</span>
              </label>
              <p className="text-[11px] text-slate-400 mt-1 pl-6">
                When enabled, the net increase or decrease in quantities will be applied directly to current medicine inventory.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
              <Button variant="secondary" onClick={() => setEditDraft(null)}>Cancel</Button>
              <Button variant="primary" onClick={saveEdit}>Save Changes</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ━━━━━━ Modal 3: Developer Delete Modal ━━━━━━ */}
      {deleteTarget && (
        <Modal open onClose={() => setDeleteTarget(null)} title={`Confirm Purge — ${deleteTarget.number}`} size="md">
          <div className="space-y-4">
            <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-xl p-3.5 text-xs text-rose-800 dark:text-rose-300 flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 shrink-0 text-rose-600" />
              <div>
                <p className="font-bold text-sm text-rose-900 dark:text-rose-200">Permanently delete approved GRN?</p>
                <p className="mt-1">
                  This action is irreversible and restricted to the Developer role. GRN <b>{deleteTarget.number}</b> for <b>{deleteTarget.supplierName}</b> ({fmtCurrency(deleteTarget.total)}) will be purged.
                </p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={reverseStockOnDelete}
                  onChange={(e) => setReverseStockOnDelete(e.target.checked)}
                  className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500"
                />
                <span>Reverse inventory stock (deduct quantities added by this GRN)</span>
              </label>
              <p className="text-[11px] text-slate-400 mt-1 pl-6">
                If checked, the {deleteTarget.items.length} medicine batch quantities will be deducted from your current stock.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
              <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button variant="danger" onClick={confirmDelete}>Confirm Permanent Deletion</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
