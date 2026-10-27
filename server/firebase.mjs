import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, initializeFirestore } from "firebase/firestore";

export const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || "AIzaSyCaQwOJk5LMsD8iqQymoUjpe8PvSyK2NJY",
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || "kumaran-5.firebaseapp.com",
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || "kumaran-5",
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || "kumaran-5.firebasestorage.app",
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "852901647426",
  appId: process.env.VITE_FIREBASE_APP_ID || "1:852901647426:web:207ee6ccba118b451d49db",
};

export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

let firestoreInstance;
try {
  firestoreInstance = initializeFirestore(app, { ignoreUndefinedProperties: true });
} catch {
  firestoreInstance = getFirestore(app);
}
export const db = firestoreInstance;

export const COLLECTIONS = {
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
};
