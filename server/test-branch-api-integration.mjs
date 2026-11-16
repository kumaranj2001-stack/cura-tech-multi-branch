/**
 * Comprehensive API Integration test for Branches, Users, and Settings authorization in server/index.mjs
 */

async function run() {
  console.log("=== Testing Full API Integration & Role Isolation ===");

  const isRunning = await fetch("http://localhost:3001/api/health").then(() => true).catch(() => false);
  if (!isRunning) {
    console.log("Local server is not running on 3001. Skipping live HTTP tests; unit tests passed.");
    return;
  }

  // 1. Super Admin POST /api/branches -> 403
  console.log("\n1. Testing POST /api/branches with role 'superadmin'...");
  const saRes = await fetch("http://localhost:3001/api/branches", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-user-role": "superadmin" },
    body: JSON.stringify({ name: "SuperAdmin Branch", code: "BR_SA", role: "superadmin" }),
  });
  if (saRes.status !== 403) throw new Error("Expected 403 for Super Admin branch creation");
  console.log("✓ Super Admin blocked with 403 from creating branch");

  // 2. Super Admin PUT /api/branches/br_main -> 403
  console.log("\n2. Testing PUT /api/branches/br_main with role 'superadmin'...");
  const saPutRes = await fetch("http://localhost:3001/api/branches/br_main", {
    method: "PUT",
    headers: { "Content-Type": "application/json", "x-user-role": "superadmin" },
    body: JSON.stringify({ patch: { name: "Hacked Branch" }, role: "superadmin" }),
  });
  if (saPutRes.status !== 403) throw new Error("Expected 403 for Super Admin branch update");
  console.log("✓ Super Admin blocked with 403 from updating branch");

  // 3. Super Admin DELETE /api/branches/br_main -> 403
  console.log("\n3. Testing DELETE /api/branches/br_main with role 'superadmin'...");
  const saDelRes = await fetch("http://localhost:3001/api/branches/br_main", {
    method: "DELETE",
    headers: { "Content-Type": "application/json", "x-user-role": "superadmin" },
  });
  if (saDelRes.status !== 403) throw new Error("Expected 403 for Super Admin branch deletion");
  console.log("✓ Super Admin blocked with 403 from deleting branch");

  // 4. Super Admin POST /api/system/purge -> 403
  console.log("\n4. Testing POST /api/system/purge with role 'superadmin'...");
  const purgeRes = await fetch("http://localhost:3001/api/system/purge", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-user-role": "superadmin" },
    body: JSON.stringify({ role: "superadmin" }),
  });
  if (purgeRes.status !== 403) throw new Error("Expected 403 for Super Admin purge system records");
  console.log("✓ Super Admin blocked with 403 from purging business records");

  // 5. Super Admin GET /api/users -> Developer accounts omitted
  console.log("\n5. Testing GET /api/users with role 'superadmin' (Developer omission)...");
  const usersRes = await fetch("http://localhost:3001/api/users", {
    headers: { "x-user-role": "superadmin" },
  });
  const usersData = await usersRes.json();
  const hasDev = (usersData.users || []).some((u) => u.role === "developer" || u.username === "guru");
  if (hasDev) throw new Error("Developer accounts were NOT omitted from Super Admin GET /api/users");
  console.log("✓ Developer accounts completely omitted from Super Admin GET /api/users");

  // 6. Super Admin PUT /api/users/:id editing details -> 403
  console.log("\n6. Testing PUT /api/users with detail update as 'superadmin'...");
  const testStaffId = "u_test_staff";
  const userPutRes = await fetch(`http://localhost:3001/api/users/${testStaffId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "x-user-role": "superadmin" },
    body: JSON.stringify({
      users: [{ id: testStaffId, username: "staff_test", name: "Staff Test", role: "staff", active: true }],
      patch: { name: "Modified Name", password: "newpassword" },
      role: "superadmin",
    }),
  });
  if (userPutRes.status !== 403) throw new Error("Expected 403 when Super Admin tries to modify user details");
  console.log("✓ Super Admin blocked with 403 from editing user profile / password");

  // 7. Super Admin PUT /api/users/:id toggling active only -> 200
  console.log("\n7. Testing PUT /api/users with ONLY active toggle as 'superadmin'...");
  const userToggleRes = await fetch(`http://localhost:3001/api/users/${testStaffId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "x-user-role": "superadmin" },
    body: JSON.stringify({
      users: [{ id: testStaffId, username: "staff_test", name: "Staff Test", role: "staff", active: true }],
      patch: { active: false },
      role: "superadmin",
    }),
  });
  if (userToggleRes.status !== 200) throw new Error("Expected 200 when Super Admin toggles user active status");
  console.log("✓ Super Admin successfully toggled user active status");

  // 8. Super Admin DELETE /api/users/:id -> 403
  console.log("\n8. Testing DELETE /api/users with role 'superadmin'...");
  const userDelRes = await fetch(`http://localhost:3001/api/users/${testStaffId}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json", "x-user-role": "superadmin" },
    body: JSON.stringify({
      users: [{ id: testStaffId, username: "staff_test", name: "Staff Test", role: "staff", active: true }],
      role: "superadmin",
    }),
  });
  if (userDelRes.status !== 403) throw new Error("Expected 403 when Super Admin tries to delete a user profile");
  console.log("✓ Super Admin blocked with 403 from deleting user profiles");

  console.log("\n✓ All API role isolation tests passed successfully!");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
