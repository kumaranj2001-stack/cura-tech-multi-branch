/**
 * Medicine Inventory Backend Handler
 * Handles validation, creation, updating, and deletion for inventory medicines.
 */

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

  if (!supplier) {
    errors.push("Supplier is required.");
  }

  const today = new Date().toISOString().slice(0, 10);
  if (mfgDate && mfgDate > today) {
    errors.push("Manufacturing date cannot be in the future.");
  }

  // Stock / Quantity validation
  let parsedStock = 0;
  if (data.stock === undefined || data.stock === null || data.stock === "") {
    if (requirePurchaseDetails) {
      errors.push("Quantity is required and cannot be blank.");
    }
  } else {
    const rawStock = Number(data.stock);
    if (isNaN(rawStock) || rawStock <= 0) {
      errors.push("Quantity must be a valid number greater than 0.");
    } else {
      parsedStock = Math.round(rawStock);
    }
  }

  // Buying Price validation
  let parsedPurchasePrice = 0;
  if (data.purchasePrice === undefined || data.purchasePrice === null || data.purchasePrice === "") {
    if (requirePurchaseDetails) {
      errors.push("Buying price is required and cannot be blank.");
    }
  } else {
    const rawPurchasePrice = Number(data.purchasePrice);
    if (isNaN(rawPurchasePrice) || rawPurchasePrice <= 0) {
      errors.push("Buying price must be a valid positive amount greater than 0.");
    } else {
      parsedPurchasePrice = Math.round(rawPurchasePrice * 100) / 100;
    }
  }

  // Selling Price validation
  let parsedSellingPrice = 0;
  if (data.sellingPrice === undefined || data.sellingPrice === null || data.sellingPrice === "") {
    if (requirePurchaseDetails) {
      errors.push("Selling price is required and cannot be blank.");
    }
  } else {
    const rawSellingPrice = Number(data.sellingPrice);
    if (isNaN(rawSellingPrice) || rawSellingPrice <= 0) {
      errors.push("Selling price must be a valid positive amount greater than 0.");
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
      branchId: data.branchId ? String(data.branchId).trim() : undefined,
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
    createdAt: new Date().toISOString(),
  };

  return {
    success: true,
    medicine: newMedicine,
    medicines: [newMedicine, ...medicines],
  };
}

/**
 * Updates an existing medicine entry.
 *
 * @param {string} id - Medicine ID
 * @param {Object} patch - Fields to update
 * @param {Array} medicines - Existing medicine list
 * @returns {Object} { success: boolean, medicine: Object, medicines: Array }
 */
export function updateMedicine(id, patch = {}, medicines = []) {
  const idx = medicines.findIndex((m) => m && m.id === id);
  if (idx === -1) {
    const err = new Error(`Medicine with ID '${id}' not found.`);
    err.statusCode = 404;
    throw err;
  }

  const current = medicines[idx];
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

  const updatedList = medicines.filter((m) => m && m.id !== id);
  return {
    success: true,
    id,
    medicines: updatedList,
  };
}
