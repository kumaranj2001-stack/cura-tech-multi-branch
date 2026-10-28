import React, { useMemo, useState } from "react";
import { useStore } from "../store/store";
import { Card, CardBody, Input, PasswordInput, Label, Button, Modal, Badge, Select, EmptyState } from "../components/ui";
import { fmtDate } from "../utils/helpers";
import { sanitizeText, sanitizeUsername, sanitizePassword } from "../utils/security";
import type { User, UserRole } from "../store/types";
import { isOverseer, canCreateAccount, formatPlanCap, staffPlanLimits } from "../store/types";

const Users: React.FC = () => {
  const { data, currentUser, currentBranch, log, staffPlan, customStaffPlanLimits, createUser, updateUser, deleteUser, flashToast } = useStore();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<User | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<{ username: string; password: string; name: string; role: UserRole; branchId: string; active: boolean }>({
    username: "",
    password: "",
    name: "",
    role: "staff",
    branchId: "",
    active: true,
  });
  const isDev = currentUser?.role === "developer";
  const isSuper = currentUser?.role === "superadmin";
  // Super Admins cannot manage Developer / other Super Admin accounts — only the Developer can
  const protectedFromMe = (target: User) =>
    isSuper && (target.role === "developer" || (target.role === "superadmin" && target.id !== currentUser?.id));
  const [resetUser, setResetUser] = useState<User | null>(null);
  const [newPwd, setNewPwd] = useState("");
  const [branchFilter, setBranchFilter] = useState("all");

  const isDeveloper = isOverseer(currentUser?.role);
  const isAdmin = currentUser?.role === "admin";
  const myBranchId = currentUser?.role === "admin" ? currentUser?.branchId || currentBranch?.id || "" : "";
  const planLimits = staffPlanLimits(staffPlan, customStaffPlanLimits);
  const usedStaff = data.users.filter((u) => u.role === "staff").length;
  const usedAdmin = data.users.filter((u) => u.role === "admin").length;
  const usedSuper = data.users.filter((u) => u.role === "superadmin").length;
  const staffSlotsLeft = Number.isFinite(planLimits.staff) ? Math.max(0, planLimits.staff - usedStaff) : Number.POSITIVE_INFINITY;
  const staffCreateCheck = canCreateAccount(data.users, "staff", staffPlan, undefined, customStaffPlanLimits);
  const canAddStaff = staffCreateCheck.ok;

  const branchName = (id?: string) => data.branches.find((b) => b.id === id)?.name || "Unassigned";

  const visibleUsers = useMemo(() => {
    if (isDeveloper) {
      return branchFilter === "all" ? data.users : data.users.filter((u) => u.branchId === branchFilter);
    }
    // Admin sees only users explicitly assigned to their own branch (plus themselves)
    return data.users.filter((u) => u.branchId === myBranchId || u.id === currentUser?.id);
  }, [data.users, isDeveloper, branchFilter, myBranchId, currentUser?.id]);

  if (currentUser?.role !== "admin" && !isOverseer(currentUser?.role)) {
    return (
      <Card>
        <CardBody className="text-center text-slate-500 py-12">⛔ Admin or Super Admin access required</CardBody>
      </Card>
    );
  }

  const openForm = (role: UserRole) => {
    const check = canCreateAccount(data.users, role, staffPlan, undefined, customStaffPlanLimits);
    if (!check.ok) {
      alert(check.message);
      return;
    }
    setEdit(null);
    setForm({
      username: "",
      password: "",
      name: "",
      role,
      branchId: isDeveloper ? data.branches[0]?.id || "" : myBranchId,
      active: true,
    });
    setOpen(true);
  };

  const openNewStaff = () => openForm("staff");

  const openNewUser = () => {
    const order: UserRole[] = ["staff", "admin", "superadmin"];
    const role = order.find((r) => canCreateAccount(data.users, r, staffPlan, undefined, customStaffPlanLimits).ok) || "staff";
    openForm(role);
  };

  const openEdit = (u: User) => {
    if (currentUser?.role === "admin" && u.role !== "staff") {
      alert("Admins can only edit Staff accounts. Contact the Super Admin or Developer.");
      return;
    }
    if (protectedFromMe(u)) {
      alert("Only the Developer can manage Developer and Super Admin accounts.");
      return;
    }
    setEdit(u);
    setForm({
      username: u.username,
      password: u.password,
      name: u.name,
      role: u.role,
      branchId: u.branchId || "",
      active: u.active,
    });
    setOpen(true);
  };

  const save = async () => {
    const trimmedUsername = sanitizeUsername(form.username);
    const trimmedPassword = sanitizePassword(form.password).trim();
    const trimmedName = sanitizeText(form.name, 80);
    if (!trimmedUsername || !trimmedPassword || !trimmedName) return alert("All fields required");
    if (trimmedUsername.length < 2) return alert("Username must be at least 2 characters");
    if (trimmedPassword.length < 4) return alert("Password must be at least 4 characters");

    // Overseer roles (Developer / Super Admin) span all branches — no branch needed
    const overseerTarget = form.role === "developer" || form.role === "superadmin";
    if (!overseerTarget && !form.branchId) return alert("Please select a branch for this user");

    // Admins always create users in their own branch
    const targetBranchId = overseerTarget ? undefined : isDeveloper ? form.branchId : myBranchId;
    const cleanForm = { ...form, username: trimmedUsername, password: trimmedPassword, name: trimmedName, branchId: targetBranchId };

    try {
      setSubmitting(true);
      if (edit) {
        if (currentUser?.role === "admin" && edit.role !== "staff") {
          alert("Admins can only edit Staff accounts. Contact the Super Admin or Developer.");
          return;
        }
        if (protectedFromMe(edit)) {
          alert("Only the Developer can manage Developer and Super Admin accounts.");
          return;
        }
        if (cleanForm.role !== edit.role) {
          const quota = canCreateAccount(data.users, cleanForm.role, staffPlan, edit.id, customStaffPlanLimits);
          if (!quota.ok) return alert(quota.message);
        }

        // Duplicate username check
        if (cleanForm.username.toLowerCase() !== edit.username.toLowerCase()) {
          const exists = data.users.some((u) => u.id !== edit.id && u.username.toLowerCase() === cleanForm.username.toLowerCase());
          if (exists) return alert(`Username "${cleanForm.username}" is already taken`);
        }

        let updatePayload: Partial<User>;
        if (isOverseer(edit.role) && !isDev) {
          // Non-developer overseers can't change another overseer's role/branch
          updatePayload = { name: cleanForm.name, password: cleanForm.password, active: cleanForm.active };
        } else if (currentUser?.role === "admin") {
          // Admin edits keep the staff member in their existing branch
          updatePayload = { username: cleanForm.username, password: cleanForm.password, name: cleanForm.name, active: cleanForm.active };
        } else {
          updatePayload = cleanForm;
        }

        await updateUser(edit.id, updatePayload);
        log("USER_UPDATE", `${trimmedUsername} (${branchName(targetBranchId)})`);
        flashToast("User updated successfully", "ok");
      } else {
        if (currentUser?.role === "admin" && cleanForm.role !== "staff") {
          return alert("Admins can only add Staff accounts.");
        }
        const quota = canCreateAccount(data.users, cleanForm.role, staffPlan, undefined, customStaffPlanLimits);
        if (!quota.ok) return alert(quota.message);
        if (data.users.some((u) => u.username.toLowerCase() === trimmedUsername.toLowerCase())) {
          return alert(`Username "${trimmedUsername}" is already taken`);
        }

        await createUser({
          ...cleanForm,
          role: cleanForm.role,
        });
        log("USER_CREATE", `${trimmedUsername} as ${cleanForm.role} in ${branchName(targetBranchId)}`);
        flashToast("User created successfully", "ok");
      }
      setOpen(false);
    } catch (err: any) {
      alert(err.message || "Failed to save user");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (u: User) => {
    if (currentUser?.role === "admin" && u.role !== "staff") {
      alert("Admins can only deactivate Staff accounts.");
      return;
    }
    if (protectedFromMe(u)) {
      alert("Only the Developer can deactivate Developer and Super Admin accounts.");
      return;
    }
    if (u.id === currentUser?.id) {
      alert("Cannot deactivate your own account");
      return;
    }
    try {
      await updateUser(u.id, { active: !u.active });
      log(u.active ? "USER_DEACTIVATE" : "USER_ACTIVATE", u.username);
      flashToast(u.active ? `Deactivated user ${u.username}` : `Activated user ${u.username}`, "ok");
    } catch (err: any) {
      alert(err.message || "Failed to update user status");
    }
  };

  const remove = async (u: User) => {
    if (currentUser?.role === "admin" && u.role !== "staff") {
      alert("Admins can only delete Staff accounts.");
      return;
    }
    if (protectedFromMe(u)) {
      alert("Only the Developer can delete Developer and Super Admin accounts.");
      return;
    }
    if (u.id === currentUser?.id) {
      alert("Cannot delete your own account");
      return;
    }
    if (u.role === "developer" || u.username === "guru") {
      alert("Primary developer account cannot be deleted.");
      return;
    }
    if (!confirm(`Are you sure you want to permanently delete user "${u.username}" (${u.name})?`)) return;
    try {
      await deleteUser(u.id);
      log("USER_DELETE", u.username);
      flashToast(`User ${u.username} permanently deleted`, "ok");
    } catch (err: any) {
      alert(err.message || "Failed to delete user");
    }
  };

  const resetPwd = async () => {
    const pwd = newPwd.trim();
    if (!resetUser || !pwd) return alert("Password cannot be empty");
    if (pwd.length < 4) return alert("Password must be at least 4 characters");
    if (currentUser?.role === "admin" && resetUser.role !== "staff") {
      alert("Admins can only reset passwords of Staff accounts.");
      return;
    }
    if (protectedFromMe(resetUser)) {
      alert("Only the Developer can reset Developer and Super Admin passwords.");
      return;
    }
    if (isOverseer(resetUser.role) && currentUser?.id === resetUser.id) {
      alert("You cannot reset your own password through this interface.");
      return;
    }
    try {
      setSubmitting(true);
      await updateUser(resetUser.id, { password: pwd });
      log("USER_PASSWORD_RESET", resetUser.username);
      flashToast(`Password for "${resetUser.username}" updated successfully`, "ok");
      setResetUser(null);
      setNewPwd("");
    } catch (err: any) {
      alert(err.message || "Failed to reset password");
    } finally {
      setSubmitting(false);
    }
  };

  const roleBadge = (u: User) =>
    u.role === "superadmin" ? <Badge tone="amber">SUPER ADMIN</Badge>
    : u.role === "developer" ? <Badge tone="amber">DEVELOPER</Badge>
    : u.role === "admin" ? <Badge tone="blue">ADMIN</Badge>
    : <Badge tone="slate">STAFF</Badge>;

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center">
            <div>
              <div className="font-semibold text-slate-800 dark:text-slate-100 text-base sm:text-lg">User Management</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {isDeveloper
                  ? "Developer has full control across all branches."
                  : `Managing users for ${branchName(myBranchId)} only. Other branches are hidden.`}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                Plan Option {staffPlan}{staffPlan === 5 ? " (Custom)" : ""}: Super Admin {usedSuper}/{formatPlanCap(planLimits.superadmin)} · Admin {usedAdmin}/{formatPlanCap(planLimits.admin)} · Staff {usedStaff}/{formatPlanCap(planLimits.staff)}
              </div>
            </div>
            <div className="flex flex-wrap sm:flex-nowrap gap-2 w-full sm:w-auto">
              {(isAdmin || isDeveloper) && (
                <Button
                  onClick={openNewStaff}
                  className="w-full sm:w-auto"
                  disabled={!canAddStaff}
                  title={canAddStaff ? "Add a staff account within the active plan" : staffCreateCheck.message}
                >
                  + Add Staff
                </Button>
              )}
              {(isDev || isSuper) && (
                <Button variant="secondary" onClick={openNewUser} className="w-full sm:w-auto">+ New User</Button>
              )}
            </div>
          </div>
          {isDeveloper && (
            <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <Label className="mb-0 shrink-0 text-xs">Filter by branch:</Label>
              <Select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} className="w-full sm:w-auto sm:max-w-xs text-xs">
                <option value="all">All branches</option>
                {data.branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
                ))}
              </Select>
              <span className="text-xs text-slate-400">{visibleUsers.length} user{visibleUsers.length === 1 ? "" : "s"}</span>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Mobile cards */}
      <div className="lg:hidden space-y-3">
        {visibleUsers.length === 0 && <Card><CardBody><EmptyState message="No users in this branch" /></CardBody></Card>}
        {visibleUsers.map((u) => (
          <Card key={u.id} className="overflow-hidden">
            <CardBody className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center font-semibold text-sm flex-shrink-0">
                    {u.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-800 dark:text-slate-100 truncate text-sm sm:text-base">{u.name}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate">@{u.username}</div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  {roleBadge(u)}
                  {u.active ? <Badge tone="green">Active</Badge> : <Badge tone="red">Inactive</Badge>}
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500 flex-wrap">
                <span className="inline-flex items-center rounded-full bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 px-2 py-0.5 font-medium">
                  {branchName(u.branchId)}
                </span>
                <span>· Created {fmtDate(u.createdAt)}</span>
              </div>
              <div className="flex gap-2 flex-wrap border-t border-slate-100 dark:border-slate-800 pt-3">
                {(isDeveloper || u.role === "staff") && (
                  <Button size="sm" variant="secondary" onClick={() => openEdit(u)}>✏ Edit</Button>
                )}
                {(isDeveloper || u.role === "staff") && (
                  <Button size="sm" variant="secondary" onClick={() => { setResetUser(u); setNewPwd(""); }}>🔑 Password</Button>
                )}
                {(isDeveloper || u.role === "staff") && (
                  <Button size="sm" variant={u.active ? "danger" : "success"} onClick={() => toggleActive(u)}>
                    {u.active ? "🚫 Deactivate" : "✅ Activate"}
                  </Button>
                )}
                {(isDeveloper || u.role === "staff") && (
                  <Button size="sm" variant="ghost" onClick={() => remove(u)}>🗑 Delete</Button>
                )}
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      {/* Desktop table */}
      <Card className="hidden lg:block overflow-hidden">
        <CardBody className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Username</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Branch</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Role</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Created</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {visibleUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-200">{u.username}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">{u.name}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 px-2 py-0.5 text-xs font-medium">
                        {branchName(u.branchId)}
                      </span>
                    </td>
                    <td className="px-4 py-3">{roleBadge(u)}</td>
                    <td className="px-4 py-3">{u.active ? <Badge tone="green">Active</Badge> : <Badge tone="red">Inactive</Badge>}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{fmtDate(u.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      {(isDeveloper || u.role === "staff") ? (
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="ghost" title="Edit user" onClick={() => openEdit(u)}>✏</Button>
                          <Button size="sm" variant="ghost" title="Reset password" onClick={() => { setResetUser(u); setNewPwd(""); }}>🔑</Button>
                          <Button size="sm" variant="ghost" title={u.active ? "Deactivate" : "Activate"} onClick={() => toggleActive(u)}>{u.active ? "🚫" : "✅"}</Button>
                          <Button size="sm" variant="ghost" title="Delete user" onClick={() => remove(u)}>🗑</Button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 italic">Developer only</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visibleUsers.length === 0 && <EmptyState message="No users in this branch" />}
          </div>
        </CardBody>
      </Card>

      {/* Create / Edit modal */}
      <Modal open={open} onClose={() => setOpen(false)} title={edit ? "Edit User" : "New User"}>
        <div className="space-y-3">
          <div>
            <Label>Username *</Label>
            <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="Enter login username" />
          </div>
          <div>
            <Label>Display Name *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name" />
          </div>
          <div>
            <Label>Password *</Label>
            <PasswordInput value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Set login password" />
            <p className="text-[11px] text-slate-400 mt-1">Make sure to note it down.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Role</Label>
              <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })} disabled={!isDeveloper && !isSuper}>
                {(planLimits.staff > 0 || form.role === "staff") && <option value="staff">Staff</option>}
                {(isDev || isSuper) && (planLimits.admin > 0 || form.role === "admin") && <option value="admin">Admin</option>}
                {(isDev || isSuper) && (planLimits.superadmin > 0 || form.role === "superadmin") && <option value="superadmin">Super Admin</option>}
                {isDev && <option value="developer">Developer</option>}
              </Select>
              {isDev && (
                <p className="text-[11px] text-violet-500 dark:text-violet-300 mt-1">Roles are limited by the active Staff Management option. Developer accounts are not counted.</p>
              )}
              {isSuper && (
                <p className="text-[11px] text-slate-400 mt-1">Super Admins can create roles permitted within the active plan limits.</p>
              )}
              {isAdmin && (
                <p className="text-[11px] text-slate-400 mt-1">
                  Admins can add Staff only. {Number.isFinite(staffSlotsLeft) ? `${staffSlotsLeft} of ${planLimits.staff} staff slot${planLimits.staff === 1 ? "" : "s"} remaining.` : "Staff accounts are unlimited on this plan."}
                </p>
              )}
            </div>
            <div>
              <Label>{form.role === "developer" || form.role === "superadmin" ? "Branch (not required)" : "Branch *"}</Label>
              <Select
                value={form.branchId}
                onChange={(e) => setForm({ ...form, branchId: e.target.value })}
                disabled={!isDeveloper || form.role === "developer" || form.role === "superadmin"}
              >
                {isDeveloper ? (
                  <>
                    <option value="">All branches (overseer)</option>
                    {data.branches.map((b) => (
                      <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
                    ))}
                  </>
                ) : (
                  <option value={myBranchId}>{branchName(myBranchId)}</option>
                )}
              </Select>
              {!isDeveloper && (
                <p className="text-[11px] text-slate-400 mt-1">New users are added to your branch only.</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input id="act" type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="rounded" />
            <label htmlFor="act" className="text-sm text-slate-700 dark:text-slate-300">Active (can log in)</label>
          </div>
          <div className="flex flex-col sm:flex-row justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={submitting} className="w-full sm:w-auto">Cancel</Button>
            <Button onClick={save} disabled={submitting} className="w-full sm:w-auto">
              {submitting ? "Saving..." : edit ? "Update User" : "Create User"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Reset password modal */}
      <Modal open={!!resetUser} onClose={() => setResetUser(null)} title={`Reset password — ${resetUser?.username}`} size="sm">
        <div className="space-y-3">
          <div>
            <Label>New Password *</Label>
            <PasswordInput value={newPwd} onChange={(e) => setNewPwd(e.target.value)} placeholder="Enter new password" />
          </div>
          <div className="flex flex-col sm:flex-row justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setResetUser(null)} disabled={submitting} className="w-full sm:w-auto">Cancel</Button>
            <Button onClick={resetPwd} disabled={submitting} className="w-full sm:w-auto">
              {submitting ? "Saving..." : "Reset Password"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Users;
