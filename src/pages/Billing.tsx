import React, { useMemo, useRef, useState } from "react";
import { useStore, uid } from "../store/store";
import { Search, Phone, X, UserRound, Banknote, CreditCard, QrCode, UserPlus, FileText, AlertTriangle, CheckCircle2, Upload, FileCheck, Stethoscope, Building2, MapPin, Plus } from "lucide-react";
import { Card, CardBody, Button, Input, Textarea, Label, Select, Badge, Th, Td, Modal } from "../components/ui";
import { fmtCurrency, fmtDate, isExpired, flashToast } from "../utils/helpers";
import { calculateBillingTotals } from "../utils/billingCalculator";
import type { Doctor, Invoice, InvoiceItem, Medicine, Patient } from "../store/types";
import { minStockOf } from "../store/types";
import InvoicePrint from "../components/InvoicePrint";

const Billing: React.FC = () => {
  const { data, setData, currentUser, log, payment, branchPayments, currentBranch, flags } = useStore();
  // UPI settings are branch-scoped: this branch's config, falling back to legacy global
  const paymentCfg = branchPayments[currentBranch?.id || currentUser?.branchId || "br_main"] || payment || {};
  const isBranchDigitalEnabled = paymentCfg.digitalEnabled !== false;
  const [search, setSearch] = useState("");
  const [payMethod, setPayMethod] = useState<"cash" | "card" | "upi">("cash");
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [patientName, setPatientName] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [patientId, setPatientId] = useState<string | undefined>();
  const [discountType, setDiscountType] = useState<"fixed" | "percent">("percent");
  const [discountValue, setDiscountValue] = useState(0);
  const [warning, setWarning] = useState("");
  const [printInv, setPrintInv] = useState<Invoice | null>(null);
  const [viewRx, setViewRx] = useState<{ url: string; type: string; name: string } | null>(null);
  const [expandedInv, setExpandedInv] = useState<string | null>(null);
  const [patientQuery, setPatientQuery] = useState("");
  const [patientMenuOpen, setPatientMenuOpen] = useState(false);

  /* Doctor state */
  const [doctorId, setDoctorId] = useState<string | undefined>();
  const [doctorName, setDoctorName] = useState("");
  const [doctorHospital, setDoctorHospital] = useState("");
  const [doctorAddress, setDoctorAddress] = useState("");
  const [doctorPhone, setDoctorPhone] = useState("");
  const [doctorQuery, setDoctorQuery] = useState("");
  const [doctorMenuOpen, setDoctorMenuOpen] = useState(false);
  const [showNewDoctor, setShowNewDoctor] = useState(false);
  const [ndForm, setNdForm] = useState({ name: "", hospital: "", hospitalAddress: "", phone: "" });

  const today = new Date().toISOString().slice(0, 10);

  /* Narcotic & Prescription document state (unlimited upload size) */
  const [rxUrl, setRxUrl] = useState("");
  const [rxName, setRxName] = useState("");
  const [showRxModal, setShowRxModal] = useState(false);
  const [rxError, setRxError] = useState("");

  const handleRxFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setRxError("");
    try {
      if (f.type.startsWith("image/") || f.type === "application/pdf") {
        const r = new FileReader();
        r.onload = () => {
          setRxUrl(r.result as string);
          setRxName(f.name);
        };
        r.onerror = () => {
          setRxError("Failed to read the selected file.");
        };
        r.readAsDataURL(f);
      } else {
        setRxError("Only image or PDF files are supported.");
      }
    } catch (err) {
      setRxError(err instanceof Error ? err.message : "Could not read the file.");
    } finally {
      e.target.value = "";
    }
  };

  const patientMatches = useMemo(() => {
    const ql = patientQuery.trim().toLowerCase();
    const digits = ql.replace(/\D/g, "");
    const list = !ql
      ? data.patients
      : data.patients.filter(
          (p) => p.name.toLowerCase().includes(ql) || (digits.length > 0 && p.phone.replace(/\D/g, "").includes(digits))
        );
    return list.slice(0, 8);
  }, [patientQuery, data.patients]);

  const hasNarcotic = useMemo(() => {
    return items.some((it) => {
      if (it.narcotic) return true;
      const med = data.medicines.find((m) => m.id === it.medicineId);
      return !!med?.narcotic;
    });
  }, [items, data.medicines]);

  const selectPatient = (p: Patient) => {
    setPatientId(p.id);
    setPatientName(p.name);
    setPatientPhone(p.phone);
    setPatientQuery("");
    setPatientMenuOpen(false);
    if (p.prescriptionUrl) {
      setRxUrl(p.prescriptionUrl);
      setRxName(p.prescriptionName || "prescription");
    } else {
      setRxUrl("");
      setRxName("");
      if (hasNarcotic) {
        openRxModal();
      }
    }
  };

  const clearPatient = () => {
    setPatientId(undefined);
    setPatientName("");
    setPatientPhone("");
    setPatientQuery("");
    setRxUrl("");
    setRxName("");
  };

  const openRxModal = () => {
    if (selectedPatient?.prescriptionUrl && !rxUrl) {
      setRxUrl(selectedPatient.prescriptionUrl);
      setRxName(selectedPatient.prescriptionName || "prescription");
    }
    setRxError("");
    setShowRxModal(true);
  };

  const saveRxToPatientProfile = () => {
    setRxError("");
    const currentDoc = rxUrl || selectedPatient?.prescriptionUrl;
    if (!currentDoc) {
      setRxError("Prescription document upload is mandatory.");
      return;
    }

    if (patientId) {
      setData((d) => ({
        ...d,
        patients: d.patients.map((p) =>
          p.id === patientId
            ? {
                ...p,
                prescriptionUrl: currentDoc,
                prescriptionName: rxName || p.prescriptionName || "prescription",
              }
            : p
        ),
      }));
      log("PRESCRIPTION_ATTACH", `Prescription attached for patient ${patientName}`);
      flashToast("✓ Prescription document attached to patient profile");
      setShowRxModal(false);
    } else {
      if (!patientName.trim()) {
        setRxError("Patient name is required to attach prescription to patient profile.");
        return;
      }
      const newPat: Patient = {
        id: uid("p"),
        name: patientName.trim(),
        phone: patientPhone.trim(),
        createdAt: new Date().toISOString(),
        prescriptionUrl: currentDoc,
        prescriptionName: rxName || "prescription",
      };
      setData((d) => ({
        ...d,
        patients: [newPat, ...d.patients],
      }));
      setPatientId(newPat.id);
      log("PRESCRIPTION_ATTACH", `Prescription attached for new patient ${newPat.name}`);
      flashToast("✓ Patient profile created & prescription attached");
      setShowRxModal(false);
    }
  };

  /* ── Add New Patient inline ── */
  const [showNewPatient, setShowNewPatient] = useState(false);
  const [npForm, setNpForm] = useState({ name: "", phone: "", address: "" });

  const saveNewPatient = () => {
    const name = npForm.name.trim();
    const phone = npForm.phone.trim();
    if (!name) return flashToast("Patient name is required", "warn");
    if (!phone) return flashToast("Phone number is required", "warn");
    if (data.patients.some((p) => p.phone === phone)) {
      return flashToast("A patient with this phone already exists — pick them from the list", "warn");
    }
    const np: Patient = { id: uid("p"), name, phone, address: npForm.address.trim() || undefined, createdAt: new Date().toISOString() };
    setData((d) => ({ ...d, patients: [np, ...d.patients] }));
    log("PATIENT_CREATE", `${name} (from billing)`);
    // auto-select the new patient without any refresh
    setPatientId(np.id);
    setPatientName(np.name);
    setPatientPhone(np.phone);
    setPatientQuery("");
    setShowNewPatient(false);
    setNpForm({ name: "", phone: "", address: "" });
    flashToast(`Patient "${name}" added & selected`);
  };

  const selectedDoctor = doctorId
    ? (data.doctors || []).find((d) => d.id === doctorId)
    : undefined;

  const doctorMatches = useMemo(() => {
    const ql = doctorQuery.trim().toLowerCase();
    const digits = ql.replace(/\D/g, "");
    const list = data.doctors || [];
    if (!ql) return list.slice(0, 8);
    return list.filter(
      (d) =>
        d.name.toLowerCase().includes(ql) ||
        d.hospital.toLowerCase().includes(ql) ||
        (d.hospitalAddress && d.hospitalAddress.toLowerCase().includes(ql)) ||
        (digits.length > 0 && d.phone.replace(/\D/g, "").includes(digits))
    ).slice(0, 8);
  }, [doctorQuery, data.doctors]);

  const selectDoctor = (d: Doctor) => {
    setDoctorId(d.id);
    setDoctorName(d.name);
    setDoctorHospital(d.hospital);
    setDoctorAddress(d.hospitalAddress || "");
    setDoctorPhone(d.phone);
    setDoctorQuery("");
    setDoctorMenuOpen(false);
  };

  const clearDoctor = () => {
    setDoctorId(undefined);
    setDoctorName("");
    setDoctorHospital("");
    setDoctorAddress("");
    setDoctorPhone("");
    setDoctorQuery("");
  };

  const saveNewDoctor = async () => {
    const name = ndForm.name.trim();
    const hospital = ndForm.hospital.trim();
    const phone = ndForm.phone.trim();
    const hospitalAddress = ndForm.hospitalAddress.trim();

    if (!name) return flashToast("Doctor name is required", "warn");
    if (!hospital) return flashToast("Hospital name is required", "warn");
    if (!phone) return flashToast("Contact phone number is required", "warn");
    if (phone.replace(/\D/g, "").length < 7) {
      return flashToast("Please enter a valid phone number with at least 7 digits", "warn");
    }

    const branchId = currentBranch?.id || currentUser?.branchId || "br_main";
    const payload: Partial<Doctor> & { name: string; hospital: string; phone: string; branchId: string } = {
      name,
      hospital,
      phone,
      branchId,
    };
    if (hospitalAddress) payload.hospitalAddress = hospitalAddress;

    let backendDoc: Doctor | null = null;
    try {
      const res = await fetch("/api/doctors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.doctor) backendDoc = json.doctor;
      }
    } catch (err) {
      console.warn("[Backend doctor creation fallback]", err);
    }

    const nd: Doctor = backendDoc || {
      id: uid("doc"),
      ...payload,
      createdAt: new Date().toISOString(),
    };

    setData((d) => ({ ...d, doctors: [nd, ...(d.doctors || []).filter((x) => x.id !== nd.id)] }));
    log("DOCTOR_CREATE", `${name} (${hospital}) from billing`);
    selectDoctor(nd);
    setShowNewDoctor(false);
    setNdForm({ name: "", hospital: "", hospitalAddress: "", phone: "" });
    flashToast(`Doctor "${name}" added & selected`, "ok");
  };

  const openRx = (p: Patient) => {
    const rxUrl = p.prescriptionUrl;
    const rxName = p.prescriptionName || "prescription";
    if (!rxUrl) return;
    if (rxUrl.startsWith("data:image")) setViewRx({ url: rxUrl, type: "image", name: rxName });
    else if (rxUrl.startsWith("data:application/pdf")) setViewRx({ url: rxUrl, type: "pdf", name: rxName });
    else window.open(rxUrl, "_blank");
  };

  const selectedPatient = patientId ? data.patients.find((p) => p.id === patientId) : undefined;
  const reqNarcoticRx = Boolean(hasNarcotic && (flags.narcoticPrescriptionRequired ?? true));
  const isRxComplete = useMemo(() => {
    if (!reqNarcoticRx) return true;
    const activeDoc = rxUrl || selectedPatient?.prescriptionUrl;
    return Boolean((patientId || patientName.trim()) && activeDoc);
  }, [reqNarcoticRx, patientId, patientName, rxUrl, selectedPatient]);

  const patientHistory = useMemo(
    () => (patientId ? data.invoices.filter((inv) => inv.patientId === patientId) : []),
    [patientId, data.invoices]
  );

  /* Available payment methods derived from master switch, mutually exclusive toggles, and branch digital enabled */
  const availablePaymentMethods = useMemo(() => {
    if (!flags.paymentsMaster) return [];
    if (flags.payPos) {
      return [
        { id: "card", label: "Card", icon: CreditCard },
        ...(isBranchDigitalEnabled ? [{ id: "upi", label: "UPI", icon: QrCode } as const] : []),
        { id: "cash", label: "Cash", icon: Banknote },
      ];
    }
    // "Digital Payments" mode displays only Cash and UPI options (UPI only if enabled for branch)
    return [
      { id: "cash", label: "Cash", icon: Banknote },
      ...(isBranchDigitalEnabled ? [{ id: "upi", label: "UPI", icon: QrCode } as const] : []),
    ];
  }, [flags.paymentsMaster, flags.payPos, flags.payDigital, isBranchDigitalEnabled]);

  React.useEffect(() => {
    if (!flags.paymentsMaster) {
      setPayMethod("cash");
      return;
    }
    if (availablePaymentMethods.length > 0 && !availablePaymentMethods.some((m) => m.id === payMethod)) {
      setPayMethod(availablePaymentMethods[0].id);
    }
  }, [flags.paymentsMaster, availablePaymentMethods, payMethod]);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return []; // remain blank — no recommendations before typing begins
    return data.medicines.filter((m) => m.name.toLowerCase().includes(q) || m.batch.toLowerCase().includes(q)).slice(0, 8);
  }, [search, data.medicines]);

  const addItem = (m: Medicine) => {
    setWarning("");
    if (isExpired(m.expiry)) {
      setWarning(`⛔ Cannot add ${m.name} — medicine is EXPIRED`);
      return;
    }
    if (m.stock <= 0) {
      setWarning(`⛔ ${m.name} is out of stock`);
      return;
    }
    const existing = items.find((i) => i.medicineId === m.id);
    if (existing) {
      const curQ = Number(existing.qty) || 0;
      const nextQ = curQ === 0 ? 1 : curQ + 1;
      if (nextQ > m.stock) {
        setWarning(`⚠️ Only ${m.stock} units available for ${m.name}`);
        return;
      }
      setItems(items.map((i) => (i.medicineId === m.id ? { ...i, qty: nextQ } : i)));
    } else {
      setItems([
        ...items,
        {
          medicineId: m.id,
          name: m.name,
          batch: m.batch,
          expiry: m.expiry,
          qty: "" as unknown as number,
          price: m.sellingPrice,
          gst: m.gst,
          narcotic: !!m.narcotic,
        },
      ]);
    }
    setSearch("");

    // If medicine is marked narcotic, trigger mandatory prescription check
    if (m.narcotic && (flags.narcoticPrescriptionRequired ?? true)) {
      if (!patientId && !patientName.trim()) {
        setWarning("⚠️ Narcotic medicine added. A patient profile & prescription details are mandatory to bill this item.");
        openRxModal();
      } else {
        const pat = patientId ? data.patients.find((p) => p.id === patientId) : undefined;
        if (!pat?.prescriptionUrl && !rxUrl) {
          openRxModal();
        }
      }
    }
  };

  const updateQty = (id: string, val: number | string) => {
    const med = data.medicines.find((m) => m.id === id);
    if (!med) return;
    if (val === "" || val === undefined) {
      setItems(items.map((i) => (i.medicineId === id ? { ...i, qty: "" as unknown as number } : i)));
      return;
    }
    const q = Number(val);
    if (q > med.stock) {
      setWarning(`⚠️ Only ${med.stock} units available for ${med.name}`);
      return;
    }
    setWarning("");
    if (q < 0) return;
    setItems(items.map((i) => (i.medicineId === id ? { ...i, qty: q } : i)));
  };

  const removeItem = (id: string) => setItems(items.filter((i) => i.medicineId !== id));

  const totals = useMemo(() => {
    return calculateBillingTotals(items, discountType, discountValue);
  }, [items, discountType, discountValue]);

  /* ── POS Swipe Machine push flow ── */
  const [posFlow, setPosFlow] = useState<{ step: "connect" | "push" | "await" | "done"; amount: number } | null>(null);
  const posTimers = useRef<number[]>([]);
  React.useEffect(() => () => { posTimers.current.forEach((t) => window.clearTimeout(t)); }, []);

  const generateBill = () => {
    if (items.length === 0) {
      setWarning("Add at least one medicine");
      return;
    }
    if (items.some((i) => !Number(i.qty) || Number(i.qty) <= 0)) {
      setWarning("Please enter a valid quantity of tablets for all items");
      return;
    }
    if (!patientName.trim()) {
      setWarning("Patient name is required");
      return;
    }

    // Narcotic verification check: block bill generation until prescription is attached with details
    if (hasNarcotic && (flags.narcoticPrescriptionRequired ?? true)) {
      if (!patientId && !patientName.trim()) {
        setWarning("⛔ A patient profile is mandatory for narcotic / controlled medicines.");
        openRxModal();
        return;
      }
      const pat = patientId ? data.patients.find((p) => p.id === patientId) : undefined;
      const activeRxUrl = rxUrl || pat?.prescriptionUrl;

      if (!activeRxUrl) {
        setWarning("⛔ Bill generation blocked: A prescription document (photo or PDF) must be uploaded and attached to the patient's billing profile.");
        openRxModal();
        return;
      }
    }

    if (flags.paymentsMaster && flags.payPos && (payMethod === "card" || payMethod === "upi")) {
      const amount = totals.total;
      setPosFlow({ step: "connect", amount });
      posTimers.current.push(window.setTimeout(() => setPosFlow({ step: "push", amount }), 1200));
      posTimers.current.push(window.setTimeout(() => setPosFlow({ step: "await", amount }), 2600));
      posTimers.current.push(window.setTimeout(() => setPosFlow({ step: "done", amount }), 4600));
      posTimers.current.push(window.setTimeout(() => {
        setPosFlow(null);
        finalize(`POS-${Date.now().toString().slice(-8)}`);
      }, 5600));
      return;
    }
    finalize();
  };

  const finalize = (posRef?: string) => {
    const newCounter = data.counters.invoice + 1;
    const activePat = patientId ? data.patients.find((p) => p.id === patientId) : undefined;
    const inv: Invoice = {
      id: uid("inv"),
      number: "INV-" + newCounter,
      patientId,
      patientName: patientName.trim(),
      patientPhone: patientPhone.trim() || undefined,
      doctorId,
      doctorName: doctorName.trim() || selectedDoctor?.name || undefined,
      hospital: doctorHospital.trim() || selectedDoctor?.hospital || undefined,
      doctorPhone: doctorPhone.trim() || selectedDoctor?.phone || undefined,
      items: items.map((i) => ({
        ...i,
        qty: Number(i.qty) || 0,
        expiry: i.expiry || data.medicines.find((m) => m.id === i.medicineId)?.expiry || "",
      })),
      subtotal: totals.subtotal,
      discount: totals.discount,
      discountType,
      discountValue,
      taxAmount: totals.taxAmount,
      total: totals.total,
      date: new Date().toISOString(),
      createdBy: currentUser?.username || "unknown",
      paymentMethod: flags.paymentsMaster ? payMethod : "cash",
      posRef,
      hasNarcotic,
      prescriptionUrl: hasNarcotic ? (rxUrl || activePat?.prescriptionUrl) : undefined,
      prescriptionName: hasNarcotic ? (rxName || activePat?.prescriptionName) : undefined,
    };
    setData((d) => {
      // deduct stock
      const meds = d.medicines.map((m) => {
        const it = items.find((i) => i.medicineId === m.id);
        const q = it ? (Number(it.qty) || 0) : 0;
        return it ? { ...m, stock: m.stock - q } : m;
      });
      // add patient if new
      let patients = d.patients;
      if (!patientId && patientName.trim()) {
        const np: Patient = {
          id: uid("p"),
          name: patientName.trim(),
          phone: patientPhone.trim(),
          createdAt: new Date().toISOString(),
          prescriptionUrl: hasNarcotic ? rxUrl : undefined,
          prescriptionName: hasNarcotic ? rxName : undefined,
        };
        patients = [np, ...patients];
        inv.patientId = np.id;
      }
      return {
        ...d,
        medicines: meds,
        invoices: [inv, ...d.invoices],
        patients,
        counters: { ...d.counters, invoice: newCounter },
      };
    });
    log("BILLING_CREATE", `Invoice ${inv.number} for ${patientName} — ${fmtCurrency(inv.total)}${hasNarcotic ? " (Narcotic prescription verified)" : ""}`);
    setPrintInv(inv);
    setItems([]);
    setPatientName("");
    setPatientPhone("");
    setPatientId(undefined);
    setDiscountValue(0);
    setWarning("");
    setPayMethod("cash");
    setRxUrl("");
    setRxName("");
    clearDoctor();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2 space-y-5">
        <Card>
          <CardBody>
            <Label>Search Medicine (by name or batch)</Label>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Type to search medicines..." />
            {search.trim().length > 0 && (
              matches.length > 0 ? (
                <div className="mt-2 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                  {matches.map((m) => {
                    const exp = isExpired(m.expiry);
                    const isNarc = !!m.narcotic;
                    return (
                      <button
                        key={m.id}
                        onClick={() => addItem(m)}
                        className={`w-full text-left px-3 py-2.5 border-b border-slate-100 dark:border-slate-700 last:border-0 flex items-center justify-between gap-3 transition-colors ${
                          isNarc
                            ? "bg-rose-50/90 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/50 border-l-4 border-l-rose-500"
                            : "hover:bg-sky-50 dark:hover:bg-slate-700/50"
                        }`}
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`font-semibold text-sm ${isNarc ? "text-rose-700 dark:text-rose-300" : "text-slate-800 dark:text-slate-200"}`}>
                              {m.name}
                            </span>
                            {isNarc && <Badge tone="red">NARCOTIC</Badge>}
                          </div>
                          <div className={`text-xs ${isNarc ? "text-rose-600/90 dark:text-rose-400 font-medium" : "text-slate-500 dark:text-slate-400"}`}>
                            Batch {m.batch} · Stock {m.stock} · Exp {m.expiry}
                            {isNarc && ((flags.narcoticPrescriptionRequired ?? true) ? " · ⚠️ Prescription Required" : " · ⚠️ Narcotic")}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className={`font-semibold ${isNarc ? "text-rose-700 dark:text-rose-300" : "text-sky-700 dark:text-sky-400"}`}>
                            {fmtCurrency(m.sellingPrice)}
                          </div>
                          {exp && <Badge tone="red">EXPIRED</Badge>}
                          {!exp && m.stock <= minStockOf(m) && m.stock > 0 && <Badge tone="amber">LOW</Badge>}
                          {m.stock === 0 && <Badge tone="red">OUT</Badge>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-2 p-3 text-center text-xs text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50/50 dark:bg-slate-800/40">
                  No medicine found matching "{search.trim()}". Only medicines previously added in Inventory can be billed.
                </div>
              )
            )}
            {warning && <div className="mt-3 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{warning}</div>}
          </CardBody>
        </Card>

        <Card>
          <CardBody className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <Th>Medicine</Th>
                    <Th>Batch</Th>
                    <Th>Expiry</Th>
                    <Th>GST %</Th>
                    <Th>Qty</Th>
                    <Th>Stock</Th>
                    <Th>Price</Th>
                    <Th>Total</Th>
                    <Th></Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={9} className="text-center py-8 text-slate-400 text-sm">No items added yet</td>
                    </tr>
                  )}
                  {items.map((i) => {
                    const med = data.medicines.find((m) => m.id === i.medicineId);
                    const currentStock = med ? med.stock : 0;
                    const qtyNum = Number(i.qty) || 0;
                    const remaining = currentStock - qtyNum;
                    const exp = i.expiry || med?.expiry || "—";
                    return (
                      <tr key={i.medicineId} className={i.narcotic ? "bg-rose-50/40 dark:bg-rose-950/20" : ""}>
                        <Td>
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-slate-800 dark:text-slate-100">{i.name}</span>
                            {i.narcotic && <Badge tone="red">NARCOTIC</Badge>}
                          </div>
                        </Td>
                        <Td className="text-xs text-slate-600 font-mono">{i.batch}</Td>
                        <Td className="text-xs text-slate-600">{exp}</Td>
                        <Td className="text-xs text-slate-600 font-medium">{i.gst != null ? `${i.gst}%` : "0%"}</Td>
                        <Td>
                          <input
                            type="number"
                            min={1}
                            max={currentStock}
                            value={i.qty === 0 || (i.qty as unknown as string) === "" ? "" : i.qty}
                            onChange={(e) => updateQty(i.medicineId, e.target.value)}
                            placeholder="Qty"
                            className="w-20 px-2 py-1 border border-slate-300 rounded-md text-sm"
                          />
                        </Td>
                        <Td>
                          <div className="flex flex-col">
                            <span className={`font-semibold ${remaining <= 0 ? "text-rose-600" : remaining <= 10 ? "text-amber-600" : "text-emerald-600"}`}>
                              {currentStock}
                            </span>
                            <span className="text-[10px] text-slate-500">After: {remaining}</span>
                          </div>
                        </Td>
                        <Td>{fmtCurrency(i.price)}</Td>
                        <Td className="font-semibold">{fmtCurrency(qtyNum * i.price)}</Td>
                        <Td>
                          <button onClick={() => removeItem(i.medicineId)} className="text-rose-600 hover:text-rose-800 text-lg">×</button>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="space-y-5">
        <Card>
          <CardBody className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold text-slate-800">Patient Info</div>
              <button
                type="button"
                onClick={() => setShowNewPatient(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 active:scale-95 transition-all"
              >
                <UserPlus className="w-3.5 h-3.5" /> Add New Patient
              </button>
            </div>
            <div className="relative">
              <Label>Search Patient — by name or phone</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <Input
                  value={patientQuery}
                  onChange={(e) => {
                    setPatientQuery(e.target.value);
                    setPatientMenuOpen(true);
                    if (patientId) setPatientId(undefined);
                  }}
                  onFocus={() => setPatientMenuOpen(true)}
                  onBlur={() => window.setTimeout(() => setPatientMenuOpen(false), 140)}
                  placeholder="Type name or phone number..."
                  className="pl-9 pr-9"
                />
                {patientQuery && (
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setPatientQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {patientMenuOpen && patientMatches.length > 0 && (
                <div className="absolute z-20 mt-1 w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-xl max-h-56 overflow-y-auto">
                  {patientMatches.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => selectPatient(p)}
                      className="w-full flex items-center gap-3 px-3 py-2 hover:bg-sky-50 dark:hover:bg-sky-900/20 text-left transition-colors"
                    >
                      <span className="w-8 h-8 rounded-full bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 flex items-center justify-center text-xs font-bold shrink-0">
                        {p.name.charAt(0).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{p.name}</span>
                        <span className="block text-xs text-slate-500 dark:text-slate-400 items-center gap-1 hidden sm:flex">
                          <Phone className="w-3 h-3" /> {p.phone}
                        </span>
                      </span>
                      <span className="text-[11px] text-slate-400 shrink-0">
                        {data.invoices.filter((i) => i.patientId === p.id).length} bills
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {patientId && selectedPatient && (
                <div className="mt-2 inline-flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 rounded-full px-3 py-1 text-xs font-medium">
                  <UserRound className="w-3.5 h-3.5" />
                  {selectedPatient.name} · {selectedPatient.phone}
                  <button type="button" onClick={clearPatient} className="hover:text-emerald-900 dark:hover:text-emerald-100 transition-colors" title="Clear patient">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              {!patientId && <p className="text-[11px] text-slate-400 mt-1">Leave empty for a walk-in customer.</p>}
            </div>
            <div>
              <Label>Patient Name *</Label>
              <Input value={patientName} onChange={(e) => setPatientName(e.target.value)} />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={patientPhone} onChange={(e) => setPatientPhone(e.target.value)} />
            </div>
          </CardBody>
        </Card>

        {/* Narcotic Prescription Verification Card */}
        {reqNarcoticRx && (
          <Card className="border-2 border-rose-300 dark:border-rose-800 bg-rose-50/70 dark:bg-rose-950/40">
            <CardBody className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg bg-rose-200 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300 flex items-center justify-center text-xs font-black">
                    Rx
                  </span>
                  <div>
                    <div className="text-sm font-bold text-rose-900 dark:text-rose-100">
                      Prescription Verification
                    </div>
                    <div className="text-[11px] text-rose-600 dark:text-rose-300">
                      Mandatory for narcotic medicines
                    </div>
                  </div>
                </div>
                {(rxUrl || selectedPatient?.prescriptionUrl) ? (
                  <Badge tone="green">Attached</Badge>
                ) : (
                  <Badge tone="red">Required</Badge>
                )}
              </div>

              {(rxUrl || selectedPatient?.prescriptionUrl) ? (
                <div className="rounded-lg bg-white dark:bg-slate-800 p-2.5 border border-emerald-200 dark:border-emerald-800 text-xs space-y-1">
                  <div className="text-emerald-700 dark:text-emerald-300 font-semibold flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> Prescription attached to patient profile
                  </div>
                  <div className="text-slate-600 dark:text-slate-400 text-[11px] truncate">
                    Document: {rxName || selectedPatient?.prescriptionName || "Attached prescription"}
                  </div>
                </div>
              ) : (
                <div className="rounded-lg bg-rose-100/80 dark:bg-rose-900/30 p-2.5 border border-rose-200 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-200 space-y-1">
                  <div className="font-semibold flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" /> Bill generation is blocked
                  </div>
                  <p className="text-[11px] text-rose-700 dark:text-rose-300">
                    Upload and attach the prescription document to the patient's billing profile.
                  </p>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                {(rxUrl || selectedPatient?.prescriptionUrl) && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="flex-1 text-xs"
                    onClick={() => {
                      const url = rxUrl || selectedPatient?.prescriptionUrl || "";
                      const name = rxName || selectedPatient?.prescriptionName || "prescription";
                      if (url.startsWith("data:image")) setViewRx({ url, type: "image", name });
                      else if (url.startsWith("data:application/pdf")) setViewRx({ url, type: "pdf", name });
                      else window.open(url, "_blank");
                    }}
                  >
                    👁 View Document
                  </Button>
                )}
                <Button
                  size="sm"
                  variant={(rxUrl || selectedPatient?.prescriptionUrl) ? "secondary" : "danger"}
                  className="flex-1 text-xs"
                  onClick={openRxModal}
                >
                  <FileText className="w-3.5 h-3.5" />
                  {(rxUrl || selectedPatient?.prescriptionUrl) ? "Edit Details" : "Attach Prescription *"}
                </Button>
              </div>
            </CardBody>
          </Card>
        )}

        {/* Patient history + old prescription */}
        {selectedPatient && (
          <Card>
            <CardBody className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-slate-800 flex items-center gap-2">🕘 Patient History</div>
                <Badge tone="blue">{patientHistory.length} visit{patientHistory.length === 1 ? "" : "s"}</Badge>
              </div>

              {/* Old prescription */}
              {selectedPatient.prescriptionUrl && (
                <div className="rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <Label className="mb-0">📎 Old Prescription</Label>
                    <button type="button" onClick={() => openRx(selectedPatient)} className="text-xs text-sky-600 hover:text-sky-800 font-medium">
                      👁 View Full Size
                    </button>
                  </div>
                  {selectedPatient.prescriptionUrl.startsWith("data:image") ? (
                    <img
                      src={selectedPatient.prescriptionUrl}
                      alt="Prescription"
                      className="max-h-36 rounded-lg cursor-pointer hover:opacity-90 transition"
                      onClick={() => openRx(selectedPatient)}
                    />
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                      <span className="text-lg">📄</span>
                      <span className="flex-1 truncate">{selectedPatient.prescriptionName || "prescription"}</span>
                      <button type="button" onClick={() => openRx(selectedPatient)} className="text-sky-600 hover:text-sky-800 font-medium">Open</button>
                    </div>
                  )}
                </div>
              )}

              {/* Past purchases */}
              {patientHistory.length === 0 ? (
                <div className="text-sm text-slate-400 text-center py-4">No previous purchases for this patient.</div>
              ) : (
                <div className="space-y-2">
                  {patientHistory.slice(0, 12).map((inv) => (
                    <div key={inv.id} className="rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden transition hover:border-sky-300 dark:hover:border-sky-700">
                      <button
                        type="button"
                        onClick={() => setExpandedInv(expandedInv === inv.id ? null : inv.id)}
                        className="w-full flex items-center justify-between px-3 py-2.5 bg-white dark:bg-slate-800 text-left"
                      >
                        <div>
                          <div className="text-sm font-semibold text-sky-700 dark:text-sky-300">{inv.number}</div>
                          <div className="text-xs text-slate-500">{fmtDate(inv.date)} · {inv.items.length} item{inv.items.length === 1 ? "" : "s"}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{fmtCurrency(inv.total)}</span>
                          <span className={`text-xs text-slate-400 transition-transform duration-200 ${expandedInv === inv.id ? "rotate-180" : ""}`}>▾</span>
                        </div>
                      </button>
                      {expandedInv === inv.id && (
                        <div className="px-3 py-2 bg-slate-50 dark:bg-slate-700/40 border-t border-slate-200 dark:border-slate-600 space-y-1">
                          {inv.items.map((it, idx) => (
                            <div key={idx} className="flex justify-between text-xs text-slate-600 dark:text-slate-300">
                              <span>{it.name} <span className="text-slate-400">×{it.qty}</span></span>
                              <span className="font-medium">{fmtCurrency(it.qty * it.price)}</span>
                            </div>
                          ))}
                          <div className="flex justify-between text-xs pt-1 mt-1 border-t border-slate-200 dark:border-slate-600 text-slate-500">
                            <span>{inv.discount > 0 ? `Discount -${fmtCurrency(inv.discount)}` : "Price includes GST"}</span>
                            <span className="font-semibold">Total {fmtCurrency(inv.total)}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        )}

        {/* ── DOCTOR INFO SECTION ── */}
        <Card>
          <CardBody className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Stethoscope className="w-4 h-4 text-sky-600" />
                <span>Doctor Info</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setNdForm({ name: doctorQuery.trim(), hospital: "", hospitalAddress: "", phone: "" });
                  setShowNewDoctor(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 active:scale-95 transition-all shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" /> Add Doctor
              </button>
            </div>

            {/* If doctor is selected, show details card with clear button */}
            {doctorId && selectedDoctor ? (
              <div className="rounded-xl border border-sky-200 dark:border-sky-800 bg-sky-50/70 dark:bg-sky-950/30 p-3 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                      <Stethoscope className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                      <span className="truncate">{selectedDoctor.name}</span>
                    </div>
                    <div className="text-xs text-sky-700 dark:text-sky-300 font-medium flex items-center gap-1 mt-0.5">
                      <Building2 className="w-3 h-3 shrink-0" />
                      <span>{selectedDoctor.hospital}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={clearDoctor}
                    className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                    title="Change or remove doctor"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {selectedDoctor.hospitalAddress && (
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-start gap-1 pt-1 border-t border-sky-100 dark:border-sky-900 whitespace-pre-line">
                    <MapPin className="w-3 h-3 shrink-0 mt-0.5 text-slate-400" />
                    <span>{selectedDoctor.hospitalAddress}</span>
                  </div>
                )}

                <div className="text-xs text-slate-600 dark:text-slate-300 flex items-center justify-between pt-1">
                  <span className="flex items-center gap-1 text-[11px] text-slate-500">
                    <Phone className="w-3 h-3" /> {selectedDoctor.phone}
                  </span>
                  {selectedDoctor.regNo && (
                    <span className="text-[10px] font-mono text-slate-400">Reg: {selectedDoctor.regNo}</span>
                  )}
                </div>
              </div>
            ) : (
              <div className="relative">
                <Label>Select Prescribing Doctor</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <Input
                    value={doctorQuery}
                    onChange={(e) => {
                      setDoctorQuery(e.target.value);
                      setDoctorMenuOpen(true);
                    }}
                    onFocus={() => setDoctorMenuOpen(true)}
                    onBlur={() => window.setTimeout(() => setDoctorMenuOpen(false), 150)}
                    placeholder="Search doctor by name, hospital, or phone..."
                    className="pl-9 pr-9"
                  />
                  {doctorQuery && (
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setDoctorQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {doctorMenuOpen && (
                  <div className="absolute z-20 mt-1 w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-xl max-h-56 overflow-y-auto">
                    {doctorMatches.length === 0 ? (
                      <div className="p-3 text-center text-xs text-slate-500">
                        <div>No doctor found matching "{doctorQuery}"</div>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setDoctorMenuOpen(false);
                            setNdForm({ name: doctorQuery.trim(), hospital: "", hospitalAddress: "", phone: "" });
                            setShowNewDoctor(true);
                          }}
                          className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-sky-600 hover:underline"
                        >
                          <Plus className="w-3 h-3" /> Add "{doctorQuery.trim()}" as New Doctor
                        </button>
                      </div>
                    ) : (
                      doctorMatches.map((d) => (
                        <button
                          key={d.id}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => selectDoctor(d)}
                          className="w-full flex items-center gap-3 px-3 py-2 hover:bg-sky-50 dark:hover:bg-sky-900/20 text-left transition-colors border-b border-slate-100 dark:border-slate-700/50 last:border-0"
                        >
                          <span className="w-8 h-8 rounded-full bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 flex items-center justify-center text-xs font-bold shrink-0">
                            {d.name.replace(/^(Dr\.?|Doctor)\s*/i, "").charAt(0).toUpperCase() || "D"}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{d.name}</span>
                            <span className="block text-xs text-slate-500 dark:text-slate-400 truncate">
                              {d.hospital} · {d.phone}
                            </span>
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardBody className="space-y-3">
            <div className="font-semibold text-slate-800">Bill Summary</div>
            
            {/* Subtotal */}
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Subtotal</span>
              <span className="font-medium">{fmtCurrency(totals.subtotal)}</span>
            </div>
            
            {/* Discount section */}
            <div className="border-t border-slate-200 pt-3 mt-2 bg-slate-50 dark:bg-slate-700/30 rounded-lg p-3">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-slate-700 font-semibold">Discount</span>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <Select value={discountType} onChange={(e) => setDiscountType(e.target.value as "fixed" | "percent")}>
                  <option value="percent">% Percent</option>
                  <option value="fixed">₹ Fixed</option>
                </Select>
                <Input 
                  type="number" 
                  min={0} 
                  value={discountValue} 
                  onChange={(e) => setDiscountValue(Number(e.target.value))} 
                  placeholder={discountType === "percent" ? "Enter %" : "Enter ₹"} 
                />
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Discount Amount</span>
                <span className="font-medium text-rose-600">- {fmtCurrency(totals.discount)}</span>
              </div>
            </div>
            
            {/* Payment method selector — controlled by master toggle */}
            {flags.paymentsMaster && availablePaymentMethods.length > 0 && (
              <div className="border-t border-slate-200 pt-3 mt-2">
                <div className="text-sm font-semibold text-slate-700 mb-2">Payment Method</div>
                <div className={`grid gap-2 ${availablePaymentMethods.length === 3 ? "grid-cols-3" : availablePaymentMethods.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
                  {availablePaymentMethods.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setPayMethod(m.id as "cash" | "card" | "upi")}
                      className={`flex flex-col items-center gap-1.5 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${
                        payMethod === m.id
                          ? "border-sky-500 bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 shadow-sm"
                          : "border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-sky-300 hover:text-slate-700 dark:hover:text-slate-200"
                      }`}
                    >
                      <m.icon className="w-5 h-5" />
                      {m.label}
                    </button>
                  ))}
                </div>

                {payMethod === "upi" && flags.payPos && (
                  <div className="mt-3 rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50/60 dark:bg-violet-900/20 p-4 text-center">
                    <CreditCard className="w-6 h-6 text-violet-600 dark:text-violet-300 mx-auto mb-1" />
                    <div className="text-sm font-bold text-violet-800 dark:text-violet-200">POS Swipe Machine</div>
                    <div className="text-xs text-violet-700 dark:text-violet-300 mt-1">Generating the bill will push {fmtCurrency(totals.total)} to the connected terminal.</div>
                  </div>
                )}
                {payMethod === "card" && flags.payPos && (
                  <div className="mt-3 rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50/60 dark:bg-violet-900/20 p-4 text-center">
                    <CreditCard className="w-6 h-6 text-violet-600 dark:text-violet-300 mx-auto mb-1" />
                    <div className="text-sm font-bold text-violet-800 dark:text-violet-200">Card via POS Swipe Machine</div>
                    <div className="text-xs text-violet-700 dark:text-violet-300 mt-1">{fmtCurrency(totals.total)} will be pushed to the terminal on generate.</div>
                  </div>
                )}
                {payMethod === "upi" && !flags.payPos && isBranchDigitalEnabled && (
                  <div className="mt-3 rounded-xl border border-sky-200 dark:border-sky-800 bg-sky-50/60 dark:bg-sky-900/20 p-4 text-center">
                    {paymentCfg.upiQr ? (
                      <>
                        <div className="mx-auto w-44 h-44 rounded-xl bg-white ring-1 ring-slate-200 p-2 shadow-sm">
                          <img src={paymentCfg.upiQr} alt="UPI QR code" className="w-full h-full object-contain" />
                        </div>
                        <div className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-100">
                          Scan & pay {fmtCurrency(totals.total)}
                        </div>
                        {paymentCfg.upiName && <div className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">{paymentCfg.upiName}</div>}
                        {paymentCfg.upiId && <div className="text-xs font-mono text-sky-700 dark:text-sky-300 mt-0.5">{paymentCfg.upiId}</div>}
                        <div className="mt-2 text-[11px] text-slate-400">Confirm the payment, then generate the bill</div>
                      </>
                    ) : (
                      <div className="text-sm text-slate-500 dark:text-slate-400 py-2">
                        No UPI QR configured yet.
                        <div className="text-xs mt-1">Add your merchant UPI QR in <b>Settings → Payments</b> to show it here.</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Final Total */}
            <div className="flex justify-between text-xl font-bold pt-3 border-t-2 border-sky-200">
              <span className="text-slate-800">Final Total</span>
              <span className="text-sky-700">{fmtCurrency(totals.total)}</span>
            </div>
            <div className="text-[11px] text-slate-400 text-right italic">
              All prices include GST · No separate tax added
            </div>

            {/* Narcotic Blocking Warning */}
            {reqNarcoticRx && !isRxComplete && (
              <div className="rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 p-3 space-y-2 text-xs">
                <div className="flex items-center gap-2 text-rose-800 dark:text-rose-200 font-bold">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  Bill Generation Blocked
                </div>
                <p className="text-rose-700 dark:text-rose-300 text-[11px] leading-relaxed">
                  Contains narcotic / controlled medication. Prescription document must be attached to the patient profile before bill generation is allowed.
                </p>
                <Button size="sm" variant="danger" className="w-full text-xs" onClick={openRxModal}>
                  <FileText className="w-3.5 h-3.5" /> Attach Prescription *
                </Button>
              </div>
            )}

            <Button 
              className={`w-full ${reqNarcoticRx && !isRxComplete ? "opacity-60 cursor-not-allowed" : ""}`} 
              onClick={generateBill}
            >
              🧾 Generate Bill
            </Button>
          </CardBody>
        </Card>
      </div>

      {printInv && <InvoicePrint invoice={printInv} onClose={() => setPrintInv(null)} />}
      
      {/* Prescription View Modal */}
      {viewRx && (
        <Modal open={!!viewRx} onClose={() => setViewRx(null)} title={`Prescription — ${viewRx.name}`} size="lg">
          <div className="text-center">
            {viewRx.type === "image" ? (
              <img src={viewRx.url} alt="Prescription" className="max-w-full max-h-[70vh] rounded-lg shadow-lg mx-auto" />
            ) : (
              // For PDFs, use embed/object tag which works better than data URLs
              <div className="w-full h-[70vh] bg-slate-100 dark:bg-slate-700 rounded-lg overflow-hidden">
                <embed src={viewRx.url} type="application/pdf" className="w-full h-full" />
              </div>
            )}
            <div className="mt-4 flex justify-center gap-3">
              <Button variant="secondary" onClick={() => {
                // Convert data URL to blob and download
                fetch(viewRx.url)
                  .then(res => res.blob())
                  .then(blob => {
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement("a");
                    link.href = url;
                    link.download = viewRx.name || "prescription";
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    URL.revokeObjectURL(url);
                  })
                  .catch(() => {
                    // Fallback: open in new tab if download fails
                    window.open(viewRx.url, "_blank");
                  });
              }}>📥 Download</Button>
              <Button onClick={() => setViewRx(null)}>Close</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Add New Patient modal */}
      {showNewPatient && (
        <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <style>{`@keyframes np-pop { from { opacity: 0; transform: translateY(14px) scale(.97); } to { opacity: 1; transform: none; } }`}</style>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md p-6" style={{ animation: "np-pop .3s cubic-bezier(.22,1,.36,1) both" }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-xl bg-sky-100 dark:bg-sky-900/40 text-sky-600 dark:text-sky-300 flex items-center justify-center">
                  <UserPlus className="w-4.5 h-4.5" />
                </span>
                <h3 className="text-lg font-extrabold text-slate-800 dark:text-slate-100">Add New Patient</h3>
              </div>
              <button onClick={() => setShowNewPatient(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <Label>Patient Name *</Label>
                <Input autoFocus value={npForm.name} onChange={(e) => setNpForm({ ...npForm, name: e.target.value })} placeholder="Full name" />
              </div>
              <div>
                <Label>Phone Number *</Label>
                <Input value={npForm.phone} onChange={(e) => setNpForm({ ...npForm, phone: e.target.value })} placeholder="10-digit mobile" inputMode="tel" />
              </div>
              <div>
                <Label>Address (optional)</Label>
                <Input value={npForm.address} onChange={(e) => setNpForm({ ...npForm, address: e.target.value })} placeholder="Street, city" />
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="secondary" className="flex-1" onClick={() => setShowNewPatient(false)}>Cancel</Button>
                <Button className="flex-1" onClick={saveNewPatient}>Save & Select</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* POS Swipe Machine processing overlay */}
      {posFlow && (
        <div className="fixed inset-0 z-[70] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
          <style>{`
            @keyframes pos-pulse { 0%,100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.06); opacity: .85; } }
            @keyframes pos-pop { from { opacity: 0; transform: scale(.5); } 60% { transform: scale(1.1); } to { transform: scale(1); } }
          `}</style>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm p-7 text-center">
            {posFlow.step === "done" ? (
              <>
                <div className="mx-auto w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center mb-4" style={{ animation: "pos-pop .4s cubic-bezier(.22,1,.36,1) both" }}>
                  <svg viewBox="0 0 24 24" className="w-8 h-8 text-white" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                </div>
                <h3 className="text-lg font-extrabold text-slate-800 dark:text-slate-100">Payment Approved</h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-2"><b>{fmtCurrency(posFlow.amount)}</b> captured on the POS terminal.</p>
              </>
            ) : (
              <>
                <div className="mx-auto w-16 h-16 rounded-2xl bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-300 flex items-center justify-center mb-4" style={{ animation: "pos-pulse 1.2s ease-in-out infinite" }}>
                  <CreditCard className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-extrabold text-slate-800 dark:text-slate-100">POS Swipe Machine</h3>
                <p className="text-2xl font-extrabold text-violet-700 dark:text-violet-300 mt-1 tabular-nums">{fmtCurrency(posFlow.amount)}</p>
                <div className="mt-4 space-y-2 text-sm text-left">
                  {[
                    { key: "connect", label: "Connecting to terminal" },
                    { key: "push", label: "Pushing amount to machine" },
                    { key: "await", label: "Awaiting card / UPI approval" },
                  ].map((s, i) => {
                    const order = ["connect", "push", "await"];
                    const cur = order.indexOf(posFlow.step);
                    const state = i < cur ? "done" : i === cur ? "active" : "todo";
                    return (
                      <div key={s.key} className={`flex items-center gap-2 ${state === "todo" ? "opacity-40" : ""}`}>
                        {state === "done" ? (
                          <span className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center"><svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg></span>
                        ) : state === "active" ? (
                          <span className="w-5 h-5 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
                        ) : (
                          <span className="w-5 h-5 rounded-full border-2 border-slate-300 dark:border-slate-600" />
                        )}
                        <span className="text-slate-700 dark:text-slate-300">{s.label}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {/* Narcotic Prescription Details & Verification Modal */}
      {showRxModal && (
        <Modal
          open={showRxModal}
          onClose={() => setShowRxModal(false)}
          title="Narcotic Prescription Details & Verification"
          size="md"
        >
          <div className="space-y-4">
            <div className="rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50/80 dark:bg-rose-950/40 p-3.5 flex items-start gap-3">
              <span className="w-8 h-8 rounded-lg bg-rose-200 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300 flex items-center justify-center font-bold text-sm shrink-0">
                Rx
              </span>
              <div className="text-xs text-rose-800 dark:text-rose-200 space-y-1">
                <div className="font-bold text-sm text-rose-900 dark:text-rose-100">
                  Mandatory Prescription Verification
                </div>
                <p>
                  This bill contains <b>Narcotic / Controlled Medicines</b>. By pharmacy regulations, a valid prescription with doctor details and a digital copy (photo or PDF) must be attached to the patient's billing profile before generating the bill.
                </p>
              </div>
            </div>

            {rxError && (
              <div className="rounded-lg bg-rose-100 text-rose-800 p-2.5 text-xs font-medium border border-rose-300 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                {rxError}
              </div>
            )}

            {/* Target Patient Profile */}
            <div className="p-3 bg-slate-50 dark:bg-slate-700/40 rounded-xl border border-slate-200 dark:border-slate-600 space-y-2">
              <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-0">
                Attaching to Patient Profile
              </Label>
              {patientId && selectedPatient ? (
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-800 dark:text-slate-100">{selectedPatient.name}</span>
                    {selectedPatient.phone && <span className="text-xs text-slate-500 ml-2">({selectedPatient.phone})</span>}
                  </div>
                  <Badge tone="green">Existing Patient Record</Badge>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Enter the patient's name to attach this prescription to their record:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <Label>Patient Name *</Label>
                      <Input
                        placeholder="Full name"
                        value={patientName}
                        onChange={(e) => setPatientName(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Patient Phone (optional)</Label>
                      <Input
                        placeholder="10-digit mobile"
                        value={patientPhone}
                        onChange={(e) => setPatientPhone(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Document Upload */}
            <div>
              <Label>Upload Prescription Document (Photo or PDF — No Size Limit) *</Label>
              {(rxUrl || selectedPatient?.prescriptionUrl) ? (
                <div className="border border-emerald-300 dark:border-emerald-700 bg-emerald-50/70 dark:bg-emerald-950/30 rounded-xl p-3.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FileCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-emerald-800 dark:text-emerald-200 truncate">
                        {rxName || selectedPatient?.prescriptionName || "prescription-attached"}
                      </div>
                      <div className="text-[11px] text-emerald-600 dark:text-emerald-400">Document attached & verified</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        const url = rxUrl || selectedPatient?.prescriptionUrl || "";
                        const name = rxName || selectedPatient?.prescriptionName || "prescription";
                        if (url.startsWith("data:image")) setViewRx({ url, type: "image", name });
                        else if (url.startsWith("data:application/pdf")) setViewRx({ url, type: "pdf", name });
                        else window.open(url, "_blank");
                      }}
                      className="px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 rounded-lg transition"
                    >
                      👁 View
                    </button>
                    <label className="cursor-pointer px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-200/60 rounded-lg transition">
                      Replace
                      <input type="file" accept="image/*,application/pdf" className="hidden" onChange={handleRxFile} />
                    </label>
                  </div>
                </div>
              ) : (
                <label className="border-2 border-dashed border-rose-300 dark:border-rose-700 hover:border-rose-400 rounded-xl p-5 flex flex-col items-center justify-center cursor-pointer bg-rose-50/30 dark:bg-rose-950/10 hover:bg-rose-50/60 transition group">
                  <Upload className="w-6 h-6 text-rose-500 group-hover:scale-110 transition-transform mb-1.5" />
                  <span className="text-xs font-bold text-rose-800 dark:text-rose-200">
                    Upload Prescription Image or PDF *
                  </span>
                  <span className="text-[11px] text-slate-400 mt-0.5">
                    Click to browse (JPG, PNG, WebP or PDF — no file size limit)
                  </span>
                  <input type="file" accept="image/*,application/pdf" className="hidden" onChange={handleRxFile} />
                </label>
              )}
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
              <Button variant="secondary" className="flex-1" onClick={() => setShowRxModal(false)}>
                Cancel
              </Button>
              <Button className="flex-1" onClick={saveRxToPatientProfile}>
                💾 Attach to Patient Profile
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ━━━━━━ Modal: Add New Doctor ━━━━━━ */}
      {showNewDoctor && (
        <Modal open onClose={() => setShowNewDoctor(false)} title="Add New Doctor">
          <div className="space-y-3">
            <div>
              <Label>Doctor Name *</Label>
              <Input
                value={ndForm.name}
                onChange={(e) => setNdForm({ ...ndForm, name: e.target.value })}
                placeholder="e.g. Dr. Rajesh Kumar"
                autoFocus
              />
            </div>
            <div>
              <Label>Hospital / Clinic Name *</Label>
              <Input
                value={ndForm.hospital}
                onChange={(e) => setNdForm({ ...ndForm, hospital: e.target.value })}
                placeholder="e.g. Apollo Multispecialty Hospital"
              />
            </div>
            <div>
              <Label>Hospital Address</Label>
              <Textarea
                rows={3}
                value={ndForm.hospitalAddress}
                onChange={(e) => setNdForm({ ...ndForm, hospitalAddress: e.target.value })}
                placeholder="Format address across multiple lines...&#10;e.g. 2nd Floor, Medical Enclave&#10;Plot 14, Main Road, Chennai"
              />
            </div>
            <div>
              <Label>Contact Number *</Label>
              <Input
                value={ndForm.phone}
                onChange={(e) => setNdForm({ ...ndForm, phone: e.target.value })}
                placeholder="e.g. 9876543210"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
              <Button variant="secondary" onClick={() => setShowNewDoctor(false)}>Cancel</Button>
              <Button onClick={saveNewDoctor}>Save & Select Doctor</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default Billing;
