import React, { useState } from "react";
import { useStore, uid } from "../store/store";
import { Card, CardBody, Input, Textarea, Label, Button, Modal, Badge, EmptyState } from "../components/ui";
import type { Branch } from "../store/types";
import { isOverseer, planAllowsMultiBranch } from "../store/types";

const Branches: React.FC = () => {
  const { data, setData, currentUser, log, staffPlan, customStaffPlanLimits } = useStore();
  const canCreateBranch = planAllowsMultiBranch(staffPlan, customStaffPlanLimits);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Branch | null>(null);
  const [form, setForm] = useState({ name: "", code: "", storeName: "", address: "", gstNumber: "", phone: "", active: true });

  if (!isOverseer(currentUser?.role)) {
    return <Card><CardBody className="text-center text-slate-500 dark:text-slate-400 py-12">⛔ Developer access required</CardBody></Card>;
  }

  const openNew = () => {
    if (!canCreateBranch) {
      alert("New branches are available only on the Full roster plan (Option 4).");
      return;
    }
    setEdit(null);
    setForm({ name: "", code: "", storeName: "", address: "", gstNumber: "", phone: "", active: true });
    setOpen(true);
  };

  const openEdit = (b: Branch) => {
    setEdit(b);
    setForm({ name: b.name, code: b.code, storeName: b.storeName || "", address: b.address || "", gstNumber: b.gstNumber || "", phone: b.phone || "", active: b.active });
    setOpen(true);
  };

  const save = () => {
    if (!form.name.trim() || !form.code.trim()) {
      alert("Branch name and code are required");
      return;
    }
    if (edit) {
      setData((d) => ({
        ...d,
        branches: d.branches.map((b) => (b.id === edit.id ? { ...b, ...form } : b)),
      }));
      log("BRANCH_UPDATE", form.name);
    } else {
      if (!canCreateBranch) {
        alert("New branches are available only on the Full roster plan (Option 4).");
        return;
      }
      if (data.branches.find((b) => b.code === form.code)) {
        alert("Branch code already exists");
        return;
      }
      const nb: Branch = {
        id: uid("br"),
        createdAt: new Date().toISOString(),
        ...form,
      };
      setData((d) => ({ ...d, branches: [...d.branches, nb] }));
      log("BRANCH_CREATE", form.name);
    }
    setOpen(false);
  };

  const toggleActive = (b: Branch) => {
    // No primary branch — but never lock out assigned users or yourself
    if (b.id === currentUser?.branchId) {
      alert("Cannot deactivate your own branch");
      return;
    }
    const branchUsers = data.users.filter((u) => u.branchId === b.id && u.active);
    if (b.active && branchUsers.length > 0) {
      alert(`Cannot deactivate a branch with ${branchUsers.length} active user(s). Reassign them first.`);
      return;
    }
    setData((d) => ({
      ...d,
      branches: d.branches.map((x) => (x.id === b.id ? { ...x, active: !x.active } : x)),
    }));
    log(b.active ? "BRANCH_DEACTIVATE" : "BRANCH_ACTIVATE", b.name);
  };

  const remove = (b: Branch) => {
    if (b.id === currentUser?.branchId) {
      alert("Cannot delete your own branch");
      return;
    }
    // Check if branch has users
    const branchUsers = data.users.filter((u) => u.branchId === b.id);
    if (branchUsers.length > 0) {
      alert(`Cannot delete branch with ${branchUsers.length} user(s). Reassign or delete users first.`);
      return;
    }
    if (!confirm(`Delete branch "${b.name}"? This cannot be undone.`)) return;
    setData((d) => ({ ...d, branches: d.branches.filter((x) => x.id !== b.id) }));
    log("BRANCH_DELETE", b.name);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center">
          <div>
            <div className="font-semibold text-slate-800 dark:text-slate-100"> Branch Management</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Create and manage pharmacy branches. Each branch has separate inventory and data.</div>
          </div>
          {canCreateBranch && <Button onClick={openNew} className="w-full sm:w-auto">+ New Branch</Button>}
        </CardBody>
      </Card>

      {/* Branch List - Cards for all screens */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.branches.length === 0 && (
          <Card className="md:col-span-2 lg:col-span-3">
            <CardBody>
              <EmptyState message="No branches yet. Click '+ New Branch' to create one." />
            </CardBody>
          </Card>
        )}
        {data.branches.map((b) => (
          <Card key={b.id}>
            <CardBody className="space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-sky-500 to-emerald-500 text-white flex items-center justify-center font-bold text-lg">
                    {b.code.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-bold text-slate-800 dark:text-slate-100">{b.name}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{b.code}</div>
                  </div>
                </div>
                {b.active ? <Badge tone="green">Active</Badge> : <Badge tone="red">Inactive</Badge>}
              </div>

              {b.storeName && (
                <div className="text-sm font-medium text-sky-700 dark:text-sky-300">{b.storeName}</div>
              )}
              {b.address && (
                <div className="text-sm text-slate-600 dark:text-slate-400 flex items-start gap-1.5">
                  <span className="text-slate-400 shrink-0 mt-0.5">📍</span>
                  <div className="whitespace-pre-line leading-relaxed">{b.address}</div>
                </div>
              )}
              {b.gstNumber && (
                <div className="text-xs font-mono text-slate-500 dark:text-slate-400">GSTIN: {b.gstNumber}</div>
              )}
              {b.phone && (
                <div className="text-sm text-slate-600 dark:text-slate-400">
                  <span className="text-slate-400">📞</span> {b.phone}
                </div>
              )}

              <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-700">
                <div className="text-xs text-slate-400">
                  Created: {new Date(b.createdAt).toLocaleDateString("en-IN")}
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(b)}>✏</Button>
                  <Button size="sm" variant="ghost" onClick={() => toggleActive(b)}>
                    {b.active ? "🚫" : "✅"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(b)}>🗑</Button>
                </div>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      {/* Create/Edit Modal */}
      <Modal open={open} onClose={() => setOpen(false)} title={edit ? "Edit Branch" : "New Branch"}>
        <div className="space-y-3">
          <div>
            <Label>Branch Name *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Anna Nagar Branch" />
          </div>
          <div>
            <Label>Branch Code *</Label>
            <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="e.g. BR002" className="uppercase" />
            <p className="text-xs text-slate-400 mt-1">Short unique code for this branch</p>
          </div>

          {/* Store profile — appears on this branch's tax invoices */}
          <div className="pt-2">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-1 h-4 rounded-full bg-sky-500" />
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Store Profile — printed on invoices</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Pharmacy Name</Label>
                <Input value={form.storeName} onChange={(e) => setForm({ ...form, storeName: e.target.value })} placeholder="e.g. Guru Pharmacy" />
              </div>
              <div>
                <Label>GST Number (GSTIN)</Label>
                <Input value={form.gstNumber} onChange={(e) => setForm({ ...form, gstNumber: e.target.value.toUpperCase() })} placeholder="22AAAAA0000A1Z5" maxLength={20} className="uppercase" />
              </div>
              <div className="sm:col-span-2">
                <Label>Registered Address</Label>
                <Textarea
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="Full registered address (press Enter for new lines)"
                  rows={3}
                />
                <p className="text-xs text-slate-400 mt-1">Multi-line address formatting is preserved on invoices and printed documents.</p>
              </div>
            </div>
          </div>

          <div>
            <Label>Phone</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Branch phone number" />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="act"
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
              className="rounded"
            />
            <label htmlFor="act" className="text-sm text-slate-700 dark:text-slate-300">Active (can be used for operations)</label>
          </div>
          <div className="flex justify-end gap-2 pt-3">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save}>{edit ? "Update Branch" : "Create Branch"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Branches;
