import React, { useState } from "react";
import { useStore } from "../store/store";
import { useTheme } from "../store/theme";
import { Button, Input, Label, PasswordInput } from "../components/ui";
import { sanitizeUsername, sanitizePassword } from "../utils/security";
import { Activity, ShieldCheck, Network, UserRound, Lock, Loader2, Moon, Sun, ClipboardCheck } from "lucide-react";
import logoUrl from "../assets/logo.png";
import Privacy from "./Privacy";

const Login: React.FC = () => {
  const { login, cloudReady, cloudError, cloudSyncing } = useStore();
  const { theme, toggle } = useTheme();
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  /* Sign-in stays available at all times — no attempt counter or lockout */
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setLoading(true);
    setTimeout(() => {
      const r = login(sanitizeUsername(u), sanitizePassword(p));
      if (!r.ok) setErr(r.message || "Login failed");
      setLoading(false);
    }, 200);
  };

  const cloudState = cloudError ? "error" : cloudSyncing ? "syncing" : cloudReady ? "ready" : "connecting";

  if (showPrivacy) return <Privacy onBack={() => setShowPrivacy(false)} />;

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-900 transition-colors">
      <style>{`
        @keyframes ecg-dash { to { stroke-dashoffset: -480; } }
        @keyframes rise-in { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        .ecg-path { stroke-dasharray: 240 240; animation: ecg-dash 3.2s linear infinite; }
        .rise { animation: rise-in .5s cubic-bezier(.22,1,.36,1) both; }
        .rise-1 { animation-delay: .05s; } .rise-2 { animation-delay: .15s; } .rise-3 { animation-delay: .25s; }
        .grid-bg {
          background-image:
            linear-gradient(rgba(148,163,184,.12) 1px, transparent 1px),
            linear-gradient(90deg, rgba(148,163,184,.12) 1px, transparent 1px);
          background-size: 34px 34px;
        }
      `}</style>

      {/* ── Brand panel ── */}
      <aside className="relative hidden lg:flex w-[46%] xl:w-[42%] flex-col justify-between overflow-hidden bg-slate-900 dark:bg-slate-950 text-white p-10">
        <div className="absolute inset-0 grid-bg opacity-70" />
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-sky-500/20 blur-3xl" />
        <div className="absolute -bottom-40 -left-24 w-96 h-96 rounded-full bg-emerald-500/15 blur-3xl" />

        <div className="relative flex items-center gap-3 rise rise-1">
          <div className="w-12 h-12 rounded-xl bg-white ring-1 ring-white/20 flex items-center justify-center overflow-hidden shadow-lg shadow-sky-900/40">
            <img src={logoUrl} alt="Guru logo" className="w-10 h-10 object-contain" />
          </div>
          <div>
            <div className="text-lg font-extrabold tracking-tight leading-none">GU<span className="text-sky-400">RU</span></div>
            <div className="text-[11px] text-slate-400 tracking-wide mt-0.5">PHARMACY ERP</div>
          </div>
        </div>

        <div className="relative">
          <h1 className="text-4xl xl:text-5xl font-extrabold tracking-tight leading-[1.05] rise rise-2">
            Every branch.<br />Every batch.<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-emerald-400">One console.</span>
          </h1>

          {/* living ECG line */}
          <div className="mt-8 rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-4 rise rise-3">
            <div className="flex items-center justify-between text-[11px] font-semibold tracking-widest text-slate-400 mb-2">
              <span className="flex items-center gap-1.5"><Activity className="w-3.5 h-3.5 text-emerald-400" /> SYSTEM VITALS</span>
              <span className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${cloudState === "ready" ? "bg-emerald-400" : cloudState === "error" ? "bg-rose-400" : "bg-amber-400"} animate-pulse`} />
                {cloudState === "ready" ? "CLOUD LIVE" : cloudState === "error" ? "CLOUD ERROR" : "CONNECTING"}
              </span>
            </div>
            <svg viewBox="0 0 480 64" className="w-full h-14" preserveAspectRatio="none">
              <path
                className="ecg-path"
                d="M0 32 H70 L82 32 L92 12 L104 52 L116 24 L126 32 H200 L212 32 L222 16 L234 48 L246 32 H330 L342 32 L352 10 L364 54 L376 26 L386 32 H480"
                fill="none" stroke="url(#ecggrad)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              />
              <defs>
                <linearGradient id="ecggrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#38bdf8" />
                  <stop offset="100%" stopColor="#34d399" />
                </linearGradient>
              </defs>
            </svg>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-3 rise rise-3">
            {[
              { icon: Network, label: "Multi-branch", sub: "live sync" },
              { icon: ClipboardCheck, label: "GRN workflow", sub: "approve & fix" },
              { icon: ShieldCheck, label: "Role-guarded", sub: "audit trail" },
            ].map((f) => (
              <div key={f.label} className="rounded-xl border border-white/10 bg-white/5 p-3 hover:bg-white/10 hover:-translate-y-0.5 transition-all duration-200">
                <f.icon className="w-4 h-4 text-sky-400 mb-2" />
                <div className="text-xs font-semibold">{f.label}</div>
                <div className="text-[10px] text-slate-400">{f.sub}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative text-[11px] text-slate-500">© {new Date().getFullYear()} Guru · Secure session, ends on close</div>
      </aside>

      {/* ── Form panel ── */}
      <main className="relative flex-1 flex items-center justify-center p-6">
        <button
          onClick={toggle}
          className="absolute top-4 right-4 w-10 h-10 rounded-xl flex items-center justify-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md hover:scale-105 active:scale-95 transition-all text-slate-600 dark:text-slate-300"
          title={theme === "light" ? "Switch to Dark Mode" : "Switch to Light Mode"}
        >
          {theme === "light" ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
        </button>

        <div className="w-full max-w-sm">
          {/* mobile brand */}
          <div className="lg:hidden flex items-center gap-3 mb-8 rise rise-1">
            <div className="w-12 h-12 rounded-xl bg-white ring-1 ring-slate-200 dark:ring-slate-600 flex items-center justify-center overflow-hidden shadow-lg shadow-sky-200/50 dark:shadow-none">
              <img src={logoUrl} alt="Guru logo" className="w-10 h-10 object-contain" />
            </div>
            <div>
              <div className="text-xl font-extrabold tracking-tight text-slate-800 dark:text-slate-100">GU<span className="text-sky-600 dark:text-sky-400">RU</span></div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 tracking-wide">Pharmacy Management System</div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl shadow-slate-200/60 dark:shadow-none border border-slate-100 dark:border-slate-700 p-7 rise rise-2">
            <div className="flex items-center justify-between gap-2 mb-1">
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Sign in</h2>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800">
                Developer Access Only
              </span>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Exclusive Developer console login</p>

            <form onSubmit={submit} className="space-y-4">
              <div>
                <Label>Username</Label>
                <div className="relative">
                  <UserRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <Input className="pl-9" value={u} onChange={(e) => setU(e.target.value)} placeholder="Developer username (guru)" autoFocus required />
                </div>
              </div>
              <div>
                <Label>Password</Label>
                <PasswordInput
                  leftIcon={<Lock className="w-4 h-4" />}
                  value={p}
                  onChange={(e) => setP(e.target.value)}
                  placeholder="Enter password"
                  required
                />
              </div>

              {cloudState === "connecting" && (
                <div className="text-amber-700 dark:text-amber-300 text-sm bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                  Connecting to Firebase cloud data...
                </div>
              )}
              {cloudState === "syncing" && (
                <div className="text-amber-700 dark:text-amber-300 text-sm bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                  Syncing cloud data...
                </div>
              )}
              {cloudError && (
                <div className="text-rose-600 dark:text-rose-400 text-sm bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800 rounded-lg px-3 py-2">
                  Firebase connection error: {cloudError}
                </div>
              )}
              {err && (
                <div className="text-rose-600 dark:text-rose-400 text-sm bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800 rounded-lg px-3 py-2">
                  {err}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={loading || (!cloudReady && !cloudError)}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {loading ? "Signing in..." : !cloudReady && !cloudError ? "Connecting..." : "Sign In"}
              </Button>
            </form>
          </div>

          <p className="text-center text-xs text-slate-400 dark:text-slate-500 mt-5 rise rise-3">
            Session ends automatically when you close the app ·{" "}
            <button
              type="button"
              onClick={() => setShowPrivacy(true)}
              className="underline underline-offset-2 hover:text-sky-600 dark:hover:text-sky-400 transition-colors"
            >
              Privacy Policy
            </button>
          </p>
        </div>
      </main>
    </div>
  );
};

export default Login;
