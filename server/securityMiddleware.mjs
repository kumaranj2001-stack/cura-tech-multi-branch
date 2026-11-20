/**
 * Security, Stability & Resilience Middleware Layer
 *
 * Implements:
 * 1. Differential Rate Limiting (Token Bucket / Sliding Window)
 * 2. Distributed Tracing & Request Tracking (X-Request-Id)
 * 3. Idempotent API Execution (Idempotency-Key caching)
 * 4. Circuit Breakers for Outbound Dependencies
 * 5. Input Sanitization (Prototype Pollution & Injection Prevention)
 * 6. Exponential Backoff with Full Jitter
 * 7. HTTP Response Compression (Gzip / Deflate)
 */

import crypto from "node:crypto";
import zlib from "node:zlib";

/* ── 1. Distributed Tracing & Request ID ───────────────────────────────── */
export function getOrCreateTraceId(req) {
  const existing = req.headers["x-request-id"] || req.headers["x-trace-id"] || req.headers["traceparent"];
  if (existing && typeof existing === "string") {
    return existing.trim().slice(0, 64);
  }
  return crypto.randomUUID();
}

/* ── 2. Differential Rate Limiter ───────────────────────────────────────── */
class MemoryRateLimiter {
  constructor() {
    this.buckets = new Map(); // ip:category -> { count, resetAt }
    // Periodic garbage collection every 60s
    this.gcTimer = setInterval(() => {
      const now = Date.now();
      for (const [k, v] of this.buckets.entries()) {
        if (now > v.resetAt) this.buckets.delete(k);
      }
    }, 60000);
    if (this.gcTimer.unref) this.gcTimer.unref();
  }

  check(ip, category, limit, windowMs) {
    const now = Date.now();
    const key = `${ip}:${category}`;
    let bucket = this.buckets.get(key);

    if (!bucket || now > bucket.resetAt) {
      bucket = { count: 1, resetAt: now + windowMs };
      this.buckets.set(key, bucket);
      return { allowed: true, remaining: limit - 1, resetInMs: windowMs };
    }

    if (bucket.count >= limit) {
      return { allowed: false, remaining: 0, resetInMs: Math.max(0, bucket.resetAt - now) };
    }

    bucket.count += 1;
    return { allowed: true, remaining: limit - bucket.count, resetInMs: Math.max(0, bucket.resetAt - now) };
  }
}

export const rateLimiter = new MemoryRateLimiter();

// Rate limits per category
export const RATE_LIMIT_TIERS = {
  auth: { limit: 15, windowMs: 60 * 1000 },       // 15 req/min for auth/login
  write: { limit: 120, windowMs: 60 * 1000 },     // 120 req/min for mutations
  read: { limit: 600, windowMs: 60 * 1000 },      // 600 req/min for reads/searches
  system: { limit: 30, windowMs: 60 * 1000 },     // 30 req/min for purge/backup
};

export function enforceRateLimit(req, res, category = "read") {
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    "127.0.0.1";

  const tier = RATE_LIMIT_TIERS[category] || RATE_LIMIT_TIERS.read;
  const result = rateLimiter.check(ip, category, tier.limit, tier.windowMs);

  res.setHeader("X-RateLimit-Limit", tier.limit);
  res.setHeader("X-RateLimit-Remaining", result.remaining);
  res.setHeader("X-RateLimit-Reset", Math.ceil(result.resetInMs / 1000));

  if (!result.allowed) {
    res.writeHead(429, {
      "Content-Type": "application/json",
      "Retry-After": Math.ceil(result.resetInMs / 1000),
    });
    res.end(
      JSON.stringify({
        success: false,
        error: "Too Many Requests",
        message: `Rate limit exceeded for ${category} operations. Please retry in ${Math.ceil(result.resetInMs / 1000)}s.`,
      })
    );
    return false;
  }
  return true;
}

/* ── 3. Idempotency Key Store ──────────────────────────────────────────── */
class IdempotencyManager {
  constructor(ttlMs = 120000) {
    this.cache = new Map(); // key -> { response, createdAt }
    this.ttlMs = ttlMs;
    const gc = setInterval(() => {
      const now = Date.now();
      for (const [k, v] of this.cache.entries()) {
        if (now - v.createdAt > this.ttlMs) this.cache.delete(k);
      }
    }, 60000);
    if (gc.unref) gc.unref();
  }

  get(key) {
    if (!key) return null;
    const cached = this.cache.get(key);
    if (!cached) return null;
    if (Date.now() - cached.createdAt > this.ttlMs) {
      this.cache.delete(key);
      return null;
    }
    return cached.response;
  }

  set(key, statusCode, data) {
    if (!key) return;
    this.cache.set(key, {
      response: { statusCode, data },
      createdAt: Date.now(),
    });
  }
}

export const idempotencyManager = new IdempotencyManager();

/* ── 4. Circuit Breaker for External Dependencies ─────────────────────── */
export class CircuitBreaker {
  constructor(name, options = {}) {
    this.name = name;
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeoutMs = options.resetTimeoutMs || 30000;
    this.state = "CLOSED"; // CLOSED | OPEN | HALF_OPEN
    this.failures = 0;
    this.lastStateChange = Date.now();
  }

  async execute(action, fallback = null) {
    const now = Date.now();

    if (this.state === "OPEN") {
      if (now - this.lastStateChange > this.resetTimeoutMs) {
        this.state = "HALF_OPEN";
        this.lastStateChange = now;
      } else {
        if (typeof fallback === "function") return fallback();
        throw new Error(`CircuitBreaker [${this.name}] is OPEN. Request rejected to protect upstream service.`);
      }
    }

    try {
      const result = await action();
      if (this.state === "HALF_OPEN") {
        this.state = "CLOSED";
        this.failures = 0;
        this.lastStateChange = Date.now();
      }
      return result;
    } catch (err) {
      this.failures += 1;
      if (this.failures >= this.failureThreshold || this.state === "HALF_OPEN") {
        this.state = "OPEN";
        this.lastStateChange = Date.now();
      }
      throw err;
    }
  }

  getStatus() {
    return {
      name: this.name,
      state: this.state,
      failures: this.failures,
      lastStateChange: new Date(this.lastStateChange).toISOString(),
    };
  }
}

export const openRouterCircuitBreaker = new CircuitBreaker("OpenRouter-AI", {
  failureThreshold: 3,
  resetTimeoutMs: 20000,
});

/* ── 5. Input Sanitization & Payload Protection ────────────────────────── */
const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export function sanitizeInput(val, depth = 0) {
  if (depth > 12) return null; // Avoid circular/deep payload recursion
  if (val === null || val === undefined) return val;

  if (typeof val === "string") {
    // Strip control characters & null bytes, trim excessive spaces
    let s = val.replace(/\0/g, "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
    // Disarm basic script tag injection in plain text inputs
    s = s.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
    return s;
  }

  if (Array.isArray(val)) {
    return val.map((item) => sanitizeInput(item, depth + 1));
  }

  if (typeof val === "object") {
    const clean = {};
    for (const [k, v] of Object.entries(val)) {
      if (DANGEROUS_KEYS.has(k)) continue; // Protect against Prototype Pollution
      clean[k] = sanitizeInput(v, depth + 1);
    }
    return clean;
  }

  return val;
}

/* ── 6. Exponential Backoff with Jitter ────────────────────────────────── */
export async function retryWithBackoff(operation, maxRetries = 3, initialDelayMs = 200) {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      return await operation(attempt);
    } catch (err) {
      attempt++;
      if (attempt >= maxRetries) throw err;
      // Full jitter: random between 0 and 2^attempt * initialDelay
      const maxDelay = initialDelayMs * Math.pow(2, attempt);
      const jitterDelay = Math.floor(Math.random() * maxDelay);
      await new Promise((r) => setTimeout(r, jitterDelay));
    }
  }
}

/* ── 7. HTTP Payload Compression Helper ───────────────────────────────── */
export function sendCompressedJson(req, res, statusCode, data, headers = {}) {
  const jsonStr = JSON.stringify(data);
  const acceptEncoding = String(req.headers["accept-encoding"] || "");

  for (const [k, v] of Object.entries(headers)) {
    res.setHeader(k, v);
  }
  res.setHeader("Content-Type", "application/json");

  // Only compress payloads larger than 1KB
  if (jsonStr.length > 1024) {
    if (acceptEncoding.includes("gzip")) {
      res.setHeader("Content-Encoding", "gzip");
      res.writeHead(statusCode);
      return zlib.gzip(Buffer.from(jsonStr), (err, compressed) => {
        if (err) return res.end(jsonStr);
        res.end(compressed);
      });
    } else if (acceptEncoding.includes("deflate")) {
      res.setHeader("Content-Encoding", "deflate");
      res.writeHead(statusCode);
      return zlib.deflate(Buffer.from(jsonStr), (err, compressed) => {
        if (err) return res.end(jsonStr);
        res.end(compressed);
      });
    }
  }

  res.writeHead(statusCode);
  res.end(jsonStr);
}

/* ── 8. Cryptographic Password Hashing & Timing-Safe Verification ───────── */
export function hashPassword(plainPassword) {
  if (!plainPassword) return "";
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(plainPassword, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(plainPassword, storedPassword) {
  if (!storedPassword || !plainPassword) return false;
  if (typeof storedPassword !== "string") return false;
  if (storedPassword.startsWith("scrypt$")) {
    const parts = storedPassword.split("$");
    if (parts.length !== 3) return false;
    const [, salt, expectedHash] = parts;
    const actualHash = crypto.scryptSync(plainPassword, salt, 64).toString("hex");
    return crypto.timingSafeEqual(Buffer.from(actualHash, "hex"), Buffer.from(expectedHash, "hex"));
  }
  // Constant-time fallback for existing legacy plaintext passwords
  const a = Buffer.from(plainPassword);
  const b = Buffer.from(storedPassword);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/* ── 9. Document Identifier Sanitization (Anti-Path Traversal) ─────────── */
export function isValidDocumentId(id) {
  if (typeof id !== "string") return false;
  const clean = id.trim();
  // Valid Firestore IDs: 1 to 128 characters, alphanumeric plus dash and underscore
  return /^[a-zA-Z0-9_-]{1,128}$/.test(clean);
}

/* ── 10. Cryptographic Session Token & RBAC Claims Engine ───────────────── */
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");

export function createSessionToken(user) {
  const payload = {
    uid: user.id || user.username,
    username: user.username,
    role: user.role || "staff",
    branchId: user.branchId || "br_main",
    exp: Date.now() + 24 * 60 * 60 * 1000, // 24-hour validity
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", SESSION_SECRET).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifySessionToken(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, signature] = parts;
  const expectedSig = crypto.createHmac("sha256", SESSION_SECRET).update(body).digest("base64url");
  try {
    const sigA = Buffer.from(signature);
    const sigB = Buffer.from(expectedSig);
    if (sigA.length !== sigB.length || !crypto.timingSafeEqual(sigA, sigB)) {
      return null;
    }
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function getCallerAuth(req) {
  const authHeader = req.headers["authorization"] || "";
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    const verified = verifySessionToken(token);
    if (verified) return verified;
  }
  const sessionToken = req.headers["x-session-token"];
  if (sessionToken) {
    const verified = verifySessionToken(sessionToken);
    if (verified) return verified;
  }
  return null;
}

/* ── 11. Safe Error Formatter (Prevent Information Disclosure) ─────────── */
export function formatSafeError(err, traceId, isProd = process.env.NODE_ENV === "production") {
  if (!err) return { success: false, error: "An unexpected error occurred", traceId };
  if (err.statusCode && err.statusCode < 500) {
    return { success: false, error: err.message, traceId };
  }
  if (isProd) {
    return {
      success: false,
      error: "Internal Server Error. Please contact system administrator.",
      traceId,
    };
  }
  return {
    success: false,
    error: err.message || "Internal Server Error",
    traceId,
  };
}

/* ── 12. CORS Origin Validator ─────────────────────────────────────────── */
export function getSafeCorsOrigin(req) {
  const origin = req.headers["origin"];
  if (!origin) return "*";
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    return origin;
  }
  const allowed = (process.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (allowed.includes(origin)) {
    return origin;
  }
  return allowed.length > 0 ? null : origin;
}
