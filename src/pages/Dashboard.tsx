import React, { useEffect, useMemo, useState } from "react";
import { useStore } from "../store/store";
import { ArrowUpRight, ReceiptText, PackagePlus, Pill, UserPlus, AlertTriangle, Clock } from "lucide-react";
import { Card, CardBody, Badge, Modal, Button } from "../components/ui";
import { fmtCurrency, fmtDate, today, isExpired, daysToExpiry } from "../utils/helpers";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";
import type { PageId } from "../components/Layout";
import { minStockOf } from "../store/types";

/* Animated number for living KPI cards */
function useCountUp(target: number, ms = 700) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(target * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return val;
}

type DetailKey = "today" | "totalSales" | "month" | "stockValue" | "pending" | "low" | "out" | "expired" | "exp30" | "exp60" | "exp90";

const StatCard: React.FC<{
  label: string;
  amount: number;
  format?: "currency" | "count";
  icon: string;
  chip: string;
  ring: string;
  sub?: string;
  alert?: boolean;
  onClick: () => void;
}> = ({ label, amount, format = "count", icon, chip, ring, sub, alert, onClick }) => {
  const v = useCountUp(amount);
  const display = format === "currency" ? fmtCurrency(v) : String(Math.round(v));
  return (
    <button onClick={onClick} className="group text-left w-full focus:outline-none">
      <Card className={`relative overflow-hidden transition-all duration-200 hover:-translate-y-1 hover:shadow-lg group-focus:ring-2 ${ring} group-hover:border-transparent`}>
        {alert && amount > 0 && <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-rose-500 animate-pulse" />}
        <CardBody className="p-4">
          <div className="flex items-start gap-3">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0 transition-transform duration-200 group-hover:scale-110 ${chip}`}>{icon}</div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wide">{label}</div>
              <div className="text-lg lg:text-xl font-extrabold text-slate-800 dark:text-slate-100 truncate tabular-nums">{display}</div>
              <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 truncate">
                {sub || "Tap for details"}
              </div>
            </div>
          </div>
          <div className="mt-2 text-[11px] font-medium text-sky-600 dark:text-sky-400 opacity-0 group-hover:opacity-100 transition-opacity">
            View details →
          </div>
        </CardBody>
      </Card>
    </button>
  );
};

const Dashboard: React.FC<{
  setPage: (p: PageId) => void;
  onOpenInvoice?: (id: string) => void;
  onOpenInventory?: (filter?: string) => void;
}> = ({ setPage, onOpenInvoice, onOpenInventory }) => {
  const { data, flags } = useStore();
  const [detail, setDetail] = useState<DetailKey | null>(null);

  const stats = useMemo(() => {
    const t = today();
    const todays = data.invoices.filter((i) => i.date.startsWith(t));
    const todaySales = todays.reduce((s, i) => s + i.total, 0);
    const totalSales = data.invoices.reduce((s, i) => s + i.total, 0);
    const monthPrefix = t.slice(0, 7);
    const monthInvoices = data.invoices.filter((i) => i.date.startsWith(monthPrefix));
    const monthSales = monthInvoices.reduce((s, i) => s + i.total, 0);

    const lowStock = data.medicines.filter((m) => m.stock > 0 && m.stock <= minStockOf(m));
    const outStock = data.medicines.filter((m) => m.stock === 0);
    const expired = data.medicines.filter((m) => isExpired(m.expiry));
    const exp30 = data.medicines.filter((m) => {
      const d = daysToExpiry(m.expiry);
      return d > 0 && d <= 30;
    });
    const exp90 = data.medicines.filter((m) => {
      const d = daysToExpiry(m.expiry);
      return d > 60 && d <= 90;
    });
    const exp60 = data.medicines.filter((m) => {
      const d = daysToExpiry(m.expiry);
      return d > 30 && d <= 60;
    });

    const totalStockValue = data.medicines.reduce((s, m) => s + m.stock * m.purchasePrice, 0);

    const days7: { date: string; total: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const ds = d.toISOString().slice(0, 10);
      const sum = data.invoices.filter((inv) => inv.date.startsWith(ds)).reduce((s, inv) => s + inv.total, 0);
      days7.push({ date: ds, total: sum });
    }

    const months6: { month: string; total: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const ms = d.toISOString().slice(0, 7);
      const sum = data.invoices.filter((inv) => inv.date.startsWith(ms)).reduce((s, inv) => s + inv.total, 0);
      months6.push({ month: ms, total: sum });
    }

    return { todays, todaySales, totalSales, monthSales, monthInvoices, lowStock, outStock, expired, exp30, exp60, exp90, totalStockValue, days7, months6 };
  }, [data]);

  const pendingGRNs = useMemo(() => data.grns.filter((g) => g.status === "pending"), [data.grns]);

  const chartDays = useMemo(
    () =>
      stats.days7.map((d) => ({
        label: new Date(d.date).toLocaleDateString("en-IN", { weekday: "short" }),
        total: d.total,
      })),
    [stats.days7]
  );
  const chartMonths = useMemo(
    () =>
      stats.months6.map((d) => ({
        label: new Date(d.month + "-01").toLocaleDateString("en-IN", { month: "short" }),
        total: d.total,
      })),
    [stats.months6]
  );

  const medicineRow = (m: (typeof data.medicines)[number], extra?: React.ReactNode) => (
    <div key={m.id} className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-700/40 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
      <div className="min-w-0">
        <div className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{m.name}</div>
        <div className="text-xs text-slate-500 dark:text-slate-400">Batch {m.batch} · {m.stock} in stock</div>
      </div>
      <div className="flex items-center gap-2 shrink-0">{extra}</div>
    </div>
  );

  const invoiceRow = (inv: (typeof data.invoices)[number]) => (
    <button
      key={inv.id}
      type="button"
      onClick={() => onOpenInvoice?.(inv.id)}
      className="group w-full flex items-center justify-between gap-3 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-700/40 hover:bg-sky-50 dark:hover:bg-sky-900/20 hover:ring-1 hover:ring-sky-200 dark:hover:ring-sky-800 transition-all text-left"
      title="Open this bill in Invoices"
    >
      <div className="min-w-0">
        <div className="text-sm font-semibold text-sky-700 dark:text-sky-300">{inv.number}</div>
        <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{inv.patientName} · {fmtDate(inv.date)}</div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-sm font-bold text-slate-800 dark:text-slate-100 tabular-nums">{fmtCurrency(inv.total)}</span>
        <ArrowUpRight className="w-4 h-4 text-sky-500 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
      </div>
    </button>
  );

  const detailContent = () => {
    switch (detail) {
      case "today":
        return (
          <div className="space-y-2">
            {stats.todays.length === 0 ? <p className="text-sm text-slate-400 text-center py-6">No sales yet today.</p> : stats.todays.map(invoiceRow)}
            <div className="flex justify-between pt-2 border-t border-slate-200 dark:border-slate-600 text-sm font-bold"><span>Total today</span><span className="text-emerald-600">{fmtCurrency(stats.todaySales)}</span></div>
          </div>
        );
      case "totalSales":
        return (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/30 p-3 text-center"><div className="text-xs text-emerald-700 dark:text-emerald-300 font-semibold">All-time revenue</div><div className="text-lg font-extrabold text-emerald-700 dark:text-emerald-300">{fmtCurrency(stats.totalSales)}</div></div>
              <div className="rounded-lg bg-sky-50 dark:bg-sky-900/30 p-3 text-center"><div className="text-xs text-sky-700 dark:text-sky-300 font-semibold">Total invoices</div><div className="text-lg font-extrabold text-sky-700 dark:text-sky-300">{data.invoices.length}</div></div>
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-500 mb-2">RECENT INVOICES</div>
              <div className="space-y-2">{data.invoices.slice(0, 10).map(invoiceRow)}</div>
            </div>
          </div>
        );
      case "month":
        return (
          <div className="space-y-2">
            {stats.monthInvoices.length === 0 ? <p className="text-sm text-slate-400 text-center py-6">No sales this month yet.</p> : stats.monthInvoices.slice(0, 20).map(invoiceRow)}
            <div className="flex justify-between pt-2 border-t border-slate-200 dark:border-slate-600 text-sm font-bold"><span>This month</span><span className="text-sky-600">{fmtCurrency(stats.monthSales)}</span></div>
          </div>
        );
      case "stockValue": {
        const top = [...data.medicines].sort((a, b) => b.stock * b.purchasePrice - a.stock * a.purchasePrice).slice(0, 12);
        return (
          <div className="space-y-2">
            {top.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-700/40">
                <div className="min-w-0"><div className="text-sm font-medium truncate">{m.name}</div><div className="text-xs text-slate-500">{m.stock} × {fmtCurrency(m.purchasePrice)}</div></div>
                <div className="text-sm font-bold text-violet-600 shrink-0">{fmtCurrency(m.stock * m.purchasePrice)}</div>
              </div>
            ))}
            <div className="flex justify-between pt-2 border-t border-slate-200 dark:border-slate-600 text-sm font-bold"><span>Total stock value</span><span className="text-violet-600">{fmtCurrency(stats.totalStockValue)}</span></div>
          </div>
        );
      }
      case "pending":
        return (
          <div className="space-y-3">
            {pendingGRNs.length === 0 ? <p className="text-sm text-slate-400 text-center py-6">No pending GRNs. All caught up!</p> : (
              <div className="space-y-2">{pendingGRNs.map((g) => (
                <div key={g.id} className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20">
                  <div className="min-w-0"><div className="text-sm font-semibold text-slate-800 dark:text-slate-200">{g.number}</div><div className="text-xs text-slate-500">{g.supplierName} · {fmtDate(g.date)}</div></div>
                  <div className="text-sm font-bold shrink-0">{fmtCurrency(g.total)}</div>
                </div>
              ))}</div>
            )}
            <Button variant="secondary" className="w-full" onClick={() => { setDetail(null); setPage("grn"); }}>Open GRN Approvals →</Button>
          </div>
        );
      case "low":
        return <div className="space-y-2">{stats.lowStock.length === 0 ? <p className="text-sm text-slate-400 text-center py-6">No low stock items.</p> : stats.lowStock.map((m) => medicineRow(m, <Badge tone="amber">{m.stock} / min {minStockOf(m)}</Badge>))}</div>;
      case "out":
        return (
          <div className="space-y-3">
            <div className="space-y-2">{stats.outStock.length === 0 ? <p className="text-sm text-slate-400 text-center py-6">Nothing is out of stock.</p> : stats.outStock.map((m) => medicineRow(m, <Badge tone="red">OUT</Badge>))}</div>
            {stats.outStock.length > 0 && (
              <Button variant="secondary" className="w-full" onClick={() => { setDetail(null); onOpenInventory ? onOpenInventory("out") : setPage("inventory"); }}>View in Inventory (Out of Stock) →</Button>
            )}
          </div>
        );
      case "expired":
        return <div className="space-y-2">{stats.expired.length === 0 ? <p className="text-sm text-slate-400 text-center py-6">No expired medicines.</p> : stats.expired.map((m) => medicineRow(m, <Badge tone="red">EXPIRED {fmtDate(m.expiry)}</Badge>))}</div>;
      case "exp30":
        return <div className="space-y-2">{stats.exp30.length === 0 ? <p className="text-sm text-slate-400 text-center py-6">Nothing expiring within 30 days.</p> : stats.exp30.map((m) => medicineRow(m, <Badge tone="red">{daysToExpiry(m.expiry)}d left</Badge>))}</div>;
      case "exp60":
        return <div className="space-y-2">{stats.exp60.length === 0 ? <p className="text-sm text-slate-400 text-center py-6">Nothing expiring in 31–60 days.</p> : stats.exp60.map((m) => medicineRow(m, <Badge tone="amber">{daysToExpiry(m.expiry)}d left</Badge>))}</div>;
      case "exp90":
        return <div className="space-y-2">{stats.exp90.length === 0 ? <p className="text-sm text-slate-400 text-center py-6">Nothing expiring in 61–90 days.</p> : stats.exp90.map((m) => medicineRow(m, <Badge tone="blue">{daysToExpiry(m.expiry)}d left</Badge>))}</div>;
      default:
        return null;
    }
  };

  const detailTitle: Record<DetailKey, string> = {
    today: "💰 Today's Sales",
    totalSales: "🧾 Total Sales (All Time)",
    month: "📈 This Month's Sales",
    stockValue: "💊 Stock Value Breakdown",
    pending: "✅ Pending GRNs",
    low: "⚠️ Low Stock (≤ 10)",
    out: "🚫 Out of Stock",
    expired: "⛔ Expired Medicines",
    exp30: "⏰ Expiring Within 30 Days",
    exp60: "🗓️ Expiring in 31–60 Days",
    exp90: "📆 Expiring in 61–90 Days",
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        Live overview — tap any card for details
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard label="Today's Sales" amount={stats.todaySales} format="currency" icon="💰" chip="bg-emerald-50 text-emerald-600" ring="group-hover:ring-emerald-300" sub={`${stats.todays.length} invoices`} onClick={() => setDetail("today")} />
        <StatCard label="Total Sales" amount={stats.totalSales} format="currency" icon="🧾" chip="bg-sky-50 text-sky-600" ring="group-hover:ring-sky-300" sub={`${data.invoices.length} invoices`} onClick={() => setDetail("totalSales")} />
        <StatCard label="This Month" amount={stats.monthSales} format="currency" icon="📈" chip="bg-teal-50 text-teal-600" ring="group-hover:ring-teal-300" sub={`${stats.monthInvoices.length} invoices`} onClick={() => setDetail("month")} />
        <StatCard label="Stock Value" amount={stats.totalStockValue} format="currency" icon="💊" chip="bg-violet-50 text-violet-600" ring="group-hover:ring-violet-300" sub={`${data.medicines.length} medicines`} onClick={() => setDetail("stockValue")} />
        {flags.grnModule && (
          <StatCard label="Pending GRNs" amount={pendingGRNs.length} icon="✅" chip="bg-amber-50 text-amber-600" ring="group-hover:ring-amber-300" sub="awaiting approval" alert onClick={() => setDetail("pending")} />
        )}
        {flags.dashLowStock && (
          <StatCard label="Low Stock" amount={stats.lowStock.length} icon="⚠️" chip="bg-amber-50 text-amber-600" ring="group-hover:ring-amber-300" sub="below set minimum" alert onClick={() => setDetail("low")} />
        )}
        {flags.dashOutStock && (
          <StatCard
            label="Out of Stock"
            amount={stats.outStock.length}
            icon="🚫"
            chip="bg-rose-50 text-rose-600"
            ring="group-hover:ring-rose-300"
            sub="needs reorder"
            alert
            onClick={() => (onOpenInventory ? onOpenInventory("out") : setPage("inventory"))}
          />
        )}
        {flags.dashExpired && (
          <StatCard
            label="Expired"
            amount={stats.expired.length}
            icon="⛔"
            chip="bg-rose-50 text-rose-600"
            ring="group-hover:ring-rose-300"
            sub="remove from shelves"
            alert
            onClick={() => (onOpenInventory ? onOpenInventory("expired") : setPage("inventory"))}
          />
        )}
        {flags.dashExp30 && (
          <StatCard
            label="Expiry ≤ 30 days"
            amount={stats.exp30.length}
            icon="⏰"
            chip="bg-orange-50 text-orange-600"
            ring="group-hover:ring-orange-300"
            sub="urgent attention"
            alert
            onClick={() => (onOpenInventory ? onOpenInventory("exp30") : setPage("inventory"))}
          />
        )}
        {flags.dashExp60 && (
          <StatCard
            label="Expiry 31–60 days"
            amount={stats.exp60.length}
            icon="🗓️"
            chip="bg-amber-50 text-amber-600"
            ring="group-hover:ring-amber-300"
            sub="plan returns"
            alert
            onClick={() => (onOpenInventory ? onOpenInventory("exp60") : setPage("inventory"))}
          />
        )}
        {flags.dashExp90 && (
          <StatCard
            label="Expiry 61–90 days"
            amount={stats.exp90.length}
            icon="📆"
            chip="bg-sky-50 text-sky-600"
            ring="group-hover:ring-sky-300"
            sub="early warning"
            alert
            onClick={() => (onOpenInventory ? onOpenInventory("exp90") : setPage("inventory"))}
          />
        )}
      </div>

      {/* Quick actions */}
      <Card>
        <CardBody>
          <div className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">Quick Actions</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { id: "billing", label: "New Bill", Icon: ReceiptText, c: "from-sky-500 to-sky-600" },
              ...(flags.grnModule ? [{ id: "purchases", label: "GRN Entry", Icon: PackagePlus, c: "from-emerald-500 to-emerald-600" }] : []),
              { id: "inventory", label: "Inventory", Icon: Pill, c: "from-violet-500 to-violet-600" },
              { id: "patients", label: "Add Patient", Icon: UserPlus, c: "from-amber-500 to-amber-600" },
            ].map((a) => (
                <button
                  key={a.id}
                  onClick={() => setPage(a.id as PageId)}
                  className={`relative overflow-hidden bg-gradient-to-br ${a.c} text-white rounded-xl p-4 min-h-[96px] flex flex-col items-center justify-center text-center gap-2 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all shadow group`}
                >
                  <span className="absolute inset-x-0 top-0 h-px bg-white/30" />
                  <a.Icon className="w-6 h-6 transition-transform duration-200 group-hover:scale-110 group-hover:-rotate-3" strokeWidth={2.2} />
                  <span className="text-sm font-semibold tracking-wide">{a.label}</span>
                </button>
              ))}
          </div>
        </CardBody>
      </Card>

      {/* Charts — live, animated with Recharts */}
      {(flags.dashChart7d || flags.dashChart6m) && (
      <div className={`grid grid-cols-1 ${flags.dashChart7d && flags.dashChart6m ? "lg:grid-cols-2" : ""} gap-4`}>
        {flags.dashChart7d && <Card>
          <CardBody>
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">Sales — Last 7 Days</div>
                <div className="text-xs text-slate-400 dark:text-slate-500">
                  Week total {fmtCurrency(stats.days7.reduce((s, d) => s + d.total, 0))}
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-full px-2.5 py-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live
              </span>
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartDays} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="skyBar" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#38bdf8" />
                      <stop offset="100%" stopColor="#0284c7" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-slate-200 dark:text-slate-700" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${v}`} />
                  <Tooltip
                    cursor={{ fill: "rgba(56,189,248,0.08)" }}
                    formatter={(value) => [fmtCurrency(Number(value)), "Sales"]}
                    contentStyle={{ borderRadius: 12, border: "1px solid rgba(148,163,184,.3)", fontSize: 12 }}
                  />
                  <Bar dataKey="total" fill="url(#skyBar)" radius={[6, 6, 0, 0]} maxBarSize={44}>
                    {chartDays.map((_, i) => (
                      <Cell key={i} opacity={i === chartDays.length - 1 ? 1 : 0.75} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardBody>
        </Card>}
        {flags.dashChart6m && <Card>
          <CardBody>
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">Sales — Last 6 Months</div>
                <div className="text-xs text-slate-400 dark:text-slate-500">
                  Period total {fmtCurrency(stats.months6.reduce((s, d) => s + d.total, 0))}
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-full px-2.5 py-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live
              </span>
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartMonths} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="emeraldBar" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#34d399" />
                      <stop offset="100%" stopColor="#059669" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-slate-200 dark:text-slate-700" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${v}`} />
                  <Tooltip
                    cursor={{ fill: "rgba(52,211,153,0.08)" }}
                    formatter={(value) => [fmtCurrency(Number(value)), "Sales"]}
                    contentStyle={{ borderRadius: 12, border: "1px solid rgba(148,163,184,.3)", fontSize: 12 }}
                  />
                  <Bar dataKey="total" fill="url(#emeraldBar)" radius={[6, 6, 0, 0]} maxBarSize={44} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardBody>
        </Card>}
      </div>
      )}

      {/* Alerts strip */}
      {/* ── Inventory Alerts — two columns: Low Stock | Expiry ── */}
      {(flags.dashLowStock || flags.dashExpired || flags.dashExp30 || flags.dashExp60 || flags.dashExp90 || flags.dashOutStock) && (
      <div className={`grid grid-cols-1 ${flags.dashLowStock && (flags.dashExpired || flags.dashExp30 || flags.dashExp60 || flags.dashExp90) ? "lg:grid-cols-2" : "lg:grid-cols-1"} gap-4`}>
        {/* Low Stock column */}
        {flags.dashLowStock && <Card className="overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-amber-400 to-amber-500" />
          <CardBody>
            <button onClick={() => setPage("inventory")} className="w-full flex items-center justify-between mb-3 group">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                Low Stock
              </div>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-full px-2.5 py-0.5 group-hover:scale-105 transition-transform">
                {stats.lowStock.length} item{stats.lowStock.length === 1 ? "" : "s"}
              </span>
            </button>
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {stats.lowStock.length === 0 && (
                <div className="text-center text-sm text-slate-400 dark:text-slate-500 py-8">All items are well stocked ✓</div>
              )}
              {stats.lowStock.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setPage("inventory")}
                  className="w-full flex items-center justify-between gap-3 p-2.5 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/40 hover:-translate-y-0.5 hover:shadow-sm rounded-lg text-sm text-left transition-all"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-slate-800 dark:text-slate-200 truncate">{m.name}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">Batch {m.batch}</div>
                    <div className="mt-1.5 h-1.5 rounded-full bg-amber-200/70 dark:bg-amber-800/50 overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-rose-500 transition-all duration-500" style={{ width: `${Math.min(100, m.stock * 10)}%` }} />
                    </div>
                  </div>
                  <Badge tone="amber">{m.stock} / min {minStockOf(m)}</Badge>
                </button>
              ))}
            </div>
          </CardBody>
        </Card>}

        {/* Expiry column */}
        {(flags.dashExpired || flags.dashExp30 || flags.dashExp60 || flags.dashExp90) && <Card className="overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-rose-400 to-orange-400" />
          <CardBody>
            <button onClick={() => setPage("inventory")} className="w-full flex items-center justify-between mb-3 group">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                <Clock className="w-4 h-4 text-rose-500" />
                Expiry Watch
              </div>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800 rounded-full px-2.5 py-0.5 group-hover:scale-105 transition-transform">
                {stats.expired.length + stats.exp30.length + stats.exp60.length + stats.exp90.length} item{stats.expired.length + stats.exp30.length + stats.exp60.length + stats.exp90.length === 1 ? "" : "s"}
              </span>
            </button>
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {stats.expired.length === 0 && stats.exp30.length === 0 && stats.exp60.length === 0 && stats.exp90.length === 0 && (
                <div className="text-center text-sm text-slate-400 dark:text-slate-500 py-8">No expiry concerns ✓</div>
              )}
              {flags.dashExpired && stats.expired.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setPage("inventory")}
                  className="w-full flex items-center justify-between gap-3 p-2.5 bg-rose-50 dark:bg-rose-900/20 hover:bg-rose-100 dark:hover:bg-rose-900/40 hover:-translate-y-0.5 hover:shadow-sm rounded-lg text-sm text-left transition-all"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-slate-800 dark:text-slate-200 truncate">{m.name}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">Batch {m.batch} · expired {fmtDate(m.expiry)}</div>
                  </div>
                  <Badge tone="red">EXPIRED</Badge>
                </button>
              ))}
              {flags.dashExp30 && stats.exp30.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setPage("inventory")}
                  className="w-full flex items-center justify-between gap-3 p-2.5 bg-orange-50 dark:bg-orange-900/20 hover:bg-orange-100 dark:hover:bg-orange-900/40 hover:-translate-y-0.5 hover:shadow-sm rounded-lg text-sm text-left transition-all"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-slate-800 dark:text-slate-200 truncate">{m.name}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">Batch {m.batch}</div>
                  </div>
                  <Badge tone="red">{daysToExpiry(m.expiry)}d left</Badge>
                </button>
              ))}
              {flags.dashExp60 && stats.exp60.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setPage("inventory")}
                  className="w-full flex items-center justify-between gap-3 p-2.5 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/40 hover:-translate-y-0.5 hover:shadow-sm rounded-lg text-sm text-left transition-all"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-slate-800 dark:text-slate-200 truncate">{m.name}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">Batch {m.batch}</div>
                  </div>
                  <Badge tone="amber">{daysToExpiry(m.expiry)}d left</Badge>
                </button>
              ))}
              {flags.dashExp90 && stats.exp90.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setPage("inventory")}
                  className="w-full flex items-center justify-between gap-3 p-2.5 bg-sky-50 dark:bg-sky-900/20 hover:bg-sky-100 dark:hover:bg-sky-900/40 hover:-translate-y-0.5 hover:shadow-sm rounded-lg text-sm text-left transition-all"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-slate-800 dark:text-slate-200 truncate">{m.name}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">Batch {m.batch}</div>
                  </div>
                  <Badge tone="blue">{daysToExpiry(m.expiry)}d left</Badge>
                </button>
              ))}
            </div>
          </CardBody>
        </Card>}
      </div>
      )}

      {/* Detail drill-down modal */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? detailTitle[detail] : ""} size="md">
        <div className="max-h-[60vh] overflow-y-auto pr-1">{detailContent()}</div>
      </Modal>
    </div>
  );
};

export default Dashboard;
