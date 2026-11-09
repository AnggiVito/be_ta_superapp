import { procurementDb } from '../../../config/databases.js';

/**
 * Create an inventory log entry. If a client is provided, use it (so callers
 * can emit logs inside the same transaction). Otherwise use procurementDb.
 */
export async function createLog(clientOrData, maybeData) {
  let client = null;
  let data = null;
  if (maybeData == null) {
    // called as createLog(data)
    data = clientOrData;
  } else {
    client = clientOrData;
    data = maybeData;
  }

  const q = `INSERT INTO procurement_inventory_logs
    (inventory_id, item_name, change_amount, action, note, submission_id, requester_name, created_by, created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now()) RETURNING *`;
  const vals = [data.inventory_id || null, data.item_name || null, Number(data.change_amount) || 0, data.action || null, data.note || null, data.submission_id || null, data.requester_name || null, data.created_by || null];

  if (client && client.query) {
    const { rows } = await client.query(q, vals);
    return rows[0];
  }

  const { rows } = await procurementDb.query(q, vals);
  return rows[0];
}

export async function listLogs(inventoryId, { limit = 100, offset = 0 } = {}) {
  const q = `SELECT * FROM procurement_inventory_logs WHERE inventory_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`;
  const vals = [inventoryId, limit, offset];
  const { rows } = await procurementDb.query(q, vals);
  return rows;
}

export async function listAllLogs({ limit = 100, offset = 0 } = {}) {
  const q = `SELECT * FROM procurement_inventory_logs ORDER BY created_at DESC LIMIT $1 OFFSET $2`;
  const { rows } = await procurementDb.query(q, [limit, offset]);
  return rows;
}
