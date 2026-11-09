import { procurementDb } from '../../../config/databases.js';

let _submissionItemsHaveInventoryId = null;
let _inventoryJoinAvailable = null;

/** True when procurement_submission_items.inventory_id exists. */
export async function submissionItemsHaveInventoryId() {
  if (_submissionItemsHaveInventoryId !== null) return _submissionItemsHaveInventoryId;
  const { rowCount } = await procurementDb.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'procurement_submission_items'
       AND column_name = 'inventory_id'
     LIMIT 1`,
  );
  _submissionItemsHaveInventoryId = rowCount > 0;
  return _submissionItemsHaveInventoryId;
}

/** True when inventory_id column and inventory tables exist (safe to JOIN). */
export async function canJoinSubmissionItemInventory() {
  if (_inventoryJoinAvailable !== null) return _inventoryJoinAvailable;
  if (!(await submissionItemsHaveInventoryId())) {
    _inventoryJoinAvailable = false;
    return false;
  }
  const tablesRes = await procurementDb.query(
    `SELECT to_regclass('public.procurement_inventory') AS inventory_table,
            to_regclass('public.procurement_inventory_categories') AS category_table`,
  );
  const tables = tablesRes.rows[0] || {};
  _inventoryJoinAvailable = !!(tables.inventory_table && tables.category_table);
  return _inventoryJoinAvailable;
}

/** Ensure inventory_id column exists (idempotent). Returns whether column is present. */
export async function ensureSubmissionItemsInventoryColumn(client = procurementDb) {
  if (await submissionItemsHaveInventoryId()) return true;
  try {
    await client.query(
      'ALTER TABLE procurement_submission_items ADD COLUMN IF NOT EXISTS inventory_id bigint',
    );
    _submissionItemsHaveInventoryId = null;
    _inventoryJoinAvailable = null;
    return await submissionItemsHaveInventoryId();
  } catch (_) {
    return false;
  }
}
