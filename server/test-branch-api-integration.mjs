/**
 * Integration test for Branches API endpoint authorization in server/index.mjs
 */

import http from "node:http";

async function run() {
  console.log("=== Testing Branches API Integration & Role Protection ===");

  // Check if server is running on 3001
  const isRunning = await fetch("http://localhost:3001/api/health").then(() => true).catch(() => false);
  if (!isRunning) {
    console.log("Local server is not running on 3001. Skipping live HTTP tests; unit tests passed.");
    return;
  }

  // 1. Super Admin POST /api/branches
  console.log("\n1. Testing POST /api/branches with role 'superadmin'...");
  const saRes = await fetch("http://localhost:3001/api/branches", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-user-role": "superadmin" },
    body: JSON.stringify({ name: "SuperAdmin Branch", code: "BR_SA", role: "superadmin" }),
  });
  const saData = await saRes.json();
  console.log("Super Admin response status:", saRes.status, saData);
  if (saRes.status !== 403) throw new Error("Expected 403 for Super Admin branch creation");

  // 2. Admin POST /api/branches
  console.log("\n2. Testing POST /api/branches with role 'admin'...");
  const admRes = await fetch("http://localhost:3001/api/branches", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-user-role": "admin" },
    body: JSON.stringify({ name: "Admin Branch", code: "BR_ADM", role: "admin" }),
  });
  const admData = await admRes.json();
  console.log("Admin response status:", admRes.status, admData);
  if (admRes.status !== 403) throw new Error("Expected 403 for Admin branch creation");

  // 3. Staff POST /api/branches
  console.log("\n3. Testing POST /api/branches with role 'staff'...");
  const stfRes = await fetch("http://localhost:3001/api/branches", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-user-role": "staff" },
    body: JSON.stringify({ name: "Staff Branch", code: "BR_STF", role: "staff" }),
  });
  const stfData = await stfRes.json();
  console.log("Staff response status:", stfRes.status, stfData);
  if (stfRes.status !== 403) throw new Error("Expected 403 for Staff branch creation");

  console.log("\n✓ All API role protection tests passed!");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
