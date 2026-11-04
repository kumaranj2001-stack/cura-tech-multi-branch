/* ── Firebase configuration — abstraction layer ───────────────────────────
   Production: supply values via environment variables (VITE_FIREBASE_*).
   They are injected at build time and never appear in source control.

   Fallback: an encoded snapshot is decoded at runtime so local/dev builds
   keep working without a .env file. Note: any config shipped to a browser
   is ultimately discoverable — real protection comes from Firestore
   Security Rules + Firebase Authentication, which this app enforces.       */

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

/* The fallback below is XOR-scrambled (not plain base64) so credentials are
   not trivially readable from the bundle. Production deployments should still
   supply real environment variables via .env — see .env.example.            */
const SCRAMBLED_FALLBACK =
  "OHczMT8CMTwBCBJzfzk0ATgULCIfG3VhX2EqLTcFYT0+dGJAWEBHEj4TeTgCODxQWV8QGmE0JzU+DTsoQlteEAxhNiczN2QgIEBaHV9DLyE7bDQ7NStAWh5UXzEwMCAlLDU1UxxTXVtheXAxJCY+IEBGeVYUeXcxNCQoeTFGUVgfWzY5Jih7KyYkTVFYEBphJiYuJCgzIGFHU1lTN3doYzU8JiQORlVRXm44Jy0iIHknUVNeUV5tMzszMys1NkZBRF1EIjI3bzc5JGcPEF1XRTA0NSg4LgcgTVZVQH8nd2hjYnxtfBsKAAUGdW1gY3prNTVTe1QQDGFkaHVjcG19GwIHAgB7Z2g2Mytud0VQVAEDImBrcWB+ZnQTUVMCVCA0YWMr";
const SCRAMBLE_KEY = "CURAVITE#2026";

function unscramble(encoded: string): Partial<FirebaseConfig> {
  try {
    const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
    const out = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) out[i] = bytes[i] ^ SCRAMBLE_KEY.charCodeAt(i % SCRAMBLE_KEY.length);
    return JSON.parse(new TextDecoder().decode(out)) as Partial<FirebaseConfig>;
  } catch {
    return {};
  }
}

function decodeFallback(): Partial<FirebaseConfig> {
  return unscramble(SCRAMBLED_FALLBACK);
}

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env || {};
const fb = decodeFallback();

export const firebaseConfig: FirebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || fb.apiKey || "",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || fb.authDomain || "",
  projectId: env.VITE_FIREBASE_PROJECT_ID || fb.projectId || "",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || fb.storageBucket || "",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || fb.messagingSenderId || "",
  appId: env.VITE_FIREBASE_APP_ID || fb.appId || "",
};

export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
