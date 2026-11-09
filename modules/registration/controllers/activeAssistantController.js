import { generateActiveAssistantTemplateBuffer } from '../services/activeAssistantTemplateService.js';
import { importActiveAssistantsFromExcel } from '../services/activeAssistantImportService.js';
import { listActiveAssistantsForPracticum } from '../services/activeAssistantService.js';
import { logger } from '../../../core/utils/logger.js';

export const ACTIVE_ASSISTANT_TEMPLATE_FILENAME = 'template asisten aktif.xlsx';

export async function downloadTemplate(req, res) {
  try {
    const buffer = generateActiveAssistantTemplateBuffer();
    const fn = ACTIVE_ASSISTANT_TEMPLATE_FILENAME;
    const fnEncoded = encodeURIComponent(fn);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fn}"; filename*=UTF-8''${fnEncoded}`
    );
    res.setHeader('Content-Length', buffer.length);
    return res.send(buffer);
  } catch (err) {
    logger.error('Error in downloadActiveAssistantTemplate:', err);
    return res.status(500).json({ success: false, message: 'Gagal mengunduh template' });
  }
}

/**
 * POST /api/registration/active-assistants/import
 * Body (multipart/form-data): assistant_file, practicum_id
 */
export async function importActiveAssistants(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'File Excel tidak ditemukan' });
    }

    const practicumId = req.body?.practicum_id;
    if (!practicumId) {
      return res.status(400).json({
        success: false,
        message: 'practicum_id wajib diisi sebelum import asisten aktif',
      });
    }

    const uploadedBy = req.user?.id ? String(req.user.id) : null;
    const results = await importActiveAssistantsFromExcel(req.file.buffer, practicumId, uploadedBy);

    if (results.errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Terdapat ${results.errors.length} error. Tidak ada data yang disimpan (rollback).`,
        errors: results.errors,
        preview: results.preview,
      });
    }

    return res.json({
      success: true,
      message: `${results.success.length} asisten aktif berhasil didaftarkan untuk praktikum ${results.practicum?.name || results.practicum_id} (periode ${results.periode_key}). Role asisten sudah di-assign.`,
      data: results.success,
      active_periode: results.active_periode,
      periode_key: results.periode_key,
      practicum_id: results.practicum_id,
      practicum: results.practicum,
    });
  } catch (err) {
    logger.error('Error in importActiveAssistants:', err);

    if (
      err.userFacing
      || err.code === 'ACTIVE_PERIODE_NOT_CONFIGURED'
      || err.code === 'PRACTICUM_ID_REQUIRED'
      || err.code === 'PRACTICUM_NOT_FOUND'
      || err.code === 'PRACTICUM_PERIODE_MISMATCH'
    ) {
      return res.status(400).json({ success: false, message: err.message });
    }

    return res.status(500).json({
      success: false,
      message: 'Gagal mengimport asisten aktif dari Excel',
    });
  }
}

/**
 * GET /api/registration/active-assistants?practicum_id=
 */
export async function listActiveAssistants(req, res) {
  try {
    const practicumId = req.query?.practicum_id;
    if (!practicumId) {
      return res.status(400).json({
        success: false,
        message: 'practicum_id wajib diisi',
      });
    }

    const result = await listActiveAssistantsForPracticum(practicumId);
    return res.json({
      success: true,
      active_periode: result.active_periode,
      periode_key: result.periode_key,
      practicum_id: result.practicum_id,
      practicum: result.practicum,
      data: result.data,
    });
  } catch (err) {
    logger.error('Error in listActiveAssistants:', err);

    if (
      err.userFacing
      || err.code === 'ACTIVE_PERIODE_NOT_CONFIGURED'
      || err.code === 'PRACTICUM_ID_REQUIRED'
      || err.code === 'PRACTICUM_NOT_FOUND'
      || err.code === 'PRACTICUM_PERIODE_MISMATCH'
    ) {
      return res.status(400).json({ success: false, message: err.message });
    }

    return res.status(500).json({
      success: false,
      message: 'Gagal mengambil daftar asisten aktif',
    });
  }
}
