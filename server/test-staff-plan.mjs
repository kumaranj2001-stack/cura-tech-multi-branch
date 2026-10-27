import http from "node:http";

async function testStaffPlanEndpoints() {
  console.log("=== Testing Backend Staff Plan Endpoints ===");

  // Helper for requests
  function makeRequest(method, path, body = null) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: "localhost",
        port: 3001,
        path,
        method,
        headers: {
          "Content-Type": "application/json",
        },
      };

      const req = http.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => {
          try {
            resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
          } catch (e) {
            resolve({ statusCode: res.statusCode, body: data });
          }
        });
      });

      req.on("error", reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  // 1. GET /api/staff-plan
  const getRes = await makeRequest("GET", "/api/staff-plan");
  console.log("GET /api/staff-plan Status:", getRes.statusCode);
  console.log("Active Plan:", getRes.body.staffPlan);
  console.log("Custom Limits:", getRes.body.customStaffPlanLimits);
  console.log("Options Count:", getRes.body.options?.length);

  // 2. POST /api/staff-plan with Option 5 and custom limits
  const postPayload = {
    staffPlan: 5,
    customLimits: {
      superadmin: 2,
      admin: 6,
      staff: 20,
    },
  };
  const postRes = await makeRequest("POST", "/api/staff-plan", postPayload);
  console.log("\nPOST /api/staff-plan Status:", postRes.statusCode);
  console.log("Updated Plan Response:", postRes.body);

  // 3. Verify GET reflects new custom limits
  const verifyRes = await makeRequest("GET", "/api/staff-plan");
  console.log("\nVerify GET /api/staff-plan Status:", verifyRes.statusCode);
  console.log("Active Plan after update:", verifyRes.body.staffPlan);
  console.log("Custom Limits after update:", verifyRes.body.customStaffPlanLimits);

  if (verifyRes.body.staffPlan === 5 && verifyRes.body.customStaffPlanLimits.admin === 6) {
    console.log("\n>>> ALL BACKEND STAFF PLAN TESTS PASSED SUCCESS! <<<");
  } else {
    console.error("Test failed to match expected values");
    process.exit(1);
  }
}

testStaffPlanEndpoints().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
