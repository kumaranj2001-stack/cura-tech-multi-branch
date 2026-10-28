import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase";
import { flashToast } from "../utils/helpers";
import type { AppData, AuditLog, Branch, Doctor, FeatureFlags, GRN, Invoice, Medicine, Patient, PaymentSettings, ReturnEntry, StaffPlanLimits, StaffPlanTier, Supplier, User } from "./types";
import { DEFAULT_CUSTOM_STAFF_LIMITS, DEFAULT_FEATURE_FLAGS, DEFAULT_STAFF_PLAN, isStaffPlanTier, planAllowsMultiBranch, getAuditRetentionMs } from "./types";

const DATA_KEY = "guru_pharma_data_v4";
const SESSION_KEY = "guru_pharma_session_v4";
const BRANCH_SESSION_KEY = "guru_pharma_session_branch_v4";

const COLLECTIONS = {
  branches: "gp_branches",
  users: "gp_users",
  medicines: "gp_medicines",
  patients: "gp_patients",
  doctors: "gp_doctors",
  invoices: "gp_invoices",
  suppliers: "gp_suppliers",
  grns: "gp_grns",
  returns: "gp_returns",
  audit: "gp_audit",
  meta: "gp_meta",
} as const;

/* Starter branch seeded on first run — a regular branch, not a primary.
   Every user and record is explicitly assigned; nothing defaults here. */
const starterBranch: Branch = {
  id: "br_main",
  name: "Main Branch",
  code: "BR001",
  address: "",
  phone: "",
  active: true,
  createdAt: new Date().toISOString(),
};

const defaultUsers: User[] = [
  {
    id: "u_developer",
    username: "guru",
    password: "kumaran",
    name: "Developer",
    role: "developer",
    active: true,
    createdAt: new Date().toISOString(),
  },
];

const defaultDoctors: Doctor[] = [
  {
    id: "doc_1",
    name: "Dr. Arvind Sharma",
    hospital: "Apollo Multispecialty Hospital",
    hospitalAddress: "Plot 14, Health City, Main Road",
    phone: "9876543210",
    regNo: "MCI-48291",
    branchId: "br_main",
    createdAt: new Date().toISOString(),
  },
  {
    id: "doc_2",
    name: "Dr. Priya Nair",
    hospital: "Fortis City Clinic",
    hospitalAddress: "Sector 5, Medical Enclave",
    phone: "9811223344",
    regNo: "MCI-73910",
    branchId: "br_main",
    createdAt: new Date().toISOString(),
  },
];

/* Clean start: one branch, the four role accounts, zero business data */
const seedData = (): AppData => ({
  branches: [starterBranch],
  users: defaultUsers,
  medicines: [],
  patients: [],
  doctors: defaultDoctors,
  invoices: [],
  suppliers: [],
  grns: [],
  returns: [],
  audit: [],
  counters: { invoice: 1000, grn: 500 },
});

type EntityKey = "branches" | "users" | "medicines" | "patients" | "doctors" | "invoices" | "suppliers" | "grns" | "returns" | "audit";

const ENTITY_KEYS: EntityKey[] = ["branches", "users", "medicines", "patients", "doctors", "invoices", "suppliers", "grns", "returns", "audit"];

type FirestoreSlices = Record<EntityKey, unknown[]>;

function getLocalData(): AppData | null {
  try {
    const raw = localStorage.getItem(DATA_KEY);
    if (raw) return JSON.parse(raw) as AppData;
  } catch {}
  return null;
}

function saveLocalData(data: AppData) {
  localStorage.setItem(DATA_KEY, JSON.stringify(data));
}

function ensureDefaults(data: AppData): AppData {
  // Only Developer accounts are preserved; filter out admin, superadmin, and staff
  const devUsers = (data.users || [])
    .filter((u) => u.role === "developer" || u.username === "guru")
    .map((u) => (u.role === "developer" ? u : { ...u, role: "developer" as const, name: "Developer" }));

  defaultUsers.forEach((user) => {
    if (!devUsers.find((u) => u.username === user.username)) devUsers.push(user);
  });

  const next: AppData = {
    ...seedData(),
    ...data,
    branches: [...(data.branches || [])],
    users: devUsers,
    medicines: [...(data.medicines || [])],
    patients: [...(data.patients || [])],
    doctors: [...(data.doctors || defaultDoctors)].map((d) => (d.branchId ? d : { ...d, branchId: starterBranch.id })),
    invoices: [...(data.invoices || [])],
    suppliers: [...(data.suppliers || [])],
    grns: [...(data.grns || [])],
    returns: [...(data.returns || [])],
    audit: [...(data.audit || [])],
    counters: data.counters || { invoice: 1000, grn: 500 },
  };

  if (!next.branches.find((b) => b.id === starterBranch.id)) next.branches.unshift(starterBranch);
  return next;
}

function initialData(): AppData {
  return ensureDefaults(getLocalData() || seedData());
}

/* ── Branch isolation engine ─────────────────────────────────────────────
   Every operational record carries a branchId. Non-developer users only
   ever SEE records from their own branch, and every record they write is
   stamped with their branch on commit — so Branch 1 and Branch 2 data
   stay fully separate in Firestore and on every device.                    */

const SCOPED_KEYS = ["medicines", "patients", "doctors", "invoices", "suppliers", "grns", "returns", "audit"] as const;
type ScopedKey = (typeof SCOPED_KEYS)[number];

function scopeBranchOf(user: User | null, viewBranchId: string | null): string | null {
  if (!user) return null;
  if (user.role === "superadmin" || user.role === "developer") return viewBranchId; // overseer: all or focused branch
  return user.branchId || null; // no implicit primary branch — explicit assignment only
}

function inScope(record: { branchId?: string } | undefined, branchId: string | null): boolean {
  if (!branchId) return true;
  const rBranch = record?.branchId as string | undefined;
  if (!rBranch) return branchId === "br_main";
  return rBranch === branchId;
}

function scopeData(full: AppData, branchId: string | null): AppData {
  if (!branchId) return full;
  const next = { ...full } as AppData;
  for (const key of SCOPED_KEYS) {
    (next as unknown as Record<ScopedKey, unknown[]>)[key] = (full[key] as Array<{ branchId?: string }>).filter((r) => inScope(r, branchId));
  }
  return next;
}

function mergeScoped(full: AppData, scopedNext: AppData, branchId: string | null): AppData {
  if (!branchId) return scopedNext;
  const next = { ...full } as AppData;
  for (const key of SCOPED_KEYS) {
    const incoming = (scopedNext[key] as Array<{ id: string; branchId?: string }>).map((r) =>
      r && r.branchId === undefined ? { ...r, branchId } : r
    );
    (next as unknown as Record<ScopedKey, unknown[]>)[key] = [
      ...(full[key] as Array<{ branchId?: string }>).filter((r) => !inScope(r, branchId)),
      ...incoming,
    ];
  }
  next.users = scopedNext.users;
  next.branches = scopedNext.branches;
  next.counters = scopedNext.counters;
  return next;
}

export interface BranchBackupFile {
  kind: "guru-branch";
  version: 1;
  branchId: string;
  exportedAt: string;
  data: AppData;
  payment?: PaymentSettings;
  profile?: import("./types").StoreProfile;
}

function stampBranch<T extends { branchId?: string }>(rows: T[] | undefined, branchId: string): T[] {
  return (rows || []).map((r) => ({ ...r, branchId }));
}

function sliceForBranch(full: AppData, branchId: string): AppData {
  const scoped = scopeData(full, branchId);
  return {
    ...scoped,
    branches: full.branches.filter((b) => b.id === branchId),
    users: full.users.filter((u) => u.branchId === branchId),
  };
}

function incomingForBranch(incoming: AppData, branchId: string): AppData {
  const hasTagged = SCOPED_KEYS.some((key) =>
    (incoming[key] as Array<{ branchId?: string }> | undefined)?.some((r) => r?.branchId === branchId)
  );
  if (hasTagged) return sliceForBranch(incoming, branchId);
  const users = (incoming.users || []).filter(
    (u) => u.role !== "developer" && u.role !== "superadmin" && (!u.branchId || u.branchId === branchId)
  );
  const branches = (incoming.branches || []).filter((b) => b.id === branchId);
  return {
    ...incoming,
    branches: branches.length ? branches : (incoming.branches || []).slice(0, 1),
    users,
  };
}

function mergeBranchRestore(full: AppData, incoming: AppData, branchId: string): AppData {
  const slice = incomingForBranch(incoming, branchId);
  const keepOthers = <T extends { branchId?: string }>(rows: T[]) => rows.filter((r) => r.branchId !== branchId);
  const incomingBranch = (slice.branches || []).find((b) => b.id === branchId) || (slice.branches || [])[0];
  const incomingUsers = (slice.users || [])
    .filter((u) => u.role !== "developer" && u.role !== "superadmin")
    .map((u) => ({ ...u, branchId }));

  return {
    ...full,
    branches: incomingBranch
      ? full.branches.map((b) => (b.id === branchId ? { ...incomingBranch, id: branchId } : b))
      : full.branches,
    users: [
      ...full.users.filter((u) => u.role === "developer" || u.role === "superadmin" || u.branchId !== branchId),
      ...incomingUsers,
    ],
    medicines: [...keepOthers(full.medicines), ...stampBranch(slice.medicines, branchId)],
    patients: [...keepOthers(full.patients), ...stampBranch(slice.patients, branchId)],
    doctors: [...keepOthers(full.doctors || []), ...stampBranch(slice.doctors || [], branchId)],
    invoices: [...keepOthers(full.invoices), ...stampBranch(slice.invoices, branchId)],
    suppliers: [...keepOthers(full.suppliers), ...stampBranch(slice.suppliers, branchId)],
    grns: [...keepOthers(full.grns), ...stampBranch(slice.grns, branchId)],
    returns: [...keepOthers(full.returns), ...stampBranch(slice.returns, branchId)],
    audit: [...keepOthers(full.audit), ...stampBranch(slice.audit, branchId)],
    counters: full.counters,
  };
}

export function parseBranchBackup(raw: unknown): { data: AppData; branchId?: string; payment?: PaymentSettings; profile?: import("./types").StoreProfile } {
  if (!raw || typeof raw !== "object") throw new Error("Invalid file");
  const obj = raw as Record<string, unknown>;
  if ((obj.kind === "guru-branch" || obj.kind === "curavite-branch") && obj.data && typeof obj.data === "object") {
    const data = obj.data as AppData;
    if (!Array.isArray(data.medicines)) throw new Error("Invalid file");
    return {
      data,
      branchId: typeof obj.branchId === "string" ? obj.branchId : undefined,
      payment: obj.payment as PaymentSettings | undefined,
      profile: obj.profile as import("./types").StoreProfile | undefined,
    };
  }
  const data = raw as AppData;
  if (!Array.isArray(data.medicines) && !Array.isArray(data.invoices)) throw new Error("Invalid file");
  return { data };
}

function removeUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => removeUndefined(item)) as T;
  if (value && typeof value === "object") {
    const next: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([key, val]) => {
      if (val !== undefined) next[key] = removeUndefined(val);
    });
    return next as T;
  }
  return value;
}

function stableStringify(value: unknown) {
  return JSON.stringify(removeUndefined(value));
}

function friendlyCloudError(err: unknown): string {
  const code = (err as { code?: string })?.code || "";
  if (code === "permission-denied") {
    return "Firestore rules are blocking access. Open Firebase Console → Firestore Database → Rules, paste the rules shown in Settings → Cloud Backend, then publish.";
  }
  if (code === "failed-precondition" || code === "not-found") {
    return "Firestore database is not created yet. Open Firebase Console → Firestore Database and click Create database.";
  }
  if (code === "unavailable") {
    return "No internet connection. Changes are saved locally and will sync when you are back online.";
  }
  return err instanceof Error ? err.message : "Cloud connection failed.";
}

function sortByDateDesc<T extends { date?: string; createdAt?: string; timestamp?: string }>(items: T[]) {
  return [...items].sort((a, b) => {
    const av = a.timestamp || a.date || a.createdAt || "";
    const bv = b.timestamp || b.date || b.createdAt || "";
    return bv.localeCompare(av);
  });
}

function normalizeCloudData(slices: Partial<FirestoreSlices>, counters: AppData["counters"] | null): AppData {
  return ensureDefaults({
    branches: sortByDateDesc((slices.branches || []) as Branch[]),
    users: sortByDateDesc((slices.users || []) as User[]),
    medicines: [...((slices.medicines || []) as Medicine[])].sort((a, b) => a.name.localeCompare(b.name)),
    patients: sortByDateDesc((slices.patients || []) as Patient[]),
    doctors: sortByDateDesc((slices.doctors || []) as Doctor[]),
    invoices: sortByDateDesc((slices.invoices || []) as Invoice[]),
    suppliers: [...((slices.suppliers || []) as Supplier[])].sort((a, b) => a.name.localeCompare(b.name)),
    grns: sortByDateDesc((slices.grns || []) as GRN[]),
    returns: sortByDateDesc((slices.returns || []) as ReturnEntry[]),
    audit: sortByDateDesc((slices.audit || []) as AuditLog[]),
    counters: counters || { invoice: 1000, grn: 500 },
  });
}

async function syncCollection<K extends EntityKey>(collectionName: string, prevItems: AppData[K], nextItems: AppData[K]) {
  if (!db) return;
  const prevMap = new Map((prevItems as Array<{ id: string }>).map((item) => [item.id, item]));
  const nextMap = new Map((nextItems as Array<{ id: string }>).map((item) => [item.id, item]));
  const operations: Array<{ type: "set" | "delete"; id: string; data?: unknown }> = [];

  for (const [id, item] of nextMap.entries()) {
    const prev = prevMap.get(id);
    if (!prev || stableStringify(prev) !== stableStringify(item)) {
      operations.push({ type: "set", id, data: removeUndefined(item) });
    }
  }

  for (const [id] of prevMap.entries()) {
    if (!nextMap.has(id)) {
      operations.push({ type: "delete", id });
    }
  }

  for (let i = 0; i < operations.length; i += 400) {
    const batch = writeBatch(db);
    const chunk = operations.slice(i, i + 400);
    chunk.forEach((op) => {
      const ref = doc(db, collectionName, op.id);
      if (op.type === "set") batch.set(ref, op.data as Record<string, unknown>);
      else batch.delete(ref);
    });
    await batch.commit();
  }
}

async function syncCloudData(prev: AppData, next: AppData) {
  if (!db) return;
  const ensured = ensureDefaults(next);
  const previous = ensureDefaults(prev);

  await Promise.all([
    syncCollection(COLLECTIONS.branches, previous.branches, ensured.branches),
    syncCollection(COLLECTIONS.users, previous.users, ensured.users),
    syncCollection(COLLECTIONS.medicines, previous.medicines, ensured.medicines),
    syncCollection(COLLECTIONS.patients, previous.patients, ensured.patients),
    syncCollection(COLLECTIONS.doctors, previous.doctors, ensured.doctors),
    syncCollection(COLLECTIONS.invoices, previous.invoices, ensured.invoices),
    syncCollection(COLLECTIONS.suppliers, previous.suppliers, ensured.suppliers),
    syncCollection(COLLECTIONS.grns, previous.grns, ensured.grns),
    syncCollection(COLLECTIONS.returns, previous.returns, ensured.returns),
    syncCollection(COLLECTIONS.audit, previous.audit, ensured.audit),
  ]);

  await setDoc(doc(db, COLLECTIONS.meta, "app"), {
    counters: ensured.counters,
    initialized: true,
    updatedAt: new Date().toISOString(),
  }, { merge: true });
}

async function seedCloudIfEmpty(seed: AppData) {
  if (!db) return;
  const metaRef = doc(db, COLLECTIONS.meta, "app");
  const metaSnap = await getDoc(metaRef);
  if (metaSnap.exists()) return;

  const batch = writeBatch(db);
  const data = ensureDefaults(seed);
  ENTITY_KEYS.forEach((key) => {
    (data[key] as Array<{ id: string }>).forEach((item) => {
      batch.set(doc(db, COLLECTIONS[key], item.id), removeUndefined(item));
    });
  });
  batch.set(metaRef, {
    counters: data.counters,
    initialized: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  await batch.commit();
}

interface StoreCtx {
  data: AppData;
  setData: (updater: (d: AppData) => AppData) => void;
  currentUser: User | null;
  currentBranch: Branch | null;
  viewBranchId: string | null;
  setViewBranchId: (id: string | null) => void;
  flags: FeatureFlags;
  setFlag: (key: keyof FeatureFlags, value: boolean) => void;
  setFlagsBatch: (patch: Partial<FeatureFlags>) => void;
  staffPlan: StaffPlanTier;
  setStaffPlan: (tier: StaffPlanTier, customLimits?: StaffPlanLimits) => void;
  customStaffPlanLimits: StaffPlanLimits;
  setCustomStaffPlanLimits: (limits: StaffPlanLimits) => void;
  payment: PaymentSettings;
  setPayment: (patch: Partial<PaymentSettings>) => void;
  branchPayments: Record<string, PaymentSettings>;
  setBranchPayment: (branchId: string, patch: Partial<PaymentSettings>) => void;
  branchProfiles: Record<string, import("./types").StoreProfile>;
  setBranchProfile: (branchId: string, patch: Partial<import("./types").StoreProfile>) => void;
  login: (username: string, password: string) => { ok: boolean; message?: string };
  logout: () => void;
  log: (action: string, details?: string) => void;
  flashToast: typeof flashToast;
  cloudReady: boolean;
  cloudSyncing: boolean;
  cloudError: string;
  buildBranchBackup: (branchId: string) => BranchBackupFile;
  restoreBranchBackup: (branchId: string, incoming: AppData, extras?: { payment?: PaymentSettings; profile?: import("./types").StoreProfile }) => void;
}

const Ctx = createContext<StoreCtx | null>(null);

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [fullData, setDataRaw] = useState<AppData>(() => initialData());
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as User;
      if (parsed.role !== "developer") {
        sessionStorage.removeItem(SESSION_KEY);
        sessionStorage.removeItem(BRANCH_SESSION_KEY);
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  });
  const actingRoleRef = useRef(currentUser?.role);
  actingRoleRef.current = currentUser?.role;
  const [currentBranch, setCurrentBranch] = useState<Branch | null>(() => {
    try {
      const raw = sessionStorage.getItem(BRANCH_SESSION_KEY);
      return raw ? (JSON.parse(raw) as Branch) : null;
    } catch {
      return null;
    }
  });
  const [cloudReady, setCloudReady] = useState(false);
  const [cloudSyncing, setCloudSyncing] = useState(false);
  const [cloudError, setCloudError] = useState("");
  // Super Admin branch switcher: null = all branches, otherwise focused branch id
  const [viewBranchId, setViewBranchId] = useState<string | null>(null);
  // Developer-controlled feature flags — synced through the meta doc
  const [flags, setFlags] = useState<FeatureFlags>(DEFAULT_FEATURE_FLAGS);
  const [staffPlan, setStaffPlanState] = useState<StaffPlanTier>(() => {
    try {
      const saved = Number(localStorage.getItem("gp_staff_plan"));
      if (isStaffPlanTier(saved)) return saved;
    } catch {}
    return DEFAULT_STAFF_PLAN;
  });
  const [customStaffPlanLimits, setCustomStaffPlanLimitsState] = useState<StaffPlanLimits>(() => {
    try {
      const saved = localStorage.getItem("gp_custom_staff_limits");
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_CUSTOM_STAFF_LIMITS;
  });
  const customStaffPlanLimitsRef = useRef(customStaffPlanLimits);
  customStaffPlanLimitsRef.current = customStaffPlanLimits;

  const setFlagsBatch = useCallback((patch: Partial<FeatureFlags>) => {
    setFlags((prev) => {
      const next = { ...prev, ...patch };
      if (db) {
        setDoc(doc(db, COLLECTIONS.meta, "app"), { featureFlags: next }, { merge: true }).catch(() => {});
      }
      const retentionMs = getAuditRetentionMs(next);
      if (retentionMs !== null) {
        const cutoff = Date.now() - retentionMs;
        setDataRaw((d) => {
          const filtered = d.audit.filter((e) => new Date(e.timestamp).getTime() >= cutoff);
          if (filtered.length !== d.audit.length) {
            const nextData = { ...d, audit: filtered };
            saveLocalData(nextData);
            return nextData;
          }
          return d;
        });
      }
      return next;
    });
  }, []);

  const setFlag = useCallback((key: keyof FeatureFlags, value: boolean) => {
    setFlags((prev) => {
      const next = { ...prev, [key]: value };
      if (db) {
        setDoc(doc(db, COLLECTIONS.meta, "app"), { featureFlags: next }, { merge: true }).catch(() => {});
      }
      if (key === "auditRetention30" || key === "auditRetention60" || key === "auditRetentionLifetime") {
        const retentionMs = getAuditRetentionMs(next);
        if (retentionMs !== null) {
          const cutoff = Date.now() - retentionMs;
          setDataRaw((d) => {
            const filtered = d.audit.filter((e) => new Date(e.timestamp).getTime() >= cutoff);
            if (filtered.length !== d.audit.length) {
              const nextData = { ...d, audit: filtered };
              saveLocalData(nextData);
              return nextData;
            }
            return d;
          });
        }
      }
      return next;
    });
  }, []);

  const setStaffPlan = useCallback((tier: StaffPlanTier, customLimits?: StaffPlanLimits) => {
    const role = actingRoleRef.current;
    if (role !== "developer" && role !== "superadmin") return;
    if (!isStaffPlanTier(tier)) return;
    setStaffPlanState(tier);
    try {
      localStorage.setItem("gp_staff_plan", String(tier));
    } catch {}
    const activeCustom = customLimits || customStaffPlanLimitsRef.current;
    if (customLimits) {
      setCustomStaffPlanLimitsState(customLimits);
      try {
        localStorage.setItem("gp_custom_staff_limits", JSON.stringify(customLimits));
      } catch {}
    }
    if (!planAllowsMultiBranch(tier, activeCustom)) setViewBranchId(null);
    if (db) {
      const payload: Record<string, unknown> = { staffPlan: tier };
      if (customLimits) {
        payload.customStaffPlanLimits = customLimits;
      }
      setDoc(doc(db, COLLECTIONS.meta, "app"), payload, { merge: true }).catch(() => {});
    }
  }, []);

  const setCustomStaffPlanLimits = useCallback((limits: StaffPlanLimits) => {
    const role = actingRoleRef.current;
    if (role !== "developer" && role !== "superadmin") return;
    setCustomStaffPlanLimitsState(limits);
    try {
      localStorage.setItem("gp_custom_staff_limits", JSON.stringify(limits));
    } catch {}
    if (db) {
      setDoc(doc(db, COLLECTIONS.meta, "app"), { customStaffPlanLimits: limits }, { merge: true }).catch(() => {});
    }
  }, []);

  // Payment settings (UPI QR etc.) — synced through the meta doc
  const [payment, setPaymentState] = useState<PaymentSettings>({});

  // Branch-level payment settings: { [branchId]: PaymentSettings }
  const [branchPayments, setBranchPayments] = useState<Record<string, PaymentSettings>>({});
  const migratedRef = useRef(false);

  // Branch-level store profiles (pharmacy name, address, contact, GSTIN)
  const [branchProfiles, setBranchProfiles] = useState<Record<string, import("./types").StoreProfile>>({});

  const setBranchProfile = useCallback((branchId: string, patch: Partial<import("./types").StoreProfile>) => {
    setBranchProfiles((prev) => {
      const current = prev[branchId] || {};
      const next = { ...current };
      const wire: Record<string, unknown> = {};
      (Object.keys(patch) as (keyof import("./types").StoreProfile)[]).forEach((k) => {
        const v = patch[k];
        if (v === undefined) {
          delete next[k];
          wire[k] = deleteField();
        } else {
          next[k] = v;
          wire[k] = v;
        }
      });
      if (db) {
        setDoc(doc(db, COLLECTIONS.meta, "app"), { branchProfiles: { [branchId]: wire } }, { merge: true }).catch(() => {});
      }
      return { ...prev, [branchId]: next };
    });
  }, []);

  const setBranchPayment = useCallback((branchId: string, patch: Partial<PaymentSettings>) => {
    setBranchPayments((prev) => {
      const current = prev[branchId] || {};
      const next: PaymentSettings = { ...current };
      const wire: Record<string, unknown> = {};
      (Object.keys(patch) as (keyof PaymentSettings)[]).forEach((k) => {
        const v = patch[k];
        if (v === undefined) {
          delete next[k];
          wire[k] = deleteField();
        } else {
          (next as any)[k] = v;
          wire[k] = v;
        }
      });
      if (db) {
        setDoc(doc(db, COLLECTIONS.meta, "app"), { branchPayments: { [branchId]: wire } }, { merge: true }).catch(() => {});
      }
      return { ...prev, [branchId]: next };
    });
  }, []);

  const setPayment = useCallback((patch: Partial<PaymentSettings>) => {
    setPaymentState((prev) => {
      // Build local next-state AND a Firestore wire payload that uses
      // deleteField() for removed keys, so the field is truly deleted in
      // the cloud (a plain merge that omits a key would leave it behind).
      const next: PaymentSettings = { ...prev };
      const wire: Record<string, unknown> = {};
      (Object.keys(patch) as (keyof PaymentSettings)[]).forEach((k) => {
        const v = patch[k];
        if (v === undefined) {
          delete next[k];
          wire[k] = deleteField();
        } else {
          (next as any)[k] = v;
          wire[k] = v;
        }
      });
      if (db) {
        setDoc(doc(db, COLLECTIONS.meta, "app"), { payment: wire }, { merge: true }).catch(() => {});
      }
      return next;
    });
  }, []);

  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;
  const currentBranchRef = useRef(currentBranch);
  currentBranchRef.current = currentBranch;
  const fullDataRef = useRef(fullData);
  fullDataRef.current = fullData;
  const viewBranchRef = useRef(viewBranchId);
  viewBranchRef.current = viewBranchId;
  const flagsRef = useRef(flags);
  flagsRef.current = flags;
  const staffPlanRef = useRef(staffPlan);
  staffPlanRef.current = staffPlan;

  const setViewBranchIdGuarded = useCallback((id: string | null) => {
    if (id !== null && !planAllowsMultiBranch(staffPlanRef.current)) return;
    setViewBranchId(id);
  }, []);
  const branchPaymentsRef = useRef(branchPayments);
  branchPaymentsRef.current = branchPayments;
  const branchProfilesRef = useRef(branchProfiles);
  branchProfilesRef.current = branchProfiles;

  // Dynamic retention: respects developer-configured retention policy (30 days, 60 days, or lifetime)
  const pruneAuditWithFlags = useCallback((entries: AuditLog[], f: FeatureFlags) => {
    const retentionMs = getAuditRetentionMs(f);
    if (retentionMs === null) {
      // Lifetime storage: never purge logs based on age
      return entries;
    }
    const cutoff = Date.now() - retentionMs;
    return entries.filter((e) => new Date(e.timestamp).getTime() >= cutoff);
  }, []);

  const pruneAudit = useCallback(
    (entries: AuditLog[]) => {
      return pruneAuditWithFlags(entries, flagsRef.current);
    },
    [pruneAuditWithFlags]
  );

  // Purge stale logs once cloud snapshot arrives, then re-check hourly or upon policy changes
  const purgedRef = useRef(false);
  useEffect(() => {
    if (!cloudReady) return;
    const checkStale = () => {
      const retentionMs = getAuditRetentionMs(flagsRef.current);
      if (retentionMs === null) return;
      const cutoff = Date.now() - retentionMs;
      if (fullDataRef.current.audit.some((e) => new Date(e.timestamp).getTime() < cutoff)) {
        setDataRaw((prev) => {
          const next = { ...prev, audit: pruneAuditWithFlags(prev.audit, flagsRef.current) };
          saveLocalData(next);
          return next;
        });
      }
    };

    if (!purgedRef.current) {
      purgedRef.current = true;
      checkStale();
    } else {
      checkStale();
    }

    const t = window.setInterval(checkStale, 60 * 60 * 1000);
    return () => window.clearInterval(t);
  }, [cloudReady, pruneAuditWithFlags, flags.auditRetention30, flags.auditRetention60, flags.auditRetentionLifetime]);



  // Branch scope: overseers see all (or a focused branch); others only their own
  const scopeBranch = scopeBranchOf(currentUser, viewBranchId);

  // Pages read only their own branch's data
  const data = useMemo(() => scopeData(fullData, scopeBranch), [fullData, scopeBranch]);

  const applyUpdate = useCallback((updater: (d: AppData) => AppData) => {
    setDataRaw((prevFull) => {
      const branchId = scopeBranchOf(currentUserRef.current, viewBranchRef.current);
      const scopedPrev = scopeData(prevFull, branchId);
      const scopedNext = updater(scopedPrev);
      const nextFull = mergeScoped(prevFull, scopedNext, branchId);
      saveLocalData(nextFull);
      setCloudSyncing(true);
      void syncCloudData(prevFull, nextFull)
        .then(() => {
          setCloudError("");
          setCloudSyncing(false);
        })
        .catch((err) => {
          setCloudError(friendlyCloudError(err));
          setCloudSyncing(false);
        });
      return nextFull;
    });
  }, []);

  const setData = useCallback((updater: (d: AppData) => AppData) => {
    applyUpdate(updater);
  }, [applyUpdate]);

  const buildBranchBackup = useCallback((branchId: string): BranchBackupFile => {
    return {
      kind: "guru-branch",
      version: 1,
      branchId,
      exportedAt: new Date().toISOString(),
      data: sliceForBranch(fullDataRef.current, branchId),
      payment: branchPaymentsRef.current[branchId],
      profile: branchProfilesRef.current[branchId],
    };
  }, []);

  const restoreBranchBackup = useCallback((
    branchId: string,
    incoming: AppData,
    extras?: { payment?: PaymentSettings; profile?: import("./types").StoreProfile }
  ) => {
    setDataRaw((prevFull) => {
      const nextFull = mergeBranchRestore(prevFull, incoming, branchId);
      saveLocalData(nextFull);
      setCloudSyncing(true);
      void syncCloudData(prevFull, nextFull)
        .then(() => {
          setCloudError("");
          setCloudSyncing(false);
        })
        .catch((err) => {
          setCloudError(friendlyCloudError(err));
          setCloudSyncing(false);
        });
      return nextFull;
    });
    if (extras?.payment) {
      setBranchPayments((prev) => {
        const next = { ...prev, [branchId]: extras.payment as PaymentSettings };
        setDoc(doc(db, COLLECTIONS.meta, "app"), { branchPayments: { [branchId]: extras.payment } }, { merge: true }).catch(() => {});
        return next;
      });
    }
    if (extras?.profile) {
      setBranchProfiles((prev) => {
        const next = { ...prev, [branchId]: extras.profile as import("./types").StoreProfile };
        setDoc(doc(db, COLLECTIONS.meta, "app"), { branchProfiles: { [branchId]: extras.profile } }, { merge: true }).catch(() => {});
        return next;
      });
    }
  }, []);

  const log = useCallback((action: string, details?: string) => {
    // Audit logging can be disabled from the developer Feature Controls (Master Switch)
    if (!flagsRef.current.auditEnabled) return;
    const entry: AuditLog = {
      id: "a_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
      branchId: currentBranchRef.current?.id,
      user: currentUserRef.current?.username || "system",
      action,
      details,
      timestamp: new Date().toISOString(),
    };
    const maxEntries = flagsRef.current.auditRetentionLifetime ? 10000 : 2000;
    applyUpdate((prev) => ({ ...prev, audit: [entry, ...pruneAudit(prev.audit)].slice(0, maxEntries) }));
  }, [applyUpdate, pruneAudit]);

  const login = useCallback((username: string, password: string) => {
    const allUsers = fullDataRef.current.users;
    const user = allUsers.find((x) => x.username.trim().toLowerCase() === username.trim().toLowerCase());
    if (!cloudReady && allUsers.length === 0) return { ok: false, message: "Connecting to cloud data. Please wait..." };
    if (!user) return { ok: false, message: "User not found" };
    if (!user.active) return { ok: false, message: "Account is deactivated." };
    if (user.password !== password) return { ok: false, message: "Incorrect password" };
    if (user.role !== "developer") return { ok: false, message: "Access restricted: Only Developer access is permitted." };

    sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
    setCurrentUser(user);
    setCurrentBranch(null);
    setViewBranchId(null);
    sessionStorage.removeItem(BRANCH_SESSION_KEY);

    log("LOGIN", `Developer ${user.username} logged in`);
    return { ok: true };
  }, [cloudReady, log]);

  const logout = useCallback(() => {
    const user = currentUserRef.current;
    if (user) {
      applyUpdate((prev) => ({
        ...prev,
        audit: [{
          id: "a_" + Date.now(),
          branchId: currentBranchRef.current?.id,
          user: user.username,
          action: "LOGOUT",
          timestamp: new Date().toISOString(),
        }, ...prev.audit].slice(0, 1000),
      }));
    }
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(BRANCH_SESSION_KEY);
    setCurrentUser(null);
    setCurrentBranch(null);
    setViewBranchId(null);
  }, [applyUpdate]);

  useEffect(() => {
    let disposed = false;
    if (!db) {
      setCloudError("Database connection not initialized. Please verify your Firebase credentials.");
      return;
    }
    const localSeed = initialData();
    const slices: Partial<FirestoreSlices> = {};
    let counters: AppData["counters"] | null = null;
    let metaReady = false;
    const loaded = new Set<string>();

    const tryCompose = () => {
      if (disposed) return;
      if (!metaReady) return;
      if (ENTITY_KEYS.some((key) => !loaded.has(key))) return;
      const next = normalizeCloudData(slices, counters);
      setDataRaw(next);
      saveLocalData(next);
      fullDataRef.current = next;
      setCloudReady(true);
      setCloudError("");
    };

    const unsubscribers = ENTITY_KEYS.map((key) =>
      onSnapshot(
        collection(db, COLLECTIONS[key]),
        (snapshot) => {
          slices[key] = snapshot.docs.map((snap) => ({ id: snap.id, ...snap.data() })) as AppData[typeof key];
          loaded.add(key);
          tryCompose();
        },
        (err) => {
          setCloudError(friendlyCloudError(err));
          setCloudReady(false);
        }
      )
    );

    const unsubMeta = onSnapshot(
      doc(db, COLLECTIONS.meta, "app"),
      (snapshot) => {
        counters = snapshot.exists() ? ((snapshot.data().counters as AppData["counters"]) || { invoice: 1000, grn: 500 }) : null;
        if (snapshot.exists()) {
          const ff = snapshot.data().featureFlags as Partial<FeatureFlags> | undefined;
          if (ff) setFlags({ ...DEFAULT_FEATURE_FLAGS, ...ff });
          if (isStaffPlanTier(snapshot.data().staffPlan)) {
            const nextPlan = snapshot.data().staffPlan;
            setStaffPlanState(nextPlan);
            try {
              localStorage.setItem("gp_staff_plan", String(nextPlan));
            } catch {}
            const customLim = snapshot.data().customStaffPlanLimits as StaffPlanLimits | undefined;
            if (customLim) {
              setCustomStaffPlanLimitsState(customLim);
              try {
                localStorage.setItem("gp_custom_staff_limits", JSON.stringify(customLim));
              } catch {}
            }
            if (!planAllowsMultiBranch(nextPlan, customLim || customStaffPlanLimitsRef.current)) {
              setViewBranchId(null);
            }
          }
          const pay = snapshot.data().payment as PaymentSettings | undefined;
          if (pay) setPaymentState(pay);
          const bp = (snapshot.data().branchPayments as Record<string, PaymentSettings> | undefined) || {};
          setBranchPayments(bp);
          const prof = (snapshot.data().branchProfiles as Record<string, import("./types").StoreProfile> | undefined) || {};
          setBranchProfiles(prof);
          // One-time migration: fold legacy global payment into the main branch
          if (pay && Object.keys(pay).length > 0 && Object.keys(bp).length === 0 && !migratedRef.current) {
            migratedRef.current = true;
            setDoc(doc(db, COLLECTIONS.meta, "app"), { branchPayments: { br_main: pay }, payment: deleteField() }, { merge: true }).catch(() => {});
          }
        }
        metaReady = snapshot.exists();
        tryCompose();
      },
      (err) => {
        setCloudError(friendlyCloudError(err));
        setCloudReady(false);
      }
    );

    void seedCloudIfEmpty(localSeed).catch((err) => {
      setCloudError(friendlyCloudError(err));
      setCloudReady(false);
    });

    return () => {
      disposed = true;
      unsubscribers.forEach((unsub) => unsub());
      unsubMeta();
    };
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    const latestUser = fullData.users.find((u) => u.id === currentUser.id || u.username === currentUser.username);
    if (!latestUser) return;

    if (!latestUser.active) {
      sessionStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(BRANCH_SESSION_KEY);
      setCurrentUser(null);
      setCurrentBranch(null);
      return;
    }

    if (stableStringify(latestUser) !== stableStringify(currentUser)) {
      setCurrentUser(latestUser);
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(latestUser));
    }

    if (latestUser.role !== "developer" && latestUser.role !== "superadmin") {
      const branch = latestUser.branchId ? fullData.branches.find((b) => b.id === latestUser.branchId) : undefined;
      if (!branch) {
        // Branch was removed or unassigned — force re-login
        sessionStorage.removeItem(SESSION_KEY);
        sessionStorage.removeItem(BRANCH_SESSION_KEY);
        setCurrentUser(null);
        setCurrentBranch(null);
        return;
      }
      if (!currentBranch || branch.id !== currentBranch.id || branch.name !== currentBranch.name || branch.code !== currentBranch.code) {
        setCurrentBranch(branch);
        sessionStorage.setItem(BRANCH_SESSION_KEY, JSON.stringify(branch));
      }
    } else if (currentBranch) {
      setCurrentBranch(null);
      sessionStorage.removeItem(BRANCH_SESSION_KEY);
    }
  }, [currentUser, currentBranch, fullData.users, fullData.branches]);

  // One-time comprehensive cleanup: purge all old invoices, inventory tablets & details, audit logs, grns, returns, and all non-developer accounts
  useEffect(() => {
    const WIPE_KEY = "gp_wipe_invoices_medicines_audit_developer_v4";
    if (localStorage.getItem(WIPE_KEY)) return;
    localStorage.setItem(WIPE_KEY, "1");
    try {
      localStorage.removeItem("guru_pharma_data_v3");
      localStorage.removeItem("guru_pharma_data_v2");
      localStorage.removeItem("guru_pharma_data_v1");
      sessionStorage.removeItem("guru_pharma_session_v3");
      sessionStorage.removeItem("guru_pharma_session_branch_v3");
    } catch {}
    setData((d) => ({
      ...d,
      medicines: [],
      invoices: [],
      audit: [],
      grns: [],
      returns: [],
      users: defaultUsers,
      counters: { invoice: 1000, grn: 500 },
    }));
  }, [setData]);

  const value = useMemo<StoreCtx>(() => ({
    data,
    setData,
    currentUser,
    currentBranch,
    viewBranchId,
    setViewBranchId: setViewBranchIdGuarded,
    flags,
    setFlag,
    setFlagsBatch,
    staffPlan,
    setStaffPlan,
    customStaffPlanLimits,
    setCustomStaffPlanLimits,
    payment,
    setPayment,
    branchPayments,
    setBranchPayment,
    branchProfiles,
    setBranchProfile,
    login,
    logout,
    log,
    flashToast,
    cloudReady,
    cloudSyncing,
    cloudError,
    buildBranchBackup,
    restoreBranchBackup,
  }), [data, setData, currentUser, currentBranch, viewBranchId, setViewBranchIdGuarded, flags, setFlag, setFlagsBatch, staffPlan, setStaffPlan, customStaffPlanLimits, setCustomStaffPlanLimits, payment, branchPayments, branchProfiles, login, logout, log, cloudReady, cloudSyncing, cloudError, buildBranchBackup, restoreBranchBackup]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export { flashToast } from "../utils/helpers";

export function useStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}

export function uid(prefix = "id") {
  return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
