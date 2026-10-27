import React, { useMemo, useState } from "react";
import { useStore, uid } from "../store/store";
import { Card, CardBody, Input, Label, Button, Th, Td, Modal, EmptyState, Badge } from "../components/ui";
import { fmtCurrency, fmtDate } from "../utils/helpers";
import { sanitizeText, sanitizePhone, isPlausiblePhone } from "../utils/security";
import type { Patient } from "../store/types";

const Patients: React.FC = () => {
  const { data, setData, log, flags } = useStore();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<Patient | null>(null);
  const [edit, setEdit] = useState<Patient | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", address: "", prescriptionUrl: "", prescriptionName: "" });

  const filtered = useMemo(() => {
    const ql = q.toLowerCase();
    return data.patients.filter((p) => p.name.toLowerCase().includes(ql) || p.phone.includes(ql));
  }, [data.patients, q]);

  const openNew = () => {
    setEdit(null);
    setForm({ name: "", phone: "", address: "", prescriptionUrl: "", prescriptionName: "" });
    setOpen(true);
  };

  const openEdit = (p: Patient) => {
    setEdit(p);
    setForm({ name: p.name, phone: p.phone, address: p.address || "", prescriptionUrl: p.prescriptionUrl || "", prescriptionName: p.prescriptionName || "" });
    setOpen(true);
  };

  // Compress images so the record stays under Firestore's 1 MiB document limit and syncs everywhere
  const compressImage = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const maxSide = 1400;
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          URL.revokeObjectURL(url);
          reject(new Error("Canvas unsupported"));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/jpeg", 0.78));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Could not read image"));
      };
      img.src = url;
    });

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      if (f.type.startsWith("image/")) {
        const compressed = await compressImage(f);
        if (compressed.length > 900 * 1024) {
          alert("Image is still too large after compression. Please use a smaller photo.");
          return;
        }
        setForm({ ...form, prescriptionUrl: compressed, prescriptionName: f.name });
      } else if (f.type === "application/pdf") {
        if (f.size > 500 * 1024) {
          alert("PDF too large for cloud sync. Max 500KB — please upload a smaller PDF or a photo instead.");
          return;
        }
        const r = new FileReader();
        r.onload = () => setForm({ ...form, prescriptionUrl: r.result as string, prescriptionName: sanitizeText(f.name, 80) });
        r.readAsDataURL(f);
      } else {
        alert("Only images or PDF files are supported.");
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not read the file.");
    } finally {
      e.target.value = "";
    }
  };

  const save = () => {
    const name = sanitizeText(form.name, 80);
    const phone = sanitizePhone(form.phone);
    if (!name || !phone) {
      alert("Name and phone are required");
      return;
    }
    if (!isPlausiblePhone(phone)) {
      alert("Enter a valid phone number (at least 7 digits)");
      return;
    }
    const clean = { ...form, name, phone, prescriptionName: sanitizeText(form.prescriptionName, 80) };
    if (edit) {
      setData((d) => ({ ...d, patients: d.patients.map((p) => (p.id === edit.id ? { ...p, ...clean } : p)) }));
      log("PATIENT_UPDATE", name);
    } else {
      const np: Patient = { id: uid("p"), createdAt: new Date().toISOString(), ...clean };
      setData((d) => ({ ...d, patients: [np, ...d.patients] }));
      log("PATIENT_CREATE", name);
    }
    setOpen(false);
  };

  const remove = (p: Patient) => {
    if (!confirm(`Delete patient ${p.name}?`)) return;
    setData((d) => ({ ...d, patients: d.patients.filter((x) => x.id !== p.id) }));
    log("PATIENT_DELETE", p.name);
  };

  const history = (pid: string) => data.invoices.filter((i) => i.patientId === pid);

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="flex flex-col sm:flex-row gap-3">
          <Input placeholder="Search by name or phone..." value={q} onChange={(e) => setQ(e.target.value)} />
          <Button onClick={openNew}>+ New Patient</Button>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <Th>Name</Th>
                  <Th>Phone</Th>
                  <Th>Address</Th>
                  <Th>Prescription</Th>
                  <Th>Visits</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((p) => {
                  const h = history(p.id);
                  return (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <Td className="font-medium">{p.name}</Td>
                      <Td>{p.phone}</Td>
                      <Td>{p.address || "—"}</Td>
                      <Td>{p.prescriptionUrl ? <Badge tone="green">Uploaded</Badge> : "—"}</Td>
                      <Td>{h.length}</Td>
                      <Td className="space-x-2">
                        <Button size="sm" variant="secondary" onClick={() => setView(p)}>History</Button>
                        <Button size="sm" variant="ghost" onClick={() => openEdit(p)}>Edit</Button>
                        <Button size="sm" variant="ghost" onClick={() => remove(p)}>🗑</Button>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && <EmptyState message="No patients found" />}
          </div>
        </CardBody>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title={edit ? "Edit Patient" : "New Patient"}>
        <div className="space-y-3">
          <div><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label>Phone *</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div><Label>Address</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          {edit && flags.prescriptionUpload && (
            <div>
              <Label>Prescription Upload (optional, required for narcotics)</Label>
              <input type="file" accept="image/*,.pdf" onChange={handleFile} className="text-sm" />
              {form.prescriptionName && <div className="text-xs text-emerald-600 mt-1">✓ {form.prescriptionName}</div>}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-3">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save}>Save</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!view} onClose={() => setView(null)} title={`History — ${view?.name}`} size="lg">
        {view && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm bg-slate-50 p-3 rounded-lg">
              <div><span className="text-slate-500">Phone:</span> {view.phone}</div>
              <div><span className="text-slate-500">Address:</span> {view.address || "—"}</div>
            </div>
            {view.prescriptionUrl && (
              <div>
                <Label>Prescription</Label>
                {view.prescriptionUrl.startsWith("data:image") ? (
                  <img src={view.prescriptionUrl} alt="Rx" className="max-h-60 rounded border cursor-pointer hover:opacity-90 transition" onClick={() => {
                    const w = window.open("", "_blank");
                    if (w) {
                      w.document.write(`<img src="${view.prescriptionUrl}" style="max-width:100%;height:auto;" />`);
                    }
                  }} />
                ) : view.prescriptionUrl.startsWith("data:application/pdf") ? (
                  <div className="space-y-2">
                    <embed src={view.prescriptionUrl} type="application/pdf" className="w-full h-96 rounded border" />
                    <div>
                      <button
                        onClick={() => {
                          const rxUrl = view.prescriptionUrl;
                          const rxName = view.prescriptionName || "prescription.pdf";
                          if (!rxUrl) return;
                          fetch(rxUrl)
                            .then(res => res.blob())
                            .then(blob => {
                              const url = URL.createObjectURL(blob);
                              const link = document.createElement("a");
                              link.href = url;
                              link.download = rxName;
                              document.body.appendChild(link);
                              link.click();
                              document.body.removeChild(link);
                              URL.revokeObjectURL(url);
                            })
                            .catch(() => {
                              window.open(rxUrl, "_blank");
                            });
                        }}
                        className="text-sky-600 underline text-sm hover:text-sky-800"
                      >
                        📎 Download {view.prescriptionName}
                      </button>
                    </div>
                  </div>
                ) : (
                  <a href={view.prescriptionUrl} download={view.prescriptionName} className="text-sky-600 underline text-sm">📎 Download {view.prescriptionName}</a>
                )}
              </div>
            )}
            <div>
              <div className="text-sm font-semibold mb-2">Purchase History</div>
              {history(view.id).length === 0 && <EmptyState message="No purchases yet" />}
              {history(view.id).map((inv) => (
                <div key={inv.id} className="border border-slate-200 rounded-lg p-3 mb-2">
                  <div className="flex justify-between text-sm">
                    <div className="font-semibold text-sky-700">{inv.number}</div>
                    <div className="text-slate-500">{fmtDate(inv.date)}</div>
                  </div>
                  <div className="text-xs text-slate-500">{inv.items.map((i) => `${i.name} ×${i.qty}`).join(", ")}</div>
                  <div className="text-right font-semibold mt-1">{fmtCurrency(inv.total)}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Patients;
