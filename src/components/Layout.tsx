import React, { useState } from "react";
import { useStore } from "../store/store";
import { useTheme } from "../store/theme";
import { cn } from "../utils/cn";
import { isOverseer, planAllowsMultiBranch } from "../store/types";
import { Network } from "lucide-react";
import logoUrl from "../assets/logo.png";

export type PageId =
  | "dashboard"
  | "billing"
  | "invoices"
  | "patients"
  | "doctors"
  | "inventory"
  | "purchases"
  | "grn"
  | "approvedGrn"
  | "salesReturn"
  | "returns"
  | "suppliers"
  | "reports"
  | "audit"
  | "users"
  | "settings"
  | "branches"
  | "privacy";

interface NavItem {
  id: PageId;
  label: string;
  icon: string;
  adminOnly?: boolean;
  developerOnly?: boolean;
  staffAllowed?: boolean;
}

const NAV: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: "📊", staffAllowed: true },
  { id: "billing", label: "New Billing", icon: "🧾", staffAllowed: true },
  { id: "invoices", label: "Invoices", icon: "📄", staffAllowed: true },
  { id: "patients", label: "Patients", icon: "👥", staffAllowed: true },
  { id: "doctors", label: "Doctors", icon: "🩺", staffAllowed: true },
  { id: "inventory", label: "Inventory", icon: "💊", staffAllowed: true },
  { id: "purchases", label: "GRN Entry", icon: "🛒", staffAllowed: true },
  { id: "grn", label: "GRN Approvals", icon: "✅", staffAllowed: false },
  { id: "approvedGrn", label: "Approved GRNs", icon: "📦", developerOnly: true },
  { id: "salesReturn", label: "Sales Return", icon: "🔄", staffAllowed: true },
  { id: "returns", label: "All Returns", icon: "↩️", staffAllowed: false },
  { id: "suppliers", label: "Suppliers", icon: "🏢", staffAllowed: false },
  { id: "reports", label: "Reports", icon: "📈", staffAllowed: false },
  { id: "audit", label: "Audit Log", icon: "🔍", developerOnly: true },
  { id: "users", label: "Users", icon: "🔐", adminOnly: true },
  { id: "branches", label: "Branches", icon: "🏪", developerOnly: true },
  { id: "settings", label: "Settings", icon: "⚙️", staffAllowed: true },
  { id: "privacy", label: "Privacy Policy", icon: "🛡️", staffAllowed: true },
];

const Layout: React.FC<{ page: PageId; setPage: (p: PageId) => void; children: React.ReactNode }> = ({ page, setPage, children }) => {
  const { currentUser, data, logout, cloudSyncing, cloudError, cloudReady, viewBranchId, setViewBranchId, flags, staffPlan, customStaffPlanLimits } = useStore();
  const multiBranch = planAllowsMultiBranch(staffPlan, customStaffPlanLimits);
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  // Desktop: sidebar is a slim rail that expands on hover
  const [hoverOpen, setHoverOpen] = useState(false);
  const rail = !hoverOpen;

  const items = NAV.filter((n) => {
    // developer toggle: hide the whole GRN module for everyone
    if (!flags.grnModule && (n.id === "purchases" || n.id === "grn" || n.id === "approvedGrn")) return false;
    // hide Audit Log when logging is disabled
    if (!flags.auditEnabled && n.id === "audit") return false;
    if (n.id === "branches" && !multiBranch) return false;
    if (isOverseer(currentUser?.role)) return true;
    if (currentUser?.role === "admin") {
      if (n.developerOnly) return false;
      return true;
    }
    if (n.adminOnly || n.developerOnly) return false;
    return n.staffAllowed !== false;
  });

  return (
    <div className="h-screen [height:100dvh] flex overflow-hidden bg-slate-50 dark:bg-slate-900 transition-colors">
      {/* Sidebar — hover-expanding rail on desktop, drawer on mobile */}
      <aside
        onMouseEnter={() => setHoverOpen(true)}
        onMouseLeave={() => setHoverOpen(false)}
        className={cn(
          "fixed lg:static inset-y-0 left-0 z-40 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 flex flex-col overflow-y-auto",
          "transition-all duration-300 ease-in-out",
          "w-64",
          rail && "lg:w-[4.6rem]",
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className={cn("px-4 lg:px-3 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center gap-3 transition-all", rail && "lg:justify-center lg:px-0")}>
          <div className="w-11 h-11 shrink-0 rounded-xl bg-white ring-1 ring-slate-200 dark:ring-slate-600 flex items-center justify-center overflow-hidden shadow-sm">
            <img src={logoUrl} alt="Guru logo" className="w-9 h-9 object-contain" />
          </div>
          <div className={cn("min-w-0 transition-all duration-200", rail && "lg:w-0 lg:opacity-0 lg:overflow-hidden")}>
            <div className="font-extrabold tracking-tight text-slate-800 dark:text-slate-100 leading-tight whitespace-nowrap">
              GU<span className="text-sky-600 dark:text-sky-400">RU</span>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">Pharmacy Suite</div>
          </div>
        </div>
        <nav className="overflow-x-hidden py-3 px-2">
          {items.map((n) => (
            <button
              key={n.id}
              title={n.label}
              onClick={() => {
                setPage(n.id);
                setOpen(false);
              }}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium mb-0.5 transition-colors",
                rail && "lg:justify-center lg:px-0",
                page === n.id
                  ? "bg-sky-50 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700"
              )}
            >
              <span className="text-lg shrink-0">{n.icon}</span>
              <span className={cn("whitespace-nowrap transition-all duration-200", rail && "lg:w-0 lg:opacity-0 lg:overflow-hidden")}>{n.label}</span>
            </button>
          ))}
        </nav>
        <div className={cn("border-t border-slate-200 dark:border-slate-700 p-3", rail && "lg:px-2")}>
          <div className={cn("flex items-center gap-3 px-2 py-2", rail && "lg:justify-center lg:px-0")}>
            <div className="w-9 h-9 shrink-0 rounded-full bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-300 flex items-center justify-center font-semibold">
              {currentUser?.name.charAt(0).toUpperCase()}
            </div>
            <div className={cn("flex-1 min-w-0 transition-all duration-200", rail && "lg:w-0 lg:opacity-0 lg:overflow-hidden")}>
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate whitespace-nowrap">{currentUser?.name}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 capitalize whitespace-nowrap">{currentUser?.role}</div>
            </div>
          </div>
          <button
            onClick={logout}
            title="Logout"
            className={cn(
              "mt-2 w-full px-3 py-2 rounded-lg text-sm font-medium text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/30 hover:bg-rose-100 dark:hover:bg-rose-900/50 transition-all",
              rail && "lg:px-0 lg:flex lg:justify-center"
            )}
          >
            <span className={cn(rail && "lg:hidden")}>🚪 Logout</span>
            <span className={cn("hidden", rail && "lg:inline")}>🚪</span>
          </button>
        </div>
        {/* pushes remaining space below the profile so it hugs the menu */}
        <div className="flex-1 min-h-3" />
      </aside>

      {/* Backdrop on mobile */}
      {open && <div className="fixed inset-0 z-30 bg-slate-900/30 dark:bg-black/50 lg:hidden" onClick={() => setOpen(false)} />}

      {/* Main — only this column scrolls; sidebar stays pinned */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 lg:px-6 py-3 z-20 transition-colors shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <button onClick={() => setOpen(true)} className="lg:hidden text-2xl text-slate-600 dark:text-slate-300">☰</button>
              <div className="min-w-0">
                <h2 className="font-semibold text-slate-800 dark:text-slate-100 capitalize">
                  {NAV.find((n) => n.id === page)?.label}
                </h2>
                {isOverseer(currentUser?.role) && (
                  <div className="flex flex-wrap items-center gap-2 mt-1 text-xs">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-900/30 px-2.5 py-1 text-violet-700 dark:text-violet-300 font-semibold">
                      <Network className="w-3.5 h-3.5" />
                      {currentUser?.role === "developer" ? "Developer" : "Super Admin"}
                    </span>
                    {multiBranch && (
                    <label className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-900/30 pl-2.5 pr-1 py-0.5 text-sky-700 dark:text-sky-300 font-medium">
                      <span className="whitespace-nowrap">{viewBranchId ? "Viewing" : "All Branches"}</span>
                      <select
                        value={viewBranchId || "all"}
                        onChange={(e) => setViewBranchId(e.target.value === "all" ? null : e.target.value)}
                        className="bg-transparent text-xs font-semibold text-sky-700 dark:text-sky-300 focus:outline-none cursor-pointer max-w-[140px]"
                        title="Switch branch context"
                      >
                        <option value="all">All Branches</option>
                        {data.branches.map((b) => (
                          <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
                        ))}
                      </select>
                    </label>
                    )}
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium border transition-colors ${cloudError ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-900/30 dark:text-rose-300" : cloudSyncing ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-300" : cloudReady ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300" : "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-700/30 dark:text-slate-300"}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${cloudError ? "bg-rose-500" : cloudSyncing ? "bg-amber-500 animate-pulse" : cloudReady ? "bg-emerald-500" : "bg-slate-400 animate-pulse"}`} />
                      {cloudError ? "Cloud error" : cloudSyncing ? "Syncing..." : cloudReady ? "Cloud connected" : "Connecting..."}
                    </span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={toggle}
                className="w-9 h-9 rounded-lg flex items-center justify-center text-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 transition"
                title={theme === "light" ? "Switch to Dark Mode" : "Switch to Light Mode"}
              >
                {theme === "light" ? "🌙" : "☀️"}
              </button>
              <div className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block text-right">
                {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              </div>
            </div>
          </div>
          {cloudError && (
            <div className="mt-3 rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
              Firebase sync error: {cloudError}
            </div>
          )}
        </header>
        <main className="flex-1 min-h-0 p-4 lg:p-6 overflow-y-auto overflow-x-hidden">
          <div className="mx-auto w-full max-w-[1500px]">{children}</div>
        </main>
      </div>
    </div>
  );
};

export default Layout;
