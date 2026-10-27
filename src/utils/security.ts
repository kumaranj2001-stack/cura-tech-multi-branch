/* ── Client-side input hardening ───────────────────────────────────────────
   Strips control characters, HTML-significant symbols and over-length
   content before anything reaches state or Firestore. Defense in depth —
   authoritative enforcement still lives in Firestore Security Rules.      */

export function sanitizeText(input: unknown, maxLen = 200): string {
  if (typeof input !== "string") return "";
  return input
    .replace(/[\u0000-\u001F\u007F]/g, "") // control chars
    .replace(/[<>]/g, "") // html-significant
    .trim()
    .slice(0, maxLen);
}

export function sanitizeUsername(input: unknown): string {
  return sanitizeText(input, 40).replace(/\s+/g, "").toLowerCase();
}

export function sanitizePhone(input: unknown): string {
  return String(input ?? "")
    .replace(/[^\d+\-() ]/g, "")
    .trim()
    .slice(0, 20);
}

export function sanitizePassword(input: unknown): string {
  return String(input ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .slice(0, 128);
}

export function isPlausiblePhone(input: string): boolean {
  return input.replace(/\D/g, "").length >= 7;
}

export function maskSecret(secret: string, visible = 4): string {
  if (!secret) return "";
  if (secret.length <= visible) return "•".repeat(secret.length);
  return "•".repeat(Math.max(4, secret.length - visible)) + secret.slice(-visible);
}
