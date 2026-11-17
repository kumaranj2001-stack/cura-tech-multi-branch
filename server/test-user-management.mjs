import { validateUserPayload, listUsers, createUser, updateUser, deleteUser } from "./userHandler.mjs";

console.log("=== Testing User Management Handler & RBAC ===");

// 1. Validation tests
console.log("1. Testing validation...");
const emptyVal = validateUserPayload({}, false);
console.assert(!emptyVal.valid, "Empty payload should be invalid");
console.assert(emptyVal.errors.length >= 3, "Expected errors for username, name, password");
console.log("✓ Validation correctly rejects missing fields");

const shortPwdVal = validateUserPayload({ username: "john", name: "John", password: "12" }, false);
console.assert(!shortPwdVal.valid, "Short password (<4) should be invalid");
console.log("✓ Validation correctly rejects short password");

// 2. Create User
console.log("\n2. Testing user creation...");
const initialUsers = [
  { id: "u_dev", username: "guru", name: "Developer", role: "developer", active: true },
  { id: "u_adm", username: "admin1", name: "Admin One", role: "admin", branchId: "br_main", active: true },
];

const createRes = createUser({
  username: "staff_new",
  name: "New Staff Member",
  password: "password123",
  role: "staff",
  branchId: "br_main",
  active: true,
}, initialUsers);

console.assert(createRes.success === true, "User creation should succeed");
console.assert(createRes.user.username === "staff_new", "Username should match");
console.assert(createRes.user.name === "New Staff Member", "Name should match");
console.assert(createRes.users.length === 3, "Total users should be 3");
console.log("✓ User created successfully");

// Duplicate username check
let duplicateFailed = false;
try {
  createUser({ username: "staff_new", name: "Another", password: "pwd", role: "staff" }, createRes.users);
} catch (e) {
  duplicateFailed = true;
}
console.assert(duplicateFailed, "Duplicate username must throw error");
console.log("✓ Duplicate username correctly rejected");

// 3. Update User - Developer vs Super Admin / Admin
console.log("\n3. Testing user updates (Developer full edit vs Superadmin active toggle only)...");

// Non-developer attempting to change name/password/username must be blocked
let saDetailEditBlocked = false;
try {
  updateUser(createRes.user.id, { name: "Hacked by Admin", password: "newpassword" }, createRes.users, "superadmin");
} catch (e) {
  if (e.statusCode === 403 && e.message.includes("Only Developer can modify user credentials")) {
    saDetailEditBlocked = true;
  }
}
console.assert(saDetailEditBlocked, "Non-developer detail edit must be rejected with 403");
console.log("✓ Non-developer credential/profile modification blocked with 403 as expected!");

// Non-developer toggling active status ONLY must succeed
const saToggleRes = updateUser(createRes.user.id, { active: false }, createRes.users, "superadmin");
console.assert(saToggleRes.success === true && saToggleRes.user.active === false, "Superadmin should be able to toggle active");
console.log("✓ Superadmin successfully toggled user active status!");

// Developer full update
const devUpdateRes = updateUser(createRes.user.id, {
  name: "Updated Staff Name",
  username: "staff_renamed",
  password: "newsecretpassword",
  active: true,
}, createRes.users, "developer");

console.assert(devUpdateRes.success === true, "Developer update should succeed");
console.assert(devUpdateRes.user.name === "Updated Staff Name", "Name should be updated");
console.assert(devUpdateRes.user.username === "staff_renamed", "Username should be updated");
console.assert(devUpdateRes.user.password === "newsecretpassword", "Password should be updated");
console.log("✓ Developer user full update succeeded!");

// 4. Delete User - Developer only
console.log("\n4. Testing user deletion RBAC...");
let saDeleteBlocked = false;
try {
  deleteUser(createRes.user.id, devUpdateRes.users, "superadmin");
} catch (e) {
  if (e.statusCode === 403 && e.message.includes("Only Developer can delete user profiles")) {
    saDeleteBlocked = true;
  }
}
console.assert(saDeleteBlocked, "Non-developer user delete must be blocked with 403");
console.log("✓ Superadmin/Admin blocked from deleting users!");

// Developer delete succeeds
const deleteRes = deleteUser(createRes.user.id, devUpdateRes.users, "developer");
console.assert(deleteRes.success === true, "Deletion should succeed for developer");
console.assert(deleteRes.users.length === 2, "Users length should decrease to 2");
console.assert(!deleteRes.users.find(u => u.id === createRes.user.id), "Deleted user must not be present");
console.log("✓ User deleted successfully by Developer!");

// Cannot delete primary developer
let devDeleteBlocked = false;
try {
  deleteUser("u_dev", deleteRes.users, "developer");
} catch (e) {
  devDeleteBlocked = true;
}
console.assert(devDeleteBlocked, "Deleting primary developer must be blocked");
console.log("✓ Primary developer deletion protected");

// 5. List & filter (Developer account omission for non-developers)
console.log("\n5. Testing user listing & Developer account omission...");

// Superadmin listing: Developer accounts MUST be omitted
const saUsers = listUsers(deleteRes.users, {}, "superadmin");
const devInSaView = saUsers.some((u) => u.role === "developer" || u.username === "guru");
console.assert(!devInSaView, "Developer accounts must NOT be visible to Superadmin!");
console.log("✓ Developer accounts completely omitted from Super Admin view!");

// Admin listing: Developer accounts MUST be omitted
const admUsers = listUsers(deleteRes.users, {}, "admin");
const devInAdmView = admUsers.some((u) => u.role === "developer" || u.username === "guru");
console.assert(!devInAdmView, "Developer accounts must NOT be visible to Admin!");
console.log("✓ Developer accounts completely omitted from Admin view!");

// Developer listing: Developer accounts MUST be visible
const devUsers = listUsers(deleteRes.users, {}, "developer");
const devInDevView = devUsers.some((u) => u.role === "developer" || u.username === "guru");
console.assert(devInDevView, "Developer accounts must be visible to Developer!");
console.log("✓ Developer accounts visible to Developer role!");

// 6. Role creation permissions & Plan Quotas
console.log("\n6. Testing staff creation restrictions & plan quota enforcement...");

// Non-developer attempting to create Admin or Superadmin role must be blocked with 403
let nonDevAdminCreateBlocked = false;
try {
  createUser({ username: "subadmin", name: "Sub Admin", password: "pwd1", role: "admin" }, initialUsers, "superadmin");
} catch (e) {
  if (e.statusCode === 403 && e.message.includes("Admins and Super Admins can only add Staff members")) {
    nonDevAdminCreateBlocked = true;
  }
}
console.assert(nonDevAdminCreateBlocked, "Super Admin attempting to create Admin must be blocked with 403");
console.log("✓ Super Admin / Admin restricted from creating non-staff accounts!");

// Developer creating Admin or Superadmin role must succeed
const devCreateAdminRes = createUser({ username: "new_admin", name: "New Admin", password: "pwd1", role: "admin" }, initialUsers, "developer");
console.assert(devCreateAdminRes.success === true && devCreateAdminRes.user.role === "admin", "Developer should create admin");
console.log("✓ Developer successfully created Admin account!");

// Quota limit test for Staff
const testPlanLimits = { superadmin: 1, admin: 1, staff: 2 };
const usersAtQuota = [
  { id: "s1", username: "staff1", role: "staff" },
  { id: "s2", username: "staff2", role: "staff" },
];

let quotaBlocked = false;
try {
  createUser({ username: "staff3", name: "Staff Three", password: "pwd1", role: "staff" }, usersAtQuota, "admin", testPlanLimits);
} catch (e) {
  if (e.statusCode === 400 && e.message.includes("Quota limit reached")) {
    quotaBlocked = true;
  }
}
console.assert(quotaBlocked, "Staff creation exceeding plan limit must be blocked with 400");
console.log("✓ Staff creation dynamically capped based on developer plan quota!");

console.log("\nALL USER MANAGEMENT HANDLER TESTS PASSED!");
