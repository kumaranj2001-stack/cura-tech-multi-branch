export interface BillLineItemInput {
  price: number;
  qty: number;
  [key: string]: unknown;
}

export interface BillingCalculationResult {
  subtotal: number;
  discount: number;
  taxAmount: number;
  total: number;
  grandTotal: number;
  items: Array<BillLineItemInput & { lineTotal: number }>;
}

/**
 * Calculates billing totals where product price/MRP inherently includes GST.
 * Line item calculation is simply unit price multiplied by quantity (price * qty).
 * The final total reflects that amount minus any discounts.
 */
export function calculateBillingTotals(
  items: BillLineItemInput[],
  discountType: "fixed" | "percent" = "percent",
  discountValue: number = 0
): BillingCalculationResult {
  const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

  let subtotal = 0;
  const processedItems = items.map((it) => {
    const unitPrice = Math.max(0, Number(it.price) || 0);
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
