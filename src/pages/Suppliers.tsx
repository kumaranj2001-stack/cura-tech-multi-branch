import React, { useState } from "react";
import { useStore, uid } from "../store/store";
import { Pencil, Trash2, Building2, BadgeCheck } from "lucide-react";
import { Card, CardBody, Input, Label, Button, Th, Td, Modal, EmptyState } from "../components/ui";
import { fmtCurrency } from "../utils/helpers";
import { sanitizeText } from "../utils/security";
import type { Supplier } from "../store/types";

const Suppliers: React.FC = () => {
  const { data, setData, log, currentUser } = useStore();
  const canManageSuppliers = currentUser?.role === "superadmin" || currentUser?.role === "developer";
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Supplier | null>(null);
  const [form, setForm] = useState({ name: "", contact: "", email: "", address: "", gstNumber: "", diNumber: "" });

  const purchaseTotalForSupplier = (id: string) =>
    data.grns.filter((g) => g.supplierId === id && g.status === "approved").reduce((s, g) => s + g.total, 0);

  const openNew = () => {
    setEdit(null);
    setForm({ name: "", contact: "", email: "", address: "", gstNumber: "", diNumber: "" });
    setOpen(true);
  };

  const openEdit = (s: Supplier) => {
    if (!canManageSuppliers) {
      alert("Access restricted: Only Super Admin and Developer accounts can edit suppliers.");
      return;
    }
    setEdit(s);
    setForm({
      name: s.name,
      contact: s.contact,
      email: s.email || "",
      address: s.address || "",
      gstNumber: s.gstNumber || "",
      diNumber: s.diNumber || "",
    });
    setOpen(true);
  };

  const save = () => {
    if (edit && !canManageSuppliers) {
      alert("Access restricted: Only Super Admin and Developer accounts can edit suppliers.");
      return;
    }
    const name = sanitizeText(form.name, 100);
    if (!name) return alert("Name required");
    const clean = {
      ...form,
      name,
      contact: sanitizeText(form.contact, 30),
      email: sanitizeText(form.email, 100),
      address: sanitizeText(form.address, 200),
      gstNumber: sanitizeText(form.gstNumber, 20).toUpperCase(),
      diNumber: sanitizeText(form.diNumber, 40).toUpperCase(),
    };
    if (edit) {
      setData((d) => ({ ...d, suppliers: d.suppliers.map((x) => (x.id === edit.id ? { ...x, ...clean } : x)) }));
      log("SUPPLIER_UPDATE", name);
    } else {
      const ns: Supplier = { id: uid("s"), branchId: undefined, ...clean };
      setData((d) => ({ ...d, suppliers: [ns, ...d.suppliers] }));
      log("SUPPLIER_CREATE", name);
    }
    setOpen(false);
  };

  const remove = (s: Supplier) => {
    if (!canManageSuppliers) {
      alert("Access restricted: Only Super Admin and Developer accounts can delete suppliers.");
      return;
    }
    if (!confirm(`Delete ${s.name}?`)) return;
    setData((d) => ({ ...d, suppliers: d.suppliers.filter((x) => x.id !== s.id) }));
    log("SUPPLIER_DELETE", s.name);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="flex justify-end"><Button onClick={openNew}>+ New Supplier</Button></CardBody>
      </Card>

      {/* Mobile cards */}
      <div className="lg:hidden space-y-3">
        {data.suppliers.length === 0 && <Card><CardBody><EmptyState message="No suppliers" /></CardBody></Card>}
        {data.suppliers.map((s) => (
          <Card key={s.id}>
            <CardBody className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 flex items-center justify-center shrink-0">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-800 dark:text-slate-200 truncate">{s.name}</div>
                    <div className="text-xs text-slate-500">{s.contact}{s.email ? ` · ${s.email}` : ""}</div>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!canManageSuppliers}
                    onClick={() => canManageSuppliers && openEdit(s)}
                    title={canManageSuppliers ? "Edit supplier" : "Edit restricted: Super Admin / Developer only"}
                    className={!canManageSuppliers ? "opacity-40 cursor-not-allowed" : ""}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!canManageSuppliers}
                    onClick={() => canManageSuppliers && remove(s)}
                    title={canManageSuppliers ? "Delete supplier" : "Delete restricted: Super Admin / Developer only"}
                    className={!canManageSuppliers ? "opacity-40 cursor-not-allowed" : "text-rose-600 hover:text-rose-700"}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-slate-50 dark:bg-slate-700/40 px-2.5 py-1.5 flex items-center gap-1.5">
                  <BadgeCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="text-slate-500">GST:</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-200 truncate">{s.gstNumber || "—"}</span>
                </div>
                <div className="rounded-lg bg-slate-50 dark:bg-slate-700/40 px-2.5 py-1.5 flex items-center gap-1.5">
                  <BadgeCheck className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                  <span className="text-slate-500">DI No:</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-200 truncate">{s.diNumber || "—"}</span>
                </div>
              </div>
              {s.address && <div className="text-xs text-slate-500">{s.address}</div>}
              <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-700 text-sm">
                <span className="text-slate-500">Total purchases</span>
                <span className="font-bold text-sky-700">{fmtCurrency(purchaseTotalForSupplier(s.id))}</span>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      {/* Desktop table */}
      <Card className="hidden lg:block">
        <CardBody className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr><Th>Name</Th><Th>Contact</Th><Th>GST No.</Th><Th>DI No.</Th><Th>Address</Th><Th>Total Purchases</Th><Th></Th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.suppliers.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                    <Td>
                      <div className="font-medium">{s.name}</div>
                      {s.email && <div className="text-xs text-slate-500">{s.email}</div>}
                    </Td>
                    <Td>{s.contact}</Td>
                    <Td>
                      {s.gstNumber ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-full px-2 py-0.5">
                          <BadgeCheck className="w-3.5 h-3.5" />{s.gstNumber}
                        </span>
                      ) : <span className="text-slate-400">—</span>}
                    </Td>
                    <Td>
                      {s.diNumber ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-full px-2 py-0.5">
                          <BadgeCheck className="w-3.5 h-3.5" />{s.diNumber}
                        </span>
                      ) : <span className="text-slate-400">—</span>}
                    </Td>
                    <Td>{s.address || "—"}</Td>
                    <Td className="font-semibold">{fmtCurrency(purchaseTotalForSupplier(s.id))}</Td>
                    <Td className="space-x-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={!canManageSuppliers}
                        onClick={() => canManageSuppliers && openEdit(s)}
                        title={canManageSuppliers ? "Edit supplier" : "Edit restricted: Super Admin / Developer only"}
                        className={!canManageSuppliers ? "opacity-40 cursor-not-allowed" : ""}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={!canManageSuppliers}
                        onClick={() => canManageSuppliers && remove(s)}
                        title={canManageSuppliers ? "Delete supplier" : "Delete restricted: Super Admin / Developer only"}
                        className={!canManageSuppliers ? "opacity-40 cursor-not-allowed" : "text-rose-600 hover:text-rose-700"}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.suppliers.length === 0 && <EmptyState message="No suppliers" />}
          </div>
        </CardBody>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title={edit ? "Edit Supplier" : "New Supplier"}>
        <div className="space-y-3">
          <div><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Supplier / agency name" /></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><Label>Contact</Label><Input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} placeholder="Phone" /></div>
            <div><Label>Email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@supplier.com" /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>GST Number (GSTIN)</Label>
              <Input value={form.gstNumber} onChange={(e) => setForm({ ...form, gstNumber: e.target.value.toUpperCase() })} placeholder="22AAAAA0000A1Z5" maxLength={20} />
              <p className="text-[11px] text-slate-400 mt-1">15-character GSTIN — auto-uppercased</p>
            </div>
            <div>
              <Label>DI / Drug License No.</Label>
              <Input value={form.diNumber} onChange={(e) => setForm({ ...form, diNumber: e.target.value.toUpperCase() })} placeholder="e.g. 21B/2024/DL" maxLength={40} />
              <p className="text-[11px] text-slate-400 mt-1">Drug license issued to the supplier</p>
            </div>
          </div>
          <div><Label>Address</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Street, city" /></div>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save}>{edit ? "Update Supplier" : "Save Supplier"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Suppliers;
