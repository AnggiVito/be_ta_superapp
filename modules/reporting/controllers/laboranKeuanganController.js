/**
 * Controller — upload laboran & compare vs procurement (KPA sistem).
 */

import { logger } from '../../../core/utils/logger.js';
import {
  processLaboranKeuanganUpload,
  listLaboranUploads,
  getLaboranUploadDetail,
} from '../services/laboranKeuanganService.js';
import {
  executeCompare,
  getCompareOverview,
  getCompareProdiDetail,
  getLatestCompareRunForUpload,
  getOrRunLatestCompare,
} from '../services/keuanganCompareService.js';

export async function uploadLaboranKeuangan(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'File Excel wajib diupload' });
    }
    const tahun = req.body?.tahun ?? req.query?.tahun;
    if (!tahun) {
      return res.status(400).json({ success: false, message: 'Parameter tahun wajib diisi' });
    }

    const result = await processLaboranKeuanganUpload(
      req.file,
      req.user?.id || 'system',
      tahun
    );

    res.status(201).json({
      success: true,
      message: `Berhasil memproses ${result.upload.transaction_count} transaksi dari ${result.upload.sheet_count} sheet`,
      data: result,
    });
  } catch (err) {
    logger.error('uploadLaboranKeuangan error:', err);
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
}

export async function listLaboranKeuanganUploads(req, res) {
  try {
    const limit = parseInt(req.query?.limit, 10) || 50;
    const tahun = req.query?.tahun ?? null;
    const uploads = await listLaboranUploads({ limit, tahun });
    res.json({ success: true, data: uploads, count: uploads.length });
  } catch (err) {
    logger.error('listLaboranKeuanganUploads error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function getLaboranKeuanganUpload(req, res) {
  try {
    const detail = await getLaboranUploadDetail(req.params.uploadId);
    if (!detail) {
      return res.status(404).json({ success: false, message: 'Upload tidak ditemukan' });
    }
    const latestCompare = await getLatestCompareRunForUpload(req.params.uploadId);
    res.json({
      success: true,
      data: { ...detail, latest_compare_run: latestCompare },
    });
  } catch (err) {
    logger.error('getLaboranKeuanganUpload error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function getLatestKeuanganCompare(req, res) {
  try {
    const tahun = req.query?.tahun ?? null;
    const refresh = req.query?.refresh === 'true' || req.query?.refresh === '1';
    const result = await getOrRunLatestCompare({
      tahun,
      userId: req.user?.id || 'system',
      refresh,
    });

    res.json({
      success: true,
      message: result.summary.is_fully_matched
        ? 'Semua transaksi sesuai antara laporan laboran dan KPA (procurement).'
        : 'Ditemukan selisih — lihat detail compare.',
      data: result,
    });
  } catch (err) {
    logger.error('getLatestKeuanganCompare error:', err);
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
}

export async function runKeuanganCompare(req, res) {
  try {
    const uploadId = req.body?.upload_id ?? req.params?.uploadId;
    if (!uploadId) {
      return res.status(400).json({ success: false, message: 'upload_id wajib diisi' });
    }

    const result = await executeCompare(uploadId, req.user?.id || 'system');
    res.json({
      success: true,
      message: result.summary.is_fully_matched
        ? 'Semua transaksi sesuai antara laporan laboran dan KPA (procurement).'
        : 'Ditemukan selisih — lihat detail compare.',
      data: result,
    });
  } catch (err) {
    logger.error('runKeuanganCompare error:', err);
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
}

export async function getKeuanganCompareOverview(req, res) {
  try {
    const data = await getCompareOverview(req.params.runId);
    res.json({ success: true, data });
  } catch (err) {
    logger.error('getKeuanganCompareOverview error:', err);
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
}

export async function getKeuanganCompareProdiDetail(req, res) {
  try {
    const kodePP = decodeURIComponent(req.params.kodePP || '_unknown');
    const data = await getCompareProdiDetail(req.params.runId, kodePP, {
      status: req.query?.status,
    });
    res.json({ success: true, data });
  } catch (err) {
    logger.error('getKeuanganCompareProdiDetail error:', err);
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
}
