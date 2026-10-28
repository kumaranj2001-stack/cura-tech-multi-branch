import React, { useRef, useState } from "react";
import { useStore } from "../store/store";
import { useTheme } from "../store/theme";
import { Card, CardBody, Button, Label, Input, Select, Modal } from "../components/ui";
import { downloadJSON, flashToast, compressImageFile } from "../utils/helpers";
import type { FeatureFlags, StaffPlanLimits } from "../store/types";
import { isOverseer, STAFF_PLAN_OPTIONS, formatPlanCap, staffPlanLimits, DEFAULT_CUSTOM_STAFF_LIMITS } from "../store/types";
import { parseBranchBackup } from "../store/store";
import { FileDown, Upload, Package, Filter, BarChart3, LayoutDashboard, QrCode, Loader2, ShieldCheck, CreditCard, AlertTriangle, Clock, Sliders } from "lucide-react";

const Toggle: React.FC<{ on: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }> = ({ on, onChange, label, hint, disabled }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={() => !disabled && onChange(!on)}
    className={`w-full flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-left group transition-all ${
      disabled
        ? "opacity-60 cursor-not-allowed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50"
        : "hover:border-sky-300 dark:hover:border-sky-700 hover:shadow-sm"
    }`}
  >
    <span className="min-w-0">
      <span className="block text-sm font-medium text-slate-800 dark:text-slate-200">{label}</span>
      {hint && <span className="block text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">{hint}</span>}
      {disabled && <span className="block text-[10px] text-amber-600 dark:text-amber-400 mt-0.5 font-medium">Developer & Admin roles only</span>}
    </span>
    <span className={`relative shrink-0 w-11 h-6 rounded-full transition-colors duration-200 ${on && !disabled ? "bg-emerald-500" : on ? "bg-emerald-300 dark:bg-emerald-800" : "bg-slate-300 dark:bg-slate-600"}`}>
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${on ? "translate-x-5" : "translate-x-0"}`} />
    </span>
  </button>
);

const SubToggle: React.FC<{
  on: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}> = ({ on, disabled, onChange, label, hint }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={() => !disabled && onChange(!on)}
    className={`w-full flex items-center justify-between gap-3 p-2.5 rounded-lg border text-left transition-all ${
      disabled
        ? "opacity-50 cursor-not-allowed border-slate-200 dark:border-slate-800 bg-slate-100/50 dark:bg-slate-900/40"
        : "border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-800/90 hover:border-sky-300 dark:hover:border-sky-700 hover:shadow-xs"
    }`}
  >
    <span className="min-w-0 flex items-center gap-2">
      <FileDown className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300">{label}</span>
        {hint && <span className="block text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{hint}</span>}
      </span>
    </span>
    <span
      className={`relative shrink-0 w-9 h-5 rounded-full transition-colors duration-200 ${
        on && !disabled ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${
          on && !disabled ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </span>
  </button>
);

interface FlagItem {
  key: keyof FeatureFlags;
  label: string;
  hint?: string;
  subToggle?: {
    key: keyof FeatureFlags;
    label: string;
    hint?: string;
  };
}

const FLAG_GROUPS: {
  title: string;
  icon: React.FC<{ className?: string }>;
  note?: string;
  items: FlagItem[];
  subToggle?: {
    key: keyof FeatureFlags;
    label: string;
    hint?: string;
  };
}[] = [
  {
    title: "Documents & Export",
    icon: FileDown,
    items: [
      { key: "pdfInvoices", label: "Invoice PDF download", hint: "Download sales invoices as PDF" },
      { key: "btnSavePdf", label: "“Save as PDF” button", hint: "Show on the invoice view screen" },
      { key: "btnWhatsApp", label: "“Share on WhatsApp” button", hint: "Show on the invoice view screen" },
    ],
  },
  {
    title: "Purchases / GRN",
    icon: Package,
    items: [
      { key: "grnModule", label: "GRN Entry & Approvals", hint: "Hides GRN Entry, GRN Approvals and the pending-GRN dashboard card" },
    ],
  },
  {
    title: "Payment Methods",
    icon: CreditCard,
    items: [
      { key: "paymentsMaster", label: "Payments section", hint: "Master switch — when off, all payment options are completely hidden in New Billing" },
      { key: "payDigital", label: "Digital Payments", hint: "Displays only Cash and UPI options in New Billing (mutually exclusive with POS)" },
      { key: "payPos", label: "POS Swipe Machine", hint: "Displays Card, UPI, and Cash options in New Billing (mutually exclusive with Digital)" },
    ],
    note: "Digital Payments and POS Swipe Machine are mutually exclusive — enabling one switches the other off.",
  },
  {
    title: "Audit & Security",
    icon: ShieldCheck,
    items: [
      { key: "auditEnabled", label: "Audit logging", hint: "Master switch — records sign-ins, edits, approvals, and stock changes across all devices" },
    ],
  },
  {
    title: "Patients",
    icon: Upload,
    items: [
      { key: "prescriptionUpload", label: "Prescription upload", hint: "Attach prescription images / PDFs to patients" },
      { key: "narcoticPrescriptionRequired", label: "Mandatory prescription for narcotics", hint: "When disabled, waives mandatory prescription requirements for narcotic drugs" },
    ],
  },
  {
    title: "Inventory Control",
    icon: Sliders,
    note: "Restricted to Developer and Admin roles.",
    items: [
      {
        key: "minStockFeature",
        label: "Minimum Stock",
        hint: "Controls visibility of Minimum Stock in the inventory table and Add Medicine modal",
      },
    ],
  },
  {
    title: "Inventory Filters",
    icon: Filter,
    items: [
      {
        key: "filterLowStock",
        label: "Low stock filter",
        hint: "Below-minimum filter in Inventory",
        subToggle: {
          key: "pdfFilterLowStock",
          label: "Inventory PDF download",
          hint: "Controls 'Download PDF' for Low Stock filter",
        },
      },
      {
        key: "filterExp30",
        label: "Expiry 1–30 days",
        hint: "1–30 days expiry filter in Inventory",
        subToggle: {
          key: "pdfFilterExp30",
          label: "Inventory PDF download",
          hint: "Controls 'Download PDF' for 1–30 Days filter",
        },
      },
      {
        key: "filterExp60",
        label: "Expiry 31–60 days",
        hint: "31–60 days expiry filter in Inventory",
        subToggle: {
          key: "pdfFilterExp60",
          label: "Inventory PDF download",
          hint: "Controls 'Download PDF' for 31–60 Days filter",
        },
      },
      {
        key: "filterExp90",
        label: "Expiry 61–90 days",
        hint: "61–90 days expiry filter in Inventory",
        subToggle: {
          key: "pdfFilterExp90",
          label: "Inventory PDF download",
          hint: "Controls 'Download PDF' for 61–90 Days filter",
        },
      },
      {
        key: "filterExpired",
        label: "Expired filter",
        hint: "Expired-items filter in Inventory",
        subToggle: {
          key: "pdfFilterExpired",
          label: "Inventory PDF download",
          hint: "Controls 'Download PDF' for Expired filter",
        },
      },
      {
        key: "filterNarcotic",
        label: "Narcotic Drugs filter",
        hint: "Narcotic / controlled substances filter in Inventory",
        subToggle: {
          key: "pdfFilterNarcotic",
          label: "Inventory PDF download",
          hint: "Controls 'Download PDF' for Narcotic Drugs filter",
        },
      },
    ],
  },
  {
    title: "Dashboard Widgets",
    icon: LayoutDashboard,
    items: [
      { key: "dashChart7d", label: "Sales — Last 7 Days", hint: "Weekly sales chart" },
      { key: "dashChart6m", label: "Sales — Last 6 Months", hint: "Monthly sales chart" },
      { key: "dashLowStock", label: "Low Stock", hint: "Below-minimum widget & column" },
      { key: "dashOutStock", label: "Out of Stock", hint: "Zero-stock widget" },
      { key: "dashExpired", label: "Expired", hint: "Expired-items widget & rows" },
      { key: "dashExp30", label: "Expiry within 30 days", hint: "Urgent expiry widget & rows" },
      { key: "dashExp60", label: "Expiry 31–60 days", hint: "Planning expiry widget & rows" },
      { key: "dashExp90", label: "Expiry 61–90 days", hint: "Early-warning expiry rows" },
    ],
  },
  {
    title: "GRN Entry",
    icon: Package,
    items: [{ key: "grnAutoFill", label: "Auto-fill from supplier invoice", hint: "PDF / Excel import & auto population" }],
  },
  {
    title: "Reports",
    icon: BarChart3,
    items: [
      {
        key: "repDaily",
        label: "Daily Sales",
        subToggle: {
          key: "repDailyPdf",
          label: "Download PDF",
          hint: "Controls the 'Download PDF' button in Daily Sales report",
        },
      },
      {
        key: "repMonthly",
        label: "Monthly Sales",
        subToggle: {
          key: "repMonthlyPdf",
          label: "Download PDF",
          hint: "Controls the 'Download PDF' button in Monthly Sales report",
        },
      },
      {
        key: "repPurchases",
        label: "Purchases",
        subToggle: {
          key: "repPurchasesPdf",
          label: "Download PDF",
          hint: "Controls the 'Download PDF' button in Purchases report",
        },
      },
      {
        key: "repStock",
        label: "Stock Report",
        subToggle: {
          key: "repStockPdf",
          label: "Download PDF",
          hint: "Controls the 'Download PDF' button in Stock report",
        },
      },
      {
        key: "repExpiry",
        label: "Expiry Report",
        subToggle: {
          key: "repExpiryPdf",
          label: "Download PDF",
          hint: "Controls the 'Download PDF' button in Expiry report",
        },
      },
      {
        key: "repPL",
        label: "Profit & Loss",
        subToggle: {
          key: "repPLPdf",
          label: "Download PDF",
          hint: "Controls the 'Download PDF' button in Profit & Loss report",
        },
      },
      {
        key: "repTax",
        label: "Tax Report",
        subToggle: {
          key: "repTaxPdf",
          label: "Download PDF",
          hint: "Controls the 'Download PDF' button in Tax report",
        },
      },
      {
        key: "repUser",
        label: "User Activity",
        subToggle: {
          key: "repUserPdf",
          label: "Download PDF",
          hint: "Controls the 'Download PDF' button in User Activity report",
        },
      },
      {
        key: "repUserSales",
        label: "User-based Sales",
        hint: "Show total sales and bills generated by each user",
        subToggle: {
          key: "repUserSalesPdf",
          label: "Download PDF",
          hint: "Controls the 'Download PDF' button in User-based Sales report",
        },
      },
    ],
  },
];

const FIRESTORE_RULES = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Reject oversized or malformed writes (safely allows delete)
    function sane() {
      return request.method == 'delete' || (request.resource != null && request.resource.data.size() < 60);
    }

    // System metadata: readable, writable, never deletable
    match /gp_meta/{doc} {
      allow read: if true;
      allow create, update: if sane();
      allow delete: if false;
    }

    // Audit trail is append-only — no tampering or deletion
    match /gp_audit/{doc} {
      allow read: if true;
      allow create: if sane();
      allow update, delete: if false;
    }

    // Operational collections: validated reads/writes
    match /gp_branches/{doc}  { allow read: if true; allow write: if sane(); }
    match /gp_users/{doc}     { allow read: if true; allow write: if sane() && (request.method == 'delete' || request.resource.data.password is string); }
    match /gp_medicines/{doc} { allow read: if true; allow write: if sane(); }
    match /gp_patients/{doc}  { allow read: if true; allow write: if sane(); }
    match /gp_doctors/{doc}   { allow read: if true; allow write: if sane(); }
    match /gp_invoices/{doc}  { allow read: if true; allow write: if sane(); }
    match /gp_suppliers/{doc} { allow read: if true; allow write: if sane(); }
    match /gp_grns/{doc}      { allow read: if true; allow write: if sane(); }
    match /gp_returns/{doc}   { allow read: if true; allow write: if sane(); }
  }
}`;

const Settings: React.FC = () => {
  const { data, currentUser, log, cloudReady, cloudSyncing, cloudError, flags, setFlag, setFlagsBatch, staffPlan, setStaffPlan, customStaffPlanLimits, payment, branchPayments, setBranchPayment, buildBranchBackup, restoreBranchBackup } = useStore();
  const isSuperAdmin = currentUser?.role === "superadmin";
  const isAdmin = currentUser?.role === "admin";
  const isDeveloper = isOverseer(currentUser?.role);
  const isDevAccount = currentUser?.role === "developer";
  const isStaff = currentUser?.role === "staff";
  const canViewPayments = isAdmin || isSuperAdmin;

  // Option 5 - Fully Customizable Account Plan state
  const [customModalOpen, setCustomModalOpen] = useState(false);
  const [customForm, setCustomForm] = useState<{
    superadminEnabled: boolean;
    superadminQty: number;
    superadminUnlimited: boolean;
    adminEnabled: boolean;
    adminQty: number;
    adminUnlimited: boolean;
    staffEnabled: boolean;
    staffQty: number;
    staffUnlimited: boolean;
  }>({
    superadminEnabled: true,
    superadminQty: 1,
    superadminUnlimited: false,
    adminEnabled: true,
    adminQty: 2,
    adminUnlimited: false,
    staffEnabled: true,
    staffQty: 5,
    staffUnlimited: false,
  });

  const openCustomizeModal = () => {
    const lim = customStaffPlanLimits || DEFAULT_CUSTOM_STAFF_LIMITS;
    setCustomForm({
      superadminEnabled: lim.superadmin > 0,
      superadminQty: Number.isFinite(lim.superadmin) ? Math.max(1, lim.superadmin) : 1,
      superadminUnlimited: lim.superadmin === Number.POSITIVE_INFINITY,
      adminEnabled: lim.admin > 0,
      adminQty: Number.isFinite(lim.admin) ? Math.max(1, lim.admin) : 2,
      adminUnlimited: lim.admin === Number.POSITIVE_INFINITY,
      staffEnabled: lim.staff > 0,
      staffQty: Number.isFinite(lim.staff) ? Math.max(1, lim.staff) : 5,
      staffUnlimited: lim.staff === Number.POSITIVE_INFINITY,
    });
    setCustomModalOpen(true);
  };

  const saveCustomLimits = () => {
    const newLimits: StaffPlanLimits = {
      superadmin: !customForm.superadminEnabled
        ? 0
        : customForm.superadminUnlimited
        ? Number.POSITIVE_INFINITY
        : Math.max(0, Number(customForm.superadminQty) || 0),
      admin: !customForm.adminEnabled
        ? 0
        : customForm.adminUnlimited
        ? Number.POSITIVE_INFINITY
        : Math.max(0, Number(customForm.adminQty) || 0),
      staff: !customForm.staffEnabled
        ? 0
        : customForm.staffUnlimited
        ? Number.POSITIVE_INFINITY
        : Math.max(0, Number(customForm.staffQty) || 0),
    };

    if (newLimits.superadmin === 0 && newLimits.admin === 0 && newLimits.staff === 0) {
      alert("Please enable at least one role with an allowance greater than 0.");
      return;
    }

    setStaffPlan(5, newLimits);
    setCustomModalOpen(false);
    log("STAFF_PLAN", `Option 5 configured: Super Admin ${formatPlanCap(newLimits.superadmin)}, Admin ${formatPlanCap(newLimits.admin)}, Staff ${formatPlanCap(newLimits.staff)}`);
    flashToast("Option 5 — Fully Customizable limits saved and applied", "ok");
  };
  // Payments are branch-scoped: each branch's admin manages their own, or super admin selects branch
  const [selectedPayBranchId, setSelectedPayBranchId] = useState<string>(
    currentUser?.branchId || data.branches[0]?.id || "br_main"
  );
  const activePayBranchId = isSuperAdmin ? (selectedPayBranchId || data.branches[0]?.id || "br_main") : (currentUser?.branchId || "br_main");
  const branchPay = branchPayments[activePayBranchId] || payment || {};
  const isBranchDigitalEnabled = branchPay.digitalEnabled !== false;

  const [upiId, setUpiId] = useState(branchPay.upiId || "");
  const [upiName, setUpiName] = useState(branchPay.upiName || "");
  const [uploadingQr, setUploadingQr] = useState(false);

  React.useEffect(() => {
    setUpiId(branchPay.upiId || "");
    setUpiName(branchPay.upiName || "");
  }, [activePayBranchId, branchPay.upiId, branchPay.upiName]);

  const onQrFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) { alert("Please upload an image (PNG/JPG) of your UPI QR."); return; }
    setUploadingQr(true);
    try {
      const dataUrl = await compressImageFile(f, 600);
      setBranchPayment(activePayBranchId, { upiQr: dataUrl });
      flashToast("UPI QR uploaded — it will now appear on this branch's billing screens");
    } catch (err) {
      flashToast(err instanceof Error ? err.message : "Could not read image", "warn");
    } finally {
      setUploadingQr(false);
      e.target.value = "";
    }
  };
  const { theme, setTheme } = useTheme();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rulesCopied, setRulesCopied] = useState(false);
  const [backupBranchId, setBackupBranchId] = useState("");

  const copyRules = async () => {
    try {
      await navigator.clipboard.writeText(FIRESTORE_RULES);
      setRulesCopied(true);
      setTimeout(() => setRulesCopied(false), 2000);
    } catch {
      alert("Copy failed. Please select the rules text manually.");
    }
  };

  if (currentUser?.role !== "admin" && currentUser?.role !== "staff" && !isOverseer(currentUser?.role)) {
    return <Card><CardBody className="text-center text-slate-500 dark:text-slate-400 py-12">⛔ Admin or Super Admin access required</CardBody></Card>;
  }

  const targetBackupBranchId = data.branches.length === 1 ? data.branches[0].id : backupBranchId;
  const targetBackupBranch = data.branches.find((b) => b.id === targetBackupBranchId);

  const exportBranch = () => {
    if (!isDevAccount || !targetBackupBranchId) {
      alert("Select a branch before backing up.");
      return;
    }
    const payload = buildBranchBackup(targetBackupBranchId);
    const code = targetBackupBranch?.code || targetBackupBranchId;
    downloadJSON(`guru-backup-${code}-${new Date().toISOString().slice(0, 10)}.json`, payload);
    log("BACKUP_EXPORT", `Branch backup downloaded for ${targetBackupBranch?.name || targetBackupBranchId}`);
  };

  const importBranch = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isDevAccount) return;
    const f = e.target.files?.[0];
    if (!f) return;
    if (!targetBackupBranchId) {
      alert("Select a branch before restoring.");
      e.target.value = "";
      return;
    }
    const r = new FileReader();
    r.onload = () => {
      try {
        const parsed = parseBranchBackup(JSON.parse(r.result as string));
        const name = targetBackupBranch?.name || targetBackupBranchId;
        if (!confirm(`Restore "${name}" only from this backup? Other branches will not be changed. This cannot be undone.`)) return;
        restoreBranchBackup(targetBackupBranchId, parsed.data, { payment: parsed.payment, profile: parsed.profile });
        log("BACKUP_IMPORT", `Branch restored from backup: ${name}`);
        flashToast(`${name} restored from backup`);
      } catch {
        alert("Invalid backup file");
      } finally {
        e.target.value = "";
      }
    };
    r.readAsText(f);
  };

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {/* Appearance */}
      <Card>
        <CardBody>
          <div className="font-semibold text-slate-800 dark:text-slate-100 mb-2">🎨 Appearance</div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Switch between light and dark mode. Your preference is saved automatically.</p>
          <div className="flex gap-3">
            <button
              onClick={() => setTheme("light")}
              className={`flex-1 flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition ${
                theme === "light"
                  ? "border-sky-500 bg-sky-50 dark:bg-sky-900/30"
                  : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600"
              }`}
            >
              <div className="text-3xl">☀️</div>
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">Light Mode</div>
              <div className="w-full h-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center px-2 gap-1">
                <div className="w-3 h-3 rounded-full bg-sky-500"></div>
                <div className="h-1.5 flex-1 bg-slate-200 rounded"></div>
              </div>
              {theme === "light" && <span className="text-xs text-sky-600 font-semibold">✓ Active</span>}
            </button>
            <button
              onClick={() => setTheme("dark")}
              className={`flex-1 flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition ${
                theme === "dark"
                  ? "border-sky-500 bg-sky-50 dark:bg-sky-900/30"
                  : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600"
              }`}
            >
              <div className="text-3xl">🌙</div>
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">Dark Mode</div>
              <div className="w-full h-10 rounded-lg bg-slate-800 border border-slate-600 flex items-center px-2 gap-1">
                <div className="w-3 h-3 rounded-full bg-sky-400"></div>
                <div className="h-1.5 flex-1 bg-slate-600 rounded"></div>
              </div>
              {theme === "dark" && <span className="text-xs text-sky-400 font-semibold">✓ Active</span>}
            </button>
          </div>
        </CardBody>
      </Card>

      {/* Cloud Backend — overseer only */}
      {isOverseer(currentUser?.role) && (
        <>
      <Card>
        <CardBody>
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <div className="font-semibold text-slate-800 dark:text-slate-100">☁️ Cloud Backend (Firebase)</div>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                All branches, users, patients, invoices, GRNs and stock sync in real time across every device and browser.
              </p>
              <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-1 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Hardened: validated writes · append-only audit log · protected metadata · sanitized inputs · abstracted credentials
              </p>
            </div>
            <span className={`shrink-0 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold border ${cloudError ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-900/30 dark:text-rose-300" : cloudSyncing ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-300" : cloudReady ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300" : "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-700/30 dark:text-slate-300"}`}>
              <span className={`w-2 h-2 rounded-full ${cloudError ? "bg-rose-500" : cloudSyncing ? "bg-amber-500 animate-pulse" : cloudReady ? "bg-emerald-500" : "bg-slate-400 animate-pulse"}`} />
              {cloudError ? "Needs setup" : cloudSyncing ? "Syncing" : cloudReady ? "Connected" : "Connecting"}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/30 p-3">
              <div className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">Project</div>
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 mt-0.5 truncate">kumaran-5</div>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/30 p-3">
              <div className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">Database</div>
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 mt-0.5">Cloud Firestore</div>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/30 p-3">
              <div className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">Live records</div>
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                {data.patients.length + data.invoices.length + data.grns.length + data.medicines.length + (data.doctors?.length || 0)} docs
              </div>
            </div>
          </div>

          {cloudError && (
            <div className="rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20 px-3 py-2.5 text-sm text-rose-700 dark:text-rose-300 mb-4">
              {cloudError}
            </div>
          )}

          <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-100 dark:bg-slate-700/50 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">One-time setup — 3 steps</span>
            </div>
            <ol className="p-4 space-y-2.5 text-sm text-slate-600 dark:text-slate-400 list-decimal list-inside">
              <li>Open <b>Firebase Console → kumaran-5 → Firestore Database</b> and click <b>Create database</b> (choose Start in test mode).</li>
              <li>In the <b>Rules</b> tab, replace everything with the rules below and press <b>Publish</b>.</li>
              <li>Reload this app on every device. Data now syncs everywhere automatically.</li>
            </ol>
            <div className="relative mx-4 mb-4 rounded-lg bg-slate-900 text-slate-100 text-xs font-mono p-3 overflow-x-auto">
              <button
                onClick={copyRules}
                className="absolute top-2 right-2 rounded-md bg-slate-700 hover:bg-slate-600 px-2.5 py-1 text-[11px] font-sans font-semibold text-slate-200 transition"
              >
                {rulesCopied ? "✓ Copied" : "Copy"}
              </button>
              <pre className="whitespace-pre">{FIRESTORE_RULES}</pre>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Staff Management — developer and super admin; one exclusive plan at a time */}
      {(isDevAccount || isSuperAdmin) && (
      <Card>
        <CardBody className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-semibold text-slate-800 dark:text-slate-100">👥 Staff Management</div>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                Choose one account-creation plan. Enabling an option turns the others off. Admins can add staff only within the selected limits, on every plan.
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-900/30 px-2.5 py-1 text-[11px] font-semibold text-violet-700 dark:text-violet-300 shrink-0">
              {isDevAccount ? "Developer & Super Admin" : "Super Admin"}
            </span>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3.5 bg-slate-50/60 dark:bg-slate-800/40 space-y-2">
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Account plans</span>
            </div>
            {STAFF_PLAN_OPTIONS.map((opt) => (
              <div key={opt.tier} className="space-y-1.5">
                <Toggle
                  on={staffPlan === opt.tier}
                  label={opt.label}
                  hint={
                    opt.tier === 5 && staffPlan === 5
                      ? `Custom quotas: ${formatPlanCap(customStaffPlanLimits.superadmin)} Super Admin · ${formatPlanCap(customStaffPlanLimits.admin)} Admin · ${formatPlanCap(customStaffPlanLimits.staff)} Staff. Click 'Configure Limits' to modify.`
                      : opt.hint
                  }
                  onChange={(v) => {
                    if (opt.tier === 5) {
                      openCustomizeModal();
                      return;
                    }
                    if (!v || staffPlan === opt.tier) return;
                    setStaffPlan(opt.tier);
                    log("STAFF_PLAN", `Option ${opt.tier} selected`);
                    flashToast(`${opt.label} is now the active plan on all devices`, "ok");
                  }}
                />
                {opt.tier === 5 && staffPlan === 5 && (
                  <div className="px-3 py-1 flex items-center justify-between text-xs">
                    <span className="text-sky-700 dark:text-sky-300 font-medium">
                      Active: {formatPlanCap(customStaffPlanLimits.superadmin)} Super Admin · {formatPlanCap(customStaffPlanLimits.admin)} Admin · {formatPlanCap(customStaffPlanLimits.staff)} Staff
                    </span>
                    <button
                      type="button"
                      onClick={openCustomizeModal}
                      className="inline-flex items-center gap-1 font-semibold text-sky-600 hover:text-sky-700 dark:text-sky-400 hover:underline cursor-pointer"
                    >
                      <Sliders className="w-3.5 h-3.5" />
                      Configure Limits
                    </button>
                  </div>
                )}
              </div>
            ))}
            <p className="mt-3 text-[11px] text-slate-400 dark:text-slate-500 flex items-start gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 mt-px shrink-0 text-teal-600 dark:text-teal-400" />
              {(() => {
                const lim = staffPlanLimits(staffPlan, customStaffPlanLimits);
                const optName = staffPlan === 5 ? "Option 5 (Fully Customizable)" : `Option ${staffPlan}`;
                return `Active ${optName}: ${formatPlanCap(lim.superadmin)} super admin · ${formatPlanCap(lim.admin)} admin · ${formatPlanCap(lim.staff)} staff. Switching options is exclusive — only one can be on.`;
              })()}
            </p>
          </div>
        </CardBody>
      </Card>
      )}

      {/* Option 5 Customization Modal */}
      <Modal
        open={customModalOpen}
        onClose={() => setCustomModalOpen(false)}
        title="Option 5 — Fully Customizable Account Plan"
        size="md"
      >
        <div className="space-y-5">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Select the specific user roles permitted in your system and define the exact quantity allowed for each role. Roles not selected will be restricted (0 allowed).
          </p>

          <div className="space-y-3">
            {/* Super Admin Role */}
            <div className={`p-4 rounded-xl border transition-all ${customForm.superadminEnabled ? "border-sky-300 dark:border-sky-700 bg-sky-50/40 dark:bg-sky-950/20" : "border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/20 opacity-75"}`}>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={customForm.superadminEnabled}
                    onChange={(e) => setCustomForm((f) => ({ ...f, superadminEnabled: e.target.checked }))}
                    className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500"
                  />
                  <div>
                    <span className="font-semibold text-sm text-slate-800 dark:text-slate-100">Super Admin</span>
                    <span className="block text-[11px] text-slate-400">Full administrative overseer across branches</span>
                  </div>
                </label>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300">
                  Overseer
                </span>
              </div>

              {customForm.superadminEnabled && (
                <div className="mt-3 pt-3 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between gap-4">
                  <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">Quantity Allowed:</span>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={customForm.superadminUnlimited}
                        onChange={(e) => setCustomForm((f) => ({ ...f, superadminUnlimited: e.target.checked }))}
                        className="rounded text-sky-600 focus:ring-sky-500"
                      />
                      Unlimited
                    </label>
                    {!customForm.superadminUnlimited && (
                      <Input
                        type="number"
                        min="1"
                        max="999"
                        value={customForm.superadminQty}
                        onChange={(e) => setCustomForm((f) => ({ ...f, superadminQty: Math.max(0, parseInt(e.target.value) || 0) }))}
                        className="w-24 text-center font-bold text-sm"
                      />
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Admin Role */}
            <div className={`p-4 rounded-xl border transition-all ${customForm.adminEnabled ? "border-sky-300 dark:border-sky-700 bg-sky-50/40 dark:bg-sky-950/20" : "border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/20 opacity-75"}`}>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={customForm.adminEnabled}
                    onChange={(e) => setCustomForm((f) => ({ ...f, adminEnabled: e.target.checked }))}
                    className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500"
                  />
                  <div>
                    <span className="font-semibold text-sm text-slate-800 dark:text-slate-100">Admin</span>
                    <span className="block text-[11px] text-slate-400">Branch administration and staff supervision</span>
                  </div>
                </label>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-300">
                  Manager
                </span>
              </div>

              {customForm.adminEnabled && (
                <div className="mt-3 pt-3 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between gap-4">
                  <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">Quantity Allowed:</span>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={customForm.adminUnlimited}
                        onChange={(e) => setCustomForm((f) => ({ ...f, adminUnlimited: e.target.checked }))}
                        className="rounded text-sky-600 focus:ring-sky-500"
                      />
                      Unlimited
                    </label>
                    {!customForm.adminUnlimited && (
                      <Input
                        type="number"
                        min="1"
                        max="999"
                        value={customForm.adminQty}
                        onChange={(e) => setCustomForm((f) => ({ ...f, adminQty: Math.max(0, parseInt(e.target.value) || 0) }))}
                        className="w-24 text-center font-bold text-sm"
                      />
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Staff Role */}
            <div className={`p-4 rounded-xl border transition-all ${customForm.staffEnabled ? "border-sky-300 dark:border-sky-700 bg-sky-50/40 dark:bg-sky-950/20" : "border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/20 opacity-75"}`}>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={customForm.staffEnabled}
                    onChange={(e) => setCustomForm((f) => ({ ...f, staffEnabled: e.target.checked }))}
                    className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500"
                  />
                  <div>
                    <span className="font-semibold text-sm text-slate-800 dark:text-slate-100">Staff</span>
                    <span className="block text-[11px] text-slate-400">POS billing, prescription entries and inventory sales</span>
                  </div>
                </label>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300">
                  Operator
                </span>
              </div>

              {customForm.staffEnabled && (
                <div className="mt-3 pt-3 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between gap-4">
                  <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">Quantity Allowed:</span>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={customForm.staffUnlimited}
                        onChange={(e) => setCustomForm((f) => ({ ...f, staffUnlimited: e.target.checked }))}
                        className="rounded text-sky-600 focus:ring-sky-500"
                      />
                      Unlimited
                    </label>
                    {!customForm.staffUnlimited && (
                      <Input
                        type="number"
                        min="1"
                        max="999"
                        value={customForm.staffQty}
                        onChange={(e) => setCustomForm((f) => ({ ...f, staffQty: Math.max(0, parseInt(e.target.value) || 0) }))}
                        className="w-24 text-center font-bold text-sm"
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-700">
            <Button variant="secondary" onClick={() => setCustomModalOpen(false)} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button onClick={saveCustomLimits} className="w-full sm:w-auto">
              Save & Apply Plan
            </Button>
          </div>
        </div>
      </Modal>

      {/* Feature Controls — developer only */}
      <Card>
        <CardBody className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-semibold text-slate-800 dark:text-slate-100">🎛️ Feature Controls</div>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                Enable or disable individual features across every device. Changes sync instantly through the cloud.
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-900/30 px-2.5 py-1 text-[11px] font-semibold text-violet-700 dark:text-violet-300 shrink-0">
              Developer only
            </span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {FLAG_GROUPS.map((g) => (
              <div key={g.title} className="rounded-xl border border-slate-200 dark:border-slate-700 p-3.5 bg-slate-50/60 dark:bg-slate-800/40">
                <div className="flex items-center gap-2 mb-2.5">
                  <g.icon className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{g.title}</span>
                </div>
                <div className={`grid gap-2.5 ${g.title === "Reports" || g.title === "Inventory Filters" ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}>
                  {g.items.map((it) => (
                    it.subToggle ? (
                      <div
                        key={it.key}
                        className="rounded-xl border border-slate-200/90 dark:border-slate-700/80 bg-white/70 dark:bg-slate-800/60 p-2.5 space-y-2"
                      >
                        <Toggle
                          on={flags[it.key]}
                          label={it.label}
                          hint={it.hint}
                          onChange={(v) => {
                            setFlag(it.key, v);
                            flashToast(`${it.label} ${v ? "enabled" : "disabled"} on all devices`, v ? "ok" : "warn");
                          }}
                        />
                        <div className="pl-3 ml-2 border-l-2 border-sky-300 dark:border-sky-800/80">
                          <SubToggle
                            on={flags[it.subToggle.key] !== false}
                            disabled={!flags[it.key]}
                            label={it.subToggle.label}
                            hint={it.subToggle.hint}
                            onChange={(v) => {
                              setFlag(it.subToggle!.key, v);
                              flashToast(`${it.label}: Download PDF ${v ? "enabled" : "disabled"}`, v ? "ok" : "warn");
                            }}
                          />
                        </div>
                      </div>
                    ) : (
                      <Toggle
                        key={it.key}
                        on={flags[it.key] !== false}
                        disabled={it.key === "minStockFeature" && !(isDeveloper || isAdmin)}
                        label={it.label}
                        hint={it.hint}
                        onChange={(v) => {
                          if (it.key === "minStockFeature") {
                            if (!(isDeveloper || isAdmin)) {
                              alert("Access restricted: Only Developer and Admin accounts can modify the Minimum Stock setting.");
                              return;
                            }
                            setFlag("minStockFeature", v);
                            flashToast(`Minimum Stock feature ${v ? "enabled" : "disabled"} on all devices`, v ? "ok" : "warn");
                            fetch("/api/inventory/settings", {
                              method: "POST",
                              headers: {
                                "Content-Type": "application/json",
                                "x-user-role": currentUser?.role || "",
                              },
                              body: JSON.stringify({ minStockFeature: v, role: currentUser?.role || "" }),
                            }).catch(() => {});
                            return;
                          }
                          if (it.key === "paymentsMaster") {
                            setFlag("paymentsMaster", v);
                            if (v && !flags.payDigital && !flags.payPos) {
                              setFlag("payDigital", true);
                            }
                          } else if (it.key === "payDigital") {
                            setFlag("payDigital", v);
                            if (v) setFlag("payPos", false);
                            else if (!v && !flags.payPos) setFlag("payPos", true);
                          } else if (it.key === "payPos") {
                            setFlag("payPos", v);
                            if (v) setFlag("payDigital", false);
                            else if (!v && !flags.payDigital) setFlag("payDigital", true);
                          } else {
                            setFlag(it.key, v);
                          }
                          flashToast(`${it.label} ${v ? "enabled" : "disabled"} on all devices`, v ? "ok" : "warn");
                        }}
                      />
                    )
                  ))}
                </div>
                {g.subToggle && (
                  <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700/80">
                    <div className="pl-3 ml-2 border-l-2 border-sky-300 dark:border-sky-800/80">
                      <SubToggle
                        on={flags[g.subToggle.key] !== false}
                        label={g.subToggle.label}
                        hint={g.subToggle.hint}
                        onChange={(v) => {
                          setFlag(g.subToggle!.key, v);
                          flashToast(`${g.subToggle!.label} ${v ? "enabled" : "disabled"} on all devices`, v ? "ok" : "warn");
                        }}
                      />
                    </div>
                  </div>
                )}
                {g.title === "Payment Methods" && (
                  <div className="mt-4 pt-3.5 border-t border-slate-200 dark:border-slate-700/80 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <QrCode className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                        <span className="text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                          Branch Digital Payments Mode
                        </span>
                      </div>
                      <span className="text-[10px] font-semibold text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-900/30 px-2 py-0.5 rounded-full border border-sky-200 dark:border-sky-800">
                        Per-branch
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                      Enable or disable Digital Payments mode for each branch independently. When disabled for a branch, all options for uploading a QR, entering a UPI ID, and setting a payee name are completely hidden for that branch.
                    </p>
                    <div className="space-y-2">
                      {data.branches.map((b) => {
                        const isDigitalOn = branchPayments[b.id]?.digitalEnabled !== false;
                        return (
                          <Toggle
                            key={b.id}
                            on={isDigitalOn}
                            label={`Digital Payments — ${b.name}`}
                            hint={isDigitalOn ? "Enabled · QR upload, UPI ID & payee name available for this branch" : "Disabled · QR, UPI ID & payee name completely hidden for this branch"}
                            onChange={(v) => {
                              setBranchPayment(b.id, { digitalEnabled: v });
                              flashToast(`Digital Payments mode for ${b.name} ${v ? "enabled" : "disabled"}`, v ? "ok" : "warn");
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}
                {g.title === "Audit & Security" && (
                  <div className="mt-4 pt-3.5 border-t border-slate-200 dark:border-slate-700/80 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                        <span className="text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                          Log Retention Policy
                        </span>
                      </div>
                      <span className="text-[10px] font-semibold text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-900/30 px-2 py-0.5 rounded-full border border-sky-200 dark:border-sky-800">
                        Mutually Exclusive
                      </span>
                    </div>

                    {!flags.auditEnabled ? (
                      <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/30 p-3 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2.5">
                        <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold">Master Switch Inactive:</span> All log retention settings are hidden and disabled because the main Audit Logging toggle is turned off.
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                          Configure how long audit entries are retained before automated rolling cleanup. Selecting one retention option automatically deactivates the other two.
                        </p>
                        <div className="space-y-2">
                          <Toggle
                            on={flags.auditRetention30 && !flags.auditRetention60 && !flags.auditRetentionLifetime}
                            label="30 Days Retention"
                            hint="Rolling daily retention — automatically purges logs older than 30 days"
                            onChange={(v) => {
                              if (!v && flags.auditRetention30 && !flags.auditRetention60 && !flags.auditRetentionLifetime) return;
                              setFlagsBatch({
                                auditRetention30: true,
                                auditRetention60: false,
                                auditRetentionLifetime: false,
                              });
                              log("AUDIT_RETENTION", "Log retention policy set to 30 days");
                              flashToast("Audit log retention set to 30 days on all devices", "ok");
                            }}
                          />
                          <Toggle
                            on={flags.auditRetention60}
                            label="60 Days Retention"
                            hint="Extended retention — automatically purges logs older than 60 days"
                            onChange={(v) => {
                              if (!v && flags.auditRetention60) return;
                              setFlagsBatch({
                                auditRetention30: false,
                                auditRetention60: true,
                                auditRetentionLifetime: false,
                              });
                              log("AUDIT_RETENTION", "Log retention policy set to 60 days");
                              flashToast("Audit log retention set to 60 days on all devices", "ok");
                            }}
                          />
                          <Toggle
                            on={flags.auditRetentionLifetime}
                            label="Lifetime Storage"
                            hint="Permanent retention — logs are preserved indefinitely and never auto-purged"
                            onChange={(v) => {
                              if (!v && flags.auditRetentionLifetime) return;
                              setFlagsBatch({
                                auditRetention30: false,
                                auditRetention60: false,
                                auditRetentionLifetime: true,
                              });
                              log("AUDIT_RETENTION", "Log retention policy set to Lifetime Storage");
                              flashToast("Audit log retention set to Lifetime Storage on all devices", "ok");
                            }}
                          />
                        </div>
                      </>
                    )}
                  </div>
                )}
                {g.title === "Audit & Security" ? (
                  <p className="mt-3 text-[11px] text-slate-400 dark:text-slate-500 flex items-start gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 mt-px shrink-0 text-teal-600 dark:text-teal-400" />
                    {!flags.auditEnabled
                      ? "Audit logging is disabled. New events are not recorded and retention policies are inactive."
                      : flags.auditRetentionLifetime
                      ? "Active Policy: Lifetime storage — audit logs are preserved permanently without purging."
                      : flags.auditRetention60
                      ? "Active Policy: 60-day rolling retention — logs older than 60 days are purged automatically."
                      : "Active Policy: 30-day rolling retention — logs older than 30 days are purged automatically."}
                  </p>
                ) : g.note ? (
                  <p className="mt-3 text-[11px] text-slate-400 dark:text-slate-500 flex items-start gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 mt-px shrink-0 text-teal-600 dark:text-teal-400" />
                    {g.note}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </CardBody>
      </Card>
        </>
      )}

      {/* Payments — branch-scoped, only visible to Admin and Super Admin users, hidden from Developer and Staff */}
      {flags.paymentsMaster && canViewPayments && (
      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                💳 Payments — {data.branches.find((b) => b.id === activePayBranchId)?.name || "Main Branch"}
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                Branch-level payment settings for <b>{data.branches.find((b) => b.id === activePayBranchId)?.name || "your branch"}</b>.
                {flags.payPos ? " POS Swipe Machine is active — card/UPI bills push to the terminal." : isBranchDigitalEnabled ? " Digital Payments active — UPI QR and payment details show on the billing screen." : " Digital Payments disabled for this branch by Developer."}
              </p>
            </div>
            {isSuperAdmin && data.branches.length > 1 && (
              <div className="shrink-0 w-full sm:w-56">
                <Label className="text-xs mb-1">Branch Switcher (Super Admin)</Label>
                <Select value={selectedPayBranchId} onChange={(e) => setSelectedPayBranchId(e.target.value)}>
                  {data.branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
                  ))}
                </Select>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold border ${flags.payPos ? "border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300" : isBranchDigitalEnabled ? "border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300" : "border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"}`}>
              {flags.payPos ? "💳 POS Swipe Machine mode" : isBranchDigitalEnabled ? "📱 Digital Payments mode (Active)" : "🚫 Digital Payments mode (Disabled)"}
            </span>
          </div>

          {flags.payPos ? (
            <div className="rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50/60 dark:bg-violet-900/20 p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-violet-800 dark:text-violet-200">
                <CreditCard className="w-4 h-4" /> POS Swipe Machine
              </div>
              <p className="text-xs text-violet-700 dark:text-violet-300 leading-relaxed">
                When a bill is generated with <b>Card</b> or <b>UPI</b>, the amount is pushed straight to the connected swipe machine for processing. The terminal confirmation is recorded on the invoice.
              </p>
            </div>
          ) : !isBranchDigitalEnabled ? (
            <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/30 p-4 space-y-2 text-amber-900 dark:text-amber-200">
              <div className="flex items-center gap-2 font-bold text-sm text-amber-800 dark:text-amber-300">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                Digital Payments Mode Disabled for This Branch
              </div>
              <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
                Digital Payments mode has been turned off for <b>{data.branches.find((b) => b.id === activePayBranchId)?.name || "this branch"}</b> in Developer Settings. All options for uploading a QR, entering a UPI ID, and setting a payee name are completely hidden.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-5">
              {/* QR preview / upload */}
              <div className="flex flex-col items-center gap-3">
                {branchPay.upiQr ? (
                  <div className="w-40 h-40 rounded-2xl bg-white ring-1 ring-slate-200 dark:ring-slate-600 p-2 shadow-sm">
                    <img src={branchPay.upiQr} alt="UPI QR" className="w-full h-full object-contain" />
                  </div>
                ) : (
                  <div className="w-40 h-40 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-600 flex flex-col items-center justify-center text-slate-400 text-xs text-center px-3">
                    <QrCode className="w-8 h-8 mb-2 opacity-60" />
                    No QR uploaded yet
                  </div>
                )}
                <div className="flex gap-2">
                  <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 text-white text-sm font-semibold hover:bg-sky-700 active:scale-95 transition-all">
                    {uploadingQr ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    {uploadingQr ? "Uploading..." : branchPay.upiQr ? "Replace QR" : "Upload QR"}
                    <input type="file" accept="image/*" className="hidden" onChange={onQrFile} />
                  </label>
                  {branchPay.upiQr && (
                    <button
                      onClick={() => {
                        setBranchPayment(activePayBranchId, { upiQr: undefined });
                        flashToast("UPI QR removed from this branch's billing screens");
                      }}
                      className="px-3 py-2 rounded-lg text-sm font-semibold text-rose-600 bg-rose-50 dark:bg-rose-900/30 hover:bg-rose-100 dark:hover:bg-rose-900/50 active:scale-95 transition-all"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>

              {/* UPI details */}
              <div className="space-y-3">
                <div>
                  <Label>UPI ID</Label>
                  <Input value={upiId} onChange={(e) => setUpiId(e.target.value)} placeholder="yourname@bank" />
                </div>
                <div>
                  <Label>Payee Name</Label>
                  <Input value={upiName} onChange={(e) => setUpiName(e.target.value)} placeholder="Shop / account holder name" />
                </div>
                <Button
                  onClick={() => {
                    setBranchPayment(activePayBranchId, { upiId: upiId.trim(), upiName: upiName.trim() });
                    flashToast("Payment details saved for this branch on all devices");
                  }}
                >
                  Save Payment Details
                </Button>
              </div>
            </div>
          )}
        </CardBody>
      </Card>
      )}

      {/* Backup & Restore — developer only, one branch at a time */}
      {isDevAccount && (
      <Card>
        <CardBody className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-semibold text-slate-800 dark:text-slate-100 mb-2">💾 Backup & Restore</div>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Developer only. Select a branch, then backup or restore that branch’s records (stock, patients, invoices, GRNs, suppliers, users, payments). Other branches are left unchanged.
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-900/30 px-2.5 py-1 text-[11px] font-semibold text-violet-700 dark:text-violet-300 shrink-0">
              Developer only
            </span>
          </div>
          {data.branches.length > 1 && (
            <div className="max-w-md">
              <Label>Branch</Label>
              <Select value={backupBranchId} onChange={(e) => setBackupBranchId(e.target.value)}>
                <option value="">Select a branch</option>
                {data.branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
                ))}
              </Select>
            </div>
          )}
          {data.branches.length === 1 && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Only one branch is configured: <b>{data.branches[0].name}</b>. Backup and restore apply to this branch.
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <Button onClick={exportBranch} disabled={!targetBackupBranchId}>📥 Backup</Button>
            <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={!targetBackupBranchId}>📤 Restore</Button>
            <input ref={fileRef} type="file" accept=".json" onChange={importBranch} className="hidden" />
          </div>
        </CardBody>
      </Card>
      )}

      {/* System Statistics — admin & developer only */}
      {!isStaff && (
      <Card>
        <CardBody>
          <div className="font-semibold text-slate-800 dark:text-slate-100 mb-2">📊 System Statistics</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            {[
              { label: "Users", value: data.users.length },
              { label: "Medicines", value: data.medicines.length },
              { label: "Patients", value: data.patients.length },
              { label: "Doctors", value: data.doctors?.length || 0 },
              { label: "Invoices", value: data.invoices.length },
              { label: "Suppliers", value: data.suppliers.length },
              { label: "GRNs", value: data.grns.length },
              { label: "Returns", value: data.returns.length },
              { label: "Audit Logs", value: data.audit.length },
            ].map((s) => (
              <div key={s.label} className="bg-slate-50 dark:bg-slate-700/50 p-3 rounded">
                <div className="text-slate-500 dark:text-slate-400 text-xs">{s.label}</div>
                <div className="text-xl font-bold text-slate-800 dark:text-slate-100">{s.value}</div>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>
      )}

      {/* About */}
      <Card>
        <CardBody>
          <div className="font-semibold text-slate-800 dark:text-slate-100 mb-2">ℹ️ About</div>
          <div className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
            <div><b>Guru</b> — Pharmacy Management System v1.0</div>
            <div>Built with React, Vite, TypeScript & Tailwind CSS</div>
            <div>Data syncs through the cloud. The Developer can backup or restore a single branch from this page.</div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
};

export default Settings;
