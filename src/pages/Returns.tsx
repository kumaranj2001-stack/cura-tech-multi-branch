import React, { useState } from "react";
import { useStore, uid } from "../store/store";
import { Card, CardBody, Input, Label, Button, Th, Td, Modal, Badge, Select, EmptyState } from "../components/ui";
import { fmtDate, today } from "../utils/helpers";
import type { ReturnEntry } from "../store/types";

const Returns: React.FC = () => {
  const { data, setData, currentUser, log } = useStore();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"sales" | "purchase" | "short-expiry">("sales");
  const [medicineId, setMedicineId] = useState("");
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState("");
  const [refNumber, setRefNumber] = useState("");

  const submit = () => {
    const med = data.medicines.find((m) => m.id === medicineId);
    if (!med) { alert("Select medicine"); return; }
    if (qty <= 0) { alert("Qty must be > 0"); return; }
    const r: ReturnEntry = {
      id: uid("ret"),
      type,
      refNumber: refNumber || undefined,
      medicineId: med.id,
      medicineName: med.name,
      batch: med.batch,
      qty,
      reason,
      date: today(),
      createdBy: currentUser?.username || "unknown",
    };
    setData((d) => {
      // sales return = stock IN, purchase/short-expiry = stock OUT
      const delta = type === "sales" ? qty : -qty;
      const meds = d.medicines.map((m) => m.id === med.id ? { ...m, stock: Math.max(0, m.stock + delta) } : m);
      return { ...d, returns: [r, ...d.returns], medicines: meds };
    });
    log("RETURN_CREATE", `${type} return: ${med.name} ×${qty}`);
    setOpen(false);
    setQty(1); setReason(""); setRefNumber(""); setMedicineId("");
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="flex justify-between items-center">
          <div>
            <div className="font-semibold">Return Management</div>
            <div className="text-xs text-slate-500">Sales / Purchase / Short-expiry returns. Auto-updates stock.</div>
          </div>
          <Button onClick={() => setOpen(true)}>+ New Return</Button>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr><Th>Date</Th><Th>Type</Th><Th>Medicine</Th><Th>Batch</Th><Th>Qty</Th><Th>Ref</Th><Th>Reason</Th><Th>By</Th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.returns.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <Td>{fmtDate(r.date)}</Td>
                    <Td>
                      {r.type === "sales" && <Badge tone="green">SALES</Badge>}
                      {r.type === "purchase" && <Badge tone="blue">PURCHASE</Badge>}
                      {r.type === "short-expiry" && <Badge tone="amber">SHORT EXPIRY</Badge>}
                    </Td>
                    <Td>{r.medicineName}</Td>
                    <Td>{r.batch}</Td>
                    <Td>{r.qty}</Td>
                    <Td>{r.refNumber || "—"}</Td>
                    <Td>{r.reason || "—"}</Td>
                    <Td>{r.createdBy}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.returns.length === 0 && <EmptyState message="No returns recorded" />}
          </div>
        </CardBody>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="New Return">
        <div className="space-y-3">
          <div>
            <Label>Type</Label>
            <Select value={type} onChange={(e) => setType(e.target.value as "sales" | "purchase" | "short-expiry")}>
              <option value="sales">Sales Return (customer → +stock)</option>
              <option value="purchase">Purchase Return (to supplier → -stock)</option>
              <option value="short-expiry">Short Expiry Return (-stock)</option>
            </Select>
          </div>
          <div>
            <Label>Medicine</Label>
            <Select value={medicineId} onChange={(e) => setMedicineId(e.target.value)}>
              <option value="">Select...</option>
              {data.medicines.map((m) => <option key={m.id} value={m.id}>{m.name} — Batch {m.batch} (Stock {m.stock})</option>)}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Quantity</Label><Input type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value))} /></div>
            <div><Label>Reference (Invoice/GRN)</Label><Input value={refNumber} onChange={(e) => setRefNumber(e.target.value)} /></div>
          </div>
          <div><Label>Reason</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit}>Save Return</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Returns;
