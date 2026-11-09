import { generateScheduleTemplateBuffer, DEFAULT_MODULE_COUNT } from '../services/scheduleTemplateService.js';
import { importScheduleFromExcel } from '../services/scheduleImportService.js';
import { logger } from '../../../core/utils/logger.js';

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** Nama file unduhan tetap (bukan UUID / nama dinamis). */
export const SCHEDULE_TEMPLATE_DOWNLOAD_FILENAME = 'template penjadwalan.xlsx';

function isValidUuid(v) {
  return typeof v === 'string' && UUID_REGEX.test(v);
}

/**
 * GET /api/registration/schedules/template/download
 * Optional query: ?count=N untuk menentukan jumlah sheet (default 1, max 50)
 */
export async function downloadTemplate(req, res) {
  try {
    let count = DEFAULT_MODULE_COUNT;
    if (req.query?.count) {
      const parsed = parseInt(req.query.count, 10);
      if (!isNaN(parsed) && parsed > 0) {
        count = parsed;
      }
    }

    const buffer = generateScheduleTemplateBuffer(count);

    const fn = SCHEDULE_TEMPLATE_DOWNLOAD_FILENAME;
    const fnEncoded = encodeURIComponent(fn);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fn}"; filename*=UTF-8''${fnEncoded}`
    );
    res.setHeader('Content-Length', buffer.length);
    return res.send(buffer);
  } catch (err) {
    logger.error('Error in downloadTemplate:', err);
    return res.status(500).json({ success: false, message: 'Gagal mengunduh template' });
  }
}

/**
 * POST /api/registration/schedules/import
 * Body (multipart/form-data):
 *   - schedule_file: file Excel (.xlsx)
 *   - study_program_id: UUID
 *   - laboratory_id: UUID (harus milik study_program_id)
 *   - practicum_id: UUID (harus milik laboratory_id)
 *
 * Sheet ke-N di Excel akan dipetakan ke practicum_module ke-N (urut by sequence).
 */
export async function importSchedule(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'File Excel tidak ditemukan' });
    }

    const studyProgramId = req.body?.study_program_id;
    const laboratoryId = req.body?.laboratory_id;
    const practicumId = req.body?.practicum_id;

    if (!studyProgramId) {
      return res.status(400).json({ success: false, message: 'study_program_id wajib diisi' });
    }
    if (!isValidUuid(studyProgramId)) {
      return res.status(400).json({ success: false, message: 'study_program_id tidak valid (harus UUID)' });
    }
    if (!laboratoryId) {
      return res.status(400).json({ success: false, message: 'laboratory_id wajib diisi' });
    }
    if (!isValidUuid(laboratoryId)) {
      return res.status(400).json({ success: false, message: 'laboratory_id tidak valid (harus UUID)' });
    }
    if (!practicumId) {
      return res.status(400).json({ success: false, message: 'practicum_id wajib diisi' });
    }
    if (!isValidUuid(practicumId)) {
      return res.status(400).json({ success: false, message: 'practicum_id tidak valid (harus UUID)' });
    }

    const uploadedBy = req.user?.id || null;
    const results = await importScheduleFromExcel(
      req.file.buffer,
      studyProgramId,
      laboratoryId,
      practicumId,
      uploadedBy
    );

    if (results.errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Terdapat ${results.errors.length} error. Tidak ada data yang disimpan (rollback).`,
        errors: results.errors,
        preview: results.success,
      });
    }

    return res.json({
      success: true,
      message: `${results.success.length} jadwal berhasil diimport`,
      data: results.success,
    });
  } catch (err) {
    logger.error('Error in importSchedule:', err);

    // Errors thrown from service (user-facing) -> 400
    if (err.userFacing) {
      return res.status(400).json({ success: false, message: err.message });
    }

    return res.status(500).json({ success: false, message: 'Gagal mengimport jadwal dari Excel' });
  }
}
