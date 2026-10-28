import React, { useState, useMemo } from "react";
import { useStore } from "../store/store";
import { FileDown, Trash2 } from "lucide-react";
import { Card, CardBody, Input, Th, Td, EmptyState, Button } from "../components/ui";
import { fmtDateTime, downloadPDF } from "../utils/helpers";

const Audit: React.FC = () => {
  const { data, flags, currentUser, clearAuditLog } = useStore();
  const [q, setQ] = useState("");
  const isOverseerRole = currentUser?.role === "superadmin" || currentUser?.role === "developer";

  const branchOf = (id?: string) => data.branches.find((b) => b.id === id)?.code || (id ? "—" : "HQ");

  const filtered = useMemo(() => {
    const ql = q.toLowerCase();
    return data.audit.filter((a) =>
      !q || a.user.toLowerCase().includes(ql) || a.action.toLowerCase().includes(ql) || (a.details || "").toLowerCase().includes(ql) || branchOf(a.branchId).toLowerCase().includes(ql)
    );
  }, [data.audit, q, data.branches]);

  const exportPdf = () => {
    downloadPDF({
      filename: `audit-${Date.now()}.pdf`,
      title: "Audit Log",
      subtitle: `${filtered.length} entr${filtered.length === 1 ? "y" : "ies"} · full oversight trail`,
      columns: ["Time", "User", "Branch", "Action", "Details"],
      rows: filtered.map((a) => [fmtDateTime(a.timestamp), a.user, branchOf(a.branchId), a.action, a.details || ""]),
    });
  };

  const retentionLabel = flags.auditRetentionLifetime
    ? "Lifetime Storage"
    : flags.auditRetention60
    ? "60 Days"
    : "30 Days";

  return (
    <div className="space-y-4">
      {!flags.auditEnabled && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 flex items-start gap-3">
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse mt-1.5 shrink-0" />
          <div className="text-sm text-amber-800 dark:text-amber-200">
            <b>Audit logging is currently disabled.</b> New actions are not being recorded.{" "}
            {flags.auditRetentionLifetime
              ? "Existing entries are stored permanently without deletion."
              : `Existing entries older than ${flags.auditRetention60 ? "60 days" : "30 days"} continue to be purged automatically.`}{" "}
            Re-enable it in Settings → Feature Controls → Audit &amp; Security.
          </div>
        </div>
      )}
      <Card>
        <CardBody className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex-1 flex flex-wrap gap-2 sm:gap-3">
            <Input placeholder="Search user/action..." value={q} onChange={(e) => setQ(e.target.value)} />
            <Button variant="secondary" onClick={exportPdf}><FileDown className="w-4 h-4" /> Download PDF</Button>
            {isOverseerRole && (
              <Button
                variant="danger"
                onClick={() => {
                  if (window.confirm("Are you sure you want to permanently clear all audit logs?")) {
                    void clearAuditLog();
                  }
                }}
              >
                <Trash2 className="w-4 h-4" /> Clear Audit Log
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold">Retention:</span>
            <span className="font-medium text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-800 rounded-full px-2.5 py-0.5">
              {retentionLabel}
            </span>
          </div>
        </CardBody>
      </Card>
      <Card>
        <CardBody className="p-0">
          <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200 sticky top-0"><tr><Th>Time</Th><Th>User</Th><Th>Branch</Th><Th>Action</Th><Th>Details</Th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50 transition-colors">
                    <Td className="text-xs text-slate-500">{fmtDateTime(a.timestamp)}</Td>
                    <Td className="font-medium">{a.user}</Td>
                    <Td><span className="text-[11px] font-semibold text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-900/30 border border-teal-200 dark:border-teal-800 px-2 py-0.5 rounded-full">{branchOf(a.branchId)}</span></Td>
                    <Td><span className="text-xs font-mono bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded">{a.action}</span></Td>
                    <Td className="text-slate-600 dark:text-slate-300">{a.details || "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && <EmptyState message="No audit entries" />}
          </div>
        </CardBody>
      </Card>
    </div>
  );
};

export default Audit;
