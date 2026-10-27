import React, { useMemo, useState } from "react";
import { useStore, uid } from "../store/store";
import { Card, CardBody, Input, Label, Textarea, Button, Th, Td, Modal, EmptyState, Badge } from "../components/ui";
import { fmtCurrency, fmtDate, flashToast } from "../utils/helpers";
import { sanitizeText, sanitizePhone, isPlausiblePhone } from "../utils/security";
import type { Doctor } from "../store/types";
import { Search, Phone, Building2, MapPin, Stethoscope, Pencil, Trash2, Eye, UserPlus, FileText } from "lucide-react";

export const Doctors: React.FC = () => {
  const { data, setData, log, currentUser, currentBranch } = useStore();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [view, setView] = useState<Doctor | null>(null);
  const [edit, setEdit] = useState<Doctor | null>(null);
  const [form, setForm] = useState({
    name: "",
    hospital: "",
    hospitalAddress: "",
    phone: "",
    regNo: "",
  });

  const doctorsList = useMemo(() => {
    return data.doctors || [];
  }, [data.doctors]);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    if (!ql) return doctorsList;
    return doctorsList.filter(
      (d) =>
        d.name.toLowerCase().includes(ql) ||
        d.hospital.toLowerCase().includes(ql) ||
        (d.hospitalAddress && d.hospitalAddress.toLowerCase().includes(ql)) ||
        d.phone.includes(ql) ||
        (d.regNo && d.regNo.toLowerCase().includes(ql))
    );
  }, [doctorsList, q]);

  const openNew = () => {
    setEdit(null);
    setForm({ name: "", hospital: "", hospitalAddress: "", phone: "", regNo: "" });
    setFormError("");
    setOpen(true);
  };

  const openEdit = (d: Doctor) => {
    setEdit(d);
    setForm({
      name: d.name,
      hospital: d.hospital,
      hospitalAddress: d.hospitalAddress || "",
      phone: d.phone,
      regNo: d.regNo || "",
    });
    setFormError("");
    setOpen(true);
  };

  const save = async () => {
    setFormError("");
    const name = sanitizeText(form.name, 100);
    const hospital = sanitizeText(form.hospital, 150);
    const phone = sanitizePhone(form.phone);
    const hospitalAddress = form.hospitalAddress.trim();
    const regNo = sanitizeText(form.regNo, 50);

    if (!name) {
      setFormError("Doctor Name is required.");
      return;
    }
    if (!hospital) {
      setFormError("Hospital / Clinic Name is required.");
      return;
    }
    if (!phone) {
      setFormError("Contact phone number is required.");
      return;
    }
    if (!isPlausiblePhone(phone)) {
      setFormError("Please enter a valid contact phone number with at least 7 digits.");
      return;
    }

    setSubmitting(true);
    const targetBranchId = currentUser?.branchId || currentBranch?.id || "br_main";

    const cleanData: Partial<Doctor> & { name: string; hospital: string; phone: string; branchId: string } = {
      name,
      hospital,
      phone,
      branchId: targetBranchId,
    };
    if (hospitalAddress) cleanData.hospitalAddress = hospitalAddress;
    if (regNo) cleanData.regNo = regNo;

    try {
      if (edit) {
        // Backend API update
        try {
          await fetch(`/api/doctors/${edit.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: edit.id, patch: cleanData }),
          });
        } catch (apiErr) {
          console.warn("[Backend Doctor Update Warning]", apiErr);
        }

        setData((d) => ({
          ...d,
          doctors: (d.doctors || []).map((doc) => (doc.id === edit.id ? { ...doc, ...cleanData } : doc)),
        }));
        log("DOCTOR_UPDATE", `${name} (${hospital})`);
        flashToast(`Doctor "${name}" updated successfully`, "ok");
        setOpen(false);
      } else {
        // Backend API creation
        let backendDoctor: Doctor | null = null;
        try {
          const res = await fetch("/api/doctors", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(cleanData),
          });
          if (res.ok) {
            const json = await res.json();
            if (json.doctor) backendDoctor = json.doctor;
          }
        } catch (apiErr) {
          console.warn("[Backend Doctor Create Warning]", apiErr);
        }

        const newDoc: Doctor = backendDoctor || {
          id: uid("doc"),
          createdAt: new Date().toISOString(),
          ...cleanData,
        };

        setData((d) => ({
          ...d,
          doctors: [newDoc, ...(d.doctors || []).filter((doc) => doc.id !== newDoc.id)],
        }));
        log("DOCTOR_CREATE", `${name} (${hospital})`);
        flashToast(`Doctor "${name}" created successfully`, "ok");
        setOpen(false);
        setForm({ name: "", hospital: "", hospitalAddress: "", phone: "", regNo: "" });
      }
    } catch (err) {
      console.error("[Doctor Save Error]", err);
      setFormError(err instanceof Error ? err.message : "Failed to save doctor");
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (d: Doctor) => {
    if (!confirm(`Are you sure you want to delete ${d.name} (${d.hospital})?`)) return;
    try {
      await fetch(`/api/doctors/${d.id}`, { method: "DELETE" });
    } catch (apiErr) {
      console.warn("[Backend Doctor Delete Warning]", apiErr);
    }
    setData((state) => ({
      ...state,
      doctors: (state.doctors || []).filter((x) => x.id !== d.id),
    }));
    log("DOCTOR_DELETE", `${d.name} (${d.hospital})`);
    flashToast(`Doctor "${d.name}" deleted`);
    if (view?.id === d.id) setView(null);
  };

  const doctorInvoices = useMemo(() => {
    if (!view) return [];
    return data.invoices.filter(
      (inv) =>
        inv.doctorId === view.id ||
        (inv.doctorName && inv.doctorName.toLowerCase() === view.name.toLowerCase())
    );
  }, [view, data.invoices]);

  const totalPrescribedValue = useMemo(() => {
    return doctorInvoices.reduce((s, inv) => s + (inv.total || 0), 0);
  }, [doctorInvoices]);

  return (
    <div className="space-y-4">
      {/* Top Search & Add Bar */}
      <Card>
        <CardBody className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              placeholder="Search by name, hospital, address, or phone..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9 w-full"
            />
          </div>
          <Button onClick={openNew} className="w-full sm:w-auto shrink-0 shadow-sm">
            <UserPlus className="w-4 h-4" /> Add Doctor
          </Button>
        </CardBody>
      </Card>

      {/* Doctors Table / Cards */}
      <Card>
        <CardBody className="p-0">
          <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between font-semibold">
            <div className="flex items-center gap-2">
              <Stethoscope className="w-4 h-4 text-sky-600" />
              <span>Registered Doctors</span>
              <Badge tone="blue">{filtered.length}</Badge>
            </div>
            {q && (
              <span className="text-xs text-slate-400">
                Filtered from {doctorsList.length} total
              </span>
            )}
          </div>

          {/* Mobile Cards */}
          <div className="lg:hidden p-3 space-y-3">
            {filtered.length === 0 && <EmptyState message="No doctors found" />}
            {filtered.map((d) => {
              const invCount = data.invoices.filter(
                (inv) =>
                  inv.doctorId === d.id ||
                  (inv.doctorName && inv.doctorName.toLowerCase() === d.name.toLowerCase())
              ).length;
              return (
                <Card key={d.id} className="border border-slate-200 dark:border-slate-700">
                  <CardBody className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                          <Stethoscope className="w-3.5 h-3.5 text-sky-600" />
                          <span>{d.name}</span>
                        </div>
                        {d.regNo && <div className="text-[11px] text-slate-400 font-mono">Reg: {d.regNo}</div>}
                      </div>
                      <Badge tone="blue">{invCount} bill{invCount === 1 ? "" : "s"}</Badge>
                    </div>

                    <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
                      <div className="flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="font-medium">{d.hospital}</span>
                      </div>
                      {d.hospitalAddress && (
                        <div className="flex items-start gap-1.5 text-slate-500 text-[11px]">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                          <span className="whitespace-pre-line line-clamp-2">{d.hospitalAddress}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <a href={`tel:${d.phone}`} className="text-sky-600 hover:underline">{d.phone}</a>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-1.5 pt-2 border-t border-slate-100 dark:border-slate-700">
                      <Button size="sm" variant="secondary" onClick={() => setView(d)}>
                        <Eye className="w-3.5 h-3.5" /> View
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => openEdit(d)}>
                        <Pencil className="w-3.5 h-3.5 text-amber-600" /> Edit
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(d)} className="text-rose-600">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </CardBody>
                </Card>
              );
            })}
          </div>

          {/* Desktop Table */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <Th>Doctor Name</Th>
                  <Th>Hospital</Th>
                  <Th>Hospital Address</Th>
                  <Th>Contact Number</Th>
                  <Th>Prescriptions</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-slate-400 text-sm">
                      No doctor records found matching criteria
                    </td>
                  </tr>
                )}
                {filtered.map((d) => {
                  const invCount = data.invoices.filter(
                    (inv) =>
                      inv.doctorId === d.id ||
                      (inv.doctorName && inv.doctorName.toLowerCase() === d.name.toLowerCase())
                  ).length;
                  return (
                    <tr key={d.id} className="hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors">
                      <Td>
                        <div className="flex items-center gap-2">
                          <span className="w-8 h-8 rounded-full bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 flex items-center justify-center text-xs font-bold shrink-0">
                            {d.name.replace(/^(Dr\.?|Doctor)\s*/i, "").charAt(0).toUpperCase() || "D"}
                          </span>
                          <div>
                            <div className="font-semibold text-slate-800 dark:text-slate-100">{d.name}</div>
                            {d.regNo && <div className="text-[11px] text-slate-400 font-mono">Reg: {d.regNo}</div>}
                          </div>
                        </div>
                      </Td>
                      <Td>
                        <div className="font-medium text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-slate-400" />
                          <span>{d.hospital}</span>
                        </div>
                      </Td>
                      <Td>
                        {d.hospitalAddress ? (
                          <div className="text-xs text-slate-600 dark:text-slate-300 max-w-xs whitespace-pre-line">
                            {d.hospitalAddress}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </Td>
                      <Td>
                        <div className="flex items-center gap-1.5 text-xs">
                          <Phone className="w-3.5 h-3.5 text-slate-400" />
                          <a href={`tel:${d.phone}`} className="text-sky-600 dark:text-sky-400 hover:underline">
                            {d.phone}
                          </a>
                        </div>
                      </Td>
                      <Td>
                        <Badge tone="blue">
                          {invCount} invoice{invCount === 1 ? "" : "s"}
                        </Badge>
                      </Td>
                      <Td className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button size="sm" variant="secondary" onClick={() => setView(d)} title="View Doctor Details">
                            <Eye className="w-3.5 h-3.5" /> View
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => openEdit(d)} title="Edit Doctor">
                            <Pencil className="w-3.5 h-3.5 text-amber-600" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => remove(d)} title="Delete Doctor" className="text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40">
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      {/* ━━━━━━ Modal 1: Add / Edit Doctor ━━━━━━ */}
      {open && (
        <Modal open onClose={() => setOpen(false)} title={edit ? `Edit Doctor — ${edit.name}` : "Add New Doctor"}>
          <div className="space-y-4">
            <div>
              <Label>Doctor Name *</Label>
              <Input
                placeholder="e.g. Dr. Rajesh Kumar"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                autoFocus
              />
            </div>

            <div>
              <Label>Hospital / Clinic Name *</Label>
              <Input
                placeholder="e.g. City Care Multispecialty Hospital"
                value={form.hospital}
                onChange={(e) => setForm({ ...form, hospital: e.target.value })}
              />
            </div>

            <div>
              <Label>Hospital Address</Label>
              <Textarea
                placeholder="Format address across multiple lines...&#10;e.g. 2nd Floor, Medical Enclave&#10;124 Park Street&#10;Chennai - 600001"
                rows={3}
                value={form.hospitalAddress}
                onChange={(e) => setForm({ ...form, hospitalAddress: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Contact Number *</Label>
                <Input
                  placeholder="e.g. 9876543210"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div>
                <Label>Medical Reg. No (Optional)</Label>
                <Input
                  placeholder="e.g. MCI-23456"
                  value={form.regNo}
                  onChange={(e) => setForm({ ...form, regNo: e.target.value })}
                />
              </div>
            </div>

            {formError && (
              <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
                <span>⚠️</span>
                <span>{formError}</span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
              <Button variant="secondary" onClick={() => setOpen(false)} disabled={submitting}>Cancel</Button>
              <Button onClick={save} disabled={submitting}>
                {submitting ? "Saving..." : edit ? "Save Changes" : "Create Doctor"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ━━━━━━ Modal 2: View Doctor Details & Invoices ━━━━━━ */}
      {view && (
        <Modal open onClose={() => setView(null)} title={`Doctor Profile — ${view.name}`} size="lg">
          <div className="space-y-4">
            {/* Header info card */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <Stethoscope className="w-5 h-5 text-sky-600" />
                    <span>{view.name}</span>
                  </h3>
                  {view.regNo && <div className="text-xs text-slate-400 font-mono mt-0.5">Reg. No: {view.regNo}</div>}
                </div>
                <Badge tone="blue">{doctorInvoices.length} bill{doctorInvoices.length === 1 ? "" : "s"}</Badge>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-300 pt-2 border-t border-slate-200 dark:border-slate-700">
                <div>
                  <span className="text-slate-400">Hospital:</span>
                  <div className="font-semibold text-slate-800 dark:text-slate-200">{view.hospital}</div>
                </div>
                <div>
                  <span className="text-slate-400">Contact:</span>
                  <div><a href={`tel:${view.phone}`} className="text-sky-600 font-semibold">{view.phone}</a></div>
                </div>
                {view.hospitalAddress && (
                  <div className="sm:col-span-2">
                    <span className="text-slate-400">Hospital Address:</span>
                    <div className="whitespace-pre-line text-slate-700 dark:text-slate-300 mt-0.5 bg-white dark:bg-slate-700/50 p-2 rounded border border-slate-200 dark:border-slate-600">
                      {view.hospitalAddress}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Invoices list */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="font-semibold text-sm text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-sky-600" />
                  <span>Prescription & Billing History ({doctorInvoices.length})</span>
                </div>
                <div className="text-xs text-slate-500">
                  Total Value: <b className="text-sky-700 dark:text-sky-400">{fmtCurrency(totalPrescribedValue)}</b>
                </div>
              </div>

              {doctorInvoices.length === 0 ? (
                <div className="text-center py-8 text-sm text-slate-400 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
                  No invoices recorded under this doctor yet.
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {doctorInvoices.map((inv) => (
                    <div
                      key={inv.id}
                      className="p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-semibold text-sky-700 dark:text-sky-400">{inv.number}</div>
                        <div className="text-slate-500 dark:text-slate-400">
                          {fmtDate(inv.date)} · Patient: <b>{inv.patientName}</b> ({inv.items.length} items)
                        </div>
                      </div>
                      <div className="text-right font-bold text-slate-800 dark:text-slate-100">
                        {fmtCurrency(inv.total)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
              <Button variant="secondary" onClick={() => setView(null)}>Close</Button>
              <Button
                variant="primary"
                onClick={() => {
                  const d = view;
                  setView(null);
                  openEdit(d);
                }}
              >
                <Pencil className="w-3.5 h-3.5" /> Edit Profile
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default Doctors;
