import { procurementDb } from '../../../config/databases.js';

export async function createDraft(userId, data, title = null) {
  const q = `INSERT INTO procurement_submission_drafts (user_id, title, data, created_at, updated_at) VALUES ($1,$2,$3, now(), now()) RETURNING *`;
  const vals = [String(userId), title, data];
  const { rows } = await procurementDb.query(q, vals);
  return rows[0];
}

export async function updateDraft(id, userId, data, title = null) {
  // only allow owner to update
  const q = `UPDATE procurement_submission_drafts SET data = $1, title = $2, version = version + 1, updated_at = now() WHERE id = $3 AND user_id = $4 RETURNING *`;
  const vals = [data, title, id, String(userId)];
  const { rows } = await procurementDb.query(q, vals);
  return rows[0] || null;
}

function deepMerge(target = {}, source = {}) {
  // merge objects recursively; arrays and primitives are replaced
  const out = { ...target };
  for (const key of Object.keys(source)) {
    const s = source[key];
    if (s && typeof s === 'object' && !Array.isArray(s) && out[key] && typeof out[key] === 'object' && !Array.isArray(out[key])) {
      out[key] = deepMerge(out[key], s);
    } else {
      out[key] = s;
    }
  }
  return out;
}

export async function updateDraftMerged(id, userId, incoming, title = null) {
  // load existing draft
  const cur = await procurementDb.query('SELECT * FROM procurement_submission_drafts WHERE id = $1 AND user_id = $2 FOR UPDATE', [id, String(userId)]);
  if (cur.rowCount === 0) return null;
  const draft = cur.rows[0];
  const existing = draft.data || {};
  const merged = deepMerge(existing, incoming || {});

  const q = `UPDATE procurement_submission_drafts SET data = $1, title = $2, version = version + 1, updated_at = now() WHERE id = $3 AND user_id = $4 RETURNING *`;
  const vals = [merged, title || draft.title, id, String(userId)];
  const { rows } = await procurementDb.query(q, vals);
  return rows[0] || null;
}

export async function getDraftsByUser(userId, { limit = 20, offset = 0 } = {}) {
  const q = `SELECT id, user_id, title, data, version, created_at, updated_at FROM procurement_submission_drafts WHERE user_id = $1 ORDER BY updated_at DESC LIMIT $2 OFFSET $3`;
  const vals = [String(userId), limit, offset];
  const { rows } = await procurementDb.query(q, vals);
  return rows;
}

export async function getDraftById(id) {
  const q = `SELECT * FROM procurement_submission_drafts WHERE id = $1`;
  const { rows } = await procurementDb.query(q, [id]);
  return rows[0] || null;
}

export async function deleteDraft(id, userId) {
  const q = `DELETE FROM procurement_submission_drafts WHERE id = $1 AND user_id = $2 RETURNING *`;
  const { rows } = await procurementDb.query(q, [id, String(userId)]);
  return rows[0] || null;
}
