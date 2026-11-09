/**
 * Display name for procurement submission line items.
 * Inventory-backed rows should read as "{category} {inventory item name}" (e.g. "buku halus").
 */
export function resolveProcurementItemDisplayName(item = {}) {
  const stored = String(item.item_name ?? item.name ?? item.description ?? '').trim();
  const category = String(
    item.category_name ?? item.category ?? item.inventory_category_name ?? ''
  ).trim();
  const invItemName = String(
    item.inventory_item_name ?? item.inventory_name ?? ''
  ).trim();

  if (category && invItemName) {
    return `${category} ${invItemName}`;
  }

  const hasInv =
    item.inventory_id != null ||
    item.inventoryId != null ||
    item.inventory != null;
  if (hasInv && category && stored) {
    const lowerStored = stored.toLowerCase();
    const lowerCat = category.toLowerCase();
    if (lowerStored === lowerCat || lowerStored.startsWith(`${lowerCat} `)) {
      return stored;
    }
    return `${category} ${stored}`;
  }

  if (stored) return stored;
  if (invItemName) return invItemName;
  if (category) return category;
  return '—';
}
