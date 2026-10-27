import React, { useState } from "react";
import { StoreProvider, useStore } from "./store/store";
import { ThemeProvider } from "./store/theme";
import { isOverseer, planAllowsMultiBranch } from "./store/types";
import Login from "./pages/Login";
import Layout, { type PageId } from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Billing from "./pages/Billing";
import Invoices from "./pages/Invoices";
import Patients from "./pages/Patients";
import Doctors from "./pages/Doctors";
import Inventory from "./pages/Inventory";
import Purchases from "./pages/Purchases";
import GRN from "./pages/GRN";
import { ApprovedGrn } from "./pages/ApprovedGrn";
import SalesReturn from "./pages/SalesReturn";
import Returns from "./pages/Returns";
import Suppliers from "./pages/Suppliers";
import Reports from "./pages/Reports";
import Audit from "./pages/Audit";
import Users from "./pages/Users";
import Settings from "./pages/Settings";
import Branches from "./pages/Branches";
import Privacy from "./pages/Privacy";

const Inner: React.FC = () => {
  const { currentUser, flags, staffPlan, customStaffPlanLimits } = useStore();
  const [page, setPage] = useState<PageId>("dashboard");
  const [invoiceFocus, setInvoiceFocus] = useState<string | null>(null);
  const [inventoryFilter, setInventoryFilter] = useState<string | null>(null);

  const openInvoice = (id: string) => {
    setInvoiceFocus(id);
    setPage("invoices");
  };

  const openInventory = (filter?: string) => {
    setInventoryFilter(filter || null);
    setPage("inventory");
  };

  if (!currentUser) return <Login />;

  // Pages allowed for staff
  const staffAllowed: PageId[] = ["dashboard", "billing", "invoices", "purchases", "salesReturn", "patients", "inventory"];
  if (currentUser.role === "staff" && !staffAllowed.includes(page)) {
    setPage("dashboard");
    return null;
  }
  // Audit and branches are overseer-only (super admin / developer)
  if ((page === "audit" || page === "branches") && !isOverseer(currentUser.role)) {
    setPage("dashboard");
    return null;
  }
  // Branches tab / multi-branch tools are Full roster (option 4) or Option 5 with super admin
  if (page === "branches" && !planAllowsMultiBranch(staffPlan, customStaffPlanLimits)) {
    setPage("dashboard");
    return null;
  }
  // Users is admin/overseer only; Settings is open to staff too (branch payment settings)
  if (page === "users" && currentUser.role !== "admin" && !isOverseer(currentUser.role)) {
    setPage("dashboard");
    return null;
  }
  // GRN module disabled by developer toggle
  if (!flags.grnModule && (page === "purchases" || page === "grn" || page === "approvedGrn")) {
    setPage("dashboard");
    return null;
  }
  // Audit hidden when logging is disabled
  if (!flags.auditEnabled && page === "audit") {
    setPage("dashboard");
    return null;
  }

  let content: React.ReactNode;
  switch (page) {
    case "dashboard": content = <Dashboard setPage={setPage} onOpenInvoice={openInvoice} onOpenInventory={openInventory} />; break;
    case "billing": content = <Billing />; break;
    case "invoices": content = <Invoices focusId={invoiceFocus} onConsumeFocus={() => setInvoiceFocus(null)} />; break;
    case "patients": content = <Patients />; break;
    case "doctors": content = <Doctors />; break;
    case "inventory": content = <Inventory initialFilter={inventoryFilter as any} onConsumeFilter={() => setInventoryFilter(null)} />; break;
    case "purchases": content = <Purchases />; break;
    case "grn": content = <GRN />; break;
    case "approvedGrn": content = <ApprovedGrn />; break;
    case "salesReturn": content = <SalesReturn />; break;
    case "returns": content = <Returns />; break;
    case "suppliers": content = <Suppliers />; break;
    case "reports": content = <Reports />; break;
    case "audit": content = <Audit />; break;
    case "users": content = <Users />; break;
    case "branches": content = <Branches />; break;
    case "settings": content = <Settings />; break;
    case "privacy": content = <Privacy />; break;
    default: content = <Dashboard setPage={setPage} />;
  }

  return <Layout page={page} setPage={setPage}>{content}</Layout>;
};

const App: React.FC = () => (
  <ThemeProvider>
    <StoreProvider>
      <Inner />
    </StoreProvider>
  </ThemeProvider>
);

export default App;
