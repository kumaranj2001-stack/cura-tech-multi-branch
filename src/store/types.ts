export type Role = "admin" | "staff";
export type UserRole = "superadmin" | "developer" | "admin" | "staff";

/* Roles with full multi-branch oversight (super admin + legacy developer) */
export const isOverseer = (role?: string) => role === "superadmin" || role === "developer";
/* Roles with admin-level operational privileges */
export const isAdminLike = (role?: string) => role === "admin" || isOverseer(role);

export interface Branch {
  id: string;
  name: string;
  code: string; // short code like "BR001"
  storeName?: string;   // pharmacy display name on invoices
  address?: string;     // registered address
  gstNumber?: string;   // GSTIN
  phone?: string;
  active: boolean;
  createdAt: string;
}

export interface User {
  id: string;
  username: string;
  password: string;
  name: string;
  role: UserRole;
  branchId?: string; // for admin/staff - which branch they belong to
  active: boolean;
  createdAt: string;
}

export interface Medicine {
  id: string;
  branchId?: string;
  name: string;
  batch: string;
  purchasePrice: number;
  sellingPrice: number;
  stock: number;
  supplier: string;
  expiry: string;
  mfgDate?: string;
  gst: number;
  narcotic?: boolean;
  minStock?: number; // manual low-stock threshold (default 10)
}

/* Per-medicine low-stock threshold — editable so small-pack drugs don't false-alarm */
export const minStockOf = (m: { minStock?: number }): number => m.minStock ?? 10;

export interface Patient {
  id: string;
  branchId?: string;
  name: string;
  phone: string;
  address?: string;
  prescriptionUrl?: string;
  prescriptionName?: string;
  doctorName?: string;
  prescriptionDate?: string;
  prescriptionNumber?: string;
  doctorRegNo?: string;
  createdAt: string;
}

export interface Doctor {
  id: string;
  branchId?: string;
  name: string;
  hospital: string;
  hospitalAddress?: string;
  phone: string;
  regNo?: string;
  createdAt: string;
}

export interface InvoiceItem {
  medicineId: string;
  name: string;
  batch: string;
  expiry?: string;
  qty: number;
  price: number;
  gst: number;
  narcotic?: boolean;
}

export type PaymentMethod = "cash" | "card" | "upi";

export interface Invoice {
  id: string;
  branchId?: string;
  number: string;
  patientId?: string;
  patientName: string;
  patientPhone?: string;
  doctorId?: string;
  doctorName?: string;
  hospital?: string;
  doctorPhone?: string;
  items: InvoiceItem[];
  subtotal: number;
  discount: number;
  discountType: "fixed" | "percent";
  discountValue: number;
  taxAmount: number;
  total: number;
  date: string;
  createdBy: string;
  paymentMethod?: PaymentMethod;
  posRef?: string; // POS terminal reference when processed via swipe machine
  hasNarcotic?: boolean;
  prescriptionNumber?: string;
  prescriptionDate?: string;
  doctorRegNo?: string;
  prescriptionUrl?: string;
  prescriptionName?: string;
}

export interface PaymentSettings {
  digitalEnabled?: boolean; // toggle to manage "Digital Payments mode" for each branch independently
  upiQr?: string;   // data URL of the merchant UPI QR
  upiId?: string;   // e.g. name@bank
  upiName?: string; // payee display name
}

export interface StoreProfile {
  name?: string;      // pharmacy display name
  address?: string;   // registered address
  contact?: string;   // phone / contact
  gstNumber?: string; // GSTIN
}

export interface Supplier {
  id: string;
  branchId?: string;
  name: string;
  contact: string;
  address?: string;
  email?: string;
  gstNumber?: string; // supplier GSTIN
  diNumber?: string; // Drug Inspector / Drug License number
  fixedDiscount?: number; // agency-wise overall discount fixation %
}

export interface PurchaseItem {
  medicineId?: string;
  name: string;
  batch: string;
  qty: number;
  strips: number;
  tabsPerStrip: number;
  freeStrips: number;
  purchasePrice: number;
  sellingPrice: number;
  expiry: string;
  igst: number;
  cgst: number;
  sgst: number;
  /* extended GRN-entry matrix (optional, backward compatible) */
  discountPct?: number;
  discountAmt?: number;
  gross?: number;
  grossTaxable?: number;
  taxPct?: number;
  taxValue?: number;
  extraCharges?: number;
  lineDeductions?: number;
  lineAdditions?: number;
  purchaseTotal?: number;
  resaleQty?: number;
  costPrice?: number;
  marginPct?: number;
  mrpUnit?: number;
  mrpStrip?: number;
  mfgDate?: string;
  shelfLifeDays?: number;
  resaleGross?: number;
  salesTax?: number;
  resaleTotal?: number;
  value?: number;
  unit?: string;
}

export interface GrnAdjustment {
  id: string;
  desc: string;
  amount: number;
}

export interface GRN {
  id: string;
  branchId?: string;
  number: string;
  supplierId: string;
  supplierName: string;
  invoiceNumber: string;
  date: string;
  items: PurchaseItem[];
  subtotal: number;
  agencyDiscountPct: number;
  agencyDiscountAmt: number;
  specialDiscount: number;
  taxAmount: number;
  total: number;
  status: "pending" | "approved" | "rejected";
  createdBy: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectedReason?: string;
  canModify?: boolean; // discount fixation can be modified on this GRN
  attachedInvoiceName?: string;
  aiExtracted?: boolean;
  modelUsed?: string;
  extractedAt?: string;
}

export interface ReturnEntry {
  id: string;
  branchId?: string;
  type: "sales" | "purchase" | "short-expiry";
  refNumber?: string;
  medicineId: string;
  medicineName: string;
  batch: string;
  qty: number;
  reason: string;
  date: string;
  createdBy: string;
}

export interface AuditLog {
  id: string;
  branchId?: string;
  user: string;
  action: string;
  details?: string;
  timestamp: string;
}

export interface AppData {
  branches: Branch[];
  users: User[];
  medicines: Medicine[];
  patients: Patient[];
  doctors: Doctor[];
  invoices: Invoice[];
  suppliers: Supplier[];
  grns: GRN[];
  returns: ReturnEntry[];
  audit: AuditLog[];
  counters: { invoice: number; grn: number };
}

/* ── Developer-controlled feature flags (synced via the meta doc) ─────── */
export interface FeatureFlags {
  pdfInvoices: boolean;
  pdfInventory: boolean;
  prescriptionUpload: boolean;
  filterLowStock: boolean;
  filterNearExpiry?: boolean;
  filterExp30: boolean;
  filterExp60: boolean;
  filterExp90: boolean;
  filterExpired: boolean;
  filterNarcotic?: boolean;
  pdfFilterLowStock: boolean;
  pdfFilterExp30: boolean;
  pdfFilterExp60: boolean;
  pdfFilterExp90: boolean;
  pdfFilterExpired: boolean;
  pdfFilterNarcotic?: boolean;
  grnAutoFill: boolean;
  btnSavePdf: boolean;
  btnWhatsApp: boolean;
  grnModule: boolean;
  auditEnabled: boolean;
  auditRetention30: boolean;
  auditRetention60: boolean;
  auditRetentionLifetime: boolean;
  paymentsMaster: boolean;
  payDigital: boolean;
  payPos: boolean;
  dashLowStock: boolean;
  dashOutStock: boolean;
  dashExpired: boolean;
  dashExp30: boolean;
  dashExp60: boolean;
  dashExp90: boolean;
  dashChart7d: boolean;
  dashChart6m: boolean;
  repDaily: boolean;
  repDailyPdf: boolean;
  repMonthly: boolean;
  repMonthlyPdf: boolean;
  repPurchases: boolean;
  repPurchasesPdf: boolean;
  repStock: boolean;
  repStockPdf: boolean;
  repExpiry: boolean;
  repExpiryPdf: boolean;
  repPL: boolean;
  repPLPdf: boolean;
  repTax: boolean;
  repTaxPdf: boolean;
  repUser: boolean;
  repUserPdf: boolean;
  repUserSales: boolean;
  repUserSalesPdf: boolean;
  narcoticPrescriptionRequired: boolean;
  minStockFeature: boolean;
}

/* ── Developer-controlled staff / account plans (mutually exclusive) ──── */
export type StaffPlanTier = 1 | 2 | 3 | 4 | 5;

export interface StaffPlanLimits {
  superadmin: number;
  admin: number;
  staff: number;
}

export const DEFAULT_CUSTOM_STAFF_LIMITS: StaffPlanLimits = {
  superadmin: 1,
  admin: 2,
  staff: 5,
};

export const STAFF_PLAN_OPTIONS: {
  tier: StaffPlanTier;
  label: string;
  hint: string;
  limits: StaffPlanLimits;
}[] = [
  { tier: 1, label: "Option 1 — One admin, two staff", hint: "Permits 1 admin (to manage staff) and 2 staff members. No super admin. Single branch only.", limits: { superadmin: 0, admin: 1, staff: 2 } },
  { tier: 2, label: "Option 2 — Two admins, three staff", hint: "Permits 2 admins and 3 staff members. Single branch only.", limits: { superadmin: 0, admin: 2, staff: 3 } },
  { tier: 3, label: "Option 3 — Two admins, four staff", hint: "Permits 2 admins and 4 staff members. Single branch only.", limits: { superadmin: 0, admin: 2, staff: 4 } },
  { tier: 4, label: "Option 4 — Full roster", hint: "Permits 1 super admin, 4 admins, and unlimited staff. Multi-branch switching and new branches are enabled.", limits: { superadmin: 1, admin: 4, staff: Number.POSITIVE_INFINITY } },
  { tier: 5, label: "Option 5 — Fully Customizable", hint: "Customizable quotas per role (Super Admin, Admin, Staff). Defined and managed by Super Admins.", limits: DEFAULT_CUSTOM_STAFF_LIMITS },
];

export const planAllowsMultiBranch = (tier: StaffPlanTier, customLimits?: StaffPlanLimits) =>
  tier === 4 || (tier === 5 && ((customLimits ?? DEFAULT_CUSTOM_STAFF_LIMITS).superadmin > 0));

export const DEFAULT_STAFF_PLAN: StaffPlanTier = 1;

export const staffPlanLimits = (tier: StaffPlanTier, customLimits?: StaffPlanLimits): StaffPlanLimits => {
  if (tier === 5) {
    const base = customLimits ?? DEFAULT_CUSTOM_STAFF_LIMITS;
    return {
      superadmin: typeof base.superadmin === "number" ? Math.max(0, base.superadmin) : 0,
      admin: typeof base.admin === "number" ? Math.max(0, base.admin) : 0,
      staff: typeof base.staff === "number" ? Math.max(0, base.staff) : 0,
    };
  }
  return STAFF_PLAN_OPTIONS.find((o) => o.tier === tier)?.limits ?? STAFF_PLAN_OPTIONS[0].limits;
};

export const isStaffPlanTier = (value: unknown): value is StaffPlanTier =>
  value === 1 || value === 2 || value === 3 || value === 4 || value === 5;

export const formatPlanCap = (n: number) => (Number.isFinite(n) ? String(n) : "unlimited");

export const roleQuota = (limits: StaffPlanLimits, role: UserRole): number => {
  if (role === "staff") return limits.staff;
  if (role === "admin") return limits.admin;
  if (role === "superadmin") return limits.superadmin;
  return Number.POSITIVE_INFINITY;
};

export const canCreateAccount = (
  users: { id: string; role: UserRole }[],
  role: UserRole,
  tier: StaffPlanTier,
  exceptId?: string,
  customLimits?: StaffPlanLimits
): { ok: boolean; message?: string } => {
  if (role === "developer") return { ok: true };
  const limits = staffPlanLimits(tier, customLimits);
  const max = roleQuota(limits, role);
  const used = users.filter((u) => u.role === role && u.id !== exceptId).length;
  const label = role === "staff" ? "staff" : role === "admin" ? "admin" : "super admin";
  if (max <= 0) {
    return { ok: false, message: `The selected plan does not permit ${label} accounts.` };
  }
  if (used >= max) {
    return {
      ok: false,
      message: `This plan allows ${formatPlanCap(max)} ${label} account${max === 1 ? "" : "s"}. The limit has been reached.`,
    };
  }
  return { ok: true };
};

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  pdfInvoices: true,
  pdfInventory: true,
  prescriptionUpload: true,
  filterLowStock: true,
  filterNearExpiry: true,
  filterExp30: true,
  filterExp60: true,
  filterExp90: true,
  filterExpired: true,
  filterNarcotic: true,
  pdfFilterLowStock: true,
  pdfFilterExp30: true,
  pdfFilterExp60: true,
  pdfFilterExp90: true,
  pdfFilterExpired: true,
  pdfFilterNarcotic: true,
  grnAutoFill: true,
  btnSavePdf: true,
  btnWhatsApp: true,
  grnModule: true,
  auditEnabled: true,
  auditRetention30: true,
  auditRetention60: false,
  auditRetentionLifetime: false,
  paymentsMaster: true,
  payDigital: true,
  payPos: false,
  dashLowStock: true,
  dashOutStock: true,
  dashExpired: true,
  dashExp30: true,
  dashExp60: true,
  dashExp90: true,
  dashChart7d: true,
  dashChart6m: true,
  repDaily: true,
  repDailyPdf: true,
  repMonthly: true,
  repMonthlyPdf: true,
  repPurchases: true,
  repPurchasesPdf: true,
  repStock: true,
  repStockPdf: true,
  repExpiry: true,
  repExpiryPdf: true,
  repPL: true,
  repPLPdf: true,
  repTax: true,
  repTaxPdf: true,
  repUser: true,
  repUserPdf: true,
  repUserSales: true,
  repUserSalesPdf: true,
  narcoticPrescriptionRequired: true,
  minStockFeature: true,
};

export const getAuditRetentionDays = (flags: FeatureFlags): number | null => {
  if (flags.auditRetentionLifetime) return null;
  if (flags.auditRetention60) return 60;
  return 30; // default 30 days
};

export const getAuditRetentionMs = (flags: FeatureFlags): number | null => {
  const days = getAuditRetentionDays(flags);
  return days === null ? null : days * 24 * 60 * 60 * 1000;
};
