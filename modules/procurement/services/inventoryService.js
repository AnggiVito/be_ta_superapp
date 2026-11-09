import { procurementDb } from '../../../config/databases.js';

/** Normalized submission.status SQL for table alias [ps]. */
const submissionStatusKeySql = (alias = 'ps') => `regexp_replace(
  regexp_replace(lower(trim(COALESCE(${alias}.status, ''))), '[\\s\\-–—]+', '_', 'g'),
  '_+',
  '_',
  'g'
)`;

/** Submission ended — inventory may be deleted if stock is 0. */
const DELETE_TERMINAL_SUBMISSION_STATUSES = ['completed', 'rejected', 'cancelled', 'canceled'];

let _submissionItemsHaveInventoryId = null;

async function submissionItemsHaveInventoryId() {
  if (_submissionItemsHaveInventoryId !== null) return _submissionItemsHaveInventoryId;
  const { rowCount } = await procurementDb.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'procurement_submission_items'
       AND column_name = 'inventory_id'
     LIMIT 1`
  );
  _submissionItemsHaveInventoryId = rowCount > 0;
  return _submissionItemsHaveInventoryId;
}

function activeProcurementExistsSql() {
  const sk = submissionStatusKeySql('ps');
  const terminal = DELETE_TERMINAL_SUBMISSION_STATUSES.map((s) => `'${s}'`).join(', ');
  return `EXISTS (
    SELECT 1
    FROM procurement_submission_items psi
    INNER JOIN procurement_submission ps ON ps.id = psi.submission_id
    WHERE psi.inventory_id = i.id
      AND ${sk} NOT IN (${terminal})
  )`;
}

export async function getActiveSubmissionsForInventory(inventoryId) {
  if (!(await submissionItemsHaveInventoryId())) return [];
  const sk = submissionStatusKeySql('ps');
  const terminal = DELETE_TERMINAL_SUBMISSION_STATUSES.map((s) => `'${s}'`).join(', ');
  const q = `
    SELECT DISTINCT ps.id, ps.status, ps.purpose, ps.updated_at
    FROM procurement_submission_items psi
    INNER JOIN procurement_submission ps ON ps.id = psi.submission_id
    WHERE psi.inventory_id = $1
      AND ${sk} NOT IN (${terminal})
    ORDER BY ps.updated_at DESC
    LIMIT 5
  `;
  const { rows } = await procurementDb.query(q, [inventoryId]);
  return rows;
}

export async function getInventoryDeleteEligibility(inventoryId) {
  const inv = await getInventoryById(inventoryId);
  if (!inv) {
    return { canDelete: false, reason: 'Item not found', activeSubmissions: [] };
  }
  if (Number(inv.stock) !== 0) {
    return {
      canDelete: false,
      reason: 'Inventory item can only be deleted when stock is 0',
      activeSubmissions: [],
    };
  }
  const active = await getActiveSubmissionsForInventory(inventoryId);
  if (active.length > 0) {
    return {
      canDelete: false,
      reason:
        'Cannot delete: this item is linked to a procurement submission that is still in progress. ' +
        'Wait until the submission is completed, rejected, or cancelled.',
      activeSubmissions: active,
    };
  }
  return { canDelete: true, reason: null, activeSubmissions: [] };
}

function enrichRowWithDeleteMeta(row, hasInventoryLink) {
  const stock = Number(row.stock) || 0;
  let canDelete = stock === 0;
  let deleteBlockReason = null;
  if (stock !== 0) {
    deleteBlockReason = 'Stock must be 0 before deletion';
  } else if (hasInventoryLink && row.has_active_procurement) {
    canDelete = false;
    deleteBlockReason =
      'Linked to a procurement submission that is still in progress';
  }
  return { ...row, can_delete: canDelete, delete_block_reason: deleteBlockReason };
}

export async function createInventory({ item_name, stock = 0, minimum_quantity = 0, created_by = null, category_id = null }) {
  const q = `INSERT INTO procurement_inventory (item_name, stock, minimum_quantity, created_by, category_id, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, now(), now()) RETURNING *`;
  const vals = [item_name, stock, minimum_quantity, created_by, category_id];
  const { rows } = await procurementDb.query(q, vals);
  return rows[0];
}

export async function listInventory({ limit = 100, offset = 0 } = {}) {
  const hasLink = await submissionItemsHaveInventoryId();
  const activeSql = hasLink ? activeProcurementExistsSql() : 'false';
  const q = `SELECT i.*, c.name AS category_name, c.unit AS unit,
      (${activeSql}) AS has_active_procurement
    FROM procurement_inventory i
    LEFT JOIN procurement_inventory_categories c ON c.id = i.category_id
    ORDER BY i.created_at DESC
    LIMIT $1 OFFSET $2`;
  const vals = [limit, offset];
  const { rows } = await procurementDb.query(q, vals);
  return rows.map((r) => enrichRowWithDeleteMeta(r, hasLink));
}

export async function getInventoryById(id) {
  const hasLink = await submissionItemsHaveInventoryId();
  const activeSql = hasLink ? activeProcurementExistsSql() : 'false';
  const q = `SELECT i.*, c.name AS category_name, c.unit AS unit,
      (${activeSql}) AS has_active_procurement
    FROM procurement_inventory i
    LEFT JOIN procurement_inventory_categories c ON c.id = i.category_id
    WHERE i.id = $1`;
  const { rows } = await procurementDb.query(q, [id]);
  const row = rows[0] || null;
  return row ? enrichRowWithDeleteMeta(row, hasLink) : null;
}

export async function updateInventory(id, { item_name, stock, minimum_quantity = 0, category_id = null }) {
  const q = `UPDATE procurement_inventory SET item_name = $1, stock = $2, minimum_quantity = $3, category_id = $4, updated_at = now() WHERE id = $5 RETURNING *`;
  const vals = [item_name, stock, minimum_quantity, category_id, id];
  const { rows } = await procurementDb.query(q, vals);
  return rows[0] || null;
}

export async function listLowStock({ limit = 100, offset = 0 } = {}) {
  // Only return items which have a positive minimum_quantity configured and stock is below or equal
  const q = `SELECT i.*, c.name AS category_name, c.unit AS unit
    FROM procurement_inventory i
    LEFT JOIN procurement_inventory_categories c ON c.id = i.category_id
    WHERE i.minimum_quantity IS NOT NULL AND i.minimum_quantity > 0 AND i.stock <= i.minimum_quantity
    ORDER BY i.updated_at DESC
    LIMIT $1 OFFSET $2`;
  const vals = [limit, offset];
  const { rows } = await procurementDb.query(q, vals);
  return rows;
}

export async function deleteInventory(id) {
  const { rows } = await procurementDb.query('DELETE FROM procurement_inventory WHERE id = $1 RETURNING *', [id]);
  return rows[0] || null;
}
