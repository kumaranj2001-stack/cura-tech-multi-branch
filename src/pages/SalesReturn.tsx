import React, { useState, useMemo } from "react";
import { useStore, uid } from "../store/store";
import { Card, CardBody, Input, Label, Button, Th, Td, Modal, Badge, Select, EmptyState } from "../components/ui";
import { fmtDate, today } from "../utils/helpers";
import type { ReturnEntry } from "../store/types";

const SalesReturn: React.FC = () => {
  const { data, setData, currentUser, log } = useStore();
  const [open, setOpen] = useState(false);
  const [medicineId, setMedicineId] = useState("");
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState("");
  const [refNumber, setRefNumber] = useState("");
  const [q, setQ] = useState("");

  const submit = () => {
    const med = data.medicines.find((m) => m.id === medicineId);
    if (!med) return alert("Select a medicine");
    if (qty <= 0) return alert("Quantity must be greater than 0");
    if (!reason.trim()) return alert("Please enter a reason for the return");

    const r: ReturnEntry = {
      id: uid("ret"),
      type: "sales",
      refNumber: refNumber.trim() || undefined,
      medicineId: med.id,
      medicineName: med.name,
      batch: med.batch,
      qty,
      reason: reason.trim(),
      date: today(),
      createdBy: currentUser?.username || "unknown",
    };
    setData((d) => ({
      ...d,
      returns: [r, ...d.returns],
      // sales return → stock comes back IN
      medicines: d.medicines.map((m) => (m.id === med.id ? { ...m, stock: m.stock + qty } : m)),
    }));
    log("SALES_RETURN_CREATE", `${med.name} ×${qty} (${reason.trim()})`);
    setOpen(false);
    setMedicineId(""); setQty(1); setReason(""); setRefNumber("");
  };

  // Show only sales returns
  const salesReturns = useMemo(
    () => data.returns.filter((r) => r.type === "sales").filter((r) => {
      if (!q) return true;
      const ql = q.toLowerCase();
      return r.medicineName.toLowerCase().includes(ql) || (r.refNumber || "").toLowerCase().includes(ql);
    }),
    [data.returns, q]
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center">
          <div>
            <div className="font-semibold text-slate-800">Sales Returns</div>
            <div className="text-xs text-slate-500">Record medicines returned by customers. Stock will be added back automatically.</div>
          </div>
          <Button onClick={() => setOpen(true)}>+ New Sales Return</Button>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="p-0">
          <div className="px-4 py-3 border-b border-slate-100">
            <Input placeholder="Search by medicine or invoice ref..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <Th>Date</Th><Th>Medicine</Th><Th>Batch</Th><Th>Qty Returned</Th>
                  <Th>Invoice Ref</Th><Th>Reason</Th><Th>By</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {salesReturns.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <Td>{fmtDate(r.date)}</Td>
                    <Td className="font-medium">{r.medicineName}</Td>
                    <Td>{r.batch}</Td>
                    <Td><Badge tone="green">+{r.qty}</Badge></Td>
                    <Td>{r.refNumber || "—"}</Td>
                    <Td className="text-slate-600">{r.reason}</Td>
                    <Td>{r.createdBy}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
            {salesReturns.length === 0 && <EmptyState message="No sales returns recorded yet" />}
          </div>
        </CardBody>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="New Sales Return">
        <div className="space-y-3">
          <div>
            <Label>Medicine *</Label>
            <Select value={medicineId} onChange={(e) => setMedicineId(e.target.value)}>
              <option value="">Select medicine...</option>
              {data.medicines.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} — Batch {m.batch} (Current Stock: {m.stock})
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Quantity Returned *</Label>
              <Input type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value))} />
            </div>
            <div>
              <Label>Invoice Reference (optional)</Label>
              <Input value={refNumber} onChange={(e) => setRefNumber(e.target.value)} placeholder="e.g. INV-1001" />
            </div>
          </div>
          <div>
            <Label>Reason *</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Wrong medicine, damaged, customer request" />
          </div>
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-lg p-3">
            ℹ️ On submission, <b>{qty || 0}</b> unit(s) will be added back to stock.
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit}>Submit Return</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default SalesReturn;
