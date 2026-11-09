// databases.js berada di folder root `config/` — dari sini naik 3 level ke root
import { procurementDb, userManagementDb, registrationDb } from '../../../config/databases.js';
import { buildInsert } from '../models/submissionModel.js';
import * as inventoryLogService from './inventoryLogService.js';
import * as submissionStatusLogService from './submissionStatusLogService.js';
import * as handoverLogSvc from './handoverLogService.js';

async function ensureSubmissionItemsInventoryColumn(client) {
  const colRes = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'procurement_submission_items' AND column_name = 'inventory_id'");
  if (colRes.rowCount > 0) return true;

  // Try to add the column for backward-compatible environments that missed migration.
  try {
    await client.query('ALTER TABLE procurement_submission_items ADD COLUMN IF NOT EXISTS inventory_id bigint');
  } catch (e) {
    return false;
  }

  const verifyRes = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'procurement_submission_items' AND column_name = 'inventory_id'");
  return verifyRes.rowCount > 0;
}

async function canJoinItemUnitFromInventory() {
  const invIdColRes = await procurementDb.query(
    "SELECT 1 FROM information_schema.columns WHERE table_name = 'procurement_submission_items' AND column_name = 'inventory_id' LIMIT 1"
  );
  if (invIdColRes.rowCount === 0) return false;

  const tablesRes = await procurementDb.query(
    "SELECT to_regclass('public.procurement_inventory') AS inventory_table, to_regclass('public.procurement_inventory_categories') AS category_table"
  );
  const tables = tablesRes.rows[0] || {};
  return !!(tables.inventory_table && tables.category_table);
}

async function getItemsBySubmissionIdWithUnit(submissionId) {
  if (await canJoinItemUnitFromInventory()) {
    const { rows } = await procurementDb.query(
      `SELECT i.*,
              COALESCE(NULLIF(TRIM(pic.unit), ''), NULLIF(TRIM(i.unit), ''), '') AS unit,
              pic.name AS category_name,
              pi.item_name AS inventory_item_name
       FROM procurement_submission_items i
       LEFT JOIN procurement_inventory pi ON i.inventory_id = pi.id
       LEFT JOIN procurement_inventory_categories pic ON pi.category_id = pic.id
       WHERE i.submission_id = $1
       ORDER BY i.created_at`,
      [submissionId]
    );
    return rows;
  }

  const { rows } = await procurementDb.query(
    'SELECT * FROM procurement_submission_items WHERE submission_id = $1 ORDER BY created_at',
    [submissionId]
  );
  return rows;
}

async function buildItemsAggregationSubquery() {
  if (await canJoinItemUnitFromInventory()) {
    return `
      SELECT iu.submission_id, json_agg(row_to_json(iu) ORDER BY iu.created_at) AS items
      FROM (
        SELECT i.*,
               COALESCE(NULLIF(TRIM(pic.unit), ''), NULLIF(TRIM(i.unit), ''), '') AS unit,
               pic.name AS category_name,
               pi.item_name AS inventory_item_name
        FROM procurement_submission_items i
        LEFT JOIN procurement_inventory pi ON i.inventory_id = pi.id
        LEFT JOIN procurement_inventory_categories pic ON pi.category_id = pic.id
      ) iu
      GROUP BY iu.submission_id
    `;
  }

  return `
    SELECT submission_id, json_agg(row_to_json(i) ORDER BY i.created_at) AS items
    FROM procurement_submission_items i
    GROUP BY submission_id
  `;
}

export async function create({
  requester_name,
  requester_role,
  requester_id = null,
  study_program_id = null,
  lab_id = null,
  item_name = null,
  specification = null,
  quantity_text = null,
  unit_price_text = null,
  total_price = null,
  purpose = null,
  submission_reference = null,
  status = 'submitted',
}) {
  // Build insert dynamically based on actual columns present in the procurement_submission table.
  // This makes the service resilient when some migrations haven't been applied yet.
  const candidateCols = [
    'requester_name',
    'requester_role',
    'requester_id',
    'study_program_id',
    'lab_id',
    'item_name',
    'specification',
    'quantity_text',
    'unit_price_text',
    'total_price',
    'purpose',
    'submission_reference',
    'status',
  ];

  const candidateVals = [
    requester_name,
    requester_role,
    requester_id,
    study_program_id,
    lab_id,
    item_name,
    specification,
    quantity_text,
    unit_price_text,
    total_price,
    purpose,
    submission_reference,
    status,
  ];

  // Determine which columns actually exist in the DB
  const colRes = await procurementDb.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'procurement_submission'");
  const existing = new Set(colRes.rows.map(r => r.column_name));

  const cols = [];
  const vals = [];
  for (let i = 0; i < candidateCols.length; i++) {
    if (existing.has(candidateCols[i])) {
      cols.push(candidateCols[i]);
      vals.push(candidateVals[i]);
    }
  }

  if (cols.length === 0) {
    throw new Error('procurement_submission has no expected columns');
  }

  const placeholders = vals.map((_, idx) => `$${idx + 1}`).join(', ');
  const sql = `INSERT INTO procurement_submission (${cols.join(', ')}) VALUES (${placeholders}) RETURNING *`;
  const { rows } = await procurementDb.query(sql, vals);
  return rows[0];
}

export async function createItem(submissionId, { item_name, specification = null, unit_price, quantity, total_price, status = 'pending', approved_by = null, approved_at = null, inventory_id = null, urgency_level = null, purchase_link = null, unit = null }) {
  const client = await procurementDb.connect();
  try {
    await client.query('BEGIN');

    let canPersistInventoryLink = true;
    if (inventory_id != null) {
      canPersistInventoryLink = await ensureSubmissionItemsInventoryColumn(client);
      if (!canPersistInventoryLink) {
        const err = new Error('Unable to persist inventory linkage (inventory_id) on submission item');
        err.code = 'INVENTORY_LINK_UNAVAILABLE';
        throw err;
      }
    }

    // If inventory linkage requested and item is being activated (status pending), attempt to decrement stock atomically
    if (inventory_id != null && status === 'pending') {
      // check procurement_inventory table exists
      const tableRes = await client.query("SELECT to_regclass('public.procurement_inventory') as reg");
      const hasInventoryTable = tableRes.rows[0] && tableRes.rows[0].reg != null;
      if (hasInventoryTable) {
        // lock the inventory row
        const invRes = await client.query('SELECT id, stock FROM procurement_inventory WHERE id = $1 FOR UPDATE', [inventory_id]);
        if (invRes.rowCount === 0) {
          const err = new Error('Inventory item not found');
          err.code = 'INVENTORY_NOT_FOUND';
          throw err;
        }
        const stock = Number(invRes.rows[0].stock) || 0;
        const qty = Number(quantity) || 0;
        if (qty > stock) {
          const err = new Error(`Insufficient stock (${stock}) for requested quantity ${qty}`);
          err.code = 'INSUFFICIENT_STOCK';
          throw err;
        }

        // decrement stock
        await client.query('UPDATE procurement_inventory SET stock = stock - $1, updated_at = now() WHERE id = $2', [qty, inventory_id]);
        // create an inventory log entry (inside same transaction)
        try {
          const sub = (await client.query('SELECT requester_name FROM procurement_submission WHERE id = $1', [submissionId]));
          const requester = sub.rows[0]?.requester_name || null;
          await inventoryLogService.createLog(client, {
            inventory_id,
            item_name,
            change_amount: -Math.abs(qty),
            action: 'reserved',
            note: `Requested by ${requester || 'unknown'}`,
            submission_id: submissionId,
            requester_name: requester,
            created_by: null,
          });
        } catch (el) {
          // Logging failure should not prevent the main operation — but record to console
          console.error('Failed to create inventory log (reserve):', el?.message || el);
        }
      }
    }

    // Now insert item row; include inventory_id column when linkage exists
    const colRes = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'procurement_submission_items'");
    const existing = new Set(colRes.rows.map(r => r.column_name));

    const cols = ['submission_id', 'item_name', 'specification', 'unit_price', 'quantity', 'total_price', 'status', 'approved_by', 'approved_at'];
    const vals = [submissionId, item_name, specification, unit_price, quantity, total_price, status, approved_by, approved_at];

    if (inventory_id != null && canPersistInventoryLink && existing.has('inventory_id')) {
      cols.push('inventory_id');
      vals.push(inventory_id);
    }
    if (existing.has('urgency_level')) {
      cols.push('urgency_level');
      vals.push(urgency_level);
    }
    if (existing.has('purchase_link')) {
      cols.push('purchase_link');
      vals.push(purchase_link);
    }
    if (existing.has('unit') && unit != null) {
      const trimmed = String(unit).trim();
      if (trimmed) {
        cols.push('unit');
        vals.push(trimmed);
      }
    }

    const placeholders = vals.map((_, idx) => `$${idx + 1}`).join(',');
    const q = `INSERT INTO procurement_submission_items (${cols.join(', ')}, created_at, updated_at) VALUES (${placeholders}, now(), now()) RETURNING *`;
    const { rows } = await client.query(q, vals);
    await client.query('COMMIT');
    return rows[0];
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function findByIdWithItems(id) {
  const p = await procurementDb.query('SELECT * FROM procurement_submission WHERE id=$1', [id]);
  const items = await getItemsBySubmissionIdWithUnit(id);
  return { ...p.rows[0], items };
}

export async function getItemById(id) {
  const { rows } = await procurementDb.query('SELECT * FROM procurement_submission_items WHERE id = $1', [id]);
  return rows[0] || null;
}

export async function getSubmissionById(id) {
  const { rows } = await procurementDb.query('SELECT * FROM procurement_submission WHERE id = $1', [id]);
  return rows[0] || null;
}

export async function updateItem(id, { item_name, specification = null, unit_price, quantity, total_price, urgency_level = null, purchase_link = null }) {
  const client = await procurementDb.connect();
  try {
    await client.query('BEGIN');
    const cur = await client.query('SELECT status, submission_id FROM procurement_submission_items WHERE id = $1 FOR UPDATE', [id]);
    if (cur.rowCount === 0) {
      await client.query('ROLLBACK');
      return null;
    }
    if (cur.rows[0].status !== 'pending') {
      await client.query('ROLLBACK');
      const err = new Error('Item status not pending');
      err.code = 'NOT_PENDING';
      throw err;
    }

    const colRes = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'procurement_submission_items'");
    const existingCols = new Set(colRes.rows.map(r => r.column_name));
    const sets = ['item_name = $1', 'specification = $2', 'unit_price = $3', 'quantity = $4', 'total_price = $5'];
    const vals = [item_name, specification, unit_price, quantity, total_price];
    if (existingCols.has('urgency_level')) {
      sets.push(`urgency_level = $${vals.length + 1}`);
      vals.push(urgency_level);
    }
    if (existingCols.has('purchase_link')) {
      sets.push(`purchase_link = $${vals.length + 1}`);
      vals.push(purchase_link);
    }
    vals.push(id);
    const q = `
      UPDATE procurement_submission_items
      SET ${sets.join(', ')},
          updated_at = now()
      WHERE id = $${vals.length}
      RETURNING *`;
    const { rows } = await client.query(q, vals);

    const submissionId = cur.rows[0].submission_id;
    const sumRes = await client.query(
      'SELECT COALESCE(SUM(total_price),0) AS overall_total FROM procurement_submission_items WHERE submission_id = $1',
      [submissionId]
    );
    const overall = sumRes.rows[0]?.overall_total ?? 0;
    await client.query('UPDATE procurement_submission SET total_price = $1 WHERE id = $2', [overall, submissionId]);

    await client.query('COMMIT');
    return rows[0];
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function deleteItem(id, actorUserId) {
  const client = await procurementDb.connect();
  try {
    await client.query('BEGIN');

    const q = `SELECT psi.*, ps.requester_id FROM procurement_submission_items psi
      JOIN procurement_submission ps ON psi.submission_id = ps.id
      WHERE psi.id = $1 FOR UPDATE`;
    const cur = await client.query(q, [id]);
    if (cur.rowCount === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    const row = cur.rows[0];
    if (String(row.requester_id) !== String(actorUserId)) {
      await client.query('ROLLBACK');
      const err = new Error('Forbidden');
      err.code = 'FORBIDDEN';
      throw err;
    }

    if (row.status !== 'pending') {
      await client.query('ROLLBACK');
      const err = new Error('Item status not pending');
      err.code = 'NOT_PENDING';
      throw err;
    }

    const delRes = await client.query('DELETE FROM procurement_submission_items WHERE id = $1 RETURNING *', [id]);
    const deleted = delRes.rows[0];

    const sumRes = await client.query('SELECT COALESCE(SUM(total_price),0) AS overall_total FROM procurement_submission_items WHERE submission_id = $1', [deleted.submission_id]);
    const overall = sumRes.rows[0]?.overall_total ?? 0;
    await client.query('UPDATE procurement_submission SET total_price = $1 WHERE id = $2', [overall, deleted.submission_id]);

    await client.query('COMMIT');
    return deleted;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Update a submission that is still in 'draft' status.
 * Replaces purpose, study_program_id, lab_id and rebuilds items.
 * Only the owner can update, and only while status = 'draft'.
 */
export async function updateDraftSubmission(id, actorUserId, { study_program_id, lab_id, purpose, items }) {
  const client = await procurementDb.connect();
  try {
    await client.query('BEGIN');

    const subRes = await client.query('SELECT * FROM procurement_submission WHERE id = $1 FOR UPDATE', [id]);
    if (subRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return null;
    }
    const submission = subRes.rows[0];
    if (String(submission.requester_id) !== String(actorUserId)) {
      await client.query('ROLLBACK');
      const err = new Error('Forbidden'); err.code = 'FORBIDDEN'; throw err;
    }
    if (submission.status !== 'draft') {
      await client.query('ROLLBACK');
      const err = new Error('Only draft submissions can be edited'); err.code = 'NOT_DRAFT'; throw err;
    }

    // Build normalized item rows
    const normalizedItems = (items || []).map((it) => {
      const unit = Number(it.unit_price);
      const qty = Number(it.quantity);
      const rawLink = String(it.purchase_link ?? it.purchaseLink ?? '').trim();
      return {
        item_name: it.item_name,
        specification: it.specification || null,
        unit_price: unit,
        quantity: qty,
        total_price: unit * qty,
        inventory_id: it.inventoryId ?? it.inventory_id ?? null,
        urgency_level: it.urgency_level ?? it.urgency ?? null,
        purchase_link: rawLink || null,
        unit: typeof it.unit === 'string' ? it.unit.trim() || null : null,
      };
    });
    const overall_total = normalizedItems.reduce((s, it) => s + it.total_price, 0);

    // Master item fields (mirrors createSubmission logic)
    const masterItemName = normalizedItems.length === 1
      ? normalizedItems[0].item_name
      : normalizedItems.map(i => i.item_name).join(' ; ');
    const masterSpec = normalizedItems.length === 1
      ? (normalizedItems[0].specification || null)
      : normalizedItems.map(i => i.specification || '').join(' ; ');
    const masterQtyText = normalizedItems.length === 1
      ? String(normalizedItems[0].quantity)
      : normalizedItems.map(i => i.quantity).join(' ; ');
    const masterUnitText = normalizedItems.length === 1
      ? String(normalizedItems[0].unit_price)
      : normalizedItems.map(i => i.unit_price).join(' ; ');

    // Update the submission header
    await client.query(
      `UPDATE procurement_submission
         SET purpose = $1, study_program_id = $2, lab_id = $3,
             item_name = $4, specification = $5, quantity_text = $6,
             unit_price_text = $7, total_price = $8, updated_at = now()
       WHERE id = $9`,
      [purpose || null, study_program_id || null, lab_id || null,
       masterItemName, masterSpec, masterQtyText, masterUnitText, overall_total, id]
    );

    // Replace items: delete old pending items and insert new ones
    await client.query('DELETE FROM procurement_submission_items WHERE submission_id = $1', [id]);

    // detect if inventory_id column exists so we can persist it if provided
    const colRes = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'procurement_submission_items'");
    const existingCols = new Set(colRes.rows.map(r => r.column_name));
    const hasInventoryCol = existingCols.has('inventory_id');

    for (const it of normalizedItems) {
      const cols = ['submission_id', 'item_name', 'specification', 'unit_price', 'quantity', 'total_price', 'status'];
      const vals = [id, it.item_name, it.specification, it.unit_price, it.quantity, it.total_price, 'draft'];
      if (hasInventoryCol && it.inventory_id != null) {
        cols.push('inventory_id');
        vals.push(it.inventory_id);
      }
      if (existingCols.has('urgency_level')) {
        cols.push('urgency_level');
        vals.push(it.urgency_level);
      }
      if (existingCols.has('purchase_link')) {
        cols.push('purchase_link');
        vals.push(it.purchase_link);
      }
      if (existingCols.has('unit') && it.unit) {
        cols.push('unit');
        vals.push(it.unit);
      }
      const placeholders = vals.map((_, idx) => `$${idx + 1}`).join(',');
      await client.query(
        `INSERT INTO procurement_submission_items (${cols.join(', ')}, created_at, updated_at)
         VALUES (${placeholders}, now(), now())`,
        vals
      );
    }

    await client.query('COMMIT');
    return await findByIdWithItems(id);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function deleteSubmission(id, actorUserId) {
  const client = await procurementDb.connect();
  try {
    await client.query('BEGIN');

    const subRes = await client.query('SELECT * FROM procurement_submission WHERE id = $1 FOR UPDATE', [id]);
    if (subRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return null;
    }
    const submission = subRes.rows[0];
    if (String(submission.requester_id) !== String(actorUserId)) {
      await client.query('ROLLBACK');
      const err = new Error('Forbidden');
      err.code = 'FORBIDDEN';
      throw err;
    }

  const itemsRes = await client.query('SELECT id, status FROM procurement_submission_items WHERE submission_id = $1 FOR UPDATE', [id]);
  const allowedStatus = String(submission.status).toLowerCase() === 'draft' ? 'draft' : 'pending';
  const notPending = itemsRes.rows.find(r => String(r.status).toLowerCase() !== allowedStatus);
    if (notPending) {
      await client.query('ROLLBACK');
      const err = new Error('Some items are not pending');
      err.code = 'NOT_PENDING_ITEMS';
      throw err;
    }

    await client.query('DELETE FROM procurement_submission_items WHERE submission_id = $1', [id]);
    const delSub = await client.query('DELETE FROM procurement_submission WHERE id = $1 RETURNING *', [id]);

    await client.query('COMMIT');
    return delSub.rows[0];
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function getSubmissionsByRequester(requesterId, { limit = 20, offset = 0, status = null } = {}) {
  // return submissions with items aggregated as JSON array
  // If status is provided, filter submissions by status
  let baseWhere = 's.requester_id = $1';
  const params = [requesterId];
  let idx = 2;

  if (status) {
    baseWhere += ` AND lower(s.status) = $${idx}`;
    params.push(status);
    idx++;
  }

  // add limit and offset
  params.push(limit);
  params.push(offset);

  const itemsAggregationSubquery = await buildItemsAggregationSubquery();
  const q = `
    SELECT s.*, COALESCE(items.items, '[]') AS items FROM procurement_submission s
    LEFT JOIN (
      ${itemsAggregationSubquery}
    ) items ON items.submission_id = s.id
    WHERE ${baseWhere}
    ORDER BY s.created_at DESC
    LIMIT $${idx} OFFSET $${idx + 1}
  `;
  const { rows } = await procurementDb.query(q, params);
  return rows;
}

export async function setFundingChoice(submissionId, fundingChoice, actorUserId) {
  const client = await procurementDb.connect();
  try {
    await client.query('BEGIN');

    const subRes = await client.query('SELECT * FROM procurement_submission WHERE id = $1 FOR UPDATE', [submissionId]);
    if (subRes.rowCount === 0) { await client.query('ROLLBACK'); return null; }
    const submission = subRes.rows[0];

    // Permission: allow owner or TPA/kaur to set
    const isOwner = String(submission.requester_id) === String(actorUserId);
    // Note: role check should be done at controller level; here we trust caller.

    // Ensure funding tracking columns exist on procurement_submission table
    const colRes = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'procurement_submission' AND column_name IN ('funding_choice','funding_set_by','funding_set_at')");
    const existing = new Set(colRes.rows.map(r => r.column_name));
    if (!existing.has('funding_choice')) {
      await client.query("ALTER TABLE procurement_submission ADD COLUMN IF NOT EXISTS funding_choice varchar(64)");
    }
    if (!existing.has('funding_set_by')) {
      await client.query("ALTER TABLE procurement_submission ADD COLUMN IF NOT EXISTS funding_set_by varchar(64)");
    }
    if (!existing.has('funding_set_at')) {
      await client.query("ALTER TABLE procurement_submission ADD COLUMN IF NOT EXISTS funding_set_at timestamp without time zone");
    }

    await client.query('UPDATE procurement_submission SET funding_choice = $1, funding_set_by = $2, funding_set_at = now(), updated_at = now() WHERE id = $3', [fundingChoice, actorUserId, submissionId]);
    await client.query('COMMIT');
    return await findByIdWithItems(submissionId);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Paginated list for TPA (non-draft). Optional filters match query params on GET /submission/all.
 * @returns {{ rows: any[], total: number }}
 */
export async function getAllSubmissions({
  limit = 10,
  offset = 0,
  status = null,
  studyProgramId = null,
  labId = null,
  q = null,
  /** TPA "See details" list: hide pre-laboran stages (waiting, approved_by_kordas). */
  tpaPipelineList = false,
} = {}) {
  const itemsAggregationSubquery = await buildItemsAggregationSubquery();
  const conditions = [`lower(COALESCE(s.status, '')) NOT IN ('draft', 'drafted')`];
  const params = [];

  const statusParam =
    status != null && String(status).trim() !== '' ? String(status).trim() : null;
  const requestedStatuses = statusParam
    ? statusParam.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
    : [];

  if (requestedStatuses.length === 1) {
    params.push(requestedStatuses[0]);
    conditions.push(`lower(trim(COALESCE(s.status, ''))) = $${params.length}`);
  } else if (requestedStatuses.length > 1) {
    params.push(requestedStatuses);
    conditions.push(`lower(trim(COALESCE(s.status, ''))) = ANY($${params.length}::text[])`);
  }

  // Hide closed reimbursements from the general TPA list unless explicitly requested.
  if (!requestedStatuses.includes('closed')) {
    conditions.push(`lower(trim(COALESCE(s.status, ''))) != 'closed'`);
  }

  if (tpaPipelineList) {
    conditions.push(
      `lower(trim(COALESCE(s.status, ''))) NOT IN ('waiting', 'approved_by_kordas', 'approved_by_koordinator_asisten')`,
    );
  }

  if (studyProgramId != null && String(studyProgramId).trim() !== '') {
    params.push(String(studyProgramId).trim());
    conditions.push(`s.study_program_id = $${params.length}`);
  }
  if (labId != null && String(labId).trim() !== '') {
    params.push(String(labId).trim());
    conditions.push(`s.lab_id = $${params.length}`);
  }
  if (q != null && String(q).trim() !== '') {
    const raw = String(q).trim();
    const escaped = raw.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
    const like = `%${escaped}%`;
    params.push(like);
    conditions.push(
      `(COALESCE(s.purpose, '') ILIKE $${params.length} ESCAPE '\\'
        OR COALESCE(s.submission_reference, '') ILIKE $${params.length} ESCAPE '\\'
        OR CAST(s.id AS TEXT) ILIKE $${params.length} ESCAPE '\\')`
    );
  }

  const whereSql = conditions.join(' AND ');
  const countQ = `SELECT COUNT(*)::int AS c FROM procurement_submission s WHERE ${whereSql}`;
  const { rows: countRows } = await procurementDb.query(countQ, params);
  const total = Number(countRows[0]?.c ?? 0);

  const pLimit = params.length + 1;
  const pOffset = params.length + 2;
  const dataParams = [...params, limit, offset];
  const dataQ = `
    SELECT s.*, COALESCE(items.items, '[]') AS items FROM procurement_submission s
    LEFT JOIN (
      ${itemsAggregationSubquery}
    ) items ON items.submission_id = s.id
    WHERE ${whereSql}
    ORDER BY s.created_at DESC
    LIMIT $${pLimit} OFFSET $${pOffset}
  `;
  const { rows } = await procurementDb.query(dataQ, dataParams);
  return { rows, total };
}

/**
 * Return aggregated counts useful for TPA dashboard
 * Returns object with keys: need_process, need_review, on_review, ready_to_pickup, process_reimbursement
 */
export async function getTpaStats() {
  const sk = SQL_PROCUREMENT_STATUS_KEY;
  const q = `SELECT
    COUNT(*) FILTER (WHERE ${sk} = 'approved_by_kaprodi')::int AS need_process,
    COUNT(*) FILTER (
      WHERE ${sk} = 'approved_by_dosen_pembina'
         OR lower(trim(COALESCE(status, ''))) LIKE '%need%'
    )::int AS need_review,
    COUNT(*) FILTER (
      WHERE ${sk} IN ('on_review', 'on_going', 'ongoing')
    )::int AS on_review,
    COUNT(*) FILTER (WHERE ${sk} = 'ready_to_pickup')::int AS ready_to_pickup,
    COUNT(*) FILTER (WHERE ${sk} = 'completed')::int AS process_reimbursement
  FROM procurement_submission
  WHERE ${sk} NOT IN ('draft', 'drafted', 'closed')`;
  const { rows } = await procurementDb.query(q);
  const row = rows[0] || {};
  return {
    need_process: Number(row.need_process) || 0,
    need_review: Number(row.need_review) || 0,
    on_review: Number(row.on_review) || 0,
    ready_to_pickup: Number(row.ready_to_pickup) || 0,
    process_reimbursement: Number(row.process_reimbursement) || 0,
  };
}

/**
 * Return the number of submissions that have reached Kaur Lab.
 * For this dashboard, "waiting" means submissions approved by TPA and
 * waiting for Kaur Lab review.
 */
/** Normal: approved_by_tpa awaiting Kaur. Optional: laboran pass already set approved_by_kaur. */
const SQL_KAUR_LAB_WAITING_WHERE = `
  (
    lower(COALESCE(s.status, '')) = 'approved_by_tpa'
    AND (s.kaur_lab_signature IS NULL OR trim(COALESCE(s.kaur_lab_signature, '')) = '')
  )
  OR (
    lower(COALESCE(s.status, '')) = 'approved_by_kaur'
    AND EXISTS (
      SELECT 1 FROM procurement_submission_laboran_pass_logs lp
      WHERE lp.submission_id = s.id AND lp.pass_kind = 'kaur'
    )
    AND (s.kaur_lab_signature IS NULL OR trim(COALESCE(s.kaur_lab_signature, '')) = '')
  )
`;

export async function getKaurLabStats() {
  const q = `SELECT COUNT(*)::int AS waiting
  FROM procurement_submission s
  WHERE ${SQL_KAUR_LAB_WAITING_WHERE}`;
  const { rows } = await procurementDb.query(q);
  return rows[0] || { waiting: 0 };
}

/**
 * Return submissions that already reached Kaur Lab.
 */
export async function getKaurLabApprovedSubmissions({ limit = 200, offset = 0 } = {}) {
  const itemsAggregationSubquery = await buildItemsAggregationSubquery();
  const q = `
    SELECT s.*, COALESCE(items.items, '[]') AS items
    FROM procurement_submission s
    LEFT JOIN (
      ${itemsAggregationSubquery}
    ) items ON items.submission_id = s.id
    WHERE ${SQL_KAUR_LAB_WAITING_WHERE}
    ORDER BY s.created_at DESC
    LIMIT $1 OFFSET $2
  `;
  const { rows } = await procurementDb.query(q, [limit, offset]);
  return rows;
}

/**
 * Kaprodi review queue — same gate as TPA label "Approved - by Kaur":
 * status approved_by_kaur (Kaur signed OR laboran bypass pass to Kaur), not yet signed by Kaprodi.
 * Also includes approved_by_kaprodi after laboran pass to Kaprodi.
 */
const SQL_KAPRODI_WAITING_WHERE = `
  (
    lower(COALESCE(s.status, '')) = 'approved_by_kaur'
    AND (s.kaprodi_signature IS NULL OR trim(COALESCE(s.kaprodi_signature, '')) = '')
  )
  OR (
    lower(COALESCE(s.status, '')) = 'approved_by_kaprodi'
    AND (s.kaprodi_signature IS NULL OR trim(COALESCE(s.kaprodi_signature, '')) = '')
    AND EXISTS (
      SELECT 1 FROM procurement_submission_laboran_pass_logs lp
      WHERE lp.submission_id = s.id AND lp.pass_kind = 'kaprodi'
    )
  )
`;

/**
 * Return aggregated counts for Kaprodi dashboard (restricted to a study program)
 * Waiting means approved_by_kaur (or laboran-passed to Kaprodi) and Kaprodi has not signed yet.
 */
export async function getKaprodiStats(studyProgramId) {
  // If no studyProgramId provided, return zero to be conservative
  if (!studyProgramId) return { waiting: 0 };
  const q = `SELECT COUNT(*)::int AS waiting
  FROM procurement_submission s
  WHERE ${SQL_KAPRODI_WAITING_WHERE} AND s.study_program_id = $1`;
  const { rows } = await procurementDb.query(q, [studyProgramId]);
  return rows[0] || { waiting: 0 };
}

/**
 * Return submissions forwarded by Kaur for a given study program
 */
export async function getKaprodiApprovedSubmissions({ studyProgramId, limit = 200, offset = 0 } = {}) {
  if (!studyProgramId) return [];
  const itemsAggregationSubquery = await buildItemsAggregationSubquery();
  const q = `
    SELECT s.*, COALESCE(items.items, '[]') AS items
    FROM procurement_submission s
    LEFT JOIN (
      ${itemsAggregationSubquery}
    ) items ON items.submission_id = s.id
    WHERE ${SQL_KAPRODI_WAITING_WHERE} AND s.study_program_id = $1
    ORDER BY s.created_at DESC
    LIMIT $2 OFFSET $3
  `;
  const { rows } = await procurementDb.query(q, [studyProgramId, limit, offset]);
  return rows;
}

/** SQL expression: normalize status string to snake key (matches Flutter `procurementWorkflowStatusKey`). */
export const SQL_PROCUREMENT_STATUS_KEY = `regexp_replace(
  regexp_replace(lower(trim(COALESCE(status, ''))), '[\\s\\-–—]+', '_', 'g'),
  '_+',
  '_',
  'g'
)`;

/**
 * Return aggregated counts for the currently authenticated user (requester dashboard).
 * Keys: total, waiting, ready_to_pickup, rejected, drafted
 */
export async function getUserStats(userId) {
  const uid = userId == null ? '' : String(userId).trim();
  const q = `SELECT
    COUNT(*)::int AS total,
    COUNT(*) FILTER (
      WHERE ${SQL_PROCUREMENT_STATUS_KEY} = 'waiting'
         OR lower(trim(COALESCE(status, ''))) LIKE '%need%'
    )::int AS waiting,
    COUNT(*) FILTER (
      WHERE ${SQL_PROCUREMENT_STATUS_KEY} = 'ready_to_pickup'
    )::int AS ready_to_pickup,
    COUNT(*) FILTER (WHERE ${SQL_PROCUREMENT_STATUS_KEY} = 'rejected')::int AS rejected,
    COUNT(*) FILTER (
      WHERE ${SQL_PROCUREMENT_STATUS_KEY} IN ('draft', 'drafted')
    )::int AS drafted
  FROM procurement_submission
  WHERE trim(COALESCE(requester_id::text, '')) = $1`;
  const { rows } = await procurementDb.query(q, [uid]);
  const row = rows[0] || {};
  return {
    total: Number(row.total) || 0,
    waiting: Number(row.waiting) || 0,
    ready_to_pickup: Number(row.ready_to_pickup) || 0,
    rejected: Number(row.rejected) || 0,
    drafted: Number(row.drafted) || 0,
  };
}

/**
 * Count procurement submissions for a lab with status strictly equal to [status] (normalized lower-case).
 */
export async function countProcurementSubmissionsForLabByStatus(labId, status) {
  const st = String(status || '').trim().toLowerCase();
  if (!labId || !st) return 0;
  const q = `SELECT COUNT(*)::int AS c
    FROM procurement_submission
    WHERE lab_id = $1
      AND lower(trim(COALESCE(status, ''))) = $2`;
  const { rows } = await procurementDb.query(q, [labId, st]);
  return rows[0]?.c ?? 0;
}

/**
 * Count procurement submissions tied to a lab with status strictly equal to waiting
 * (dosen pembina dashboard; matches the lab inbox list endpoint).
 */
export async function countWaitingProcurementSubmissionsForLab(labId) {
  return countProcurementSubmissionsForLabByStatus(labId, 'waiting');
}

/**
 * All non-draft submissions for a given laboratory (procurement_submission.lab_id).
 */
export async function getSubmissionsForLab(labId, { limit = 50, offset = 0, status = null } = {}) {
  if (!labId) return [];
  let baseWhere = "s.lab_id = $1 AND lower(COALESCE(s.status, '')) NOT IN ('draft', 'drafted')";
  const params = [labId];
  let idx = 2;

  if (status) {
    baseWhere += ` AND lower(trim(COALESCE(s.status, ''))) = $${idx}`;
    params.push(String(status).toLowerCase());
    idx++;
  }

  params.push(limit);
  params.push(offset);

  const itemsAggregationSubquery = await buildItemsAggregationSubquery();
  const q = `
    SELECT s.*, COALESCE(items.items, '[]') AS items FROM procurement_submission s
    LEFT JOIN (
      ${itemsAggregationSubquery}
    ) items ON items.submission_id = s.id
    WHERE ${baseWhere}
    ORDER BY s.created_at DESC
    LIMIT $${idx} OFFSET $${idx + 1}
  `;
  const { rows } = await procurementDb.query(q, params);
  return rows;
}

/**
 * List submissions for dosen pembina supervised lab — same lab resolution as getDosenPembinaDashboardStats.
 * Inbox: **approved_by_kordas** (after Assistant Coordinator approval).
 */
export async function getDosenPembinaLabSubmissionsPayload(userId, { limit = 50, offset = 0 } = {}) {
  const resolved = await resolveDosenPembinaLabContext(userId);
  if (!resolved.labId) {
    return {
      rows: [],
      lab_id: null,
      lab_name: null,
      lab_source: resolved.source,
    };
  }
  let labName = resolved.labName ?? null;
  if (!labName && resolved.labId) {
    labName = await _registrationLaboratoryDisplayName(resolved.labId);
  }
  const rows = await getSubmissionsForLab(resolved.labId, {
    limit,
    offset,
    status: 'approved_by_kordas',
  });
  return {
    rows,
    lab_id: resolved.labId,
    lab_name: labName,
    lab_source: resolved.source,
  };
}

/**
 * Resolve supervised lab UUID for dosen pembina:
 * 1) user_profiles.procurement_supervised_lab_id — used as soon as it is set (dev bypass below is skipped).
 * 2) NODE_ENV=development only: PROCUREMENT_DOSEN_PEMBINA_DEV_FALLBACK_LAB_ID (explicit UUID).
 * 3) NODE_ENV=development only: lookup laboratories by PROCUREMENT_DOSEN_PEMBINA_DEV_FALLBACK_LAB_NAME (default "daspro").
 *
 * Production with no assignment returns labId=null.
 */
export async function resolveDosenPembinaLabContext(userId) {
  const uid = String(userId);

  try {
    const profileRes = await userManagementDb.query(
      `SELECT procurement_supervised_lab_id FROM user_profiles
       WHERE user_id = $1 AND deleted_at IS NULL LIMIT 1`,
      [uid]
    );
    const fromProfile = profileRes.rows[0]?.procurement_supervised_lab_id ?? null;
    if (fromProfile) {
      return { labId: fromProfile, source: 'profile' };
    }
  } catch (e) {
    console.error('resolveDosenPembinaLabContext: user_profiles.procurement_supervised_lab_id unreadable (migrate user-management?):', e?.message || e);
  }

  const isDev = (process.env.NODE_ENV || '').toLowerCase() === 'development';
  if (!isDev) return { labId: null, source: 'none' };

  const envUuid = process.env.PROCUREMENT_DOSEN_PEMBINA_DEV_FALLBACK_LAB_ID?.trim();
  if (envUuid) {
    return { labId: envUuid, source: 'env_fallback' };
  }

  const fallbackName = (process.env.PROCUREMENT_DOSEN_PEMBINA_DEV_FALLBACK_LAB_NAME || 'daspro').trim();
  if (!fallbackName) return { labId: null, source: 'none' };

  try {
    const lr = await registrationDb.query(
      `SELECT id, name FROM laboratories
       WHERE lower(trim(name)) = lower(trim($1))
       ORDER BY created_at DESC NULLS LAST
       LIMIT 1`,
      [fallbackName]
    );
    if (lr.rowCount > 0) {
      return {
        labId: lr.rows[0].id,
        labName: lr.rows[0].name ?? null,
        source: 'registration_name_fallback',
      };
    }
  } catch (e) {
    console.error('resolveDosenPembinaLabContext: registration lookup failed', e?.message || e);
  }
  return { labId: null, source: 'none' };
}

async function _registrationLaboratoryDisplayName(labId) {
  try {
    const r = await registrationDb.query('SELECT name FROM laboratories WHERE id = $1 LIMIT 1', [labId]);
    return r.rows[0]?.name ?? null;
  } catch {
    return null;
  }
}

export async function getDosenPembinaDashboardStats(userId) {
  const resolved = await resolveDosenPembinaLabContext(userId);
  if (!resolved.labId) {
    return {
      waiting: 0,
      lab_id: null,
      lab_name: null,
      lab_source: resolved.source,
    };
  }
  let labName = resolved.labName ?? null;
  if (!labName && resolved.labId) {
    labName = await _registrationLaboratoryDisplayName(resolved.labId);
  }
  const pending = await countProcurementSubmissionsForLabByStatus(
    resolved.labId,
    'approved_by_kordas',
  );
  return {
    pending,
    waiting: pending,
    lab_id: resolved.labId,
    lab_name: labName,
    lab_source: resolved.source,
  };
}

/**
 * KO asisten: same supervised lab as pembina; inbox is **waiting** (first lab review).
 */
export async function getKoordinatorAsistenDashboardStats(userId) {
  const resolved = await resolveDosenPembinaLabContext(userId);
  if (!resolved.labId) {
    return {
      pending: 0,
      lab_id: null,
      lab_name: null,
      study_program_id: null,
      lab_source: resolved.source,
    };
  }
  let labName = resolved.labName ?? null;
  let studyProgramId = null;
  if (resolved.labId) {
    if (!labName) {
      labName = await _registrationLaboratoryDisplayName(resolved.labId);
    }
    try {
      const lr = await registrationDb.query(
        'SELECT study_program_id FROM laboratories WHERE id = $1 LIMIT 1',
        [resolved.labId],
      );
      studyProgramId = lr.rows[0]?.study_program_id ?? null;
    } catch {
      studyProgramId = null;
    }
  }
  const pending = await countWaitingProcurementSubmissionsForLab(resolved.labId);
  return {
    pending,
    lab_id: resolved.labId,
    lab_name: labName,
    study_program_id: studyProgramId,
    lab_source: resolved.source,
  };
}

/** Inbox list for KO asisten: same lab as pembina, status **waiting**. */
export async function getKoordinatorAsistenLabSubmissionsPayload(userId, opts = {}) {
  const resolved = await resolveDosenPembinaLabContext(userId);
  if (!resolved.labId) {
    return {
      rows: [],
      lab_id: null,
      lab_name: null,
      lab_source: resolved.source,
    };
  }
  let labName = resolved.labName ?? null;
  if (!labName && resolved.labId) {
    labName = await _registrationLaboratoryDisplayName(resolved.labId);
  }
  const rows = await getSubmissionsForLab(resolved.labId, {
    ...opts,
    status: 'waiting',
  });
  return {
    rows,
    lab_id: resolved.labId,
    lab_name: labName,
    lab_source: resolved.source,
  };
}

export async function verifyItem(itemId, actorUserId) {
  const client = await procurementDb.connect();
  try {
    await client.query('BEGIN');

    const q = `SELECT psi.*, ps.status AS submission_status, ps.id AS submission_id
      FROM procurement_submission_items psi
      JOIN procurement_submission ps ON psi.submission_id = ps.id
      WHERE psi.id = $1 FOR UPDATE`;
    const cur = await client.query(q, [itemId]);
    if (cur.rowCount === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    const row = cur.rows[0];
    if (row.status !== 'pending') {
      await client.query('ROLLBACK');
      const err = new Error('Item status must be pending to verify');
      err.code = 'NOT_PENDING';
      err.status = 409;
      throw err;
    }

    const updRes = await client.query(
      `UPDATE procurement_submission_items SET status = $1, approved_by = $2, approved_at = now() WHERE id = $3 RETURNING *`,
      ['on_review', actorUserId, itemId]
    );
    const updatedItem = updRes.rows[0];

    const countRes = await client.query(
      `SELECT COUNT(*) FILTER (WHERE status != 'on_review') AS non_review_count FROM procurement_submission_items WHERE submission_id = $1`,
      [row.submission_id]
    );
    const nonReview = Number(countRes.rows[0].non_review_count || 0);

    let updatedSubmission = null;
    if (nonReview === 0 && row.submission_status === 'submitted') {
      const updSub = await client.query(
        `UPDATE procurement_submission SET status = $1, updated_at = now() WHERE id = $2 RETURNING *`,
        ['on_review', row.submission_id]
      );
      updatedSubmission = updSub.rows[0];
    }

    await client.query('COMMIT');
    return { item: updatedItem, submission: updatedSubmission };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function getItemsBySubmissionId(submissionId) {
  return await getItemsBySubmissionIdWithUnit(submissionId);
}

export async function cancelSubmission(submissionId, actorUserId) {
  const client = await procurementDb.connect();
  try {
    await client.query('BEGIN');

    const subRes = await client.query('SELECT * FROM procurement_submission WHERE id = $1 FOR UPDATE', [submissionId]);
    if (subRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return null;
    }
    const submission = subRes.rows[0];
    if (String(submission.requester_id) !== String(actorUserId)) {
      await client.query('ROLLBACK');
      const err = new Error('Forbidden');
      err.code = 'FORBIDDEN';
      throw err;
    }

    // Only allow cancelling when submission is in 'waiting' state
    if (submission.status !== 'waiting') {
      await client.query('ROLLBACK');
      const err = new Error('Submission cannot be cancelled unless status is waiting');
      err.code = 'NOT_CANCELLABLE';
      throw err;
    }
    // Delete items and submission (treat cancel as delete)
    // Before deleting, restore inventory stock for any inventory-backed items that had reserved stock
    // First check whether procurement_submission_items has inventory_id column
    const colCheck = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'procurement_submission_items' AND column_name = 'inventory_id'");
    const hasInvCol = colCheck.rowCount > 0;
    let itemsRes;
    if (hasInvCol) {
      // lock item rows so concurrent operations don't interfere
      itemsRes = await client.query('SELECT id, inventory_id, quantity, status FROM procurement_submission_items WHERE submission_id = $1 FOR UPDATE', [submissionId]);
    } else {
      // inventory_id column missing: select without it and treat as no inventory-backed items
      itemsRes = await client.query('SELECT id, quantity, status FROM procurement_submission_items WHERE submission_id = $1 FOR UPDATE', [submissionId]);
    }
    const itemsToRestore = hasInvCol ? itemsRes.rows.filter(r => r.inventory_id != null && r.status !== 'draft' && r.status !== 'rejected') : [];
    if (itemsToRestore.length > 0) {
      // ensure procurement_inventory table exists
      const tableRes = await client.query("SELECT to_regclass('public.procurement_inventory') as reg");
      const hasInventoryTable = tableRes.rows[0] && tableRes.rows[0].reg != null;
      if (hasInventoryTable) {
        for (const it of itemsToRestore) {
          try {
            // Attempt to add back quantity; use UPDATE ... RETURNING to confirm it changed
            const qty = Number(it.quantity) || 0;
            const upd = await client.query('UPDATE procurement_inventory SET stock = stock + $1, updated_at = now() WHERE id = $2 RETURNING id, stock', [qty, it.inventory_id]);
            if (upd.rowCount === 0) {
              // inventory id not found — log and continue
              console.error(`cancelSubmission: inventory id ${it.inventory_id} not found while restoring qty=${qty}`);
              continue;
            }
                // create inventory log showing restoration due to cancel
                try {
                  const requester = submission.requester_name || null;
                  await inventoryLogService.createLog(client, {
                    inventory_id: it.inventory_id,
                    item_name: null,
                    change_amount: Number(qty) || 0,
                    action: 'restored',
                    note: `Cancelled by requester ${requester || 'unknown'}`,
                    submission_id: submissionId,
                    requester_name: requester,
                    created_by: null,
                  });
                } catch (el) {
                  console.error('Failed to create inventory log (restore on cancel):', el?.message || el);
                }
          } catch (e) {
            // non-fatal: log and continue restoring other items
            console.error('Failed to restore inventory during cancelSubmission:', e?.message || e);
          }
        }
      }
    }

    const deletedItemsRes = await client.query('DELETE FROM procurement_submission_items WHERE submission_id = $1 RETURNING *', [submissionId]);
    const deletedItems = deletedItemsRes.rows;

    const delSubRes = await client.query('DELETE FROM procurement_submission WHERE id = $1 RETURNING *', [submissionId]);
    const deletedSubmission = delSubRes.rows[0];

    await client.query('COMMIT');

    // Return the deleted submission and items for audit/UI
    return { ...deletedSubmission, items: deletedItems };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Change submission status manually (TPA role).
 * - Updates procurement_submission.status
 * - If newStatus is 'approved' or 'rejected', also update item statuses accordingly (best-effort)
 */
/**
 * Persist the supervising lecturer's hand-drawn signature for a submission.
 * Safe against environments that haven't applied the signature columns yet:
 * we detect column presence and silently skip the optional metadata columns
 * when missing, so older deployments don't 500 the endpoint.
 *
 * Returns the updated submission row (without items) or `null` when the
 * submission cannot be found.
 */
export async function setDosenPembinaSignature(submissionId, actorUserId, signatureDataUri, signerFromJwt = null) {
  const client = await procurementDb.connect();
  try {
    await client.query('BEGIN');

    const cur = await client.query('SELECT id FROM procurement_submission WHERE id = $1 FOR UPDATE', [submissionId]);
    if (cur.rowCount === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    const colRes = await client.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'procurement_submission'"
    );
    const existing = new Set(colRes.rows.map(r => r.column_name));

    if (!existing.has('dosen_pembina_signature')) {
      await client.query('ROLLBACK');
      const err = new Error('Signature column not available on this database. Run migrations.');
      err.code = 'NO_SIGNATURE_COLUMN';
      throw err;
    }

    const sets = ['dosen_pembina_signature = $1'];
    const vals = [signatureDataUri];
    if (existing.has('dosen_pembina_signed_by')) {
      sets.push(`dosen_pembina_signed_by = $${vals.length + 1}`);
      vals.push(actorUserId == null ? null : String(actorUserId));
    }
    if (existing.has('dosen_pembina_signed_at')) {
      sets.push(`dosen_pembina_signed_at = now()`);
    }
    if (signerFromJwt && typeof signerFromJwt === 'object' && existing.has('dosen_pembina_signer_name')) {
      sets.push(`dosen_pembina_signer_name = $${vals.length + 1}`);
      const nm = signerFromJwt.name != null ? String(signerFromJwt.name).trim() : '';
      vals.push(nm || null);
    }
    if (signerFromJwt && typeof signerFromJwt === 'object' && existing.has('dosen_pembina_signer_nipnim')) {
      sets.push(`dosen_pembina_signer_nipnim = $${vals.length + 1}`);
      const idn = signerFromJwt.nipnim != null ? String(signerFromJwt.nipnim).trim() : '';
      vals.push(idn || null);
    }
    vals.push(submissionId);
    const sql = `UPDATE procurement_submission SET ${sets.join(', ')}, updated_at = now() WHERE id = $${vals.length} RETURNING *`;
    const { rows } = await client.query(sql, vals);

    await client.query('COMMIT');
    return rows[0] || null;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Persist Koordinator Asisten (kordas) hand-drawn signature while the
 * submission is **waiting** (before KO flips to approved_by_kordas).
 * Column detection matches {@link setDosenPembinaSignature}.
 */
export async function setKordasSignature(submissionId, actorUserId, signatureDataUri, signerFromJwt = null) {
  const client = await procurementDb.connect();
  try {
    await client.query('BEGIN');

    const cur = await client.query('SELECT id FROM procurement_submission WHERE id = $1 FOR UPDATE', [submissionId]);
    if (cur.rowCount === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    const colRes = await client.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'procurement_submission'"
    );
    const existing = new Set(colRes.rows.map(r => r.column_name));

    if (!existing.has('kordas_signature')) {
      await client.query('ROLLBACK');
      const err = new Error('Kordas signature column not available on this database. Run migrations.');
      err.code = 'NO_SIGNATURE_COLUMN';
      throw err;
    }

    const sets = ['kordas_signature = $1'];
    const vals = [signatureDataUri];
    if (existing.has('kordas_signed_by')) {
      sets.push(`kordas_signed_by = $${vals.length + 1}`);
      vals.push(actorUserId == null ? null : String(actorUserId));
    }
    if (existing.has('kordas_signed_at')) {
      sets.push(`kordas_signed_at = now()`);
    }
    if (signerFromJwt && typeof signerFromJwt === 'object' && existing.has('kordas_signer_name')) {
      sets.push(`kordas_signer_name = $${vals.length + 1}`);
      const nm = signerFromJwt.name != null ? String(signerFromJwt.name).trim() : '';
      vals.push(nm || null);
    }
    if (signerFromJwt && typeof signerFromJwt === 'object' && existing.has('kordas_signer_nipnim')) {
      sets.push(`kordas_signer_nipnim = $${vals.length + 1}`);
      const idn = signerFromJwt.nipnim != null ? String(signerFromJwt.nipnim).trim() : '';
      vals.push(idn || null);
    }
    vals.push(submissionId);
    const sql = `UPDATE procurement_submission SET ${sets.join(', ')}, updated_at = now() WHERE id = $${vals.length} RETURNING *`;
    const { rows } = await client.query(sql, vals);

    await client.query('COMMIT');
    return rows[0] || null;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Persist Kaur Lab hand-drawn signature while the submission is **approved_by_tpa**
 * (before Kaur changes status to approved_by_kaur).
 * Column detection matches {@link setKordasSignature}.
 */
export async function setKaurLabSignature(submissionId, actorUserId, signatureDataUri, signerFromJwt = null) {
  const client = await procurementDb.connect();
  try {
    await client.query('BEGIN');

    const cur = await client.query('SELECT id FROM procurement_submission WHERE id = $1 FOR UPDATE', [submissionId]);
    if (cur.rowCount === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    const colRes = await client.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'procurement_submission'"
    );
    const existing = new Set(colRes.rows.map(r => r.column_name));

    if (!existing.has('kaur_lab_signature')) {
      await client.query('ROLLBACK');
      const err = new Error('Kaur Lab signature column not available on this database. Run migrations.');
      err.code = 'NO_SIGNATURE_COLUMN';
      throw err;
    }

    const sets = ['kaur_lab_signature = $1'];
    const vals = [signatureDataUri];
    if (existing.has('kaur_lab_signed_by')) {
      sets.push(`kaur_lab_signed_by = $${vals.length + 1}`);
      vals.push(actorUserId == null ? null : String(actorUserId));
    }
    if (existing.has('kaur_lab_signed_at')) {
      sets.push(`kaur_lab_signed_at = now()`);
    }
    if (signerFromJwt && typeof signerFromJwt === 'object' && existing.has('kaur_lab_signer_name')) {
      sets.push(`kaur_lab_signer_name = $${vals.length + 1}`);
      const nm = signerFromJwt.name != null ? String(signerFromJwt.name).trim() : '';
      vals.push(nm || null);
    }
    if (signerFromJwt && typeof signerFromJwt === 'object' && existing.has('kaur_lab_signer_nipnim')) {
      sets.push(`kaur_lab_signer_nipnim = $${vals.length + 1}`);
      const idn = signerFromJwt.nipnim != null ? String(signerFromJwt.nipnim).trim() : '';
      vals.push(idn || null);
    }
    vals.push(submissionId);
    const sql = `UPDATE procurement_submission SET ${sets.join(', ')}, updated_at = now() WHERE id = $${vals.length} RETURNING *`;
    const { rows } = await client.query(sql, vals);

    await client.query('COMMIT');
    return rows[0] || null;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Persist Kaprodi hand-drawn signature while the submission is **approved_by_kaur**
 * (before Kaprodi changes status to approved_by_kaprodi).
 * Column detection matches {@link setKaurLabSignature}.
 */
export async function setKaprodiSignature(submissionId, actorUserId, signatureDataUri, signerFromJwt = null) {
  const client = await procurementDb.connect();
  try {
    await client.query('BEGIN');

    const cur = await client.query('SELECT id FROM procurement_submission WHERE id = $1 FOR UPDATE', [submissionId]);
    if (cur.rowCount === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    const colRes = await client.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'procurement_submission'"
    );
    const existing = new Set(colRes.rows.map(r => r.column_name));

    if (!existing.has('kaprodi_signature')) {
      await client.query('ROLLBACK');
      const err = new Error('Kaprodi signature column not available on this database. Run migrations.');
      err.code = 'NO_SIGNATURE_COLUMN';
      throw err;
    }

    const sets = ['kaprodi_signature = $1'];
    const vals = [signatureDataUri];
    if (existing.has('kaprodi_signed_by')) {
      sets.push(`kaprodi_signed_by = $${vals.length + 1}`);
      vals.push(actorUserId == null ? null : String(actorUserId));
    }
    if (existing.has('kaprodi_signed_at')) {
      sets.push(`kaprodi_signed_at = now()`);
    }
    if (signerFromJwt && typeof signerFromJwt === 'object' && existing.has('kaprodi_signer_name')) {
      sets.push(`kaprodi_signer_name = $${vals.length + 1}`);
      const nm = signerFromJwt.name != null ? String(signerFromJwt.name).trim() : '';
      vals.push(nm || null);
    }
    if (signerFromJwt && typeof signerFromJwt === 'object' && existing.has('kaprodi_signer_nipnim')) {
      sets.push(`kaprodi_signer_nipnim = $${vals.length + 1}`);
      const idn = signerFromJwt.nipnim != null ? String(signerFromJwt.nipnim).trim() : '';
      vals.push(idn || null);
    }
    vals.push(submissionId);
    const sql = `UPDATE procurement_submission SET ${sets.join(', ')}, updated_at = now() WHERE id = $${vals.length} RETURNING *`;
    const { rows } = await client.query(sql, vals);

    await client.query('COMMIT');
    return rows[0] || null;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Persist requester (pengaju / pihak kedua) signature for handover receipt — **step 1**.
 * Status stays `ready_to_pickup` until laboran signs (step 2).
 */
export async function setRequesterHandoverReceiptSignature(
  submissionId,
  actorUserId,
  signatureDataUri,
  signerFromJwt = null,
) {
  const client = await procurementDb.connect();
  try {
    await client.query('BEGIN');

    const cur = await client.query(
      'SELECT id, tpa_handover_signature FROM procurement_submission WHERE id = $1 FOR UPDATE',
      [submissionId],
    );
    if (cur.rowCount === 0) {
      await client.query('ROLLBACK');
      return null;
    }
    const rowBefore = cur.rows[0];

    const colRes = await client.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'procurement_submission'"
    );
    const existing = new Set(colRes.rows.map((r) => r.column_name));

    if (!existing.has('requester_handover_signature')) {
      await client.query('ROLLBACK');
      const err = new Error(
        'Requester handover signature column not available. Run procurement migrations.',
      );
      err.code = 'NO_SIGNATURE_COLUMN';
      throw err;
    }

    const sets = ['requester_handover_signature = $1'];
    const vals = [signatureDataUri];
    if (existing.has('requester_handover_signed_by')) {
      sets.push(`requester_handover_signed_by = $${vals.length + 1}`);
      vals.push(actorUserId == null ? null : String(actorUserId));
    }
    if (existing.has('requester_handover_signed_at')) {
      sets.push('requester_handover_signed_at = now()');
    }
    if (signerFromJwt && typeof signerFromJwt === 'object' && existing.has('requester_handover_signer_name')) {
      sets.push(`requester_handover_signer_name = $${vals.length + 1}`);
      const nm = signerFromJwt.name != null ? String(signerFromJwt.name).trim() : '';
      vals.push(nm || null);
    }
    if (signerFromJwt && typeof signerFromJwt === 'object' && existing.has('requester_handover_signer_nipnim')) {
      sets.push(`requester_handover_signer_nipnim = $${vals.length + 1}`);
      const idn = signerFromJwt.nipnim != null ? String(signerFromJwt.nipnim).trim() : '';
      vals.push(idn || null);
    }
    // Legacy: laboran signed before requester — complete once requester signs.
    const tpaSig = rowBefore?.tpa_handover_signature;
    const tpaSigned = tpaSig != null && String(tpaSig).trim() !== '';
    if (existing.has('status') && tpaSigned) {
      sets.push(`status = $${vals.length + 1}`);
      vals.push('completed');
    }
    vals.push(submissionId);
    const sql = `UPDATE procurement_submission SET ${sets.join(', ')}, updated_at = now() WHERE id = $${vals.length} RETURNING *`;
    const { rows } = await client.query(sql, vals);
    const updated = rows[0] || null;

    if (updated) {
      const signerName =
        signerFromJwt?.name != null ? String(signerFromJwt.name).trim() : null;
      const signerNip =
        signerFromJwt?.nipnim != null ? String(signerFromJwt.nipnim).trim() : null;
      await handoverLogSvc.appendHandoverEvent(
        {
          submissionId,
          eventType: 'requester_receipt_signed',
          actorUserId,
          actorName: signerName || updated.requester_handover_signer_name || updated.requester_name,
          actorRole: 'requester',
          actorNipnim: signerNip || updated.requester_handover_signer_nipnim,
          submissionStatus: tpaSigned ? 'completed' : 'ready_to_pickup',
        },
        client,
      );
      if (tpaSigned) {
        await handoverLogSvc.appendHandoverEvent(
          {
            submissionId,
            eventType: 'handover_completed',
            submissionStatus: 'completed',
            notes: 'Both parties had signed; completed when recipient signed.',
          },
          client,
        );
      }
    }

    await client.query('COMMIT');
    return updated;
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {}
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Persist TPA / laboran signature for handover delivery (serah terima) — **step 2**.
 * Requires requester signature first; then marks `completed`.
 */
export async function setTpaHandoverDeliverySignature(
  submissionId,
  actorUserId,
  signatureDataUri,
  signerFromJwt = null,
) {
  const client = await procurementDb.connect();
  try {
    await client.query('BEGIN');

    const cur = await client.query(
      'SELECT id, requester_handover_signature FROM procurement_submission WHERE id = $1 FOR UPDATE',
      [submissionId],
    );
    if (cur.rowCount === 0) {
      await client.query('ROLLBACK');
      return null;
    }
    const rowBefore = cur.rows[0];

    const colRes = await client.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'procurement_submission'"
    );
    const existing = new Set(colRes.rows.map((r) => r.column_name));

    if (!existing.has('tpa_handover_signature')) {
      await client.query('ROLLBACK');
      const err = new Error(
        'TPA handover signature column not available. Run procurement migrations.',
      );
      err.code = 'NO_SIGNATURE_COLUMN';
      throw err;
    }

    const sets = ['tpa_handover_signature = $1'];
    const vals = [signatureDataUri];
    if (existing.has('tpa_handover_signed_by')) {
      sets.push(`tpa_handover_signed_by = $${vals.length + 1}`);
      vals.push(actorUserId == null ? null : String(actorUserId));
    }
    if (existing.has('tpa_handover_signed_at')) {
      sets.push('tpa_handover_signed_at = now()');
    }
    if (signerFromJwt && typeof signerFromJwt === 'object' && existing.has('tpa_handover_signer_name')) {
      sets.push(`tpa_handover_signer_name = $${vals.length + 1}`);
      const nm = signerFromJwt.name != null ? String(signerFromJwt.name).trim() : '';
      vals.push(nm || null);
    }
    if (signerFromJwt && typeof signerFromJwt === 'object' && existing.has('tpa_handover_signer_nipnim')) {
      sets.push(`tpa_handover_signer_nipnim = $${vals.length + 1}`);
      const idn = signerFromJwt.nipnim != null ? String(signerFromJwt.nipnim).trim() : '';
      vals.push(idn || null);
    }
    const reqSig = rowBefore?.requester_handover_signature;
    const reqSigned = reqSig != null && String(reqSig).trim() !== '';
    if (!reqSigned) {
      await client.query('ROLLBACK');
      const err = new Error(
        'The requester (recipient) must sign receipt before laboran can confirm serah terima.',
      );
      err.code = 'HANDOVER_ORDER';
      throw err;
    }
    if (existing.has('status')) {
      sets.push(`status = $${vals.length + 1}`);
      vals.push('completed');
    }
    vals.push(submissionId);
    const sql = `UPDATE procurement_submission SET ${sets.join(', ')}, updated_at = now() WHERE id = $${vals.length} RETURNING *`;
    const { rows } = await client.query(sql, vals);
    const updated = rows[0] || null;

    if (updated) {
      const signerName =
        signerFromJwt?.name != null ? String(signerFromJwt.name).trim() : null;
      const signerNip =
        signerFromJwt?.nipnim != null ? String(signerFromJwt.nipnim).trim() : null;
      await handoverLogSvc.appendHandoverEvent(
        {
          submissionId,
          eventType: 'tpa_delivery_signed',
          actorUserId,
          actorName: signerName || updated.tpa_handover_signer_name,
          actorRole: 'tpa',
          actorNipnim: signerNip || updated.tpa_handover_signer_nipnim,
          submissionStatus: 'completed',
        },
        client,
      );
      await handoverLogSvc.appendHandoverEvent(
        {
          submissionId,
          eventType: 'handover_completed',
          submissionStatus: 'completed',
        },
        client,
      );
    }

    await client.query('COMMIT');
    return updated;
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {}
    throw e;
  } finally {
    client.release();
  }
}

export async function changeSubmissionStatus(
  submissionId,
  actorUserId,
  newStatus,
  { reason, actorName = null, actorRole = null } = {}
) {
  const client = await procurementDb.connect();
  try {
    await client.query('BEGIN');

    const subRes = await client.query('SELECT * FROM procurement_submission WHERE id = $1 FOR UPDATE', [submissionId]);
    if (subRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return null;
    }
    const submission = subRes.rows[0];
    const fromStatus = submission.status;

    // Never allow changing to draft via this endpoint
    if (String(newStatus).toLowerCase() === 'draft') {
      await client.query('ROLLBACK');
      const e = new Error('Cannot change status to draft'); e.code = 'INVALID'; throw e;
    }

    // Update submission status
    await client.query('UPDATE procurement_submission SET status = $1, updated_at = now() WHERE id = $2', [newStatus, submissionId]);

    try {
      await submissionStatusLogService.appendStatusLog(
        {
          submissionId,
          fromStatus,
          toStatus: newStatus,
          actorUserId,
          actorName,
          actorRole: actorRole || submissionStatusLogService.actorRoleForStatus(newStatus),
          note: reason || null,
        },
        client
      );
    } catch (logErr) {
      console.error('changeSubmissionStatus: status log failed', logErr?.message || logErr);
    }

    // If reason provided and column exists, try to update status_reason or rejection_reason
    try {
      const colCheck = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name='procurement_submission' AND column_name IN ('status_reason','rejection_reason')");
      if (colCheck.rowCount > 0) {
        // prefer status_reason if available
        const cols = colCheck.rows.map(r => r.column_name);
        if (cols.includes('status_reason')) {
          await client.query('UPDATE procurement_submission SET status_reason = $1 WHERE id = $2', [reason || null, submissionId]);
        } else if (cols.includes('rejection_reason') && String(newStatus).toLowerCase() === 'rejected') {
          await client.query('UPDATE procurement_submission SET rejection_reason = $1 WHERE id = $2', [reason || null, submissionId]);
        }
      }
    } catch (e) {
      // ignore failures to write optional columns
    }

    // If approving or rejecting, optionally change item statuses
    const ns = String(newStatus).toLowerCase();
    if (ns === 'approved' || ns === 'approved_by_tpa' || ns === 'approved_by_kaur' || ns === 'approved_by_kaprodi') {
      // treat approved_by_tpa same as approved for item updates
      await client.query("UPDATE procurement_submission_items SET status = 'approved', approved_by = $1, approved_at = now() WHERE submission_id = $2 AND status != 'approved'", [actorUserId, submissionId]);
    } else if (ns === 'rejected') {
      // Before marking items rejected, restore inventory for any inventory-backed items that had reserved stock
      try {
        // detect if procurement_submission_items has inventory_id column
        const colCheck = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'procurement_submission_items' AND column_name = 'inventory_id'");
        const hasInvCol = colCheck.rowCount > 0;
        let itemsRes;
        if (hasInvCol) {
          itemsRes = await client.query('SELECT id, inventory_id, quantity, status FROM procurement_submission_items WHERE submission_id = $1 FOR UPDATE', [submissionId]);
        } else {
          itemsRes = await client.query('SELECT id, quantity, status FROM procurement_submission_items WHERE submission_id = $1 FOR UPDATE', [submissionId]);
        }
        const itemsToRestore = hasInvCol ? itemsRes.rows.filter(r => r.inventory_id != null && r.status !== 'draft' && r.status !== 'rejected') : [];
        if (itemsToRestore.length > 0) {
          // ensure procurement_inventory table exists
          const tableRes = await client.query("SELECT to_regclass('public.procurement_inventory') as reg");
          const hasInventoryTable = tableRes.rows[0] && tableRes.rows[0].reg != null;
          if (hasInventoryTable) {
            for (const it of itemsToRestore) {
              try {
                const inv = await client.query('SELECT stock FROM procurement_inventory WHERE id = $1 FOR UPDATE', [it.inventory_id]);
                if (inv.rowCount === 0) continue;
                await client.query('UPDATE procurement_inventory SET stock = stock + $1, updated_at = now() WHERE id = $2', [Number(it.quantity) || 0, it.inventory_id]);
                // create inventory log showing restoration due to rejection
                try {
                  const requester = submission.requester_name || null;
                  await inventoryLogService.createLog(client, {
                    inventory_id: it.inventory_id,
                    item_name: null,
                    change_amount: Number(it.quantity) || 0,
                    action: 'restored',
                    note: `Rejected${reason ? `: ${reason}` : ''}`,
                    submission_id: submissionId,
                    requester_name: requester,
                    created_by: actorUserId || null,
                  });
                } catch (el) {
                  console.error('Failed to create inventory log (restore on reject):', el?.message || el);
                }
              } catch (e) {
                console.error('Failed to restore inventory during changeSubmissionStatus(rejected):', e?.message || e);
              }
            }
          }
        }
      } catch (e) {
        // If restoring inventory fails, rollback outer transaction
        await client.query('ROLLBACK');
        throw e;
      }

      await client.query("UPDATE procurement_submission_items SET status = 'rejected' WHERE submission_id = $1 AND status != 'rejected'", [submissionId]);
    }

    await client.query('COMMIT');
    return await findByIdWithItems(submissionId);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
