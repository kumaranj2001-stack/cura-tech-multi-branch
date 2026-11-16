import React, { useState } from "react";
import { useStore, uid } from "../store/store";
import { Card, CardBody, Input, Textarea, Label, Button, Modal, Badge, EmptyState } from "../components/ui";
import type { Branch } from "../store/types";
import { isOverseer } from "../store/types";
import { flashToast } from "../utils/helpers";
import { Building2, Plus, ShieldCheck } from "lucide-react";

const Branches: React.FC = () => {
  const { data, setData, currentUser, log } = useStore();
  const isDeveloper = currentUser?.role === "developer";
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Branch | null>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    code: "",
    storeName: "",
    address: "",
    gstNumber: "",
    phone: "",
    active: true,
  });

  if (!isOverseer(currentUser?.role)) {
    return (
      <Card>
        <CardBody className="text-center text-slate-500 dark:text-slate-400 py-12">
          <div className="flex flex-col items-center justify-center gap-2">
            <span className="text-3xl">⛔</span>
            <div className="font-semibold text-slate-700 dark:text-slate-200">Developer or Super Admin access required</div>
            <p className="text-xs text-slate-400">Branch settings are only viewable by administrative overseers.</p>
          </div>
        </CardBody>
      </Card>
    );
  }

  const openNew = () => {
    // Branch adding is strictly restricted to Developer role
    if (!isDeveloper) {
      flashToast("Access Denied: Only Developer can add new branches", "err");
      return;
    }
    setEdit(null);
    setForm({ name: "", code: "", storeName: "", address: "", gstNumber: "", phone: "", active: true });
    setOpen(true);
  };

  const openEdit = (b: Branch) => {
    if (!isDeveloper) {
      flashToast("Access Denied: Only Developer can edit branch details", "err");
      return;
    }
    setEdit(b);
    setForm({
      name: b.name,
      code: b.code,
      storeName: b.storeName || "",
      address: b.address || "",
      gstNumber: b.gstNumber || "",
      phone: b.phone || "",
      active: b.active,
    });
    setOpen(true);
  };

  const save = async () => {
    const trimmedName = form.name.trim();
    const trimmedCode = form.code.trim().toUpperCase();

    if (!trimmedName || !trimmedCode) {
      alert("Branch name and code are required");
      return;
    }

    setLoading(true);

    if (edit) {
      // Editing existing branch — strictly restricted to Developer
      if (!isDeveloper) {
        setLoading(false);
        flashToast("Access Denied: Only Developer can edit branch details", "err");
        return;
      }
      try {
        await fetch(`/api/branches/${edit.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "x-user-role": currentUser?.role || "",
          },
          body: JSON.stringify({
            patch: {
              name: trimmedName,
              code: trimmedCode,
              storeName: form.storeName.trim(),
              address: form.address.trim(),
              gstNumber: form.gstNumber.trim().toUpperCase(),
              phone: form.phone.trim(),
              active: form.active,
            },
            role: currentUser?.role,
          }),
        });
      } catch (err) {
        console.warn("[Backend branch update warning]", err);
      }

      setData((d) => ({
        ...d,
        branches: d.branches.map((b) =>
          b.id === edit.id
            ? {
                ...b,
                name: trimmedName,
                code: trimmedCode,
                storeName: form.storeName.trim(),
                address: form.address.trim(),
                gstNumber: form.gstNumber.trim().toUpperCase(),
                phone: form.phone.trim(),
                active: form.active,
              }
            : b
        ),
      }));
      log("BRANCH_UPDATE", trimmedName);
      flashToast(`Branch "${trimmedName}" updated successfully`, "ok");
      setOpen(false);
      setLoading(false);
    } else {
      // Branch creation — strictly restricted to Developer
      if (!isDeveloper) {
        setLoading(false);
        flashToast("Access Denied: Only Developer can add branches. Super Admin, Admin, and Staff cannot add branches.", "err");
        return;
      }

      const duplicate = data.branches.find((b) => b.code.toUpperCase() === trimmedCode);
      if (duplicate) {
        setLoading(false);
        alert(`Branch code "${trimmedCode}" already exists. Please choose a unique code.`);
        return;
      }

      const payload = {
        name: trimmedName,
        code: trimmedCode,
        storeName: form.storeName.trim(),
        address: form.address.trim(),
        gstNumber: form.gstNumber.trim().toUpperCase(),
        phone: form.phone.trim(),
        active: form.active,
      };

      let backendBranch: Branch | null = null;
      try {
        const res = await fetch("/api/branches", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-user-role": currentUser?.role || "",
          },
          body: JSON.stringify({ ...payload, role: currentUser?.role }),
        });

        if (res.ok) {
          const json = await res.json();
          if (json.branch) backendBranch = json.branch;
        } else {
          const errData = await res.json().catch(() => null);
          if (errData?.error) {
            setLoading(false);
            alert(errData.error);
            return;
          }
        }
      } catch (apiErr) {
        console.warn("[Backend branch create warning]", apiErr);
      }

      const nb: Branch = backendBranch || {
        id: uid("br"),
        createdAt: new Date().toISOString(),
        ...payload,
      };

      setData((d) => ({ ...d, branches: [...d.branches, nb] }));
      log("BRANCH_CREATE", nb.name);
      flashToast(`Branch "${nb.name}" (${nb.code}) created successfully`, "ok");
      setOpen(false);
      setLoading(false);
    }
  };

  const toggleActive = async (b: Branch) => {
    if (!isDeveloper) {
      flashToast("Access Denied: Only Developer can deactivate or activate branches", "err");
      return;
    }
    if (b.id === currentUser?.branchId) {
      alert("Cannot deactivate your own branch");
      return;
    }
    const branchUsers = data.users.filter((u) => u.branchId === b.id && u.active);
    if (b.active && branchUsers.length > 0) {
      alert(`Cannot deactivate a branch with ${branchUsers.length} active user(s). Reassign them first.`);
      return;
    }

    try {
      await fetch(`/api/branches/${b.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-user-role": currentUser?.role || "",
        },
        body: JSON.stringify({ patch: { active: !b.active }, role: currentUser?.role }),
      });
    } catch (e) {
      console.warn("[Backend branch toggle warning]", e);
    }

    setData((d) => ({
      ...d,
      branches: d.branches.map((x) => (x.id === b.id ? { ...x, active: !x.active } : x)),
    }));
    log(b.active ? "BRANCH_DEACTIVATE" : "BRANCH_ACTIVATE", b.name);
    flashToast(`Branch "${b.name}" ${b.active ? "deactivated" : "activated"}`, "ok");
  };

  const remove = async (b: Branch) => {
    if (!isDeveloper) {
      flashToast("Access Denied: Only Developer can delete branches", "err");
      return;
    }
    if (b.id === currentUser?.branchId) {
      alert("Cannot delete your own branch");
      return;
    }
    const branchUsers = data.users.filter((u) => u.branchId === b.id);
    if (branchUsers.length > 0) {
      alert(`Cannot delete branch with ${branchUsers.length} user(s). Reassign or delete users first.`);
      return;
    }
    if (!confirm(`Delete branch "${b.name}"? This cannot be undone.`)) return;

    try {
      await fetch(`/api/branches/${b.id}`, {
        method: "DELETE",
        headers: {
          "x-user-role": currentUser?.role || "",
        },
      });
    } catch (e) {
      console.warn("[Backend branch delete warning]", e);
    }

    setData((d) => ({ ...d, branches: d.branches.filter((x) => x.id !== b.id) }));
    log("BRANCH_DELETE", b.name);
    flashToast(`Branch "${b.name}" deleted successfully`, "ok");
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center">
          <div>
            <div className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-sky-600 dark:text-sky-400" />
              <div className="font-bold text-slate-800 dark:text-slate-100 text-lg">Branch Management</div>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {isDeveloper
                ? "Developer master control: create, configure, and manage pharmacy branches. Each branch maintains separate inventories and invoices."
                : "Pharmacy branches overview. Branch creation is restricted exclusively to Developer accounts."}
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {isDeveloper && (
              <Button onClick={openNew} className="w-full sm:w-auto flex items-center justify-center gap-1.5 shadow-sm">
                <Plus className="w-4 h-4" />
                <span>+ New Branch</span>
              </Button>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Branch List - Cards for all screens */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.branches.length === 0 && (
          <Card className="md:col-span-2 lg:col-span-3">
            <CardBody>
              <EmptyState
                message={
                  isDeveloper
                    ? "No branches yet. Click '+ New Branch' to create one."
                    : "No branches configured yet."
                }
              />
            </CardBody>
          </Card>
        )}
        {data.branches.map((b) => (
          <Card key={b.id} className="transition-all hover:shadow-md border border-slate-200/80 dark:border-slate-700">
            <CardBody className="space-y-3 p-4 sm:p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-sky-500 to-emerald-500 text-white flex items-center justify-center font-bold text-base sm:text-lg shrink-0 shadow-sm">
                    {b.code.substring(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-slate-800 dark:text-slate-100 truncate text-base leading-snug" title={b.name}>
                      {b.name}
                    </div>
                    <div className="text-xs font-mono font-medium text-slate-500 dark:text-slate-400">{b.code}</div>
                  </div>
                </div>
                {b.active ? <Badge tone="green">Active</Badge> : <Badge tone="red">Inactive</Badge>}
              </div>

              {b.storeName && (
                <div className="text-sm font-semibold text-sky-700 dark:text-sky-300 truncate" title={b.storeName}>
                  {b.storeName}
                </div>
              )}
              {b.address && (
                <div className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 flex items-start gap-1.5 break-words">
                  <span className="text-slate-400 shrink-0 mt-0.5">📍</span>
                  <div className="whitespace-pre-line leading-relaxed">{b.address}</div>
                </div>
              )}
              {b.gstNumber && (
                <div className="text-xs font-mono text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <span className="text-slate-400">📄</span> GSTIN: <span className="font-semibold">{b.gstNumber}</span>
                </div>
              )}
              {b.phone && (
                <div className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                  <span className="text-slate-400">📞</span> {b.phone}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-slate-700/80">
                <div className="text-[11px] text-slate-400">
                  Created: {new Date(b.createdAt).toLocaleDateString("en-IN")}
                </div>
                {isDeveloper && (
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(b)} title="Edit branch profile" aria-label="Edit branch profile">
                      ✏️
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => toggleActive(b)} title={b.active ? "Deactivate branch" : "Activate branch"} aria-label={b.active ? "Deactivate branch" : "Activate branch"}>
                      {b.active ? "🚫" : "✅"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(b)} title="Delete branch" aria-label="Delete branch" className="text-rose-600 hover:text-rose-700">
                      🗑️
                    </Button>
                  </div>
                )}
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      {/* Create/Edit Modal */}
      <Modal open={open} onClose={() => setOpen(false)} title={edit ? "Edit Branch" : "New Branch"}>
        <div className="space-y-4">
          {!edit && (
            <div className="rounded-lg bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800 p-3 text-xs text-sky-800 dark:text-sky-200 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-sky-600 shrink-0" />
              <span>Developer action: Adding new pharmacy branch to cloud database.</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Branch Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Anna Nagar Branch"
                disabled={loading}
              />
            </div>
            <div>
              <Label>Branch Code *</Label>
              <Input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="e.g. BR002"
                className="uppercase font-mono"
                disabled={loading || (!!edit && !isDeveloper)}
              />
              <p className="text-[11px] text-slate-400 mt-1">Short unique code for this branch</p>
            </div>
          </div>

          {/* Store profile — appears on this branch's tax invoices */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-700/60">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-1.5 h-4 rounded-full bg-sky-500" />
              <span className="text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                Store Profile — printed on invoices
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Pharmacy Display Name</Label>
                <Input
                  value={form.storeName}
                  onChange={(e) => setForm({ ...form, storeName: e.target.value })}
                  placeholder="e.g. Guru Pharmacy"
                  disabled={loading}
                />
              </div>
              <div>
                <Label>GST Number (GSTIN)</Label>
                <Input
                  value={form.gstNumber}
                  onChange={(e) => setForm({ ...form, gstNumber: e.target.value.toUpperCase() })}
                  placeholder="22AAAAA0000A1Z5"
                  maxLength={20}
                  className="uppercase font-mono"
                  disabled={loading}
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Registered Address</Label>
                <Textarea
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="Full registered address (press Enter for new lines)"
                  rows={3}
                  disabled={loading}
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Multi-line address formatting is preserved on invoices and printed documents.
                </p>
              </div>
            </div>
          </div>

          <div>
            <Label>Phone</Label>
            <Input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="Branch phone number"
              disabled={loading}
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              id="act"
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
              className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500 cursor-pointer"
              disabled={loading}
            />
            <label htmlFor="act" className="text-sm text-slate-700 dark:text-slate-300 cursor-pointer select-none">
              Active (can be selected for operations & billing)
            </label>
          </div>

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-700/60">
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={loading} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button onClick={save} disabled={loading} className="w-full sm:w-auto">
              {loading ? "Saving..." : edit ? "Update Branch" : "Create Branch"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Branches;
