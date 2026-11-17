/**
 * Medicine Inventory Backend Handler
 * Handles validation, creation, updating, and deletion for inventory medicines.
 */

// In-memory medicine cache for fast fallback & synchronization
const memoryStore = new Map();

export function storeMedicineInMemory(med) {
  if (med && med.id) {
    memoryStore.set(med.id, med);
  }
}

export function getInMemoryMedicines() {
  return Array.from(memoryStore.values());
}

export function removeMedicineFromMemory(id) {
  memoryStore.delete(id);
}

/**
 * Validates medicine payload fields.
 * Ensures Quantity, Buying Price, and Selling Price cannot be blank or invalid when submitted.
 *
 * @param {Object} data - The medicine data payload
 * @param {Object} options - Validation options (e.g. { requirePurchaseDetails: boolean })
 * @returns {{ isValid: boolean, errors: string[], cleanData?: Object }}
 */
export function validateMedicinePayload(data = {}, options = {}) {
  const errors = [];
  const name = String(data.name || "").trim();
  const supplier = String(data.supplier || "").trim();
  const batch = String(data.batch || "").trim();
  const expiry = String(data.expiry || "").trim();
  const mfgDate = String(data.mfgDate || "").trim();
  const narcotic = Boolean(data.narcotic);
  const requirePurchaseDetails = options.requirePurchaseDetails ?? true;

  if (!name) {
    errors.push("Medicine name is required.");
  }

  if (requirePurchaseDetails && !supplier) {
    errors.push("Supplier is required.");
  }

  const today = new Date().toISOString().slice(0, 10);
  if (mfgDate && mfgDate > today) {
    errors.push("Manufacturing date cannot be in the future.");
  }

  const isBlank = (value) => value === undefined || value === null || value === "";

  // Stock / Quantity validation.
  // Full purchase entry requires a quantity above 0.
  // GRN catalog registration (requirePurchaseDetails: false) may start at 0 until the receipt line is filled.
  let parsedStock = 0;
  if (isBlank(data.stock)) {
    if (requirePurchaseDetails) {
      errors.push("Quantity is required and cannot be blank.");
    }
  } else {
    const rawStock = Number(data.stock);
    const stockInvalid = isNaN(rawStock) || rawStock < 0 || (requirePurchaseDetails && rawStock <= 0);
    if (stockInvalid) {
      errors.push(
        requirePurchaseDetails
          ? "Quantity must be a valid number greater than 0."
          : "Quantity must be a valid number greater than or equal to 0."
      );
    } else {
      parsedStock = Math.round(rawStock);
    }
  }

  // Buying Price validation
  let parsedPurchasePrice = 0;
  if (isBlank(data.purchasePrice)) {
    if (requirePurchaseDetails) {
      errors.push("Buying price is required and cannot be blank.");
    }
  } else {
    const rawPurchasePrice = Number(data.purchasePrice);
    const priceInvalid = isNaN(rawPurchasePrice) || rawPurchasePrice < 0 || (requirePurchaseDetails && rawPurchasePrice <= 0);
    if (priceInvalid) {
      errors.push(
        requirePurchaseDetails
          ? "Buying price must be a valid positive amount greater than 0."
          : "Buying price must be a valid amount greater than or equal to 0."
      );
    } else {
      parsedPurchasePrice = Math.round(rawPurchasePrice * 100) / 100;
    }
  }

  // Selling Price validation
  let parsedSellingPrice = 0;
  if (isBlank(data.sellingPrice)) {
    if (requirePurchaseDetails) {
      errors.push("Selling price is required and cannot be blank.");
    }
  } else {
    const rawSellingPrice = Number(data.sellingPrice);
    const priceInvalid = isNaN(rawSellingPrice) || rawSellingPrice < 0 || (requirePurchaseDetails && rawSellingPrice <= 0);
    if (priceInvalid) {
      errors.push(
        requirePurchaseDetails
          ? "Selling price must be a valid positive amount greater than 0."
          : "Selling price must be a valid amount greater than or equal to 0."
      );
    } else {
      parsedSellingPrice = Math.round(rawSellingPrice * 100) / 100;
    }
  }

  if (requirePurchaseDetails && !expiry) {
    errors.push("Expiry date is required.");
  }

  if (requirePurchaseDetails && !mfgDate) {
    errors.push("Manufacturing date is required.");
  }

  // GST & MinStock defaults
  let parsedGst = 5;
  if (data.gst !== undefined && data.gst !== null && data.gst !== "") {
    const rawGst = Number(data.gst);
    parsedGst = isNaN(rawGst) || rawGst < 0 ? 0 : Math.round(rawGst * 100) / 100;
  }

  let parsedMinStock = 10;
  if (data.minStock !== undefined && data.minStock !== null && data.minStock !== "") {
    const rawMin = Number(data.minStock);
    parsedMinStock = isNaN(rawMin) || rawMin < 0 ? 0 : Math.round(rawMin);
  }

  if (errors.length > 0) {
    return {
      isValid: false,
      errors,
      message: errors.join(" "),
    };
  }

  return {
    isValid: true,
    errors: [],
    cleanData: {
      name,
      supplier,
      batch,
      stock: parsedStock,
      purchasePrice: parsedPurchasePrice,
      sellingPrice: parsedSellingPrice,
      expiry,
      mfgDate,
      gst: parsedGst,
      narcotic,
      minStock: parsedMinStock,
      branchId: data.branchId ? String(data.branchId).trim() : (data.branch ? String(data.branch).trim() : "br_main"),
      createdAt: data.createdAt ? String(data.createdAt).trim() : undefined,
    },
  };
}

/**
 * Creates a new medicine entry.
 *
 * @param {Object} payload - Input payload
 * @param {Array} medicines - Existing medicine list
 * @param {Object} options - Validation options
 * @returns {Object} { success: boolean, medicine: Object, medicines: Array }
 */
export function createMedicine(payload = {}, medicines = [], options = {}) {
  const validation = validateMedicinePayload(payload, options);
  if (!validation.isValid) {
    const err = new Error(validation.message);
    err.errors = validation.errors;
    err.statusCode = 400;
    throw err;
  }

  const clean = validation.cleanData;
  const newMedicine = {
    id: payload.id || `m_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    ...clean,
    branchId: clean.branchId || "br_main",
    createdAt: clean.createdAt || new Date().toISOString(),
  };

  storeMedicineInMemory(newMedicine);

  return {
    success: true,
    medicine: newMedicine,
    medicines: [newMedicine, ...medicines],
  };
}

/**
 * Checks if a given role is authorized to customize Minimum Stock.
 * Exclusively permits Developer and Admin roles (and superadmin).
 *
 * @param {string} role - The user role
 * @returns {boolean}
 */
export function isAuthorizedForMinStock(role) {
  const r = String(role || "").toLowerCase();
  return r === "developer" || r === "superadmin" || r === "admin";
}

/**
 * Updates the Minimum Stock threshold for a specific medicine.
 * Enforces role-based access control exclusively for Developer and Admin roles.
 *
 * @param {string} id - Medicine ID
 * @param {number|string} minStock - New minimum stock value
 * @param {string} role - The user role
 * @param {Array} medicines - Existing medicine list
 * @returns {Object} { success: boolean, medicine: Object, medicines: Array }
 */
export function updateMedicineMinStock(id, minStock, role, medicines = []) {
  if (!isAuthorizedForMinStock(role)) {
    const err = new Error("Access Denied: Only Developer and Admin roles can customize Minimum Stock.");
    err.statusCode = 403;
    throw err;
  }

  const idx = medicines.findIndex((m) => m && m.id === id);
  if (idx === -1) {
    const err = new Error(`Medicine with ID '${id}' not found.`);
    err.statusCode = 404;
    throw err;
  }

  const rawMin = Number(minStock);
  if (isNaN(rawMin) || rawMin < 0) {
    const err = new Error("Minimum Stock must be a valid non-negative integer.");
    err.statusCode = 400;
    throw err;
  }

  const parsedMinStock = Math.min(99999, Math.round(rawMin));
  const current = medicines[idx];
  const updatedMedicine = {
    ...current,
    minStock: parsedMinStock,
    updatedAt: new Date().toISOString(),
  };

  const updatedList = [...medicines];
  updatedList[idx] = updatedMedicine;

  return {
    success: true,
    medicine: updatedMedicine,
    medicines: updatedList,
  };
}

/**
 * Updates an existing medicine entry.
 *
 * @param {string} id - Medicine ID
 * @param {Object} patch - Fields to update
 * @param {Array} medicines - Existing medicine list
 * @param {string} [role] - User role attempting the update
 * @returns {Object} { success: boolean, medicine: Object, medicines: Array }
 */
export function updateMedicine(id, patch = {}, medicines = [], role = "") {
  const idx = medicines.findIndex((m) => m && m.id === id);
  if (idx === -1) {
    const err = new Error(`Medicine with ID '${id}' not found.`);
    err.statusCode = 404;
    throw err;
  }

  const current = medicines[idx];

  // Restrict customizing minStock exclusively to Developer and Admin roles
  if (patch.minStock !== undefined && patch.minStock !== current.minStock && role) {
    if (!isAuthorizedForMinStock(role)) {
      const err = new Error("Access Denied: Only Developer and Admin roles can customize Minimum Stock.");
      err.statusCode = 403;
      throw err;
    }
  }

  const merged = { ...current, ...patch };

  const validation = validateMedicinePayload(merged, { requirePurchaseDetails: false });
  if (!validation.isValid) {
    const err = new Error(validation.message);
    err.errors = validation.errors;
    err.statusCode = 400;
    throw err;
  }

  const updatedMedicine = {
    ...current,
    ...validation.cleanData,
    id,
    branchId: validation.cleanData.branchId || current.branchId || "br_main",
    createdAt: current.createdAt || validation.cleanData.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  storeMedicineInMemory(updatedMedicine);

  const updatedList = [...medicines];
  updatedList[idx] = updatedMedicine;

  return {
    success: true,
    medicine: updatedMedicine,
    medicines: updatedList,
  };
}

/**
 * Searches and indexes medicines for auto-completion and synchronization.
 * Supports matching by product name, batch number, or supplier.
 * Deduplicates distinct items by name while preserving richest batch/price data.
 *
 * @param {Array} medicines
 * @param {Object} options
 * @returns {Array}
 */
export function searchMedicines(medicines = [], options = {}) {
  const q = String(options.q || options.search || "").trim().toLowerCase();
  const branchId = options.branchId ? String(options.branchId).trim() : null;

  let filtered = Array.isArray(medicines) ? medicines : [];

  if (branchId) {
    filtered = filtered.filter((m) => !m.branchId || m.branchId === branchId || m.branchId === "br_main");
  }

  if (q) {
    filtered = filtered.filter((m) => {
      const name = String(m.name || "").toLowerCase();
      const batch = String(m.batch || "").toLowerCase();
      const supplier = String(m.supplier || "").toLowerCase();
      return name.includes(q) || batch.includes(q) || supplier.includes(q);
    });
  }

  // Deduplicate and index by lowercase name, keeping richest item
  const map = new Map();
  filtered.forEach((m) => {
    const key = String(m.name || "").trim().toLowerCase();
    if (!key) return;
    if (!map.has(key)) {
      map.set(key, m);
    } else {
      const existing = map.get(key);
      const exScore = (existing.purchasePrice > 0 ? 2 : 0) + (existing.batch ? 1 : 0) + (existing.stock > 0 ? 1 : 0);
      const curScore = (m.purchasePrice > 0 ? 2 : 0) + (m.batch ? 1 : 0) + (m.stock > 0 ? 1 : 0);
      if (curScore > exScore) {
        map.set(key, m);
      }
    }
  });

  const indexed = Array.from(map.values());
  // Autocomplete queries stay short. A full catalog list (no query) must include
  // newly registered medicines so the GRN product search can find them.
  if (q) return indexed.slice(0, 30);
  return indexed;
}

/**
 * Deletes a medicine entry.
 *
 * @param {string} id - Medicine ID
 * @param {Array} medicines - Existing medicine list
 * @returns {Object} { success: boolean, id: string, medicines: Array }
 */
export function deleteMedicine(id, medicines = []) {
  const exists = medicines.some((m) => m && m.id === id);
  if (!exists) {
    const err = new Error(`Medicine with ID '${id}' not found.`);
    err.statusCode = 404;
    throw err;
  }

  removeMedicineFromMemory(id);
  const updatedList = medicines.filter((m) => m && m.id !== id);
  return {
    success: true,
    id,
    medicines: updatedList,
  };
}
