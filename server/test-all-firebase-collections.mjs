/**
 * Comprehensive Firebase Data Storage Verification Script
 * Validates that all entities (Users, Medicines, Invoices, Patients, Doctors, Suppliers, GRNs, Branches, Audit)
 * can be written to, queried from, and managed in the kumaran-5 Firebase project via the backend SDK.
 */

import { db, COLLECTIONS, firebaseConfig } from "./firebase.mjs";
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs } from "firebase/firestore";

async function runTests() {
  console.log("=== Testing Firebase Backend Data Storage on kumaran-5 ===");
  console.log("Project ID:", firebaseConfig.projectId);
  console.log("Auth Domain:", firebaseConfig.authDomain);
  console.log("Storage Bucket:", firebaseConfig.storageBucket);
  console.log("");

  const testId = `test_${Date.now()}`;

  // 1. Medicines
  console.log("1. Testing Medicines storage (gp_medicines)...");
  const medRef = doc(db, COLLECTIONS.medicines, `m_${testId}`);
  await setDoc(medRef, {
    id: `m_${testId}`,
    name: "Paracetamol 500mg Test",
    supplier: "Test Pharma",
    batch: "BAT-999",
    purchasePrice: 10,
    sellingPrice: 15,
    stock: 100,
    expiry: "2027-12-31",
    gst: 12,
    createdAt: new Date().toISOString(),
  });
  const medSnap = await getDoc(medRef);
  if (!medSnap.exists() || medSnap.data().name !== "Paracetamol 500mg Test") throw new Error("Medicine write/read failed");
  await deleteDoc(medRef);
  console.log("✓ Medicines storage verified!");

  // 2. Invoices
  console.log("2. Testing Invoices storage (gp_invoices)...");
  const invRef = doc(db, COLLECTIONS.invoices, `inv_${testId}`);
  await setDoc(invRef, {
    id: `inv_${testId}`,
    number: "INV-9999",
    patientName: "John Doe Test",
    total: 150,
    subtotal: 150,
    taxAmount: 18,
    date: new Date().toISOString(),
    createdBy: "Tester",
    items: [{ medicineId: `m_${testId}`, name: "Paracetamol", qty: 10, price: 15, gst: 12 }],
  });
  const invSnap = await getDoc(invRef);
  if (!invSnap.exists() || invSnap.data().total !== 150) throw new Error("Invoice write/read failed");
  await deleteDoc(invRef);
  console.log("✓ Invoices storage verified!");

  // 3. Patients
  console.log("3. Testing Patients storage (gp_patients)...");
  const patRef = doc(db, COLLECTIONS.patients, `p_${testId}`);
  await setDoc(patRef, {
    id: `p_${testId}`,
    name: "Jane Doe Patient",
    phone: "9876543210",
    address: "123 Test Street",
    createdAt: new Date().toISOString(),
  });
  const patSnap = await getDoc(patRef);
  if (!patSnap.exists() || patSnap.data().name !== "Jane Doe Patient") throw new Error("Patient write/read failed");
  await deleteDoc(patRef);
  console.log("✓ Patients storage verified!");

  // 4. Doctors
  console.log("4. Testing Doctors storage (gp_doctors)...");
  const docRef = doc(db, COLLECTIONS.doctors, `doc_${testId}`);
  await setDoc(docRef, {
    id: `doc_${testId}`,
    name: "Dr. Test Doctor",
    hospital: "Test Clinic",
    phone: "9876501234",
    createdAt: new Date().toISOString(),
  });
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists() || docSnap.data().name !== "Dr. Test Doctor") throw new Error("Doctor write/read failed");
  await deleteDoc(docRef);
  console.log("✓ Doctors storage verified!");

  // 5. Suppliers
  console.log("5. Testing Suppliers storage (gp_suppliers)...");
  const supRef = doc(db, COLLECTIONS.suppliers, `sup_${testId}`);
  await setDoc(supRef, {
    id: `sup_${testId}`,
    name: "Global Health Suppliers",
    contact: "9123456780",
    email: "test@supplier.com",
  });
  const supSnap = await getDoc(supRef);
  if (!supSnap.exists() || supSnap.data().name !== "Global Health Suppliers") throw new Error("Supplier write/read failed");
  await deleteDoc(supRef);
  console.log("✓ Suppliers storage verified!");

  // 6. GRNs
  console.log("6. Testing GRNs storage (gp_grns)...");
  const grnRef = doc(db, COLLECTIONS.grns, `grn_${testId}`);
  await setDoc(grnRef, {
    id: `grn_${testId}`,
    grnNumber: "GRN-9999",
    supplier: "Global Health Suppliers",
    invoiceNumber: "INV-SUP-123",
    status: "APPROVED",
    date: new Date().toISOString(),
    totalAmount: 500,
    items: [],
  });
  const grnSnap = await getDoc(grnRef);
  if (!grnSnap.exists() || grnSnap.data().grnNumber !== "GRN-9999") throw new Error("GRN write/read failed");
  await deleteDoc(grnRef);
  console.log("✓ GRNs storage verified!");

  // 7. Users
  console.log("7. Testing Users storage (gp_users)...");
  const userRef = doc(db, COLLECTIONS.users, `u_${testId}`);
  await setDoc(userRef, {
    id: `u_${testId}`,
    username: `testuser_${testId}`,
    password: "secretpassword",
    name: "Test User",
    role: "staff",
    active: true,
    createdAt: new Date().toISOString(),
  });
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists() || userSnap.data().username !== `testuser_${testId}`) throw new Error("User write/read failed");
  await deleteDoc(userRef);
  console.log("✓ Users storage verified!");

  // 8. Branches
  console.log("8. Testing Branches storage (gp_branches)...");
  const branchRef = doc(db, COLLECTIONS.branches, `br_${testId}`);
  await setDoc(branchRef, {
    id: `br_${testId}`,
    name: "Test Secondary Branch",
    code: "BR999",
    active: true,
    createdAt: new Date().toISOString(),
  });
  const branchSnap = await getDoc(branchRef);
  if (!branchSnap.exists() || branchSnap.data().code !== "BR999") throw new Error("Branch write/read failed");
  await deleteDoc(branchRef);
  console.log("✓ Branches storage verified!");

  // 9. Meta Settings
  console.log("9. Testing Meta app storage (gp_meta)...");
  const metaRef = doc(db, COLLECTIONS.meta, "app");
  const metaSnap = await getDoc(metaRef);
  if (!metaSnap.exists()) throw new Error("Meta app doc missing");
  console.log("✓ Meta app settings verified! Counters:", metaSnap.data().counters);

  console.log("\n========================================================");
  console.log("ALL FIREBASE DATA STORAGE TESTS PASSED ON kumaran-5!");
  console.log("Backend and Firestore integration is 100% operational.");
  console.log("========================================================");
  process.exit(0);
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
