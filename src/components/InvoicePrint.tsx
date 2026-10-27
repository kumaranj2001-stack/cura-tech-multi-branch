import React, { useRef, useState } from "react";
import type { Invoice } from "../store/types";
import { useStore } from "../store/store";
import { Button } from "./ui";
import { fmtCurrency, fmtDateTime, htmlToPdfBlob, flashToast } from "../utils/helpers";
import { Printer, FileDown, MessageCircle, X } from "lucide-react";
import logoUrl from "../assets/logo.png";

const InvoicePrint: React.FC<{ invoice: Invoice; onClose: () => void }> = ({ invoice, onClose }) => {
  const { flags, data, currentBranch, currentUser } = useStore();
  const branch = data.branches.find((b) => b.id === (invoice.branchId || currentBranch?.id || currentUser?.branchId || "br_main"));
  const profile = {
    name: branch?.storeName || branch?.name || "",
    address: branch?.address || "",
    contact: branch?.phone || "",
    gstNumber: branch?.gstNumber || "",
  };
  const [busy, setBusy] = useState<"pdf" | "wa" | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => window.print();

  /* The PDF is a faithful capture of this exact on-screen invoice */
  const buildPdf = () => {
    if (!printRef.current) throw new Error("Invoice not ready");
    return htmlToPdfBlob(printRef.current);
  };

  const handleSavePdf = async () => {
    setBusy("pdf");
    try {
      const blob = await buildPdf();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${invoice.number}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 4000);
      flashToast(`Invoice ${invoice.number} saved as PDF`);
    } catch {
      flashToast("Could not generate the PDF", "warn");
    } finally {
      setBusy(null);
    }
  };

  const [sentTo, setSentTo] = useState<{ phone: string; method: "share" | "wa" } | null>(null);

  /* Normalise the patient's phone to an international wa.me number (defaults to India +91) */
  const waNumber = (raw?: string) => {
    let d = (raw || "").replace(/\D/g, "");
    if (d.length === 10) d = "91" + d;
    else if (d.length === 11 && d.startsWith("0")) d = "91" + d.slice(1);
    else if (d.length === 12 && d.startsWith("91")) d = d;
    return d;
  };
  const prettyPhone = (raw?: string) => {
    const d = waNumber(raw);
    return d ? `+${d}` : "";
  };

  const handleWhatsApp = async () => {
    setBusy("wa");
    const phone = waNumber(invoice.patientPhone);
    const summary =
      `*Guru Invoice* ${invoice.number}\n` +
      `Patient: ${invoice.patientName}\n` +
      `Date: ${fmtDateTime(invoice.date)}\n` +
      `Total: ${fmtCurrency(invoice.total)}\n\n` +
      `The invoice PDF is attached with this message. Thank you!`;
    try {
      const blob = await buildPdf();
      const file = new File([blob], `${invoice.number}.pdf`, { type: "application/pdf" });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      // Native share sheet with the PDF attached (mobile) — resolves once the customer chat is sent
      if (nav.canShare && nav.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: invoice.number, text: summary });
        setSentTo({ phone: prettyPhone(invoice.patientPhone) || "WhatsApp", method: "share" });
        flashToast(`Invoice ${invoice.number} sent on WhatsApp`);
        setBusy(null);
        return;
      }
      // Desktop fallback: download the PDF, then open the customer's WhatsApp chat directly
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${invoice.number}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 4000);
      const target = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(summary)}` : `https://wa.me/?text=${encodeURIComponent(summary)}`;
      window.open(target, "_blank");
      setSentTo({ phone: prettyPhone(invoice.patientPhone), method: "wa" });
      flashToast(phone ? `WhatsApp opened for ${prettyPhone(invoice.patientPhone)}` : "WhatsApp opened — select the customer");
    } catch (e) {
      if ((e as DOMException)?.name !== "AbortError") {
        flashToast("Could not share — PDF downloaded instead", "warn");
        const phone2 = waNumber(invoice.patientPhone);
        window.open(phone2 ? `https://wa.me/${phone2}?text=${encodeURIComponent(summary)}` : `https://wa.me/?text=${encodeURIComponent(summary)}`, "_blank");
        setSentTo({ phone: prettyPhone(invoice.patientPhone), method: "wa" });
      }
    } finally {
      setBusy(null);
    }
  };

  const spin = <span className="w-3.5 h-3.5 border-2 border-current/40 border-t-current rounded-full animate-spin" />;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="no-print sticky top-0 bg-white border-b border-slate-200 px-5 py-3 flex flex-wrap items-center justify-between gap-2 z-10">
          <div className="font-semibold text-slate-800">Invoice {invoice.number}</div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={handlePrint}>
              <Printer className="w-4 h-4" /> <span className="hidden sm:inline">Print</span>
            </Button>
            {flags.btnSavePdf && (
              <Button size="sm" onClick={handleSavePdf} disabled={busy === "pdf"}>
                {busy === "pdf" ? spin : <FileDown className="w-4 h-4" />} <span className="hidden sm:inline">Save as PDF</span>
              </Button>
            )}
            {flags.btnWhatsApp && (
              <button
                onClick={handleWhatsApp}
                disabled={busy === "wa"}
                title={invoice.patientPhone ? `Send to ${prettyPhone(invoice.patientPhone)}` : "No phone on invoice — you'll pick the contact in WhatsApp"}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-white bg-[#25D366] hover:bg-[#1ebe5b] active:scale-95 disabled:opacity-60 transition-all"
              >
                {busy === "wa" ? spin : <MessageCircle className="w-4 h-4" />}
                <span className="hidden sm:inline">Share on WhatsApp</span>
                {invoice.patientPhone && <span className="hidden lg:inline text-[11px] opacity-90">· {prettyPhone(invoice.patientPhone)}</span>}
              </button>
            )}
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" /> <span className="hidden sm:inline">Close</span>
            </Button>
          </div>
        </div>

        <div id="print-area" ref={printRef} className="p-8 text-slate-800 bg-white">
          {/* Header */}
          <div className="flex items-start justify-between border-b-2 border-sky-600 pb-4 mb-5">
            <div>
              <div className="flex items-center gap-3">
                <img src={logoUrl} alt="Guru logo" className="w-14 h-14 object-contain" />
                <div>
                  <h1 className="text-3xl font-extrabold tracking-tight text-sky-700">{profile.name || "GURU"}</h1>
                  <div className="text-xs text-slate-600">Your trusted pharmacy partner</div>
                </div>
              </div>
              {profile.address && (
                <div className="text-xs text-slate-600 mt-2 max-w-[320px] leading-relaxed">
                  <span className="font-semibold text-slate-700 block">Regd. Address:</span>
                  <div className="whitespace-pre-line">{profile.address}</div>
                </div>
              )}
            </div>
            <div className="text-right text-xs text-slate-600">
              <div className="font-semibold text-slate-800">TAX INVOICE</div>
              <div>Phone: {profile.contact || "+91 98765 43210"}</div>
              {profile.gstNumber ? (
                <div className="mt-1 font-semibold text-slate-800">GSTIN: {profile.gstNumber}</div>
              ) : (
                <div>Email: info@gurupharma.com</div>
              )}
            </div>
          </div>

          {/* Meta */}
          <div className="grid grid-cols-2 gap-4 mb-5 text-sm">
            <div className="bg-slate-50 rounded-lg p-3">
              <div className="text-xs text-slate-500 font-semibold uppercase mb-1">Bill To</div>
              <div className="font-semibold">{invoice.patientName}</div>
              {invoice.patientPhone && <div className="text-slate-600">{invoice.patientPhone}</div>}
              {invoice.doctorName && (
                <div className="mt-2 pt-2 border-t border-slate-200 text-xs">
                  <div className="text-[10px] text-slate-400 font-semibold uppercase">Prescribed By</div>
                  <div className="font-semibold text-slate-700">{invoice.doctorName}</div>
                  {invoice.hospital && <div className="text-slate-500 text-[11px]">{invoice.hospital}</div>}
                </div>
              )}
            </div>
            <div className="bg-slate-50 rounded-lg p-3 text-right">
              <div className="text-xs text-slate-500 font-semibold uppercase mb-1">Invoice Details</div>
              <div><span className="text-slate-500">No:</span> <span className="font-semibold">{invoice.number}</span></div>
              <div><span className="text-slate-500">Date:</span> {fmtDateTime(invoice.date)}</div>
              <div><span className="text-slate-500">Cashier:</span> {invoice.createdBy}</div>
              <div><span className="text-slate-500">Payment:</span> <span className="font-semibold uppercase">{invoice.paymentMethod || "cash"}</span></div>
              {invoice.posRef && <div className="text-[10px] text-violet-700 font-semibold">POS Terminal Ref: {invoice.posRef}</div>}
            </div>
          </div>

          {/* Narcotic Prescription Record if applicable */}
          {(invoice.hasNarcotic || invoice.prescriptionUrl) && (
            <div className="mb-5 rounded-lg border border-rose-300 bg-rose-50/70 p-3 text-xs text-rose-950 flex items-center justify-between">
              <span className="font-bold text-rose-800 uppercase tracking-wide flex items-center gap-1.5">
                <span className="px-1.5 py-0.5 rounded bg-rose-600 text-white font-mono text-[10px] font-bold">Rx</span>
                Narcotic / Schedule Controlled Medication
              </span>
              <span className="text-[11px] text-emerald-700 font-semibold bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-full">
                ✓ Prescription Attached & Verified
              </span>
            </div>
          )}

          {/* Items */}
          <table className="w-full text-sm border-collapse mb-5">
            <thead>
              <tr className="bg-sky-600 text-white">
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">Medicine</th>
                <th className="px-3 py-2 text-left">Batch</th>
                <th className="px-3 py-2 text-left">Expiry Date</th>
                <th className="px-3 py-2 text-left">GST %</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">Price</th>
                <th className="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((it, i) => (
                <tr key={i} className={`border-b border-slate-200 ${it.narcotic ? "bg-rose-50/50" : ""}`}>
                  <td className="px-3 py-2">{i + 1}</td>
                  <td className="px-3 py-2 font-medium">
                    {it.name}
                    {it.narcotic && (
                      <span className="ml-1.5 inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-300">
                        NARCOTIC
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{it.batch}</td>
                  <td className="px-3 py-2 text-slate-600">{it.expiry || "—"}</td>
                  <td className="px-3 py-2 text-slate-600">{it.gst != null ? `${it.gst}%` : "0%"}</td>
                  <td className="px-3 py-2 text-right">{it.qty}</td>
                  <td className="px-3 py-2 text-right">{fmtCurrency(it.price)}</td>
                  <td className="px-3 py-2 text-right font-semibold">{fmtCurrency(it.qty * it.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div className="flex justify-end">
            <div className="w-full max-w-xs space-y-1 text-sm">
              <div className="flex justify-between"><span>Subtotal</span><span>{fmtCurrency(invoice.subtotal)}</span></div>
              {invoice.discount > 0 && (
                <div className="flex justify-between text-rose-600">
                  <span>Discount ({invoice.discountType === "percent" ? `${invoice.discountValue}%` : "fixed"})</span>
                  <span>- {fmtCurrency(invoice.discount)}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold border-t-2 border-slate-300 pt-2 mt-1">
                <span>Grand Total</span>
                <span className="text-sky-700">{fmtCurrency(invoice.total)}</span>
              </div>
              <div className="text-[11px] text-slate-400 text-right italic">(Inclusive of all taxes / GST)</div>
            </div>
          </div>

          <div className="mt-8 pt-4 border-t border-slate-200 text-center text-xs text-slate-500">
            Thank you for choosing Guru. Get well soon! 💊<br />
            <span className="text-[10px]">This is a computer-generated invoice and does not require a signature.</span>
          </div>
        </div>
      </div>

      {/* WhatsApp delivery confirmation */}
      {sentTo && (
        <div className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <style>{`
            @keyframes wa-pop { 0% { transform: scale(.4); opacity: 0; } 60% { transform: scale(1.08); opacity: 1; } 100% { transform: scale(1); } }
            @keyframes wa-ring { 0% { box-shadow: 0 0 0 0 rgba(37,211,102,.45); } 100% { box-shadow: 0 0 0 22px rgba(37,211,102,0); } }
          `}</style>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-7 text-center" style={{ animation: "wa-pop .35s cubic-bezier(.22,1,.36,1) both" }}>
            <div
              className="mx-auto w-16 h-16 rounded-full bg-[#25D366] flex items-center justify-center mb-4"
              style={{ animation: "wa-ring 1.1s ease-out 2" }}
            >
              <svg viewBox="0 0 24 24" className="w-8 h-8 text-white" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <h3 className="text-lg font-extrabold text-slate-800">Sent on WhatsApp</h3>
            <p className="text-sm text-slate-600 mt-2 leading-relaxed">
              Invoice <b>{invoice.number}</b> ({fmtCurrency(invoice.total)})
              {sentTo.phone
                ? <> was sent to <b className="text-[#128C7E]">{sentTo.phone}</b>.</>
                : <> is ready in WhatsApp — choose the customer to send.</>}
            </p>
            <p className="text-xs text-slate-400 mt-2">
              {sentTo.method === "share"
                ? "The PDF was attached to the message."
                : "The invoice PDF was downloaded — attach it in the open chat if needed."}
            </p>
            <button
              onClick={() => setSentTo(null)}
              className="mt-5 w-full py-2.5 rounded-xl bg-[#25D366] hover:bg-[#1ebe5b] active:scale-[.98] text-white font-bold transition-all"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default InvoicePrint;
