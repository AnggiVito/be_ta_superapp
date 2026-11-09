import { generateEnrollmentTemplateBuffer } from '../services/enrollmentTemplateService.js';
import { importEnrollmentsFromExcel } from '../services/enrollmentImportService.js';
import { logger } from '../../../core/utils/logger.js';

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export const ENROLLMENT_TEMPLATE_DOWNLOAD_FILENAME = 'template assign praktikan.xlsx';

function isValidUuid(v) {
  return typeof v === 'string' && UUID_REGEX.test(v);
}

/**
 * GET /api/registration/practicums/enrollments/template/download
 */
export async function downloadTemplate(req, res) {
  try {
    const buffer = generateEnrollmentTemplateBuffer();
    const fn = ENROLLMENT_TEMPLATE_DOWNLOAD_FILENAME;
    const fnEncoded = encodeURIComponent(fn);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fn}"; filename*=UTF-8''${fnEncoded}`
    );
    res.setHeader('Content-Length', buffer.length);
    return res.send(buffer);
  } catch (err) {
    logger.error('Error in downloadEnrollmentTemplate:', err);
    return res.status(500).json({ success: false, message: 'Gagal mengunduh template' });
  }
}

/**
 * POST /api/registration/practicums/:practicumId/enrollments/import
 * Body (multipart/form-data):
 *   - enrollment_file: file Excel (.xlsx)
 */
export async function importEnrollments(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'File Excel tidak ditemukan' });
    }

    const practicumId = req.params.practicumId;
    if (!practicumId) {
      return res.status(400).json({ success: false, message: 'practicum_id wajib diisi' });
    }
    if (!isValidUuid(practicumId)) {
      return res.status(400).json({ success: false, message: 'practicum_id tidak valid (harus UUID)' });
    }

    const uploadedBy = req.user?.id || null;
    const results = await importEnrollmentsFromExcel(req.file.buffer, practicumId, uploadedBy);

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
      message: `${results.success.length} mahasiswa berhasil di-assign ke praktikum`,
      data: results.success,
    });
  } catch (err) {
    logger.error('Error in importEnrollments:', err);

    if (err.userFacing) {
      return res.status(400).json({ success: false, message: err.message });
    }

    return res.status(500).json({ success: false, message: 'Gagal mengimport assign praktikan dari Excel' });
  }
}
