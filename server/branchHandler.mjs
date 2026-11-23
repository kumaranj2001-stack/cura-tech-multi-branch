/**
 * Branch Backend Operations & Access Control
 * Branch management is restricted strictly to Developer and Super Admin roles.
 * Standard Admin and Staff are completely disallowed from creating or modifying branches.
 */

export function isBranchManagerRole(role) {
  if (!role) return false;
  const r = String(role).trim().toLowerCase();
  return r === "developer" || r === "superadmin";
}

export function isBranchCreatorRole(role) {
  return isBranchManagerRole(role);
}

export function validateBranchPayload(payload) {
  const errors = [];
  if (!payload || typeof payload !== "object") {
    return { valid: false, errors: ["Invalid branch payload"] };
  }

  const name = String(payload.name || "").trim();
  const code = String(payload.code || "").trim().toUpperCase();

  if (!name) errors.push("Branch name is required");
  if (!code) errors.push("Branch code is required");
  if (code && !/^[A-Z0-9_-]{2,20}$/.test(code)) {
    errors.push("Branch code must be 2-20 alphanumeric characters");
  }

  const cleaned = {
    id: payload.id || `br_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name,
    code,
    storeName: String(payload.storeName || "").trim(),
    address: String(payload.address || "").trim(),
    gstNumber: String(payload.gstNumber || "").trim().toUpperCase(),
    phone: String(payload.phone || "").trim(),
    email: String(payload.email || "").trim().toLowerCase(),
    active: payload.active !== false,
    createdAt: payload.createdAt || new Date().toISOString(),
  };

  return {
    valid: errors.length === 0,
    errors,
    cleaned,
  };
}

export function createBranch(payload, existingBranches = [], role = "") {
  if (!isBranchCreatorRole(role)) {
    const err = new Error("Access Denied: Only Developer and Super Admin can add or create branches. Standard Admin and Staff accounts are completely restricted.");
    err.statusCode = 403;
    throw err;
  }

  const validation = validateBranchPayload(payload);
  if (!validation.valid) {
    const err = new Error(validation.errors.join(", "));
    err.statusCode = 400;
    throw err;
  }

  const duplicateCode = existingBranches.find(
    (b) => b.code?.toUpperCase() === validation.cleaned.code && b.id !== validation.cleaned.id
  );
  if (duplicateCode) {
    const err = new Error(`Branch code "${validation.cleaned.code}" already exists`);
    err.statusCode = 400;
    throw err;
  }

  return {
    success: true,
    branch: validation.cleaned,
  };
}

export function updateBranch(id, patch, existingBranches = [], role = "") {
  // Developer and Super Admin can update branch details
  if (!isBranchManagerRole(role)) {
    const err = new Error("Access Denied: Only Developer and Super Admin can modify branch details or change active status. Standard Admin and Staff are not permitted.");
    err.statusCode = 403;
    throw err;
  }

  const current = existingBranches.find((b) => b.id === id);
  if (!current) {
    const err = new Error(`Branch with id "${id}" not found`);
    err.statusCode = 404;
    throw err;
  }

  // If code is being changed, ensure uniqueness
  const updatedCode = patch.code ? String(patch.code).trim().toUpperCase() : current.code;
  if (patch.code && updatedCode !== current.code) {
    const duplicate = existingBranches.find((b) => b.id !== id && b.code?.toUpperCase() === updatedCode);
    if (duplicate) {
      const err = new Error(`Branch code "${updatedCode}" is already in use by another branch.`);
      err.statusCode = 400;
      throw err;
    }
  }

  const updatedBranch = {
    ...current,
    name: patch.name ? String(patch.name).trim() : current.name,
    code: updatedCode,
    storeName: patch.storeName !== undefined ? String(patch.storeName).trim() : current.storeName,
    address: patch.address !== undefined ? String(patch.address).trim() : current.address,
    gstNumber: patch.gstNumber !== undefined ? String(patch.gstNumber).trim().toUpperCase() : current.gstNumber,
    phone: patch.phone !== undefined ? String(patch.phone).trim() : current.phone,
    email: patch.email !== undefined ? String(patch.email).trim().toLowerCase() : (current.email || ""),
    active: patch.active !== undefined ? Boolean(patch.active) : current.active,
    updatedAt: new Date().toISOString(),
  };

  return {
    success: true,
    branch: updatedBranch,
  };
}

export function deleteBranch(id, existingBranches = [], existingUsers = [], role = "") {
  if (!isBranchCreatorRole(role)) {
    const err = new Error("Access Denied: Only Developer can delete branches.");
    err.statusCode = 403;
    throw err;
  }

  const current = existingBranches.find((b) => b.id === id);
  if (!current) {
    const err = new Error(`Branch with id "${id}" not found`);
    err.statusCode = 404;
    throw err;
  }

  const assignedUsers = existingUsers.filter((u) => u.branchId === id);
  if (assignedUsers.length > 0) {
    const err = new Error(`Cannot delete branch "${current.name}" with ${assignedUsers.length} assigned user(s). Reassign or delete users first.`);
    err.statusCode = 400;
    throw err;
  }

  return {
    success: true,
    deletedId: id,
    message: `Branch "${current.name}" deleted successfully`,
  };
}
