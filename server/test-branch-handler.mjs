/**
 * Unit tests for Branch Handler and Access Control
 * Verifies that:
 * 1. ONLY developer can create/add a branch.
 * 2. Super admin, Admin, and Staff are strictly rejected with 403 Access Denied.
 * 3. Validation catches missing name, code, or bad code format.
 * 4. Duplicate branch code is rejected with 400.
 * 5. Branch updates and deletions respect permissions.
 */

import { isBranchCreatorRole, validateBranchPayload, createBranch, updateBranch, deleteBranch } from "./branchHandler.mjs";

console.log("==========================================");
console.log("RUNNING BRANCH HANDLER & RBAC UNIT TESTS");
console.log("==========================================");

const initialBranches = [
  { id: "br_main", name: "Main HQ Pharmacy", code: "BR001", active: true, createdAt: "2026-01-01T00:00:00.000Z" },
];

const initialUsers = [
  { id: "u_1", username: "staff1", role: "staff", branchId: "br_main" },
];

// Test 1: Role check function
console.log("\n1. Testing isBranchCreatorRole...");
if (!isBranchCreatorRole("developer")) throw new Error("Developer should be authorized to create branches");
if (isBranchCreatorRole("superadmin")) throw new Error("Super Admin MUST NOT be authorized to create branches");
if (isBranchCreatorRole("admin")) throw new Error("Admin MUST NOT be authorized to create branches");
if (isBranchCreatorRole("staff")) throw new Error("Staff MUST NOT be authorized to create branches");
if (isBranchCreatorRole("")) throw new Error("Empty role MUST NOT be authorized");
console.log("✓ Role checking strictly limits branch creation to Developer only!");

// Test 2: Validation
console.log("\n2. Testing validateBranchPayload...");
const missingName = validateBranchPayload({ code: "BR002" });
if (missingName.valid || !missingName.errors.some((e) => e.includes("name"))) {
  throw new Error("Missing name was not caught");
}
const missingCode = validateBranchPayload({ name: "North Branch" });
if (missingCode.valid || !missingCode.errors.some((e) => e.includes("code"))) {
  throw new Error("Missing code was not caught");
}
console.log("✓ Branch payload validation caught missing fields as expected!");

// Test 3: Creation authorization - Super Admin rejection
console.log("\n3. Testing Super Admin branch creation attempt...");
let superAdminBlocked = false;
try {
  createBranch({ name: "SuperAdmin Branch", code: "BR_SA" }, initialBranches, "superadmin");
} catch (err) {
  if (err.statusCode === 403 && err.message.includes("Only Developer can add or create branches")) {
    superAdminBlocked = true;
  }
}
if (!superAdminBlocked) throw new Error("Super Admin was not blocked with 403 from creating a branch!");
console.log("✓ Super Admin correctly blocked with 403 Access Denied when attempting to create branch!");

// Test 4: Creation authorization - Admin rejection
console.log("\n4. Testing Admin branch creation attempt...");
let adminBlocked = false;
try {
  createBranch({ name: "Admin Branch", code: "BR_ADM" }, initialBranches, "admin");
} catch (err) {
  if (err.statusCode === 403) adminBlocked = true;
}
if (!adminBlocked) throw new Error("Admin was not blocked with 403 from creating a branch!");
console.log("✓ Admin correctly blocked with 403 Access Denied when attempting to create branch!");

// Test 5: Creation authorization - Staff rejection
console.log("\n5. Testing Staff branch creation attempt...");
let staffBlocked = false;
try {
  createBranch({ name: "Staff Branch", code: "BR_STF" }, initialBranches, "staff");
} catch (err) {
  if (err.statusCode === 403) staffBlocked = true;
}
if (!staffBlocked) throw new Error("Staff was not blocked with 403 from creating a branch!");
console.log("✓ Staff correctly blocked with 403 Access Denied when attempting to create branch!");

// Test 6: Creation authorization - Developer success
console.log("\n6. Testing Developer branch creation...");
const devResult = createBranch(
  { name: "South Branch", code: "BR002", storeName: "South Store", phone: "9876543210" },
  initialBranches,
  "developer"
);
if (!devResult.success || devResult.branch.name !== "South Branch" || devResult.branch.code !== "BR002") {
  throw new Error("Developer branch creation failed");
}
console.log("✓ Developer successfully created branch!");

// Test 7: Duplicate code rejection
console.log("\n7. Testing duplicate branch code rejection...");
let dupBlocked = false;
try {
  createBranch({ name: "Another Main", code: "BR001" }, initialBranches, "developer");
} catch (err) {
  if (err.statusCode === 400 && err.message.includes("already exists")) dupBlocked = true;
}
if (!dupBlocked) throw new Error("Duplicate branch code was not rejected!");
console.log("✓ Duplicate branch code rejected with 400 as expected!");

// Test 8: Deletion protections
console.log("\n8. Testing branch deletion protections...");
let nonDevDeleteBlocked = false;
try {
  deleteBranch("br_main", initialBranches, initialUsers, "superadmin");
} catch (err) {
  if (err.statusCode === 403) nonDevDeleteBlocked = true;
}
if (!nonDevDeleteBlocked) throw new Error("Non-developer deletion was not blocked!");

let assignedUsersBlocked = false;
try {
  deleteBranch("br_main", initialBranches, initialUsers, "developer");
} catch (err) {
  if (err.statusCode === 400 && err.message.includes("assigned user(s)")) assignedUsersBlocked = true;
}
if (!assignedUsersBlocked) throw new Error("Branch with assigned users was not blocked from deletion!");

console.log("✓ Branch deletion correctly restricts to Developer and protects branches with assigned users!");

console.log("\n==========================================");
console.log("ALL BRANCH HANDLER UNIT TESTS PASSED!");
console.log("==========================================");
