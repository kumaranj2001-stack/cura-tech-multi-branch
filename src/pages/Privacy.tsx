import React from "react";
import { ShieldCheck, HeartPulse, CreditCard, KeyRound, Handshake, Database, ArrowLeft, FileText } from "lucide-react";
import { Card, CardBody } from "../components/ui";
import logoUrl from "../assets/logo.png";

const SECTIONS = [
  {
    icon: HeartPulse,
    tone: "text-rose-600 bg-rose-50 dark:bg-rose-900/30",
    title: "Personal & Health Information",
    body: "Guru collects only the personal and health information necessary to run a pharmacy — patient names, contact details, prescription records, and medication history. Every record is collected and stored securely, encrypted in transit, and held in access-controlled cloud storage. Health-related data is treated as confidential at all times.",
  },
  {
    icon: FileText,
    tone: "text-sky-600 bg-sky-50 dark:bg-sky-900/30",
    title: "Use Strictly for Pharmacy Operations",
    body: "Your data is used strictly for pharmacy operations: patient management, prescription tracking, inventory and stock control, purchase (GRN) processing, billing, and regulatory reporting. It is never used for advertising, profiling, or any purpose unrelated to running the pharmacy.",
  },
  {
    icon: CreditCard,
    tone: "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30",
    title: "Financial Transactions & Payment Security",
    body: "All financial transactions — invoices, discounts, taxes, and purchase totals — are processed and recorded with the highest level of security. Payment details are handled with strict access control, totals are tamper-evident through audit trails, and no card or payment data is ever stored in plain text.",
  },
  {
    icon: KeyRound,
    tone: "text-violet-600 bg-violet-50 dark:bg-violet-900/30",
    title: "Credentials & Activity Logs",
    body: "User accounts are role-based (Developer, Super Admin, Admin, Staff) with least-privilege access. Credentials and activity logs are robustly protected to prevent unauthorized access: every sign-in, edit, approval, and deletion is recorded in a tamper-evident audit log that only authorized roles can view.",
  },
  {
    icon: Handshake,
    tone: "text-amber-600 bg-amber-50 dark:bg-amber-900/30",
    title: "No Third-Party Sharing Without Consent",
    body: "Guru confirms that no personal, health, or financial data is shared, sold, or disclosed to any third party without your explicit consent — except where disclosure is required by law or pharmacy regulation.",
  },
  {
    icon: Database,
    tone: "text-teal-600 bg-teal-50 dark:bg-teal-900/30",
    title: "Storage, Backups & Your Rights",
    body: "Data is synchronized securely across your pharmacy's authorized devices and backed up to protect against loss. You may export your data at any time from Settings, and you may request correction or deletion of records. Questions about this policy can be raised with the pharmacy's system administrator.",
  },
];

export const Privacy: React.FC<{ onBack?: () => void }> = ({ onBack }) => (
  <div className="min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors">
    <div className="mx-auto max-w-3xl px-4 py-10">
      {/* header */}
      <div className="flex items-center gap-4 mb-8">
        {onBack && (
          <button
            onClick={onBack}
            className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:shadow-md hover:-translate-x-0.5 transition-all"
            title="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <div className="w-14 h-14 rounded-2xl bg-white ring-1 ring-slate-200 dark:ring-slate-700 flex items-center justify-center overflow-hidden shadow-sm">
          <img src={logoUrl} alt="Guru logo" className="w-11 h-11 object-contain" />
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-800 dark:text-slate-100">Privacy Policy</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Guru Pharmacy Management System · Effective {new Date().getFullYear()}</p>
        </div>
      </div>

      <div className="rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-900/20 px-4 py-3 mb-6 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-teal-600 dark:text-teal-300 shrink-0 mt-0.5" />
        <p className="text-sm text-teal-800 dark:text-teal-200 leading-relaxed">
          Your trust matters. This policy explains exactly how Guru collects, protects, and uses your data — and our commitment that it is never shared without your consent.
        </p>
      </div>

      <div className="space-y-4">
        {SECTIONS.map((s, i) => (
          <Card key={s.title} className="hover:shadow-md hover:border-sky-200 dark:hover:border-sky-800 transition-all">
            <CardBody className="flex gap-4">
              <div className={`w-11 h-11 shrink-0 rounded-xl flex items-center justify-center ${s.tone}`}>
                <s.icon className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-bold text-slate-800 dark:text-slate-100 flex items-baseline gap-2">
                  <span className="text-xs font-extrabold text-slate-400 dark:text-slate-500 tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                  {s.title}
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mt-1.5">{s.body}</p>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      <p className="text-center text-xs text-slate-400 dark:text-slate-500 mt-8">
        © {new Date().getFullYear()} Guru · Pharmacy Management System · Data stays under your pharmacy's control
      </p>
    </div>
  </div>
);

export default Privacy;
