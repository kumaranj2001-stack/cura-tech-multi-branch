import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "../utils/cn";

export const Card: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...p }) => (
  <div className={cn("bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700", className)} {...p} />
);

export const CardHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...p }) => (
  <div className={cn("px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between", className)} {...p} />
);

export const CardBody: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...p }) => (
  <div className={cn("p-5", className)} {...p} />
);

export const Button: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "ghost" | "success"; size?: "sm" | "md" }
> = ({ className, variant = "primary", size = "md", ...p }) => {
  const v = {
    primary: "bg-sky-600 hover:bg-sky-700 text-white",
    secondary: "bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-600",
    danger: "bg-rose-600 hover:bg-rose-700 text-white",
    success: "bg-emerald-600 hover:bg-emerald-700 text-white",
    ghost: "bg-transparent hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300",
  }[variant];
  const s = size === "sm" ? "px-3 py-1.5 text-sm" : "px-4 py-2 text-sm";
  return (
    <button
      className={cn("inline-flex items-center justify-center gap-2 rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed", v, s, className)}
      {...p}
    />
  );
};

export const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({ className, ...p }) => (
  <input
    className={cn(
      "w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-sky-400",
      className
    )}
    {...p}
  />
);

export const Textarea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = ({ className, ...p }) => (
  <textarea
    className={cn(
      "w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-sky-400 resize-y",
      className
    )}
    {...p}
  />
);

export const PasswordInput: React.FC<
  React.InputHTMLAttributes<HTMLInputElement> & {
    leftIcon?: React.ReactNode;
    showPassword?: boolean;
    onTogglePassword?: (show: boolean) => void;
  }
> = ({ className, leftIcon, showPassword: controlledShow, onTogglePassword, ...p }) => {
  const [uncontrolledShow, setUncontrolledShow] = useState(false);
  const isControlled = controlledShow !== undefined;
  const isShown = isControlled ? controlledShow : uncontrolledShow;

  const handleToggle = () => {
    if (onTogglePassword) {
      onTogglePassword(!isShown);
    }
    if (!isControlled) {
      setUncontrolledShow((prev) => !prev);
    }
  };

  return (
    <div className="relative w-full">
      {leftIcon && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none flex items-center justify-center">
          {leftIcon}
        </span>
      )}
      <input
        className={cn(
          "w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-sky-400",
          leftIcon ? "pl-9" : "pl-3",
          "pr-10",
          className
        )}
        {...p}
        type={isShown ? "text" : "password"}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={p.disabled}
        onClick={handleToggle}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 focus:outline-none transition-colors p-0.5 disabled:opacity-40 disabled:cursor-not-allowed"
        title={isShown ? "Hide password" : "Show password"}
        aria-label={isShown ? "Hide password" : "Show password"}
      >
        {isShown ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
};

export const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = ({ className, ...p }) => (
  <select
    className={cn(
      "w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-400",
      className
    )}
    {...p}
  />
);

export const Label: React.FC<React.LabelHTMLAttributes<HTMLLabelElement>> = ({ className, ...p }) => (
  <label className={cn("block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1", className)} {...p} />
);

export const Badge: React.FC<{ children: React.ReactNode; tone?: "green" | "red" | "amber" | "blue" | "slate" }> = ({ children, tone = "slate" }) => {
  const tones = {
    green: "bg-emerald-50 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700",
    red: "bg-rose-50 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-700",
    amber: "bg-amber-50 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-700",
    blue: "bg-sky-50 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-700",
    slate: "bg-slate-50 dark:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-600",
  }[tone];
  return <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border", tones)}>{children}</span>;
};

export const Modal: React.FC<{ open: boolean; onClose: () => void; title: string; children: React.ReactNode; size?: "sm" | "md" | "lg" | "xl" }> = ({ open, onClose, title, children, size = "md" }) => {
  if (!open) return null;
  const w = { sm: "max-w-md", md: "max-w-2xl", lg: "max-w-4xl", xl: "max-w-6xl" }[size];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className={cn("bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full overflow-hidden border border-slate-200 dark:border-slate-700", w)} onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-xl leading-none">×</button>
        </div>
        <div className="p-5 max-h-[80vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
};

export const EmptyState: React.FC<{ message: string }> = ({ message }) => (
  <div className="text-center py-12 text-slate-400 dark:text-slate-500 text-sm">{message}</div>
);

export const Th: React.FC<React.ThHTMLAttributes<HTMLTableCellElement>> = ({ className, ...p }) => (
  <th className={cn("px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider", className)} {...p} />
);

export const Td: React.FC<React.TdHTMLAttributes<HTMLTableCellElement>> = ({ className, ...p }) => (
  <td className={cn("px-4 py-3 text-sm text-slate-700 dark:text-slate-300", className)} {...p} />
);
