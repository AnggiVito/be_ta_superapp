import { reportingDb } from '../../../../config/databases.js';
import { budgetScopeSqlForAlias } from './kpaSqlHelpers.js';

export async function createUploadRecord({
  periodId, fileName, filePath, fileSize, uploadedBy, prodiBudgetId,
}) {
  const { rows } = await reportingDb.query(
    `INSERT INTO kpa_uploads (period_id, file_name, file_path, file_size, uploaded_by, prodi_budget_id)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [periodId, fileName, filePath, fileSize, uploadedBy, prodiBudgetId ?? null],
  );
  return rows[0];
}

export async function insertUploadRecordClient(client, {
  periodId, fileName, filePath, fileSize, uploadedBy, prodiBudgetId,
}) {
  const { rows } = await client.query(
    `INSERT INTO kpa_uploads (period_id, file_name, file_path, file_size, uploaded_by, prodi_budget_id)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [periodId, fileName, filePath, fileSize, uploadedBy, prodiBudgetId ?? null],
  );
  return rows[0];
}

export async function listUploads(periodId, scope = null) {
  if (!scope || scope.mode !== 'kaprodi') {
    const { rows } = await reportingDb.query(
      `SELECT * FROM kpa_uploads WHERE period_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`,
      [periodId],
    );
    return rows;
  }
  const sc = budgetScopeSqlForAlias(scope, 'b', 2);
  const { rows } = await reportingDb.query(
    `SELECT u.*
       FROM kpa_uploads u
       JOIN kpa_prodi_budgets b ON b.id = u.prodi_budget_id AND b.deleted_at IS NULL
      WHERE u.period_id = $1 AND u.deleted_at IS NULL${sc.sql}
      ORDER BY u.created_at DESC`,
    [periodId, ...sc.params],
  );
  return rows;
}

export async function listAllKpaUploads(limit = 200, scope = null) {
  const lim = Number.isFinite(limit) ? limit : 200;
  const params = [];
  let where = 'u.deleted_at IS NULL';
  let nextParam = 1;
  if (scope?.mode === 'kaprodi') {
    where += ' AND u.prodi_budget_id IS NOT NULL';
    const sc = budgetScopeSqlForAlias(scope, 'b', nextParam);
    where += sc.sql;
    params.push(...sc.params);
    nextParam += sc.params.length;
  }
  const limPh = `$${nextParam}`;
  params.push(lim);
  const { rows } = await reportingDb.query(
    `SELECT u.*,
            p.tahun AS tahun,
            b.nama_pp AS budget_nama_pp,
            b.kode_pp AS budget_kode_pp
       FROM kpa_uploads u
       JOIN kpa_periods p ON p.id = u.period_id AND p.deleted_at IS NULL
       LEFT JOIN kpa_prodi_budgets b ON b.id = u.prodi_budget_id AND b.deleted_at IS NULL
      WHERE ${where}
      ORDER BY u.created_at DESC
      LIMIT ${limPh}`,
    params,
  );
  return rows;
}

export async function getKpaUploadById(id) {
  const { rows } = await reportingDb.query(
    `SELECT u.*,
            p.tahun AS tahun,
            b.nama_pp AS budget_nama_pp,
            b.kode_pp AS budget_kode_pp
       FROM kpa_uploads u
       JOIN kpa_periods p ON p.id = u.period_id AND p.deleted_at IS NULL
       LEFT JOIN kpa_prodi_budgets b ON b.id = u.prodi_budget_id AND b.deleted_at IS NULL
      WHERE u.id = $1 AND u.deleted_at IS NULL`,
    [id],
  );
  return rows[0] || null;
}

export async function softDeleteKpaUploadAndLinkedData(uploadId) {
  const upload = await getKpaUploadById(uploadId);
  if (!upload) return { ok: false, reason: 'not_found' };

  const client = await reportingDb.connect();
  try {
    await client.query('BEGIN');
    const budgetId = upload.prodi_budget_id;

    if (budgetId) {
      const { rows: cntRows } = await client.query(
        `SELECT COUNT(*)::int AS c FROM kpa_uploads
          WHERE prodi_budget_id = $1 AND deleted_at IS NULL AND id <> $2`,
        [budgetId, uploadId],
      );
      if (cntRows[0].c === 0) {
        await client.query(
          `UPDATE kpa_transactions
              SET deleted_at = NOW(), updated_at = NOW()
            WHERE prodi_budget_id = $1 AND deleted_at IS NULL`,
          [budgetId],
        );
        await client.query(
          `UPDATE kpa_prodi_budgets
              SET deleted_at = NOW(), updated_at = NOW()
            WHERE id = $1 AND deleted_at IS NULL`,
          [budgetId],
        );
      }
    }

    await client.query(
      `UPDATE kpa_uploads
          SET deleted_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL`,
      [uploadId],
    );

    await client.query('COMMIT');
    return { ok: true, filePath: upload.file_path };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
