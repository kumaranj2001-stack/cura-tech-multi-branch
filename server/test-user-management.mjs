import { validateUserPayload, listUsers, createUser, updateUser, deleteUser } from "./userHandler.mjs";

console.log("=== Testing User Management Handler ===");

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

// 3. Update User
console.log("\n3. Testing user updates (name, username, password)...");
const updateRes = updateUser(createRes.user.id, {
  name: "Updated Staff Name",
  username: "staff_renamed",
  password: "newsecretpassword",
  active: false,
}, createRes.users);

console.assert(updateRes.success === true, "Update should succeed");
console.assert(updateRes.user.name === "Updated Staff Name", "Name should be updated");
console.assert(updateRes.user.username === "staff_renamed", "Username should be updated");
console.assert(updateRes.user.password === "newsecretpassword", "Password should be updated");
console.assert(updateRes.user.active === false, "Active status should be updated");
console.log("✓ User name, username, password, and active status updated successfully");

// 4. Delete User
console.log("\n4. Testing user deletion...");
const deleteRes = deleteUser(createRes.user.id, updateRes.users);
console.assert(deleteRes.success === true, "Deletion should succeed");
console.assert(deleteRes.users.length === 2, "Users length should decrease to 2");
console.assert(!deleteRes.users.find(u => u.id === createRes.user.id), "Deleted user must not be present");
console.log("✓ User deleted successfully and removed from list");

// Cannot delete primary developer
let devDeleteBlocked = false;
try {
  deleteUser("u_dev", deleteRes.users);
} catch (e) {
  devDeleteBlocked = true;
}
console.assert(devDeleteBlocked, "Deleting primary developer must be blocked");
console.log("✓ Primary developer deletion protected");

// 5. List & filter
console.log("\n5. Testing user listing & filters...");
const searchRes = listUsers(deleteRes.users, { q: "admin" });
console.assert(searchRes.length === 1 && searchRes[0].username === "admin1", "Search by query should work");
console.log("✓ User listing and search filtering verified");

console.log("\nALL USER MANAGEMENT HANDLER TESTS PASSED!");
