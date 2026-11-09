/**
 * KPA Processing Service
 * Orchestrates parsing → DB insertion for KPA file uploads,
 * and provides summary/analytics helpers.
 */

import fs from 'fs';
import path from 'path';
import { logger } from '../../../core/utils/logger.js';
import { parseKpaFile } from './kpaParsingService.js';
import {
  getPeriodById,
  updateProdiBudget,
  bulkInsertTransactions,
  getPeriodSummary,
  listProdiBudgets,
  getProdiBudgetById,
  getBudgetSummaryOnly,
  getKpaUploadById,
  softDeleteTransactionsForBudget,
  softDeleteAllKpaDataForPeriodClient,
  insertProdiBudgetClient,
  insertUploadRecordClient,
  insertYearReplaceEventClient,
} from '../models/kpaModel.js';
import { reportingDb } from '../../../config/databases.js';

const KPA_UPLOAD_DIR = 'uploads/kpa';

/**
 * Ensure upload directory exists
 */
function ensureUploadDir() {
  if (!fs.existsSync(KPA_UPLOAD_DIR)) {
    fs.mkdirSync(KPA_UPLOAD_DIR, { recursive: true });
  }
}

/**
 * Unggah KPA: parse di luar transaksi; dalam **satu** transaksi DB —
 * soft-delete semua data tahun tersebut, lalu sisipkan data dari berkas (SSOT).
 * Jika insert gagal, ROLLBACK memulihkan data lama.
 *
 * @param {Express.Multer.File} file
 * @param {string} userId
 * @param {number} tahunParam — tahun yang dipilih user (harus sama dengan tahun di berkas)
 * @returns {{ period, prodiBudget, transactionCount, uploadRecord }}
 */
export async function processKpaYearReplaceUpload(file, userId, tahunParam) {
  ensureUploadDir();

  const tahun = parseInt(String(tahunParam), 10);
  if (!Number.isFinite(tahun) || tahun < 2000 || tahun > 2100) {
    throw new Error('Parameter tahun tidak valid (2000–2100).');
  }

  const { metadata, anggaranPerTw, transactions } = parseKpaFile(file.path);

  if (metadata.tahun !== tahun) {
    throw new Error(
      `Tahun di berkas (${metadata.tahun}) tidak sama dengan tahun yang dipilih (${tahun}). `
      + 'Sesuaikan dropdown tahun atau periksa isi berkas KPA.',
    );
  }

  if (!transactions.length) {
    throw new Error('Tidak ada baris transaksi di berkas. Data tahun tidak diubah.');
  }

  const client = await reportingDb.connect();
  let committed = false;
  try {
    await client.query('BEGIN');

    const { rows: upsertRows } = await client.query(
      `INSERT INTO kpa_periods (tahun, status, created_by)
       VALUES ($1, 'active', $2)
       ON CONFLICT ON CONSTRAINT kpa_periods_tahun_unique
       DO UPDATE SET updated_at = NOW()
       RETURNING id`,
      [tahun, userId],
    );
    const { rows: periodRows } = await client.query(
      `SELECT * FROM kpa_periods WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [upsertRows[0].id],
    );
    const period = periodRows[0];
    if (!period) {
      throw new Error(`Periode tahun ${tahun} tidak tersedia atau telah dihapus.`);
    }

    await softDeleteAllKpaDataForPeriodClient(client, period.id);

    const prodiBudget = await insertProdiBudgetClient(client, {
      periodId: period.id,
      kodePP: metadata.kode_pp,
      namaPP: metadata.nama_pp || 'Unknown',
      kodeAkun: metadata.kode_akun,
      namaAkun: metadata.nama_akun,
      noDrk: metadata.no_drk,
      kegiatan: metadata.kegiatan,
      anggaranTw1: anggaranPerTw.tw1,
      anggaranTw2: anggaranPerTw.tw2,
      anggaranTw3: anggaranPerTw.tw3,
      anggaranTw4: anggaranPerTw.tw4,
      createdBy: userId,
    });

    const transactionCount = await bulkInsertTransactions(prodiBudget.id, transactions, client);

    const uploadRecord = await insertUploadRecordClient(client, {
      periodId: period.id,
      prodiBudgetId: prodiBudget.id,
      fileName: file.originalname,
      filePath: file.path,
      fileSize: file.size,
      uploadedBy: userId,
    });

    await client.query(
      `UPDATE kpa_periods
          SET data_last_updated_at = NOW(),
              data_last_updated_by = $2,
              updated_at = NOW()
        WHERE id = $1`,
      [period.id, userId],
    );

    await insertYearReplaceEventClient(client, {
      periodId: period.id,
      tahun,
      occurredBy: userId,
      fileName: file.originalname,
      transactionCount,
      uploadId: uploadRecord.id,
      prodiBudgetId: prodiBudget.id,
    });

    await client.query('COMMIT');
    committed = true;

    const refreshed = await getPeriodById(period.id);
    return {
      period: refreshed || period,
      prodiBudget,
      transactionCount,
      uploadRecord,
    };
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      /* no active transaction */
    }
    throw err;
  } finally {
    client.release();
    if (!committed && file?.path && fs.existsSync(file.path)) {
      try {
        fs.unlinkSync(file.path);
      } catch (unlinkErr) {
        logger.warn('Gagal menghapus berkas KPA setelah rollback:', unlinkErr.message);
      }
    }
  }
}

/**
 * Build a rich summary for a period (overall + per-triwulan + prodi breakdown)
 * @param {string} periodId
 * @param {{ mode?: string, kodePp?: string|null, namaPp?: string|null }|null} [scope]
 */
export async function buildPeriodReport(periodId, scope = null) {
  const [summary, prodiBudgets] = await Promise.all([
    getPeriodSummary(periodId, scope),
    listProdiBudgets(periodId, scope),
  ]);

  // Per-triwulan comparison table
  const triwulanData = [1, 2, 3, 4].map((tw) => ({
    triwulan: tw,
    anggaran: summary[`anggaran_tw${tw}`],
    realisasi: summary[`realisasi_tw${tw}`],
    sisa: summary[`anggaran_tw${tw}`] - summary[`realisasi_tw${tw}`],
    persen: summary[`anggaran_tw${tw}`] > 0
      ? parseFloat(((summary[`realisasi_tw${tw}`] / summary[`anggaran_tw${tw}`]) * 100).toFixed(2))
      : 0,
  }));

  // Prodi with highest / lowest serapan
  const sorted = [...prodiBudgets].sort(
    (a, b) => parseFloat(b.persen_terpakai) - parseFloat(a.persen_terpakai),
  );
  const highestSerapan = sorted[0] || null;
  const lowestSerapan  = sorted[sorted.length - 1] || null;

  return {
    summary,
    triwulanData,
    prodiBudgets,
    highestSerapan,
    lowestSerapan,
  };
}

/**
 * Build report for a single prodi budget row (one uploaded KPA file's PP).
 */
export async function buildBudgetReport(prodiBudgetId) {
  const budget = await getProdiBudgetById(prodiBudgetId);
  if (!budget) throw new Error('Budget not found');

  const [period, summary] = await Promise.all([
    getPeriodById(budget.period_id),
    getBudgetSummaryOnly(prodiBudgetId),
  ]);
  if (!period) throw new Error('Period not found');

  const triwulanData = [1, 2, 3, 4].map((tw) => ({
    triwulan: tw,
    anggaran: summary[`anggaran_tw${tw}`],
    realisasi: summary[`realisasi_tw${tw}`],
    sisa: summary[`anggaran_tw${tw}`] - summary[`realisasi_tw${tw}`],
    persen: summary[`anggaran_tw${tw}`] > 0
      ? parseFloat(((summary[`realisasi_tw${tw}`] / summary[`anggaran_tw${tw}`]) * 100).toFixed(2))
      : 0,
  }));

  const prodiBudgets = [budget];
  const highestSerapan = budget;
  const lowestSerapan = budget;

  return {
    period,
    summary,
    triwulanData,
    prodiBudgets,
    highestSerapan,
    lowestSerapan,
  };
}

/**
 * Re-parse stored file for an upload row and refresh budget metadata + transactions.
 */
export async function reprocessKpaUpload(uploadId, userId) {
  const upload = await getKpaUploadById(uploadId);
  if (!upload) throw new Error('Upload not found');

  if (!upload.prodi_budget_id) {
    throw new Error(
      'Upload ini tidak tertaut ke baris anggaran (data lama). Unggah ulang file KPA untuk memproses.',
    );
  }

  const absPath = path.isAbsolute(upload.file_path)
    ? upload.file_path
    : path.join(process.cwd(), upload.file_path);

  if (!fs.existsSync(absPath)) {
    throw new Error('File asli tidak ditemukan di server. Unggah ulang file KPA.');
  }

  const { metadata, anggaranPerTw, transactions } = parseKpaFile(absPath);

  await softDeleteTransactionsForBudget(upload.prodi_budget_id);

  const prodiBudget = await updateProdiBudget(upload.prodi_budget_id, {
    kodePP: metadata.kode_pp,
    namaPP: metadata.nama_pp || 'Unknown',
    kodeAkun: metadata.kode_akun,
    namaAkun: metadata.nama_akun,
    noDrk: metadata.no_drk,
    kegiatan: metadata.kegiatan,
    anggaranTw1: anggaranPerTw.tw1,
    anggaranTw2: anggaranPerTw.tw2,
    anggaranTw3: anggaranPerTw.tw3,
    anggaranTw4: anggaranPerTw.tw4,
  });

  const transactionCount = await bulkInsertTransactions(upload.prodi_budget_id, transactions);
  const period = await getPeriodById(upload.period_id);

  logger.info(`KPA reprocessed upload=${uploadId} by=${userId} txs=${transactionCount}`);

  return { period, prodiBudget, transactionCount, upload };
}
