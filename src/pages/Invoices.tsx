import React, { useEffect, useMemo, useState } from "react";
import { useStore } from "../store/store";
import { FileDown } from "lucide-react";
import { Card, CardBody, Input, Th, Td, Button, EmptyState } from "../components/ui";
import { fmtCurrency, fmtDateTime, downloadPDF } from "../utils/helpers";
import type { Invoice } from "../store/types";
import InvoicePrint from "../components/InvoicePrint";

const Invoices: React.FC<{ focusId?: string | null; onConsumeFocus?: () => void }> = ({ focusId, onConsumeFocus }) => {
  const { data, flags } = useStore();
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [view, setView] = useState<Invoice | null>(null);

  // Deep link: open a specific invoice when navigated from the dashboard
  useEffect(() => {
    if (!focusId) return;
    const target = data.invoices.find((i) => i.id === focusId);
    if (target) setView(target);
    onConsumeFocus?.();
  }, [focusId, data.invoices, onConsumeFocus]);

  const filtered = useMemo(() => {
    const ql = q.toLowerCase();
    return data.invoices.filter((i) => {
      if (q && !(i.number.toLowerCase().includes(ql) || i.patientName.toLowerCase().includes(ql))) return false;
      if (from && i.date.slice(0, 10) < from) return false;
      if (to && i.date.slice(0, 10) > to) return false;
      return true;
    });
  }, [data.invoices, q, from, to]);

  const exportPDF = () => {
    const totals = filtered.reduce((s, i) => ({ total: s.total + i.total }), { total: 0 });
    downloadPDF({
      filename: `invoices-${Date.now()}.pdf`,
      title: "Sales Invoices",
      subtitle: `${filtered.length} invoice(s)${from ? ` from ${from}` : ""}${to ? ` to ${to}` : ""}`,
      columns: ["Invoice", "Date", "Patient", "Phone", "Items", "Subtotal", "Discount", "Total", "Cashier"],
      rows: filtered.map((i) => [i.number, fmtDateTime(i.date), i.patientName, i.patientPhone || "", i.items.length, fmtCurrency(i.subtotal), fmtCurrency(i.discount), fmtCurrency(i.total), i.createdBy]),
      footer: [
        { label: "Total Collected", value: fmtCurrency(totals.total) },
      ],
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <Input placeholder="Search invoice/patient..." value={q} onChange={(e) => setQ(e.target.value)} />
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          {flags.pdfInvoices && (
            <Button variant="secondary" onClick={exportPDF}><FileDown className="w-4 h-4" /> Download PDF</Button>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <Th>Invoice</Th>
                  <Th>Date</Th>
                  <Th>Patient</Th>
                  <Th>Items</Th>
                  <Th>Total</Th>
                  <Th>Cashier</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((i) => (
                  <tr key={i.id} className="hover:bg-slate-50">
                    <Td className="font-semibold text-sky-700">{i.number}</Td>
                    <Td>{fmtDateTime(i.date)}</Td>
                    <Td>
                      <div>{i.patientName}</div>
                      {i.patientPhone && <div className="text-xs text-slate-500">{i.patientPhone}</div>}
                    </Td>
                    <Td>{i.items.length}</Td>
                    <Td className="font-semibold">{fmtCurrency(i.total)}</Td>
                    <Td>{i.createdBy}</Td>
                    <Td>
                      <Button size="sm" variant="secondary" onClick={() => setView(i)}>View</Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && <EmptyState message="No invoices found" />}
          </div>
        </CardBody>
      </Card>

      {view && <InvoicePrint invoice={view} onClose={() => setView(null)} />}
    </div>
  );
};

export default Invoices;
