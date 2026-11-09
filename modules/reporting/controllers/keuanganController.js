/**
 * Keuangan Controller
 * HTTP handlers for KPA financial reporting endpoints
 */

import fs from 'fs';
import path from 'path';
import { logger } from '../../../core/utils/logger.js';
import {
  processKpaYearReplaceUpload,
  buildPeriodReport,
  buildBudgetReport,
  reprocessKpaUpload,
} from '../services/kpaProcessingService.js';
import {
  listPeriods,
  getPeriodById,
  createPeriod,
  listProdiBudgets,
  getProdiBudgetById,
  upsertProdiBudget,
  updateProdiBudget,
  listTransactions,
  listUploads,
  listAllKpaUploads,
  getPeriodSummary,
  softDeleteKpaUploadAndLinkedData,
} from '../models/kpaModel.js';

/** KAPRODI: pastikan baris anggaran sesuai scope JWT (kode_pp / nama_pp). */
function assertBudgetInKeuanganScope(budget, scope) {
  if (!scope || scope.mode !== 'kaprodi' || !budget) return;
  const k = scope.kodePp ? String(scope.kodePp).trim() : null;
  const n = scope.namaPp ? String(scope.namaPp).trim().toLowerCase() : null;
  if (!k && !n) {
    const err = new Error('Profil tidak memiliki kode/nama PP untuk menyaring laporan keuangan.');
    err.statusCode = 403;
    throw err;
  }
  const bk = String(budget.kode_pp ?? '').trim();
  const bn = String(budget.nama_pp ?? '').toLowerCase();
  let ok = false;
  if (k && n) ok = bk === k || bn.includes(n);
  else if (k) ok = bk === k;
  else if (n) ok = bn.includes(n);
  if (!ok) {
    const err = new Error('Akses ditolak untuk data anggaran ini.');
    err.statusCode = 403;
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Periods
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/reporting/keuangan/periods
 */
export async function getPeriods(req, res) {
  try {
    const periods = await listPeriods();
    res.json({ success: true, data: periods, count: periods.length });
  } catch (err) {
    logger.error('getPeriods error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * POST /api/reporting/keuangan/periods
 * Body: { tahun, status? }
 */
export async function createNewPeriod(req, res) {
  try {
    const { tahun, status } = req.body;
    if (!tahun) return res.status(400).json({ success: false, message: 'tahun is required' });
    const period = await createPeriod({ tahun, status: status || 'active', createdBy: req.user?.id || 'system' });
    res.json({ success: true, data: period });
  } catch (err) {
    logger.error('createNewPeriod error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/reporting/keuangan/periods/:id/summary
 */
export async function getPeriodSummaryHandler(req, res) {
  try {
    const period = await getPeriodById(req.params.id);
    if (!period) return res.status(404).json({ success: false, message: 'Period not found' });

    const report = await buildPeriodReport(period.id, req.keuanganScope ?? null);
    res.json({ success: true, data: { period, ...report } });
  } catch (err) {
    logger.error('getPeriodSummary error:', err);
    const code = err.statusCode && Number.isInteger(err.statusCode) ? err.statusCode : 500;
    res.status(code).json({ success: false, message: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Prodi Budgets
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/reporting/keuangan/periods/:id/prodi
 */
export async function getProdiBudgets(req, res) {
  try {
    const period = await getPeriodById(req.params.id);
    if (!period) return res.status(404).json({ success: false, message: 'Period not found' });

    const budgets = await listProdiBudgets(period.id, req.keuanganScope ?? null);
    res.json({ success: true, data: budgets, count: budgets.length });
  } catch (err) {
    logger.error('getProdiBudgets error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * POST /api/reporting/keuangan/prodi-budgets
 * Body: { period_id, kode_pp, nama_pp, kode_akun, nama_akun, no_drk, kegiatan,
 *         anggaran_tw1, anggaran_tw2, anggaran_tw3, anggaran_tw4 }
 */
export async function createProdiBudget(req, res) {
  try {
    const {
      period_id, kode_pp, nama_pp, kode_akun, nama_akun, no_drk, kegiatan,
      anggaran_tw1 = 0, anggaran_tw2 = 0, anggaran_tw3 = 0, anggaran_tw4 = 0,
    } = req.body;

    if (!period_id || !nama_pp) {
      return res.status(400).json({ success: false, message: 'period_id and nama_pp are required' });
    }

    const period = await getPeriodById(period_id);
    if (!period) return res.status(404).json({ success: false, message: 'Period not found' });

    const budget = await upsertProdiBudget({
      periodId: period_id, kodePP: kode_pp, namaPP: nama_pp,
      kodeAkun: kode_akun, namaAkun: nama_akun, noDrk: no_drk, kegiatan,
      anggaranTw1: parseInt(anggaran_tw1), anggaranTw2: parseInt(anggaran_tw2),
      anggaranTw3: parseInt(anggaran_tw3), anggaranTw4: parseInt(anggaran_tw4),
      createdBy: req.user?.id || 'system',
    });
    res.json({ success: true, data: budget });
  } catch (err) {
    logger.error('createProdiBudget error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * PUT /api/reporting/keuangan/prodi-budgets/:id
 */
export async function updateProdiBudgetHandler(req, res) {
  try {
    const existing = await getProdiBudgetById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Budget not found' });

    const {
      kode_pp, nama_pp, kode_akun, nama_akun, no_drk, kegiatan,
      anggaran_tw1 = 0, anggaran_tw2 = 0, anggaran_tw3 = 0, anggaran_tw4 = 0,
    } = req.body;

    const budget = await updateProdiBudget(req.params.id, {
      kodePP: kode_pp !== undefined ? kode_pp : existing.kode_pp,
      namaPP: nama_pp ?? existing.nama_pp,
      kodeAkun: kode_akun !== undefined ? kode_akun : existing.kode_akun,
      namaAkun: nama_akun !== undefined ? nama_akun : existing.nama_akun,
      noDrk: no_drk !== undefined ? no_drk : existing.no_drk,
      kegiatan: kegiatan !== undefined ? kegiatan : existing.kegiatan,
      anggaranTw1: anggaran_tw1 !== undefined ? parseInt(anggaran_tw1, 10) : existing.anggaran_tw1,
      anggaranTw2: anggaran_tw2 !== undefined ? parseInt(anggaran_tw2, 10) : existing.anggaran_tw2,
      anggaranTw3: anggaran_tw3 !== undefined ? parseInt(anggaran_tw3, 10) : existing.anggaran_tw3,
      anggaranTw4: anggaran_tw4 !== undefined ? parseInt(anggaran_tw4, 10) : existing.anggaran_tw4,
    });
    if (!budget) return res.status(404).json({ success: false, message: 'Budget not found' });
    res.json({ success: true, data: budget });
  } catch (err) {
    logger.error('updateProdiBudget error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * GET /api/reporting/keuangan/prodi-budgets/:id
 */
export async function getProdiBudgetDetail(req, res) {
  try {
    const budget = await getProdiBudgetById(req.params.id);
    if (!budget) return res.status(404).json({ success: false, message: 'Budget not found' });
    assertBudgetInKeuanganScope(budget, req.keuanganScope ?? null);
    res.json({ success: true, data: budget });
  } catch (err) {
    logger.error('getProdiBudgetDetail error:', err);
    const code = err.statusCode && Number.isInteger(err.statusCode) ? err.statusCode : 500;
    res.status(code).json({ success: false, message: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Transactions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/reporting/keuangan/periods/:id/transactions
 * Query: triwulan, kode_pp, search
 */
export async function getTransactions(req, res) {
  try {
    const period = await getPeriodById(req.params.id);
    if (!period) return res.status(404).json({ success: false, message: 'Period not found' });

    const { triwulan, kode_pp, search, prodi_budget_id } = req.query;
    const transactions = await listTransactions(period.id, {
      triwulan: triwulan ? parseInt(triwulan, 10) : null,
      kodePP: req.keuanganScope?.mode === 'kaprodi' ? null : (kode_pp || null),
      prodiBudgetId: prodi_budget_id || null,
      search: search || null,
      kpaScope: req.keuanganScope ?? null,
    });
    res.json({ success: true, data: transactions, count: transactions.length });
  } catch (err) {
    logger.error('getTransactions error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// File Upload
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/reporting/keuangan/upload
 * Multipart: file, tahun (integer — harus sama dengan tahun di metadata berkas KPA).
 * Mengganti seluruh data KPA untuk tahun tersebut dalam satu transaksi (SSOT).
 */
export async function uploadKpaFile(req, res) {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ success: false, message: 'No file uploaded' });

    const tahunRaw = req.body?.tahun;
    const tahun = tahunRaw !== undefined && tahunRaw !== '' && tahunRaw !== null
      ? parseInt(String(tahunRaw), 10)
      : NaN;
    if (!Number.isFinite(tahun)) {
      return res.status(400).json({
        success: false,
        message: 'Parameter tahun wajib diisi dan harus sama dengan tahun periode di berkas KPA.',
      });
    }

    const result = await processKpaYearReplaceUpload(file, req.user?.id || 'system', tahun);
    res.json({
      success: true,
      message:
        `Data tahun ${tahun} diganti dari berkas: ${result.transactionCount} transaksi diimpor (tanpa duplikasi).`,
      data: result,
    });
  } catch (err) {
    logger.error('uploadKpaFile error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * GET /api/reporting/keuangan/periods/:id/uploads
 */
export async function getUploads(req, res) {
  try {
    const uploads = await listUploads(req.params.id, req.keuanganScope ?? null);
    res.json({ success: true, data: uploads, count: uploads.length });
  } catch (err) {
    logger.error('getUploads error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * GET /api/reporting/keuangan/uploads
 * List all KPA uploads (for picker / history)
 */
export async function listAllUploads(req, res) {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 200;
    const uploads = await listAllKpaUploads(Number.isFinite(limit) ? limit : 200, req.keuanganScope ?? null);
    res.json({ success: true, data: uploads, count: uploads.length });
  } catch (err) {
    logger.error('listAllUploads error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * DELETE /api/reporting/keuangan/uploads/:id
 * Hapus riwayat upload + file di disk; data anggaran/transaksi ikut dihapus (soft)
 * jika tidak ada upload lain yang memakai baris anggaran yang sama.
 * Akses: KAUR, TPA.
 */
export async function deleteKpaUpload(req, res) {
  try {
    const uploadId = req.params.id;
    const result = await softDeleteKpaUploadAndLinkedData(uploadId);
    if (!result.ok) {
      return res.status(404).json({ success: false, message: 'Upload tidak ditemukan.' });
    }

    try {
      const absPath = path.isAbsolute(result.filePath)
        ? result.filePath
        : path.join(process.cwd(), result.filePath);
      if (fs.existsSync(absPath)) {
        fs.unlinkSync(absPath);
        logger.info('KPA physical file removed:', { uploadId, absPath });
      }
    } catch (fileErr) {
      logger.warn('KPA physical file delete failed (DB sudah di-soft-delete):', {
        uploadId,
        error: fileErr.message,
      });
    }

    res.json({
      success: true,
      message: 'File KPA dan data terkait telah dihapus.',
    });
  } catch (err) {
    logger.error('deleteKpaUpload error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * GET /api/reporting/keuangan/prodi-budgets/:id/summary
 * Summary scoped to one PP / one uploaded file's budget row
 */
export async function getBudgetSummaryHandler(req, res) {
  try {
    const budget = await getProdiBudgetById(req.params.id);
    if (!budget) return res.status(404).json({ success: false, message: 'Budget not found' });
    assertBudgetInKeuanganScope(budget, req.keuanganScope ?? null);

    const report = await buildBudgetReport(budget.id);
    res.json({ success: true, data: { period: report.period, ...report } });
  } catch (err) {
    logger.error('getBudgetSummaryHandler error:', err);
    const code = err.statusCode && Number.isInteger(err.statusCode) ? err.statusCode : 500;
    res.status(code).json({ success: false, message: err.message });
  }
}

/**
 * POST /api/reporting/keuangan/reprocess
 * Body/query: upload_id — re-parse stored file and refresh budget + transactions
 */
export async function reprocessKpa(req, res) {
  try {
    const uploadId = req.body.upload_id || req.query.upload_id;
    if (!uploadId) return res.status(400).json({ success: false, message: 'upload_id is required' });

    const result = await reprocessKpaUpload(uploadId, req.user?.id || 'system');
    res.json({
      success: true,
      message: `KPA diproses ulang: ${result.transactionCount} transaksi.`,
      data: result,
    });
  } catch (err) {
    logger.error('reprocessKpa error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
}
