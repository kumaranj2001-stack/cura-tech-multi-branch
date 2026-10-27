/**
 * Inventory filtering module for pharmaceutical management.
 * Categorizes and filters medicines, including Narcotic / Controlled Substances.
 */
export function filterMedicines(medicines = [], filterType = "all") {
  if (!Array.isArray(medicines)) return [];

  switch (filterType) {
    case "narcotic":
      return medicines.filter((m) => Boolean(m && m.narcotic));
    case "out":
      return medicines.filter((m) => Number(m && m.stock) === 0);
    case "low":
      return medicines.filter((m) => {
        const stock = Number(m && m.stock) || 0;
        const minStock = Number(m && m.minStock) || 10;
        return stock > 0 && stock <= minStock;
      });
    case "expired": {
      const today = new Date().toISOString().slice(0, 10);
      return medicines.filter((m) => m && m.expiry && m.expiry < today);
    }
    default:
      return medicines;
  }
}
