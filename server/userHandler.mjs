/**
 * User Management Handler for Cura-Tech / Guru Pharma ERP
 * Handles user validation, creation, editing (name, username, password, role, branch),
 * password resets, activation toggles, and deletion.
 */

export function sanitizeUsername(raw = "") {
  return String(raw || "").trim().toLowerCase().replace(/[^a-z0-9_.-]/g, "");
}

export function validateUserPayload(payload = {}, isUpdate = false) {
  const errors = [];
  const username = sanitizeUsername(payload.username);
  const name = String(payload.name || "").trim();
  const password = String(payload.password || "").trim();
  const role = payload.role ? String(payload.role).trim().toLowerCase() : undefined;

  if (!isUpdate || payload.username !== undefined) {
    if (!username) errors.push("Username is required and cannot be empty.");
    else if (username.length < 2) errors.push("Username must be at least 2 characters.");
  }

  if (!isUpdate || payload.name !== undefined) {
    if (!name) errors.push("Name is required and cannot be empty.");
  }

  if (!isUpdate || payload.password !== undefined) {
    if (!password) errors.push("Password is required and cannot be empty.");
    else if (password.length < 4) errors.push("Password must be at least 4 characters.");
  }

  if (role !== undefined) {
    const validRoles = ["developer", "superadmin", "admin", "staff"];
    if (!validRoles.includes(role)) {
      errors.push(`Invalid role '${role}'. Valid roles are: ${validRoles.join(", ")}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    cleaned: {
      username,
      name,
      password,
      role: role || "staff",
      branchId: payload.branchId ? String(payload.branchId).trim() : undefined,
      active: payload.active !== undefined ? Boolean(payload.active) : true,
    },
  };
}

export function listUsers(users = [], options = {}, callerRole = "") {
  const { branchId, role, q = "" } = options;
  const search = String(q || "").trim().toLowerCase();
  const isDevCaller = String(callerRole || "").trim().toLowerCase() === "developer";

  return (users || []).filter((u) => {
    if (!u) return false;
    // Developer accounts must be entirely omitted from non-developer roles
    if (!isDevCaller && (u.role === "developer" || u.username === "guru")) {
      return false;
    }
    if (branchId && branchId !== "all" && u.branchId !== branchId) return false;
    if (role && u.role !== role) return false;
    if (search) {
      const matchName = String(u.name || "").toLowerCase().includes(search);
      const matchUsername = String(u.username || "").toLowerCase().includes(search);
      if (!matchName && !matchUsername) return false;
    }
    return true;
  });
}

export function createUser(payload = {}, existingUsers = [], callerRole = "", planLimits = null) {
  const validation = validateUserPayload(payload, false);
  if (!validation.valid) {
    const err = new Error(validation.errors.join("; "));
    err.statusCode = 400;
    throw err;
  }

  const { username, name, password, role, branchId, active } = validation.cleaned;
  const isDevCaller = String(callerRole || "").trim().toLowerCase() === "developer";

  // Admins and Super Admins are strictly restricted to adding Staff accounts
  if (!isDevCaller && role !== "staff") {
    const err = new Error("Access Denied: Admins and Super Admins can only add Staff members. Only Developer can add Admin, Super Admin, and Developer accounts.");
    err.statusCode = 403;
    throw err;
  }

  // Quota enforcement based on plan assigned to Developer
  if (planLimits && typeof planLimits === "object") {
    const maxQuota = role === "staff" ? planLimits.staff
      : role === "admin" ? planLimits.admin
      : role === "superadmin" ? planLimits.superadmin
      : Infinity;

    if (Number.isFinite(maxQuota)) {
      const used = (existingUsers || []).filter((u) => u && u.role === role).length;
      if (used >= maxQuota) {
        const err = new Error(`Quota limit reached: The current plan permits a maximum of ${maxQuota} ${role} account(s).`);
        err.statusCode = 400;
        throw err;
      }
    }
  }

  // Check username uniqueness
  const duplicate = existingUsers.find((u) => u && String(u.username).toLowerCase() === username);
  if (duplicate) {
    const err = new Error(`Username '${username}' is already in use.`);
    err.statusCode = 409;
    throw err;
  }

  const id = payload.id || `u_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const newUser = {
    id,
    username,
    name,
    password,
    role,
    ...(branchId ? { branchId } : {}),
    active,
    createdAt: payload.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return {
    success: true,
    user: newUser,
    users: [newUser, ...existingUsers],
  };
}

export function updateUser(id, patch = {}, existingUsers = [], callerRole = "") {
  if (!id) {
    const err = new Error("User ID is required for update.");
    err.statusCode = 400;
    throw err;
  }

  const isDevCaller = String(callerRole || "").trim().toLowerCase() === "developer";
  if (!isDevCaller) {
    // Non-developers (Super Admin, Admin) are strictly capped at toggling account status between Active and Deactivated
    const patchKeys = Object.keys(patch).filter((k) => k !== "role" && k !== "users" && k !== "id");
    const hasRestrictedField = patchKeys.some((k) => k !== "active");
    if (hasRestrictedField) {
      const err = new Error("Access Denied: Only Developer can modify user credentials and profile details. Super Admins and Admins can only toggle active status.");
      err.statusCode = 403;
      throw err;
    }
  }

  const userIndex = existingUsers.findIndex((u) => u && u.id === id);
  if (userIndex === -1) {
    const err = new Error(`User with ID '${id}' not found.`);
    err.statusCode = 404;
    throw err;
  }

  const current = existingUsers[userIndex];
  const validation = validateUserPayload(patch, true);
  if (!validation.valid) {
    const err = new Error(validation.errors.join("; "));
    err.statusCode = 400;
    throw err;
  }

  const newUsername = patch.username !== undefined ? validation.cleaned.username : current.username;
  if (newUsername && newUsername !== current.username) {
    const duplicate = existingUsers.find((u) => u && u.id !== id && String(u.username).toLowerCase() === newUsername);
    if (duplicate) {
      const err = new Error(`Username '${newUsername}' is already taken.`);
      err.statusCode = 409;
      throw err;
    }
  }

  const updatedUser = {
    ...current,
    ...(patch.name !== undefined ? { name: validation.cleaned.name } : {}),
    ...(patch.username !== undefined ? { username: newUsername } : {}),
    ...(patch.password !== undefined ? { password: validation.cleaned.password } : {}),
    ...(patch.role !== undefined ? { role: validation.cleaned.role } : {}),
    ...(patch.branchId !== undefined ? { branchId: patch.branchId ? String(patch.branchId).trim() : undefined } : {}),
    ...(patch.active !== undefined ? { active: Boolean(patch.active) } : {}),
    updatedAt: new Date().toISOString(),
  };

  const nextUsers = [...existingUsers];
  nextUsers[userIndex] = updatedUser;

  return {
    success: true,
    user: updatedUser,
    users: nextUsers,
  };
}

export function deleteUser(id, existingUsers = [], callerRole = "") {
  if (!id) {
    const err = new Error("User ID is required for deletion.");
    err.statusCode = 400;
    throw err;
  }

  const isDevCaller = String(callerRole || "").trim().toLowerCase() === "developer";
  if (!isDevCaller) {
    const err = new Error("Access Denied: Only Developer can delete user profiles.");
    err.statusCode = 403;
    throw err;
  }

  const target = existingUsers.find((u) => u && u.id === id);
  if (!target) {
    const err = new Error(`User with ID '${id}' not found.`);
    err.statusCode = 404;
    throw err;
  }

  // Prevent deleting the primary developer account
  if (target.username === "guru" && target.role === "developer") {
    const err = new Error("Cannot delete the primary Developer account.");
    err.statusCode = 403;
    throw err;
  }

  const nextUsers = existingUsers.filter((u) => u && u.id !== id);

  return {
    success: true,
    deletedId: id,
    deletedUser: target,
    users: nextUsers,
  };
}

/**
 * Sanitizes user record for API output, masking passwords to protect user credentials.
 */
export function sanitizeUserOutput(user, options = {}) {
  if (!user) return null;
  const { includePassword = false } = options;
  const output = { ...user };
  if (!includePassword) {
    output.password = "••••••••";
  }
  return output;
}

