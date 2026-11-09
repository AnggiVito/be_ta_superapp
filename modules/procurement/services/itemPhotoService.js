import { procurementDb } from '../../../config/databases.js';

export async function replaceItemPhotos({ submissionId, uploadedBy, filesByItem = [] }) {
  const client = await procurementDb.connect();
  try {
    await client.query('BEGIN');
    const affected = [];
    for (const row of filesByItem) {
      const itemId = row.itemId;
      // check if a photo already exists for this submission & item
      const { rows: existingRows } = await client.query(
        'SELECT * FROM procurement_submission_item_photos WHERE submission_id = $1 AND submission_item_id = $2',
        [submissionId, itemId]
      );
      if (existingRows && existingRows.length > 0) {
        const q = `UPDATE procurement_submission_item_photos
          SET file_path = $1, file_name = $2, mime_type = $3, uploaded_by = $4, updated_at = now()
          WHERE id = $5 RETURNING *`;
        const vals = [row.filePath, row.fileName, row.mimeType, uploadedBy, existingRows[0].id];
        const res = await client.query(q, vals);
        affected.push(res.rows[0]);
      } else {
        const q = `INSERT INTO procurement_submission_item_photos
          (submission_id, submission_item_id, uploaded_by, file_path, file_name, mime_type, created_at, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6, now(), now()) RETURNING *`;
        const vals = [submissionId, itemId, uploadedBy, row.filePath, row.fileName, row.mimeType];
        const ins = await client.query(q, vals);
        affected.push(ins.rows[0]);
      }
    }
    await client.query('COMMIT');
    return affected;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function getBySubmission(submissionId) {
  const q = `SELECT p.*, i.item_name
    FROM procurement_submission_item_photos p
    LEFT JOIN procurement_submission_items i ON i.id = p.submission_item_id
    WHERE p.submission_id = $1
    ORDER BY p.created_at ASC`;
  const { rows } = await procurementDb.query(q, [submissionId]);
  return rows;
}

export async function getById(id) {
  const { rows } = await procurementDb.query('SELECT * FROM procurement_submission_item_photos WHERE id = $1', [id]);
  return rows[0] || null;
}

export async function deleteById(id) {
  // return deleted row info (including file_path) so controller can remove file
  const client = await procurementDb.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT * FROM procurement_submission_item_photos WHERE id = $1', [id]);
    const row = rows[0];
    await client.query('DELETE FROM procurement_submission_item_photos WHERE id = $1', [id]);
    await client.query('COMMIT');
    return row || null;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function replacePhotoById({ photoId, uploadedBy, filePath, fileName, mimeType }) {
  const client = await procurementDb.connect();
  try {
    await client.query('BEGIN');
    // ensure photo exists
    const { rows } = await client.query('SELECT * FROM procurement_submission_item_photos WHERE id = $1', [photoId]);
    const existing = rows[0];
    if (!existing) {
      throw new Error('Item photo not found');
    }
    const q = `UPDATE procurement_submission_item_photos SET file_path = $1, file_name = $2, mime_type = $3, uploaded_by = $4, updated_at = now() WHERE id = $5 RETURNING *`;
    const vals = [filePath, fileName, mimeType, uploadedBy, photoId];
    const res = await client.query(q, vals);
    await client.query('COMMIT');
    return res.rows[0];
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function upsertItemReadyFlags({ submissionId, itemIds = [], markedBy }) {
  const client = await procurementDb.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM procurement_submission_item_ready_flags WHERE submission_id = $1', [submissionId]);
    for (const itemId of itemIds) {
      await client.query(
        `INSERT INTO procurement_submission_item_ready_flags
         (submission_id, submission_item_id, marked_by, is_ready, created_at, updated_at)
         VALUES ($1,$2,$3,TRUE, now(), now())`,
        [submissionId, itemId, markedBy]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function getReadyFlagsBySubmission(submissionId) {
  const { rows } = await procurementDb.query(
    'SELECT * FROM procurement_submission_item_ready_flags WHERE submission_id = $1',
    [submissionId]
  );
  return rows;
}

/**
 * @param {Record<string, string|null|undefined>} keteranganByItemId - keys: submission_item_id
 */
export async function updateBeritaAcaraKeterangan({ submissionId, keteranganByItemId = {} }) {
  const entries = Object.entries(keteranganByItemId || {});
  if (!entries.length) return;

  const client = await procurementDb.connect();
  try {
    await client.query('BEGIN');
    for (const [itemId, ket] of entries) {
      const id = Number(itemId);
      if (!Number.isFinite(id)) continue;
      const trimmed = ket != null ? String(ket).trim() : '';
      const value = trimmed === '' ? null : trimmed.slice(0, 500);
      await client.query(
        `UPDATE procurement_submission_items
         SET berita_acara_keterangan = $1, updated_at = now()
         WHERE id = $2 AND submission_id = $3`,
        [value, id, submissionId],
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
