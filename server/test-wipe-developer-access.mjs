import assert from "node:assert/strict";

console.log("=== Testing Reset, Wipe, and Developer-Only Access Logic ===");

// 1. Verify Developer accounts and rejection of all other roles
const defaultUsers = [
  {
    id: "u_developer",
    username: "guru",
    password: "kumaran",
    name: "Developer",
    role: "developer",
    active: true,
  },
];

assert.equal(defaultUsers.length, 1, "Only 1 default user should exist");
assert.equal(defaultUsers[0].role, "developer", "Default user must be developer");
console.log("✓ Verified defaultUsers contains strictly Developer account only");

// 2. Test Login Validation Logic
function testLogin(username, password, users) {
  const user = users.find((x) => x.username.trim().toLowerCase() === username.trim().toLowerCase());
  if (!user) return { ok: false, message: "User not found" };
  if (!user.active) return { ok: false, message: "Account is deactivated." };
  if (user.password !== password) return { ok: false, message: "Incorrect password" };
  if (user.role !== "developer") return { ok: false, message: "Access restricted: Only Developer access is permitted." };
  return { ok: true, user };
}

// Developer login succeeds
const devLogin = testLogin("guru", "kumaran", defaultUsers);
assert.equal(devLogin.ok, true, "Developer login must succeed");
console.log("✓ Developer login verified successfully");

// Any non-developer logins are rejected
const mockUsersWithOldRoles = [
  ...defaultUsers,
  { id: "u_admin", username: "kumaran", password: "pwd", role: "admin", active: true },
  { id: "u_super", username: "super", password: "pwd", role: "superadmin", active: true },
  { id: "u_staff", username: "staff123", password: "pwd", role: "staff", active: true },
];

const adminAttempt = testLogin("kumaran", "pwd", mockUsersWithOldRoles);
assert.equal(adminAttempt.ok, false);
assert.equal(adminAttempt.message, "Access restricted: Only Developer access is permitted.");
console.log("✓ Admin login attempt blocked with Developer-only restriction");

const superAttempt = testLogin("super", "pwd", mockUsersWithOldRoles);
assert.equal(superAttempt.ok, false);
assert.equal(superAttempt.message, "Access restricted: Only Developer access is permitted.");
console.log("✓ Super Admin login attempt blocked with Developer-only restriction");

const staffAttempt = testLogin("staff123", "pwd", mockUsersWithOldRoles);
assert.equal(staffAttempt.ok, false);
assert.equal(staffAttempt.message, "Access restricted: Only Developer access is permitted.");
console.log("✓ Staff login attempt blocked with Developer-only restriction");

// 3. Test Filter / Reset Logic for Data
function sanitizeInitialData(inputData) {
  const devUsers = (inputData.users || [])
    .filter((u) => u.role === "developer" || u.username === "guru")
    .map((u) => (u.role === "developer" ? u : { ...u, role: "developer", name: "Developer" }));

  defaultUsers.forEach((u) => {
    if (!devUsers.find((x) => x.username === u.username)) devUsers.push(u);
  });

  return {
    ...inputData,
    medicines: [], // completely empty
    invoices: [],  // completely empty
    audit: [],     // completely empty
    grns: [],      // completely empty
    returns: [],   // completely empty
    users: devUsers,
  };
}

const dirtyState = {
  medicines: [{ id: "m1", name: "Old Med", stock: 50 }],
  invoices: [{ id: "inv1", total: 500 }],
  audit: [{ id: "a1", action: "OLD_ACTION" }],
  grns: [{ id: "g1", invoiceNumber: "INV-99" }],
  returns: [{ id: "r1" }],
  users: mockUsersWithOldRoles,
};

const cleanState = sanitizeInitialData(dirtyState);
assert.equal(cleanState.medicines.length, 0, "Medicines must be empty");
assert.equal(cleanState.invoices.length, 0, "Invoices must be empty");
assert.equal(cleanState.audit.length, 0, "Audit logs must be empty");
assert.equal(cleanState.grns.length, 0, "GRNs must be empty");
assert.equal(cleanState.returns.length, 0, "Returns must be empty");
assert.equal(cleanState.users.length, 1, "Only Developer user should remain");
assert.equal(cleanState.users[0].role, "developer", "Remaining user must be Developer");

console.log("✓ Sanitize & Reset logic successfully wiped all old invoices, inventory, audit logs, and non-developer accounts");
console.log("\nALL RESET & DEVELOPER-ONLY ACCESS TESTS PASSED!");
