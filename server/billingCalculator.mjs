/**
 * Calculates billing totals where product price/MRP inherently includes GST.
 * Line item calculation is simply unit price multiplied by quantity (price * qty).
 * The final total reflects that amount minus any discounts.
 */
export function calculateBillingTotals(itemsOrOptions = [], discountTypeArg = "percent", discountValueArg = 0) {
  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

  // Support both (items, type, val) and single options object { items, discountType, discountValue }
  let items = [];
  let discountType = discountTypeArg;
  let discountValue = discountValueArg;

  if (Array.isArray(itemsOrOptions)) {
    items = itemsOrOptions;
  } else if (itemsOrOptions && typeof itemsOrOptions === "object") {
    items = Array.isArray(itemsOrOptions.items) ? itemsOrOptions.items : [];
    discountType = itemsOrOptions.discountType || itemsOrOptions.type || discountTypeArg;
    discountValue = itemsOrOptions.discountValue ?? itemsOrOptions.discount ?? discountValueArg;
  }

  let subtotal = 0;
  const processedItems = items.map((it) => {
    const unitPrice = Math.max(0, Number(it.price ?? it.mrp) || 0);
    const qty = Math.max(0, Number(it.qty) || 0);
    const lineTotal = round2(unitPrice * qty);
    subtotal += lineTotal;
    return {
      ...it,
      price: unitPrice,
      qty,
      lineTotal,
    };
  });

  subtotal = round2(subtotal);

  const safeDiscountVal = Math.max(0, Number(discountValue) || 0);
  let discount = 0;
  if (discountType === "percent") {
    discount = round2((subtotal * safeDiscountVal) / 100);
  } else {
    discount = round2(Math.min(subtotal, safeDiscountVal));
  }

  // Product price/MRP inherently includes GST — no separate tax tally is added
  const taxAmount = 0;
  const total = round2(Math.max(0, subtotal - discount));

  return {
    subtotal,
    discount,
    taxAmount,
    total,
    grandTotal: subtotal,
    items: processedItems,
  };
}
