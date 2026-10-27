import React, { useState } from "react";
import { useStore } from "../store/store";
import { Pencil, Plus, Trash2, Save } from "lucide-react";
import { Card, CardBody, Button, Th, Td, Badge, EmptyState, Modal, Input, Label, Select } from "../components/ui";
import { fmtCurrency, fmtDate } from "../utils/helpers";
import type { GRN as GRNType, Medicine, PurchaseItem } from "../store/types";
import { isOverseer } from "../store/types";

/* total GST for a purchase item */
const totalGst = (it: { igst: number; cgst: number; sgst: number }) => (it.igst || 0) + (it.cgst || 0) + (it.sgst || 0);

/* recompute GRN monetary totals from its items */
const recalc = (g: GRNType) => {
  const subtotal = g.items.reduce((s, i) => s + i.qty * i.purchasePrice, 0);
  const agencyDiscountAmt = (subtotal * (g.agencyDiscountPct || 0)) / 100;
  const afterAgency = Math.max(0, subtotal - agencyDiscountAmt - (g.specialDiscount || 0));
  const taxAmount = g.items.reduce((s, i) => {
    const itemTotal = i.qty * i.purchasePrice;
    const ratio = subtotal > 0 ? itemTotal / subtotal : 0;
    return s + (afterAgency * ratio * totalGst(i)) / 100;
  }, 0);
  return { subtotal, agencyDiscountAmt, taxAmount, total: afterAgency + taxAmount };
};

const emptyItem = (): PurchaseItem => ({
  name: "", batch: "", qty: 0, strips: 0, tabsPerStrip: 10, freeStrips: 0,
  purchasePrice: 0, sellingPrice: 0, expiry: "", igst: 0, cgst: 6, sgst: 6,
});

const GRN: React.FC = () => {
  const { data, setData, currentUser, log } = useStore();
  const [view, setView] = useState<GRNType | null>(null);
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [draft, setDraft] = useState<GRNType | null>(null);

  const openEdit = (g: GRNType) => {
    if (!isAdmin || g.status !== "pending") return;
    setDraft(JSON.parse(JSON.stringify(g)) as GRNType);
  };

  const updItem = (i: number, key: keyof PurchaseItem, v: string | number) => {
    if (!draft) return;
    const items = [...draft.items];
    items[i] = { ...items[i], [key]: v };
    if (key === "strips" || key === "tabsPerStrip") {
      items[i].qty = (Number(items[i].strips) || 0) * (Number(items[i].tabsPerStrip) || 0);
    }
    setDraft({ ...draft, items });
  };

  const addItem = () => draft && setDraft({ ...draft, items: [...draft.items, emptyItem()] });
  const rmItem = (i: number) => draft && setDraft({ ...draft, items: draft.items.filter((_, x) => x !== i) });

  const today = new Date().toISOString().slice(0, 10);

  const saveEdit = () => {
    if (!draft) return;
    if (!draft.supplierName.trim() || !draft.invoiceNumber.trim()) return alert("Supplier and invoice number are required");
    if (!draft.date) return alert("Purchase date is required");
    if (draft.date > today) return alert("Purchase date cannot be in the future");
    if (draft.items.length === 0) return alert("At least one item is required");
    if (draft.items.some((i) => !i.name.trim() || !i.batch.trim() || !i.expiry || i.qty <= 0)) {
      return alert("Every item needs a name, batch, expiry and quantity above 0");
    }
    const finalGrn: GRNType = {
      ...draft,
      supplierName: draft.supplierName.trim(),
      invoiceNumber: draft.invoiceNumber.trim(),
      ...recalc(draft),
    };
    setData((d) => ({ ...d, grns: d.grns.map((x) => (x.id === finalGrn.id ? finalGrn : x)) }));
    log("GRN_EDIT", `${finalGrn.number} edited by admin before approval`);
    setDraft(null);
    setView(finalGrn);
  };

  const isAdmin = currentUser?.role === "admin" || isOverseer(currentUser?.role);
  const pending = data.grns.filter((g) => g.status === "pending");
  const history = data.grns.filter((g) => g.status !== "pending");

  const approve = (g: GRNType) => {
    if (!isAdmin) return;
    if (!confirm(`Approve ${g.number}? This will update inventory stock.`)) return;
    setData((d) => {
      const meds = [...d.medicines];
      g.items.forEach((it) => {
        const tps = it.tabsPerStrip || 1;
        const addQty = it.qty + (it.freeStrips || 0) * tps;
        const gst = totalGst(it);
        const idx = meds.findIndex((m) => m.name.toLowerCase() === it.name.toLowerCase() && m.batch === it.batch);
        if (idx >= 0) {
          meds[idx] = {
            ...meds[idx],
            stock: meds[idx].stock + addQty,
            purchasePrice: it.purchasePrice,
            sellingPrice: it.sellingPrice,
            expiry: it.expiry,
            gst,
            supplier: g.supplierName,
          };
        } else {
          const newM: Medicine = {
            id: "m_" + Date.now() + Math.random().toString(36).slice(2, 5),
            name: it.name,
            batch: it.batch,
            stock: addQty,
            purchasePrice: it.purchasePrice,
            sellingPrice: it.sellingPrice,
            expiry: it.expiry,
            gst,
            supplier: g.supplierName,
          };
          meds.push(newM);
        }
      });
      return {
        ...d,
        medicines: meds,
        grns: d.grns.map((x) =>
          x.id === g.id
            ? { ...x, status: "approved" as const, approvedBy: currentUser?.username, approvedAt: new Date().toISOString() }
            : x
        ),
      };
    });
    log("GRN_APPROVE", `${g.number} — stock updated for ${g.items.length} item(s)`);
    setView(null);
  };

  const submitReject = (g: GRNType) => {
    if (!isAdmin) return;
    if (!rejectReason.trim()) return alert("Please enter a rejection reason");
    setData((d) => ({
      ...d,
      grns: d.grns.map((x) =>
        x.id === g.id
          ? { ...x, status: "rejected" as const, approvedBy: currentUser?.username, approvedAt: new Date().toISOString(), rejectedReason: rejectReason.trim() }
          : x
      ),
    }));
    log("GRN_REJECT", `${g.number} — ${rejectReason.trim()}`);
    setRejectMode(false);
    setRejectReason("");
    setView(null);
  };

  /* Render a single GRN row for the desktop table */
  const Row: React.FC<{ g: GRNType }> = ({ g }) => (
    <tr className="hover:bg-slate-50">
      <Td className="font-semibold text-sky-700">{g.number}</Td>
      <Td>{fmtDate(g.date)}</Td>
      <Td>{g.supplierName}</Td>
      <Td>
        <div className="flex items-center gap-1.5">
          <span>{g.invoiceNumber}</span>
          {g.aiExtracted && (
            <Badge tone="blue" title={`AI Parsed (${g.modelUsed || "Multimodal LLM"})`}>
              AI
            </Badge>
          )}
        </div>
      </Td>
      <Td>{g.items.length}</Td>
      <Td className="font-semibold">{fmtCurrency(g.total)}</Td>
      <Td>
        {g.status === "pending" && <Badge tone="amber">PENDING</Badge>}
        {g.status === "approved" && <Badge tone="green">APPROVED</Badge>}
        {g.status === "rejected" && <Badge tone="red">REJECTED</Badge>}
      </Td>
      <Td>{g.createdBy}</Td>
      <Td>
        <div className="flex gap-1.5">
          <Button size="sm" variant="secondary" onClick={() => { setView(g); setRejectMode(false); setRejectReason(""); }}>
            👁 View
          </Button>
          {isAdmin && g.status === "pending" && (
            <Button size="sm" variant="ghost" onClick={() => openEdit(g)} title="Edit GRN (admin only)">
              <Pencil className="w-4 h-4" />
            </Button>
          )}
        </div>
      </Td>
    </tr>
  );

  /* Render a GRN card for mobile */
  const MobileCard: React.FC<{ g: GRNType }> = ({ g }) => (
    <Card>
      <CardBody className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-sky-700">{g.number}</span>
          {g.status === "pending" && <Badge tone="amber">PENDING</Badge>}
          {g.status === "approved" && <Badge tone="green">APPROVED</Badge>}
          {g.status === "rejected" && <Badge tone="red">REJECTED</Badge>}
        </div>
        <div className="text-sm text-slate-600 space-y-0.5">
          <div><span className="text-slate-400">Supplier:</span> {g.supplierName}</div>
          <div>
            <span className="text-slate-400">Invoice:</span> {g.invoiceNumber} · {fmtDate(g.date)}
            {g.aiExtracted && (
              <span className="ml-1.5"><Badge tone="blue">AI</Badge></span>
            )}
          </div>
          <div><span className="text-slate-400">Items:</span> {g.items.length} · <span className="text-slate-400">By:</span> {g.createdBy}</div>
        </div>
        <div className="flex items-center justify-between pt-1 border-t border-slate-100">
          <span className="font-bold text-sky-700">{fmtCurrency(g.total)}</span>
          <div className="flex gap-1.5">
            {isAdmin && g.status === "pending" && (
              <Button size="sm" variant="ghost" onClick={() => openEdit(g)} title="Edit GRN (admin only)">
                <Pencil className="w-4 h-4" />
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={() => { setView(g); setRejectMode(false); setRejectReason(""); }}>👁 View</Button>
          </div>
        </div>
      </CardBody>
    </Card>
  );

  /* Section renderer for both pending and history */
  const Section: React.FC<{ title: string; grns: GRNType[]; tone: "amber" | "slate" }> = ({ title, grns: list, tone }) => (
    <Card>
      <CardBody className="p-0">
        <div className="px-5 py-3 border-b border-slate-200 font-semibold flex items-center justify-between">
          <span>{title}</span>
          <Badge tone={tone}>{list.length}</Badge>
        </div>
        {/* Mobile */}
        <div className="lg:hidden p-3 space-y-3">
          {list.length === 0 && <EmptyState message={`No ${title.toLowerCase()}`} />}
          {list.map((g) => <MobileCard key={g.id} g={g} />)}
        </div>
        {/* Desktop */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr><Th>GRN</Th><Th>Date</Th><Th>Supplier</Th><Th>Invoice</Th><Th>Items</Th><Th>Total</Th><Th>Status</Th><Th>By</Th><Th>Action</Th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">{list.map((g) => <Row key={g.id} g={g} />)}</tbody>
          </table>
          {list.length === 0 && <EmptyState message={`No ${title.toLowerCase()}`} />}
        </div>
      </CardBody>
    </Card>
  );

  return (
    <div className="space-y-4">
      {!isAdmin && (
        <Card><CardBody className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg">⚠️ Only Admin can approve/reject GRN entries.</CardBody></Card>
      )}

      <Section title="Pending Approvals" grns={pending} tone="amber" />
      <Section title="History" grns={history} tone="slate" />

      {/* ━━━━━━ View / Review Modal ━━━━━━ */}
      <Modal open={!!view} onClose={() => { setView(null); setRejectMode(false); }} title={`Review GRN — ${view?.number}`} size="lg">
        {view && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm bg-slate-50 p-3 rounded">
              <div><b>Supplier:</b><br />{view.supplierName}</div>
              <div><b>Invoice #:</b><br />{view.invoiceNumber}</div>
              <div><b>Date:</b><br />{fmtDate(view.date)}</div>
              <div><b>Created by:</b><br />{view.createdBy}</div>
              <div><b>Status:</b><br />
                {view.status === "pending" && <Badge tone="amber">PENDING</Badge>}
                {view.status === "approved" && <Badge tone="green">APPROVED</Badge>}
                {view.status === "rejected" && <Badge tone="red">REJECTED</Badge>}
              </div>
              {view.approvedBy && <div><b>Action by:</b><br />{view.approvedBy}<br /><span className="text-xs text-slate-500">{view.approvedAt && fmtDate(view.approvedAt)}</span></div>}
            </div>

            {view.attachedInvoiceName && (
              <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg p-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-emerald-800 dark:text-emerald-300">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">📄 Attached Supplier Invoice:</span>
                  <span className="font-mono">{view.attachedInvoiceName}</span>
                </div>
                <Badge tone="green">{view.modelUsed ? `AI Parsed (${view.modelUsed})` : "AI Parsed"}</Badge>
              </div>
            )}

            {/* Items — card based */}
            <div>
              <div className="font-semibold text-sm mb-2">Items ({view.items.length})</div>
              <div className="space-y-2">
                {view.items.map((it, idx) => (
                  <div key={idx} className="border border-slate-200 rounded-lg p-3 bg-white text-sm">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="font-semibold text-slate-800">{it.name}</div>
                        <div className="text-xs text-slate-500">Batch: {it.batch} · Expiry: {it.expiry}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-sky-700">{fmtCurrency(it.qty * it.purchasePrice)}</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-x-3 gap-y-1 text-xs">
                      <div><span className="text-slate-400">Strips:</span> <b>{it.strips}</b></div>
                      <div><span className="text-slate-400">Tabs/Strip:</span> <b>{it.tabsPerStrip}</b></div>
                      <div><span className="text-slate-400">Free:</span> {it.freeStrips > 0 ? <Badge tone="green">+{it.freeStrips}</Badge> : "0"}</div>
                      <div><span className="text-slate-400">Total Qty:</span> <b className="text-sky-700">{it.qty}</b></div>
                      <div><span className="text-slate-400">Buy:</span> {fmtCurrency(it.purchasePrice)}</div>
                      <div><span className="text-slate-400">Sell:</span> {fmtCurrency(it.sellingPrice)}</div>
                    </div>
                    <div className="grid grid-cols-3 gap-x-3 text-xs mt-1 pt-1 border-t border-slate-100">
                      <div><span className="text-slate-400">IGST:</span> <b>{it.igst}%</b></div>
                      <div><span className="text-slate-400">CGST:</span> <b>{it.cgst}%</b></div>
                      <div><span className="text-slate-400">SGST:</span> <b>{it.sgst}%</b></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Totals */}
            <div className="bg-sky-50 rounded-lg p-3 text-sm space-y-1">
              <div className="flex justify-between"><span>Subtotal</span><span>{fmtCurrency(view.subtotal)}</span></div>
              <div className="flex justify-between text-rose-600"><span>Agency Discount ({view.agencyDiscountPct}%)</span><span>- {fmtCurrency(view.agencyDiscountAmt)}</span></div>
              <div className="flex justify-between text-rose-600"><span>Special Discount</span><span>- {fmtCurrency(view.specialDiscount)}</span></div>
              <div className="flex justify-between"><span>Tax (IGST+CGST+SGST)</span><span>{fmtCurrency(view.taxAmount)}</span></div>
              <div className="flex justify-between font-bold text-base border-t border-sky-200 pt-2 mt-1"><span>Grand Total</span><span className="text-sky-700">{fmtCurrency(view.total)}</span></div>
              <div className="text-xs text-slate-500 pt-1">
                Total Free Strips: <b>{view.items.reduce((s, i) => s + (i.freeStrips || 0), 0)}</b> · Total Strips: <b>{view.items.reduce((s, i) => s + (i.strips || 0), 0)}</b>
              </div>
            </div>

            {view.rejectedReason && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded p-3"><b>Rejection reason:</b> {view.rejectedReason}</div>
            )}

            {/* Approve / Reject — admin only, pending only */}
            {isAdmin && view.status === "pending" && (
              <div className="border-t border-slate-200 pt-3">
                {!rejectMode ? (
                  <div className="flex flex-col sm:flex-row gap-2 justify-end">
                    <Button variant="secondary" onClick={() => setView(null)} className="w-full sm:w-auto">Close</Button>
                    <Button variant="secondary" onClick={() => openEdit(view)} className="w-full sm:w-auto">
                      <Pencil className="w-4 h-4" /> Edit GRN
                    </Button>
                    <Button variant="danger" onClick={() => setRejectMode(true)} className="w-full sm:w-auto">✗ Reject</Button>
                    <Button variant="success" onClick={() => approve(view)} className="w-full sm:w-auto">✓ Approve & Update Stock</Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label>Rejection Reason *</Label>
                    <Input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Why is this GRN being rejected?" autoFocus />
                    <div className="flex flex-col sm:flex-row justify-end gap-2">
                      <Button variant="ghost" onClick={() => { setRejectMode(false); setRejectReason(""); }} className="w-full sm:w-auto">Cancel</Button>
                      <Button variant="danger" onClick={() => submitReject(view)} className="w-full sm:w-auto">Confirm Rejection</Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ━━━━━━ Edit GRN Modal — admin only, pending only ━━━━━━ */}
      {draft && (
        <Modal open onClose={() => setDraft(null)} title={`Edit GRN — ${draft.number}`} size="lg">
          <div className="space-y-4">
            <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
              Admin edit — changes apply before approval. Stock updates only when the GRN is approved.
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label>Supplier *</Label>
                <Select
                  value={draft.supplierId || data.suppliers.find((s) => s.name === draft.supplierName)?.id || ""}
                  onChange={(e) => {
                    const sup = data.suppliers.find((s) => s.id === e.target.value);
                    setDraft({ ...draft, supplierId: e.target.value, supplierName: sup?.name || draft.supplierName });
                  }}
                >
                  <option value="">Select supplier...</option>
                  {data.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </div>
              <div><Label>Invoice Number *</Label><Input value={draft.invoiceNumber} onChange={(e) => setDraft({ ...draft, invoiceNumber: e.target.value })} /></div>
              <div><Label>Purchase Date *</Label><Input type="date" max={today} value={draft.date} onChange={(e) => { const v = e.target.value; if (v > today) return alert("Purchase date cannot be in the future"); setDraft({ ...draft, date: v }); }} /></div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="mb-0">Items ({draft.items.length})</Label>
                <Button size="sm" variant="secondary" onClick={addItem}><Plus className="w-4 h-4" /> Add Item</Button>
              </div>
              <div className="space-y-3">
                {draft.items.map((it, i) => (
                  <div key={i} className="border border-slate-200 dark:border-slate-600 rounded-xl p-3 bg-slate-50/60 dark:bg-slate-700/30 relative">
                    <button type="button" onClick={() => rmItem(i)} className="absolute top-2 right-2 w-6 h-6 rounded-full bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-300 flex items-center justify-center hover:bg-rose-200 transition" title="Remove item">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <div className="text-[11px] font-semibold text-slate-400 mb-2">ITEM #{i + 1}</div>

                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <div><Label>Medicine *</Label><Input value={it.name} onChange={(e) => updItem(i, "name", e.target.value)} /></div>
                      <div><Label>Batch *</Label><Input value={it.batch} onChange={(e) => updItem(i, "batch", e.target.value)} /></div>
                    </div>

                    <div className="grid grid-cols-4 gap-2 mb-2">
                      <div><Label>Strips *</Label><Input type="number" min={0} value={it.strips} onChange={(e) => updItem(i, "strips", Number(e.target.value))} /></div>
                      <div><Label>Tabs/Strip *</Label><Input type="number" min={0} value={it.tabsPerStrip} onChange={(e) => updItem(i, "tabsPerStrip", Number(e.target.value))} /></div>
                      <div><Label>Free Strips</Label><Input type="number" min={0} value={it.freeStrips} onChange={(e) => updItem(i, "freeStrips", Number(e.target.value))} /></div>
                      <div><Label>Total Qty</Label><div className="px-3 py-2 bg-sky-100 dark:bg-sky-900/40 text-sky-800 dark:text-sky-300 font-bold rounded-lg text-center text-sm tabular-nums">{it.qty}</div></div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 mb-2">
                      <div><Label>Buy ₹/unit</Label><Input type="number" step="0.01" min={0} value={it.purchasePrice} onChange={(e) => updItem(i, "purchasePrice", Number(e.target.value))} /></div>
                      <div><Label>Sell ₹/unit</Label><Input type="number" step="0.01" min={0} value={it.sellingPrice} onChange={(e) => updItem(i, "sellingPrice", Number(e.target.value))} /></div>
                      <div><Label>Expiry *</Label><Input type="date" value={it.expiry} onChange={(e) => updItem(i, "expiry", e.target.value)} /></div>
                    </div>

                    <div className="grid grid-cols-4 gap-2">
                      <div><Label>IGST %</Label><Input type="number" step="0.01" min={0} value={it.igst} onChange={(e) => updItem(i, "igst", Number(e.target.value))} /></div>
                      <div><Label>CGST %</Label><Input type="number" step="0.01" min={0} value={it.cgst} onChange={(e) => updItem(i, "cgst", Number(e.target.value))} /></div>
                      <div><Label>SGST %</Label><Input type="number" step="0.01" min={0} value={it.sgst} onChange={(e) => updItem(i, "sgst", Number(e.target.value))} /></div>
                      <div><Label>Line Total</Label><div className="px-3 py-2 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 font-bold rounded-lg text-center text-sm tabular-nums">{fmtCurrency(it.qty * it.purchasePrice)}</div></div>
                    </div>
                  </div>
                ))}
                {draft.items.length === 0 && (
                  <div className="border-2 border-dashed border-slate-200 dark:border-slate-600 rounded-xl p-6 text-center text-sm text-slate-400">No items — add at least one.</div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 dark:bg-slate-700/30 p-3 rounded-lg">
              <div><Label>Agency Discount (%)</Label><Input type="number" min={0} max={100} step="0.01" value={draft.agencyDiscountPct} onChange={(e) => setDraft({ ...draft, agencyDiscountPct: Number(e.target.value) })} /></div>
              <div><Label>Special Discount (₹)</Label><Input type="number" min={0} step="0.01" value={draft.specialDiscount} onChange={(e) => setDraft({ ...draft, specialDiscount: Number(e.target.value) })} /></div>
            </div>

            {(() => {
              const t = recalc(draft);
              return (
                <div className="bg-sky-50 dark:bg-sky-900/20 rounded-lg p-3 text-sm space-y-1">
                  <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-300">Subtotal</span><span className="font-medium tabular-nums">{fmtCurrency(t.subtotal)}</span></div>
                  <div className="flex justify-between text-rose-600"><span>Agency Discount ({draft.agencyDiscountPct}%)</span><span className="tabular-nums">- {fmtCurrency(t.agencyDiscountAmt)}</span></div>
                  <div className="flex justify-between text-rose-600"><span>Special Discount</span><span className="tabular-nums">- {fmtCurrency(draft.specialDiscount)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-300">Tax (IGST+CGST+SGST)</span><span className="tabular-nums">{fmtCurrency(t.taxAmount)}</span></div>
                  <div className="flex justify-between text-lg font-bold border-t border-sky-200 dark:border-sky-800 pt-2 mt-1"><span>Grand Total</span><span className="text-sky-700 dark:text-sky-300 tabular-nums">{fmtCurrency(t.total)}</span></div>
                </div>
              );
            })()}

            <div className="flex flex-col sm:flex-row justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={() => setDraft(null)} className="w-full sm:w-auto">Cancel</Button>
              <Button onClick={saveEdit} className="w-full sm:w-auto"><Save className="w-4 h-4" /> Save Changes</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default GRN;
