/**
 * Approved GRN Backend Operations
 * Provides secured listing, modification, and deletion of approved GRN entries.
 * Restricted strictly to the Developer role.
 */

export function isDeveloperRole(role) {
  if (!role) return false;
  const normalized = String(role).trim().toLowerCase();
  return normalized === "developer" || normalized === "superadmin";
}

export function totalItemGst(it) {
  return (Number(it.igst) || 0) + (Number(it.cgst) || 0) + (Number(it.sgst) || 0);
}

/**
 * Recompute GRN monetary totals from its items
 */
export function recalcApprovedGrn(grn) {
  const items = grn.items || [];
  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

  const subtotal = round2(
    items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.purchasePrice) || 0), 0)
  );

  const agencyDiscountPct = Math.max(0, Number(grn.agencyDiscountPct) || 0);
  const agencyDiscountAmt = round2((subtotal * agencyDiscountPct) / 100);

  const specialDiscount = Math.max(0, Number(grn.specialDiscount) || 0);
  const afterAgency = Math.max(0, subtotal - agencyDiscountAmt - specialDiscount);

  const taxAmount = round2(
    items.reduce((s, i) => {
      const itemTotal = (Number(i.qty) || 0) * (Number(i.purchasePrice) || 0);
      const ratio = subtotal > 0 ? itemTotal / subtotal : 0;
      return s + (afterAgency * ratio * totalItemGst(i)) / 100;
    }, 0)
  );

  const total = round2(afterAgency + taxAmount);

  return {
    subtotal,
    agencyDiscountAmt,
    taxAmount,
    total,
  };
}

/**
 * Lists approved GRNs with optional search and date filtering.
 * Requires Developer role.
 */
export function listApprovedGrns(grns = [], filterOptions = {}, userRole) {
  if (!isDeveloperRole(userRole)) {
    throw new Error("Access Denied: Only Developer role can access approved GRN records.");
  }

  const { search = "", startDate, endDate } = filterOptions;
  const q = String(search).trim().toLowerCase();

  return grns
    .filter((g) => g.status === "approved")
    .filter((g) => {
      if (startDate && g.date < startDate) return false;
      if (endDate && g.date > endDate) return false;
      if (!q) return true;

      const numMatch = g.number && g.number.toLowerCase().includes(q);
      const supMatch = g.supplierName && g.supplierName.toLowerCase().includes(q);
      const invMatch = g.invoiceNumber && g.invoiceNumber.toLowerCase().includes(q);
      const appByMatch = g.approvedBy && g.approvedBy.toLowerCase().includes(q);
      const itemMatch =
        Array.isArray(g.items) &&
        g.items.some(
          (it) =>
            (it.name && it.name.toLowerCase().includes(q)) ||
            (it.batch && it.batch.toLowerCase().includes(q))
        );

      return numMatch || supMatch || invMatch || appByMatch || itemMatch;
    })
    .sort((a, b) => new Date(b.approvedAt || b.date).getTime() - new Date(a.approvedAt || a.date).getTime());
}

/**
 * Updates an approved GRN and optionally adjusts medicine stock.
 * Requires Developer role.
 */
export function updateApprovedGrn(grnId, patchData, grns = [], medicines = [], userRole, adjustStock = true) {
  if (!isDeveloperRole(userRole)) {
    throw new Error("Access Denied: Only Developer role can modify approved GRN entries.");
  }

  const targetIdx = grns.findIndex((g) => g.id === grnId);
  if (targetIdx === -1) {
    throw new Error(`Approved GRN with ID '${grnId}' not found.`);
  }

  const currentGrn = grns[targetIdx];
  if (currentGrn.status !== "approved") {
    throw new Error(`GRN '${currentGrn.number}' is not an approved GRN.`);
  }

  const updatedItems = patchData.items || currentGrn.items;
  if (!Array.isArray(updatedItems) || updatedItems.length === 0) {
    throw new Error("At least one line item is required.");
  }

  // Validate line items
  for (const it of updatedItems) {
    if (!it.name || !it.batch || Number(it.qty) <= 0) {
      throw new Error("Each line item must have a valid name, batch, and quantity greater than 0.");
    }
  }

  const mergedGrn = {
    ...currentGrn,
    ...patchData,
    supplierName: (patchData.supplierName || currentGrn.supplierName || "").trim(),
    invoiceNumber: (patchData.invoiceNumber || currentGrn.invoiceNumber || "").trim(),
    items: updatedItems,
  };

  const calculatedTotals = recalcApprovedGrn(mergedGrn);
  const finalGrn = {
    ...mergedGrn,
    ...calculatedTotals,
    lastEditedBy: "developer",
    lastEditedAt: new Date().toISOString(),
  };

  let updatedMedicines = [...medicines];

  if (adjustStock) {
    const oldQtyMap = new Map();
    (currentGrn.items || []).forEach((it) => {
      const key = `${(it.name || "").trim().toLowerCase()}:::${(it.batch || "").trim()}`;
      const tps = Number(it.tabsPerStrip) || 1;
      const totalUnits = (Number(it.qty) || 0) + (Number(it.freeStrips) || 0) * tps;
      oldQtyMap.set(key, (oldQtyMap.get(key) || 0) + totalUnits);
    });

    const newQtyMap = new Map();
    (finalGrn.items || []).forEach((it) => {
      const key = `${(it.name || "").trim().toLowerCase()}:::${(it.batch || "").trim()}`;
      const tps = Number(it.tabsPerStrip) || 1;
      const totalUnits = (Number(it.qty) || 0) + (Number(it.freeStrips) || 0) * tps;
      newQtyMap.set(key, (newQtyMap.get(key) || 0) + totalUnits);
    });

    const allKeys = new Set([...oldQtyMap.keys(), ...newQtyMap.keys()]);
    allKeys.forEach((key) => {
      const [name, batch] = key.split(":::");
      const oldUnits = oldQtyMap.get(key) || 0;
      const newUnits = newQtyMap.get(key) || 0;
      const delta = newUnits - oldUnits;

      const medIdx = updatedMedicines.findIndex(
        (m) => (m.name || "").trim().toLowerCase() === name && (m.batch || "").trim() === batch
      );

      if (medIdx >= 0) {
        updatedMedicines[medIdx] = {
          ...updatedMedicines[medIdx],
          stock: Math.max(0, (Number(updatedMedicines[medIdx].stock) || 0) + delta),
        };
      }
    });
  }

  const updatedGrns = grns.map((g) => (g.id === grnId ? finalGrn : g));

  return {
    success: true,
    updatedGrn: finalGrn,
    grns: updatedGrns,
    medicines: updatedMedicines,
  };
}

/**
 * Deletes an approved GRN and optionally reverses inventory stock.
 * Requires Developer role.
 */
export function deleteApprovedGrn(grnId, grns = [], medicines = [], userRole, reverseStock = true) {
  if (!isDeveloperRole(userRole)) {
    throw new Error("Access Denied: Only Developer role can delete approved GRN entries.");
  }

  const targetGrn = grns.find((g) => g.id === grnId);
  if (!targetGrn) {
    throw new Error(`Approved GRN with ID '${grnId}' not found.`);
  }

  let updatedMedicines = [...medicines];

  if (reverseStock && Array.isArray(targetGrn.items)) {
    targetGrn.items.forEach((it) => {
      const tps = Number(it.tabsPerStrip) || 1;
      const unitsAdded = (Number(it.qty) || 0) + (Number(it.freeStrips) || 0) * tps;
      const medIdx = updatedMedicines.findIndex(
        (m) =>
          (m.name || "").trim().toLowerCase() === (it.name || "").trim().toLowerCase() &&
          (m.batch || "").trim() === (it.batch || "").trim()
      );

      if (medIdx >= 0) {
        updatedMedicines[medIdx] = {
          ...updatedMedicines[medIdx],
          stock: Math.max(0, (Number(updatedMedicines[medIdx].stock) || 0) - unitsAdded),
        };
      }
    });
  }

  const updatedGrns = grns.filter((g) => g.id !== grnId);

  return {
    success: true,
    deletedGrn: targetGrn,
    grns: updatedGrns,
    medicines: updatedMedicines,
  };
}
