import assert from "node:assert/strict";
import {
  listDoctors,
  createDoctor,
  updateDoctor,
  deleteDoctor,
} from "./doctorHandler.mjs";

console.log("==========================================");
console.log("RUNNING DOCTOR MANAGEMENT BACKEND TESTS");
console.log("==========================================\n");

// Initial sample doctors
const sampleDoctors = [
  {
    id: "doc_1",
    name: "Dr. Arvind Sharma",
    hospital: "Apollo Multispecialty Hospital",
    hospitalAddress: "Plot 14, Health City, Main Road\nChennai - 600001",
    phone: "9876543210",
    regNo: "MCI-48291",
    createdAt: "2026-10-01T10:00:00.000Z",
  },
  {
    id: "doc_2",
    name: "Dr. Priya Nair",
    hospital: "Fortis City Clinic",
    hospitalAddress: "Sector 5, Medical Enclave\nBangalore - 560001",
    phone: "9811223344",
    regNo: "MCI-73910",
    createdAt: "2026-10-15T12:00:00.000Z",
  },
];

// 1. List and Search Tests
console.log("1. Testing listDoctors and search filtering...");
const all = listDoctors(sampleDoctors);
assert.equal(all.length, 2, "Should return all doctors");

const searchByName = listDoctors(sampleDoctors, { q: "Arvind" });
assert.equal(searchByName.length, 1);
assert.equal(searchByName[0].id, "doc_1");

const searchByHospital = listDoctors(sampleDoctors, { q: "Fortis" });
assert.equal(searchByHospital.length, 1);
assert.equal(searchByHospital[0].id, "doc_2");

const searchByPhone = listDoctors(sampleDoctors, { q: "9811" });
assert.equal(searchByPhone.length, 1);
assert.equal(searchByPhone[0].id, "doc_2");

const searchNoMatch = listDoctors(sampleDoctors, { q: "NonExistent" });
assert.equal(searchNoMatch.length, 0);

console.log("✓ Listing & search filtering passed.\n");

// 2. Create Doctor Tests
console.log("2. Testing createDoctor validation and creation...");
assert.throws(
  () => createDoctor({ hospital: "Care Clinic", phone: "9876543210" }, sampleDoctors),
  /Doctor name is required/,
  "Should reject missing doctor name"
);

assert.throws(
  () => createDoctor({ name: "Dr. Rajesh", phone: "9876543210" }, sampleDoctors),
  /Hospital \/ clinic name is required/,
  "Should reject missing hospital"
);

assert.throws(
  () => createDoctor({ name: "Dr. Rajesh", hospital: "Care Clinic", phone: "123" }, sampleDoctors),
  /valid phone number/,
  "Should reject invalid phone"
);

const newDocPayload = {
  name: "Dr. Suresh Reddy",
  hospital: "Manipal Hospital",
  hospitalAddress: "Old Airport Road\nHAL 2nd Stage\nBengaluru",
  phone: "9988776655",
  regNo: "KMC-9944",
};

const createResult = createDoctor(newDocPayload, sampleDoctors);
assert.equal(createResult.success, true);
assert.equal(createResult.doctors.length, 3);
assert.equal(createResult.doctor.name, "Dr. Suresh Reddy");
assert.equal(createResult.doctor.hospital, "Manipal Hospital");
assert.equal(createResult.doctor.hospitalAddress, "Old Airport Road\nHAL 2nd Stage\nBengaluru");
assert.ok(createResult.doctor.id.startsWith("doc_"));

console.log("✓ Doctor creation passed.\n");

// 3. Update Doctor Tests
console.log("3. Testing updateDoctor...");
const currentDoctors = createResult.doctors;
assert.throws(
  () => updateDoctor("non_existent_id", { name: "Dr. Unknown" }, currentDoctors),
  /not found/,
  "Should reject updating non-existent doctor"
);

const updateResult = updateDoctor(
  "doc_1",
  { hospital: "Apollo Spectra Hospitals", phone: "9876500000" },
  currentDoctors
);
assert.equal(updateResult.success, true);
assert.equal(updateResult.doctor.hospital, "Apollo Spectra Hospitals");
assert.equal(updateResult.doctor.phone, "9876500000");
assert.equal(updateResult.doctor.name, "Dr. Arvind Sharma", "Unmodified fields should persist");

console.log("✓ Doctor update passed.\n");

// 4. Delete Doctor Tests
console.log("4. Testing deleteDoctor...");
assert.throws(
  () => deleteDoctor("invalid_id", currentDoctors),
  /not found/,
  "Should reject deleting non-existent doctor"
);

const deleteResult = deleteDoctor("doc_2", currentDoctors);
assert.equal(deleteResult.success, true);
assert.equal(deleteResult.doctors.length, 2);
assert.equal(deleteResult.deletedDoctor.id, "doc_2");
assert.equal(deleteResult.doctors.some((d) => d.id === "doc_2"), false);

console.log("✓ Doctor deletion passed.\n");

console.log("==========================================");
console.log("ALL DOCTOR MANAGEMENT TESTS PASSED SUCCESSFULLY");
console.log("==========================================");
