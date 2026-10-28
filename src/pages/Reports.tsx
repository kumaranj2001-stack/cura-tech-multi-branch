import React, { useMemo, useState } from "react";
import { useStore } from "../store/store";
import { Card, CardBody, Button, Th, Td, Select, Input, Badge } from "../components/ui";
import { FileDown } from "lucide-react";
import { fmtCurrency, fmtDate, downloadPDF, isExpired, daysToExpiry } from "../utils/helpers";

type ReportType = "daily" | "monthly" | "purchases" | "stock" | "expiry" | "pl" | "tax" | "user" | "userSales";

const Reports: React.FC = () => {
  const { data, currentUser, viewBranchId, currentBranch, flags } = useStore();
  const [type, setType] = useState<ReportType>("daily");

  const reportEnabled: Record<ReportType, boolean> = {
    daily: flags.repDaily, monthly: flags.repMonthly, purchases: flags.repPurchases,
    stock: flags.repStock, expiry: flags.repExpiry, pl: flags.repPL,
    tax: flags.repTax, user: flags.repUser, userSales: flags.repUserSales ?? true,
  };

  const pdfDownloadEnabled: Record<ReportType, boolean> = {
    daily: flags.repDailyPdf !== false,
    monthly: flags.repMonthlyPdf !== false,
    purchases: flags.repPurchasesPdf !== false,
    stock: flags.repStockPdf !== false,
    expiry: flags.repExpiryPdf !== false,
    pl: flags.repPLPdf !== false,
    tax: flags.repTaxPdf !== false,
    user: flags.repUserPdf !== false,
    userSales: flags.repUserSalesPdf !== false,
  };
  const canDownloadPdf = pdfDownloadEnabled[type];

  // if the active report gets disabled remotely, jump to the first enabled one
  React.useEffect(() => {
    if (!reportEnabled[type]) {
      const first = (Object.keys(reportEnabled) as ReportType[]).find((k) => reportEnabled[k]);
      if (first) setType(first);
    }
  }, [reportEnabled, type]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const isOverseerRole = currentUser?.role === "superadmin" || currentUser?.role === "developer";
  const scopeLabel = isOverseerRole
    ? viewBranchId
      ? data.branches.find((b) => b.id === viewBranchId)?.name || "Branch"
      : "All Branches"
    : currentBranch?.name || "My Branch";

  const inRange = (d: string) => {
    const ds = d.slice(0, 10);
    if (from && ds < from) return false;
    if (to && ds > to) return false;
    return true;
  };

  const result = useMemo(() => {
    if (type === "daily") {
      const map: Record<string, { count: number; total: number; tax: number }> = {};
      data.invoices.filter((i) => inRange(i.date)).forEach((i) => {
        const d = i.date.slice(0, 10);
        if (!map[d]) map[d] = { count: 0, total: 0, tax: 0 };
        map[d].count++;
        map[d].total += i.total;
        map[d].tax += i.taxAmount;
      });
      return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0])).map(([date, v]) => ({ date, ...v }));
    }
    if (type === "monthly") {
      const map: Record<string, { count: number; total: number; tax: number }> = {};
      data.invoices.filter((i) => inRange(i.date)).forEach((i) => {
        const d = i.date.slice(0, 7);
        if (!map[d]) map[d] = { count: 0, total: 0, tax: 0 };
        map[d].count++;
        map[d].total += i.total;
        map[d].tax += i.taxAmount;
      });
      return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0])).map(([date, v]) => ({ date, ...v }));
    }
    if (type === "purchases") {
      return data.grns.filter((g) => g.status === "approved" && inRange(g.date));
    }
    if (type === "stock") {
      return data.medicines;
    }
    if (type === "expiry") {
      return data.medicines.filter((m) => isExpired(m.expiry) || daysToExpiry(m.expiry) <= 90);
    }
    if (type === "pl") {
      let revenue = 0, cost = 0;
      data.invoices.filter((i) => inRange(i.date)).forEach((inv) => {
        revenue += inv.total - inv.taxAmount;
        inv.items.forEach((it) => {
          const med = data.medicines.find((m) => m.id === it.medicineId);
          if (med) cost += med.purchasePrice * it.qty;
        });
      });
      return { revenue, cost, profit: revenue - cost };
    }
    if (type === "tax") {
      let total = 0;
      data.invoices.filter((i) => inRange(i.date)).forEach((i) => total += i.taxAmount);
      return { total, count: data.invoices.filter((i) => inRange(i.date)).length };
    }
    if (type === "user") {
      const map: Record<string, { actions: number; invoices: number; sales: number; tax: number }> = {};
      const bump = (u: string) => (map[u] = map[u] || { actions: 0, invoices: 0, sales: 0, tax: 0 });
      data.audit.filter((a) => inRange(a.timestamp)).forEach((a) => { bump(a.user).actions += 1; });
      data.invoices.filter((i) => inRange(i.date)).forEach((i) => {
        const e = bump(i.createdBy || "unknown");
        e.invoices += 1;
        e.sales += i.total;
        e.tax += i.taxAmount;
      });
      return Object.entries(map)
        .map(([user, v]) => ({ user, ...v }))
        .sort((a, b) => b.sales - a.sales || b.actions - a.actions);
    }
    if (type === "userSales") {
      const userMap: Record<string, {
        userId: string;
        name: string;
        username: string;
        role: string;
        branchName?: string;
        invoices: number;
        sales: number;
        tax: number;
      }> = {};

      data.users.forEach((u) => {
        const branch = data.branches.find((b) => b.id === u.branchId);
        userMap[u.username.toLowerCase()] = {
          userId: u.id,
          name: u.name,
          username: u.username,
          role: u.role,
          branchName: branch?.name,
          invoices: 0,
          sales: 0,
          tax: 0,
        };
      });

      data.invoices.filter((i) => inRange(i.date)).forEach((inv) => {
        const creatorKey = (inv.createdBy || "unknown").toLowerCase();
        let target = userMap[creatorKey];
        if (!target) {
          const found = data.users.find(
            (u) => u.name.toLowerCase() === creatorKey || u.username.toLowerCase() === creatorKey
          );
          if (found) {
            target = userMap[found.username.toLowerCase()];
          }
        }
        if (!target) {
          userMap[creatorKey] = {
            userId: creatorKey,
            name: inv.createdBy || "Unknown",
            username: inv.createdBy || "unknown",
            role: "staff",
            invoices: 0,
            sales: 0,
            tax: 0,
          };
          target = userMap[creatorKey];
        }
        target.invoices += 1;
        target.sales += inv.total;
        target.tax += inv.taxAmount;
      });

      return Object.values(userMap).sort(
        (a, b) => b.sales - a.sales || b.invoices - a.invoices || a.name.localeCompare(b.name)
      );
    }
    return [];
  }, [type, data, from, to]);

  const exportPdf = () => {
    if (!canDownloadPdf) return;
    let rows: (string | number)[][] = [];
    if (type === "daily" || type === "monthly") {
      rows = [["Period", "Invoices", "Tax", "Total"]];
      (result as { date: string; count: number; tax: number; total: number }[]).forEach((r) => rows.push([r.date, r.count, r.tax.toFixed(2), r.total.toFixed(2)]));
    } else if (type === "purchases") {
      rows = [["GRN", "Date", "Supplier", "Items", "Total"]];
      (result as { number: string; date: string; supplierName: string; items: unknown[]; total: number }[]).forEach((g) => rows.push([g.number, g.date, g.supplierName, g.items.length, g.total.toFixed(2)]));
    } else if (type === "stock" || type === "expiry") {
      rows = [["Name", "Batch", "Stock", "Buy", "Sell", "Expiry"]];
      (result as { name: string; batch: string; stock: number; purchasePrice: number; sellingPrice: number; expiry: string }[]).forEach((m) => rows.push([m.name, m.batch, m.stock, m.purchasePrice, m.sellingPrice, m.expiry]));
    } else if (type === "user") {
      rows = [["User", "Invoices", "Sales Amount", "Tax Collected", "Total Actions"]];
      (result as unknown as { user: string; actions: number; invoices: number; sales: number; tax: number }[]).forEach((u) =>
        rows.push([u.user, u.invoices, u.sales.toFixed(2), u.tax.toFixed(2), u.actions])
      );
    } else if (type === "userSales") {
      rows = [["User / Staff Name", "Username", "Role", "Bills Generated", "Total Sales", "Tax Collected", "Avg Bill Value"]];
      (result as unknown as { name: string; username: string; role: string; invoices: number; sales: number; tax: number }[]).forEach((u) => {
        const avg = u.invoices > 0 ? (u.sales / u.invoices).toFixed(2) : "0.00";
        rows.push([u.name, u.username, u.role.toUpperCase(), u.invoices, u.sales.toFixed(2), u.tax.toFixed(2), avg]);
      });
    } else if (type === "pl") {
      const r = result as { revenue: number; cost: number; profit: number };
      rows = [["Metric", "Amount"], ["Revenue (excl tax)", r.revenue.toFixed(2)], ["Cost", r.cost.toFixed(2)], ["Profit", r.profit.toFixed(2)]];
    } else if (type === "tax") {
      const r = result as { total: number; count: number };
      rows = [["Metric", "Value"], ["Total Tax Collected", r.total.toFixed(2)], ["Invoices", r.count]];
    }
    const columns = (rows[0] || []) as string[];
    const body = rows.slice(1);
    if (body.length === 0) {
      alert("No data in this report to download.");
      return;
    }
    downloadPDF({
      filename: `report-${type}-${Date.now()}.pdf`,
      title: `${type.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())} Report`,
      subtitle: `Scope: ${scopeLabel}${from ? ` · from ${from}` : ""}${to ? ` · to ${to}` : ""}`,
      columns,
      rows: body,
    });
  };

  const printReport = () => window.print();

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className={`grid grid-cols-1 ${canDownloadPdf ? "sm:grid-cols-5" : "sm:grid-cols-4"} gap-3`}>
          <Select value={type} onChange={(e) => setType(e.target.value as ReportType)}>
            {reportEnabled.daily && <option value="daily">📅 Daily Sales</option>}
            {reportEnabled.monthly && <option value="monthly">📆 Monthly Sales</option>}
            {reportEnabled.purchases && <option value="purchases">🛒 Purchases</option>}
            {reportEnabled.stock && <option value="stock">💊 Stock Report</option>}
            {reportEnabled.expiry && <option value="expiry">⏰ Expiry Report</option>}
            {reportEnabled.pl && <option value="pl">💰 Profit & Loss</option>}
            {reportEnabled.tax && <option value="tax">🧾 Tax Report</option>}
            {reportEnabled.user && <option value="user">👤 User Activity</option>}
            {reportEnabled.userSales && <option value="userSales">👥 User-based Sales</option>}
          </Select>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          {canDownloadPdf && (
            <Button variant="secondary" onClick={exportPdf}>
              <FileDown className="w-4 h-4" /> Download PDF
            </Button>
          )}
          <Button variant="secondary" onClick={printReport}>🖨 Print</Button>
        </CardBody>
      </Card>

      <div id="print-area">
        <Card>
          <CardBody>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h2 className="text-xl font-bold">Guru — Report</h2>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-900/30 px-2.5 py-1 text-xs font-semibold text-teal-700 dark:text-teal-300">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
                {scopeLabel}
              </span>
            </div>
            <p className="text-sm text-slate-500 mb-4 capitalize">{type.replace(/-/g, " ")} report {from && `from ${from}`} {to && `to ${to}`}{isOverseerRole && !viewBranchId ? " · combined across every branch" : ""}</p>

            {(type === "daily" || type === "monthly") && (
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200"><tr><Th>Period</Th><Th>Invoices</Th><Th>Tax</Th><Th>Total</Th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {(result as { date: string; count: number; tax: number; total: number }[]).map((r) => (
                    <tr key={r.date}><Td>{r.date}</Td><Td>{r.count}</Td><Td>{fmtCurrency(r.tax)}</Td><Td className="font-semibold">{fmtCurrency(r.total)}</Td></tr>
                  ))}
                  {result.length === 0 && (
                    <tr><td colSpan={4} className="text-center py-8 text-slate-400">No sales records found</td></tr>
                  )}
                </tbody>
              </table>
            )}

            {type === "purchases" && (
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200"><tr><Th>GRN</Th><Th>Date</Th><Th>Supplier</Th><Th>Items</Th><Th>Total</Th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {(result as { id: string; number: string; date: string; supplierName: string; items: unknown[]; total: number }[]).map((g) => (
                    <tr key={g.id}><Td>{g.number}</Td><Td>{fmtDate(g.date)}</Td><Td>{g.supplierName}</Td><Td>{g.items.length}</Td><Td className="font-semibold">{fmtCurrency(g.total)}</Td></tr>
                  ))}
                  {result.length === 0 && (
                    <tr><td colSpan={5} className="text-center py-8 text-slate-400">No purchase records found</td></tr>
                  )}
                </tbody>
              </table>
            )}

            {(type === "stock" || type === "expiry") && (
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200"><tr><Th>Name</Th><Th>Batch</Th><Th>Stock</Th><Th>Buy</Th><Th>Sell</Th><Th>Expiry</Th><Th>Status</Th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {(result as { id: string; name: string; batch: string; stock: number; purchasePrice: number; sellingPrice: number; expiry: string }[]).map((m) => {
                    const exp = isExpired(m.expiry);
                    const dte = daysToExpiry(m.expiry);
                    return (
                      <tr key={m.id}><Td>{m.name}</Td><Td>{m.batch}</Td><Td>{m.stock}</Td><Td>{fmtCurrency(m.purchasePrice)}</Td><Td>{fmtCurrency(m.sellingPrice)}</Td><Td>{m.expiry}</Td>
                        <Td>{exp ? <Badge tone="red">EXPIRED</Badge> : dte <= 90 ? <Badge tone="amber">{dte}d</Badge> : <Badge tone="green">OK</Badge>}</Td>
                      </tr>
                    );
                  })}
                  {result.length === 0 && (
                    <tr><td colSpan={7} className="text-center py-8 text-slate-400">No inventory records found</td></tr>
                  )}
                </tbody>
              </table>
            )}

            {type === "pl" && (() => {
              const r = result as { revenue: number; cost: number; profit: number };
              return (
                <div className="grid grid-cols-3 gap-4 mt-4">
                  <div className="bg-sky-50 p-4 rounded-lg"><div className="text-xs text-slate-500">Revenue</div><div className="text-2xl font-bold text-sky-700">{fmtCurrency(r.revenue)}</div></div>
                  <div className="bg-amber-50 p-4 rounded-lg"><div className="text-xs text-slate-500">Cost (COGS)</div><div className="text-2xl font-bold text-amber-700">{fmtCurrency(r.cost)}</div></div>
                  <div className="bg-emerald-50 p-4 rounded-lg"><div className="text-xs text-slate-500">Profit</div><div className="text-2xl font-bold text-emerald-700">{fmtCurrency(r.profit)}</div></div>
                </div>
              );
            })()}

            {type === "tax" && (() => {
              const r = result as { total: number; count: number };
              return (
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div className="bg-violet-50 p-4 rounded-lg"><div className="text-xs text-slate-500">Total GST Collected</div><div className="text-2xl font-bold text-violet-700">{fmtCurrency(r.total)}</div></div>
                  <div className="bg-sky-50 p-4 rounded-lg"><div className="text-xs text-slate-500">Invoices</div><div className="text-2xl font-bold text-sky-700">{r.count}</div></div>
                </div>
              );
            })()}

            {type === "user" && (() => {
              const rows = result as unknown as { user: string; actions: number; invoices: number; sales: number; tax: number }[];
              const totSales = rows.reduce((s, u) => s + u.sales, 0);
              const totInv = rows.reduce((s, u) => s + u.invoices, 0);
              const totAct = rows.reduce((s, u) => s + u.actions, 0);
              const top = rows[0];
              return (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="bg-emerald-50 dark:bg-emerald-900/20 p-4 rounded-lg">
                      <div className="text-xs text-slate-500 dark:text-slate-400">Total Sales (all users)</div>
                      <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">{fmtCurrency(totSales)}</div>
                    </div>
                    <div className="bg-sky-50 dark:bg-sky-900/20 p-4 rounded-lg">
                      <div className="text-xs text-slate-500 dark:text-slate-400">Invoices</div>
                      <div className="text-2xl font-bold text-sky-700 dark:text-sky-300 tabular-nums">{totInv}</div>
                    </div>
                    <div className="bg-violet-50 dark:bg-violet-900/20 p-4 rounded-lg">
                      <div className="text-xs text-slate-500 dark:text-slate-400">Top Seller{top && top.sales > 0 ? ` — ${top.user}` : ""}</div>
                      <div className="text-2xl font-bold text-violet-700 dark:text-violet-300 tabular-nums">{top ? fmtCurrency(top.sales) : fmtCurrency(0)}</div>
                    </div>
                  </div>
                  <table className="w-full">
                    <thead className="bg-slate-50 dark:bg-slate-700/40 border-b border-slate-200 dark:border-slate-600">
                      <tr><Th>User</Th><Th>Invoices</Th><Th>Sales Amount</Th><Th>Tax Collected</Th><Th>Total Actions</Th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                      {rows.map((u, i) => (
                        <tr key={u.user} className={i === 0 && u.sales > 0 ? "bg-emerald-50/50 dark:bg-emerald-900/10" : undefined}>
                          <Td className="font-medium">
                            <span className="inline-flex items-center gap-2">
                              <span className="w-7 h-7 rounded-full bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 flex items-center justify-center text-xs font-bold shrink-0">
                                {u.user.charAt(0).toUpperCase()}
                              </span>
                              {u.user}
                              {i === 0 && u.sales > 0 && <Badge tone="green">TOP</Badge>}
                            </span>
                          </Td>
                          <Td className="tabular-nums">{u.invoices}</Td>
                          <Td className="font-semibold text-emerald-700 dark:text-emerald-300 tabular-nums">{fmtCurrency(u.sales)}</Td>
                          <Td className="tabular-nums">{fmtCurrency(u.tax)}</Td>
                          <Td className="tabular-nums">{u.actions}</Td>
                        </tr>
                      ))}
                      {rows.length === 0 && (
                        <tr><Td colSpan={5}><div className="text-center text-slate-400 py-6">No activity in this range.</div></Td></tr>
                      )}
                    </tbody>
                    {rows.length > 0 && (
                      <tfoot className="border-t-2 border-slate-200 dark:border-slate-600">
                        <tr className="bg-slate-50 dark:bg-slate-700/40 font-bold">
                          <Td>Total</Td>
                          <Td className="tabular-nums">{totInv}</Td>
                          <Td className="text-emerald-700 dark:text-emerald-300 tabular-nums">{fmtCurrency(totSales)}</Td>
                          <Td className="tabular-nums">{fmtCurrency(rows.reduce((s, u) => s + u.tax, 0))}</Td>
                          <Td className="tabular-nums">{totAct}</Td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              );
            })()}

            {type === "userSales" && (() => {
              const rows = result as unknown as {
                userId: string;
                name: string;
                username: string;
                role: string;
                branchName?: string;
                invoices: number;
                sales: number;
                tax: number;
              }[];
              const totSales = rows.reduce((s, u) => s + u.sales, 0);
              const totInv = rows.reduce((s, u) => s + u.invoices, 0);
              const totTax = rows.reduce((s, u) => s + u.tax, 0);
              const topSeller = rows.find((r) => r.sales > 0);
              const roleBadgeTone = (role: string): "purple" | "blue" | "green" | "amber" => {
                if (role === "superadmin") return "purple";
                if (role === "developer") return "amber";
                if (role === "admin") return "blue";
                return "green";
              };
              const roleLabel = (role: string) => {
                if (role === "superadmin") return "Super Admin";
                if (role === "developer") return "Developer";
                if (role === "admin") return "Admin";
                return "Staff";
              };

              return (
                <div className="space-y-4">
                  {/* Summary Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="bg-emerald-50 dark:bg-emerald-900/20 p-4 rounded-xl border border-emerald-100 dark:border-emerald-800/40">
                      <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Total Sales (All Users)</div>
                      <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-300 tabular-nums mt-1">
                        {fmtCurrency(totSales)}
                      </div>
                      <div className="text-[11px] text-emerald-600/80 dark:text-emerald-400 mt-0.5">Across {rows.length} users (staff, admins & super admins)</div>
                    </div>
                    <div className="bg-sky-50 dark:bg-sky-900/20 p-4 rounded-xl border border-sky-100 dark:border-sky-800/40">
                      <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Total Bills Generated</div>
                      <div className="text-2xl font-bold text-sky-700 dark:text-sky-300 tabular-nums mt-1">
                        {totInv}
                      </div>
                      <div className="text-[11px] text-sky-600/80 dark:text-sky-400 mt-0.5">In selected period</div>
                    </div>
                    <div className="bg-violet-50 dark:bg-violet-900/20 p-4 rounded-xl border border-violet-100 dark:border-violet-800/40">
                      <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Top Performer</div>
                      <div className="text-xl font-bold text-violet-700 dark:text-violet-300 tabular-nums mt-1 truncate">
                        {topSeller ? topSeller.name : "No sales yet"}
                      </div>
                      <div className="text-[11px] text-violet-600/80 dark:text-violet-400 mt-0.5">
                        {topSeller && topSeller.sales > 0 ? `${fmtCurrency(topSeller.sales)} (${topSeller.invoices} bills)` : "—"}
                      </div>
                    </div>
                  </div>

                  {/* Users Sales Table */}
                  <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                    <table className="w-full">
                      <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700">
                        <tr>
                          <Th>User / Staff Member</Th>
                          <Th>Role</Th>
                          <Th className="text-right">Bills Generated</Th>
                          <Th className="text-right">Total Sales</Th>
                          <Th className="text-right">Avg Bill Value</Th>
                          <Th className="text-right">Tax Collected</Th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                        {rows.map((u, i) => {
                          const avg = u.invoices > 0 ? u.sales / u.invoices : 0;
                          return (
                            <tr key={u.userId} className={i === 0 && u.sales > 0 ? "bg-emerald-50/40 dark:bg-emerald-950/20" : undefined}>
                              <Td>
                                <div className="flex items-center gap-2.5">
                                  <span className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center text-xs font-bold shrink-0">
                                    {u.name.charAt(0).toUpperCase()}
                                  </span>
                                  <div>
                                    <div className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                                      {u.name}
                                      {i === 0 && u.sales > 0 && <Badge tone="green">TOP SELLER</Badge>}
                                    </div>
                                    <div className="text-xs text-slate-400">@{u.username}{u.branchName ? ` · ${u.branchName}` : ""}</div>
                                  </div>
                                </div>
                              </Td>
                              <Td>
                                <Badge tone={roleBadgeTone(u.role)}>{roleLabel(u.role)}</Badge>
                              </Td>
                              <Td className="text-right tabular-nums font-medium text-slate-800 dark:text-slate-200">{u.invoices}</Td>
                              <Td className="text-right tabular-nums font-bold text-emerald-700 dark:text-emerald-400">{fmtCurrency(u.sales)}</Td>
                              <Td className="text-right tabular-nums text-slate-600 dark:text-slate-300">{fmtCurrency(avg)}</Td>
                              <Td className="text-right tabular-nums text-slate-500 dark:text-slate-400">{fmtCurrency(u.tax)}</Td>
                            </tr>
                          );
                        })}
                        {rows.length === 0 && (
                          <tr><Td colSpan={6}><div className="text-center text-slate-400 py-6">No users found.</div></Td></tr>
                        )}
                      </tbody>
                      {rows.length > 0 && (
                        <tfoot className="border-t-2 border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/80 font-bold">
                          <tr>
                            <Td colSpan={2}>Grand Total ({rows.length} users)</Td>
                            <Td className="text-right tabular-nums">{totInv}</Td>
                            <Td className="text-right tabular-nums text-emerald-700 dark:text-emerald-400">{fmtCurrency(totSales)}</Td>
                            <Td className="text-right tabular-nums">{fmtCurrency(totInv > 0 ? totSales / totInv : 0)}</Td>
                            <Td className="text-right tabular-nums">{fmtCurrency(totTax)}</Td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>
              );
            })()}
          </CardBody>
        </Card>
      </div>
    </div>
  );
};

export default Reports;
