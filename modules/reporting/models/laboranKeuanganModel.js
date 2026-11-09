/**
 * Model — upload laporan keuangan laboran & hasil compare.
 */

import { reportingDb } from '../../../config/databases.js';

export async function insertLaboranUpload(client, {
  tahun, fileName, filePath, fileSize, sheetCount, transactionCount, uploadedBy,
}) {
  const db = client || reportingDb;
  const { rows } = await db.query(
    `INSERT INTO laboran_keuangan_uploads
       (tahun, file_name, file_path, file_size, sheet_count, transaction_count, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [tahun, fileName, filePath, fileSize, sheetCount, transactionCount, uploadedBy]
  );
  return rows[0];
}

export async function insertLaboranSheet(client, {
  uploadId, sheetName, sheetIndex, metadata, anggaranPerTw,
}) {
  const db = client || reportingDb;
  const { rows } = await db.query(
    `INSERT INTO laboran_keuangan_sheets
       (upload_id, sheet_name, sheet_index, kode_pp, nama_pp, kode_akun, nama_akun,
        no_drk, kegiatan, anggaran_tw1, anggaran_tw2, anggaran_tw3, anggaran_tw4)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING *`,
    [
      uploadId,
      sheetName,
      sheetIndex,
      metadata.kode_pp,
      metadata.nama_pp,
      metadata.kode_akun,
      metadata.nama_akun,
      metadata.no_drk,
      metadata.kegiatan,
      anggaranPerTw.tw1 || 0,
      anggaranPerTw.tw2 || 0,
      anggaranPerTw.tw3 || 0,
      anggaranPerTw.tw4 || 0,
    ]
  );
  return rows[0];
}

export async function bulkInsertLaboranTransactions(client, uploadId, sheetId, transactions) {
  if (!transactions.length) return 0;
  const db = client || reportingDb;
  let count = 0;

  for (const tx of transactions) {
    await db.query(
      `INSERT INTO laboran_keuangan_transactions
         (upload_id, sheet_id, triwulan, no_bukti, no_dokumen, tanggal, keterangan,
          debet, kredit, balance, nominal)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        uploadId,
        sheetId,
        tx.triwulan,
        tx.no_bukti,
        tx.no_dokumen,
        tx.tanggal,
        tx.keterangan,
        tx.debet || 0,
        tx.kredit || 0,
        tx.balance || 0,
        tx.nominal || 0,
      ]
    );
    count += 1;
  }
  return count;
}

export async function listLaboranUploads({ limit = 50, tahun = null } = {}) {
  const params = [];
  let query = `
    SELECT id, tahun, file_name, file_size, sheet_count, transaction_count,
           uploaded_by, created_at
      FROM laboran_keuangan_uploads
     WHERE deleted_at IS NULL`;
  if (tahun != null && tahun !== '') {
    params.push(parseInt(tahun, 10));
    query += ` AND tahun = $${params.length}`;
  }
  params.push(limit);
  query += ` ORDER BY created_at DESC LIMIT $${params.length}`;
  const { rows } = await reportingDb.query(query, params);
  return rows;
}

export async function getLaboranUploadById(id) {
  const { rows } = await reportingDb.query(
    `SELECT * FROM laboran_keuangan_uploads WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );
  return rows[0] ?? null;
}

export async function listLaboranSheets(uploadId) {
  const { rows } = await reportingDb.query(
    `SELECT * FROM laboran_keuangan_sheets WHERE upload_id = $1 ORDER BY sheet_index ASC`,
    [uploadId]
  );
  return rows;
}

export async function listLaboranTransactionsWithSheet(uploadId, { kodePP = null } = {}) {
  let query = `
    SELECT t.*, s.kode_pp, s.nama_pp, s.sheet_name
      FROM laboran_keuangan_transactions t
      JOIN laboran_keuangan_sheets s ON s.id = t.sheet_id
     WHERE t.upload_id = $1`;
  const params = [uploadId];
  if (kodePP) {
    params.push(String(kodePP).trim());
    query += ` AND s.kode_pp = $${params.length}`;
  }
  query += ` ORDER BY s.sheet_index ASC, t.triwulan ASC, t.tanggal ASC NULLS LAST, t.no_bukti ASC`;
  const { rows } = await reportingDb.query(query, params);
  return rows;
}

export async function insertCompareRun(client, {
  uploadId, tahun, runBy, matchedCount, missingLaboranCount, missingKpaCount, mismatchCount,
}) {
  const db = client || reportingDb;
  const isFullyMatched =
    missingLaboranCount === 0 && missingKpaCount === 0 && mismatchCount === 0;
  const { rows } = await db.query(
    `INSERT INTO keuangan_compare_runs
       (upload_id, tahun, run_by, matched_count, missing_laboran_count,
        missing_kpa_count, mismatch_count, is_fully_matched)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [
      uploadId,
      tahun,
      runBy,
      matchedCount,
      missingLaboranCount,
      missingKpaCount,
      mismatchCount,
      isFullyMatched,
    ]
  );
  return rows[0];
}

export async function bulkInsertCompareResults(client, runId, results) {
  if (!results.length) return 0;
  const db = client || reportingDb;
  for (const r of results) {
    await db.query(
      `INSERT INTO keuangan_compare_results
         (run_id, status, kode_pp, nama_pp,
          laboran_transaction_id, procurement_item_id, procurement_submission_id,
          laboran_no_bukti, laboran_keterangan, laboran_nominal, laboran_tanggal,
          procurement_item_name, procurement_reference, procurement_nominal, procurement_tanggal,
          message, match_score)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [
        runId,
        r.status,
        r.kode_pp,
        r.nama_pp,
        r.laboran_transaction_id ?? null,
        r.procurement_item_id ?? null,
        r.procurement_submission_id ?? null,
        r.laboran_no_bukti ?? null,
        r.laboran_keterangan ?? null,
        r.laboran_nominal ?? null,
        r.laboran_tanggal ?? null,
        r.procurement_item_name ?? null,
        r.procurement_reference ?? null,
        r.procurement_nominal ?? null,
        r.procurement_tanggal ?? null,
        r.message ?? null,
        r.match_score ?? null,
      ]
    );
  }
  return results.length;
}

export async function getCompareRunById(runId) {
  const { rows } = await reportingDb.query(
    `SELECT r.*, u.file_name, u.tahun AS upload_tahun
       FROM keuangan_compare_runs r
       JOIN laboran_keuangan_uploads u ON u.id = r.upload_id
      WHERE r.id = $1`,
    [runId]
  );
  return rows[0] ?? null;
}

export async function getLatestCompareRunForUpload(uploadId) {
  const { rows } = await reportingDb.query(
    `SELECT * FROM keuangan_compare_runs
      WHERE upload_id = $1
      ORDER BY created_at DESC
      LIMIT 1`,
    [uploadId]
  );
  return rows[0] ?? null;
}

export async function getCompareSummaryByProdi(runId) {
  const { rows } = await reportingDb.query(
    `SELECT
       COALESCE(kode_pp, '_unknown') AS kode_pp,
       MAX(nama_pp) AS nama_pp,
       COUNT(*) FILTER (WHERE status = 'matched')::int AS matched_count,
       COUNT(*) FILTER (WHERE status = 'missing_in_laboran')::int AS missing_laboran_count,
       COUNT(*) FILTER (WHERE status = 'missing_in_kpa')::int AS missing_kpa_count,
       COUNT(*) FILTER (WHERE status = 'amount_mismatch')::int AS mismatch_count
     FROM keuangan_compare_results
    WHERE run_id = $1
    GROUP BY COALESCE(kode_pp, '_unknown')
    ORDER BY kode_pp ASC`,
    [runId]
  );
  return rows.map((r) => ({
    ...r,
    is_fully_matched:
      r.missing_laboran_count === 0 &&
      r.missing_kpa_count === 0 &&
      r.mismatch_count === 0,
  }));
}

export async function listCompareResults(runId, { kodePP = null, status = null } = {}) {
  let query = `SELECT * FROM keuangan_compare_results WHERE run_id = $1`;
  const params = [runId];
  if (kodePP) {
    params.push(String(kodePP).trim());
    query += ` AND kode_pp = $${params.length}`;
  }
  if (status) {
    params.push(String(status).trim());
    query += ` AND status = $${params.length}`;
  }
  query += ` ORDER BY
    CASE status
      WHEN 'missing_in_laboran' THEN 1
      WHEN 'missing_in_kpa' THEN 2
      WHEN 'amount_mismatch' THEN 3
      ELSE 4
    END,
    laboran_tanggal ASC NULLS LAST,
    procurement_tanggal ASC NULLS LAST`;
  const { rows } = await reportingDb.query(query, params);
  return rows;
}
