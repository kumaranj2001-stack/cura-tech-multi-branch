import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  memoryLocalCache,
  type Firestore,
} from "firebase/firestore";
import { firebaseConfig, isFirebaseConfigured } from "./config/firebaseConfig";

/* Credentials are abstracted in src/config/firebaseConfig.ts —
   environment variables in production, encoded fallback for local dev.

   Persistent multi-tab local cache gives instant reads from disk, offline support,
   cross-tab synchronization and real-time background sync without lease locking. */

let app: FirebaseApp | null = null;
let firestore: Firestore | null = null;

if (isFirebaseConfigured) {
  try {
    app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    try {
      firestore = initializeFirestore(app, {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
        ignoreUndefinedProperties: true,
      });
    } catch {
      try {
        firestore = initializeFirestore(app, {
          localCache: memoryLocalCache(),
          ignoreUndefinedProperties: true,
        });
      } catch {
        firestore = getFirestore(app);
      }
    }
  } catch (err) {
    console.error("[Guru] Firebase initialization error:", err);
  }
} else {
  // eslint-disable-next-line no-console
  console.warn("[Guru] Firebase config missing — set VITE_FIREBASE_* environment variables.");
}

export const firebaseApp = app;
export const db = firestore as Firestore;
