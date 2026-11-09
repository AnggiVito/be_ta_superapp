/**
 * True when a submission line item is custom (not inventory-backed).
 * Matches FE logic in procurement_tpa_upload_item_photos_screen.dart.
 */
export function itemIsCustom(row) {
  const invId = row?.inventory_id ?? row?.inventoryId ?? row?.inventoryid ?? row?.inventory;
  if (invId == null) return true;
  if (typeof invId === 'number') return invId === 0;
  const s = String(invId).trim().toLowerCase();
  return s === '' || s === 'null' || s === '0' || s === 'false';
}

export function itemIsInventoryBacked(row) {
  return !itemIsCustom(row);
}
