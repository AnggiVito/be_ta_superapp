import XLSX from 'xlsx';
import { registrationDb } from '../../../config/databases.js';
import { logger } from '../../../core/utils/logger.js';
import * as profileModel from '../../user-management/models/profileModel.js';
import { SHEET_NAME } from './enrollmentTemplateService.js';

const NIM_COLUMN = 'NIM';
const KELAS_COLUMN = 'Kelas';

/**
 * @param {string} message
 * @param {string|null} column
 * @returns {never}
 */
function raiseImport(message, column = null) {
  const err = new Error(message);
  if (column) err.importColumn = column;
  throw err;
}

/** Nilai sel Excel → string (termasuk angka dari Excel). */
function cellToString(val) {
  if (val == null || val === '') return '';
  if (typeof val === 'number' && Number.isFinite(val)) return String(Math.trunc(val));
  return String(val);
}

function normalizeNim(val) {
  return cellToString(val).trim().replace(/\s/g, '');
}

function normalizeClassGroup(val) {
  return cellToString(val).trim();
}

function validateNim(nimRaw, displayValue) {
  if (!nimRaw) {
    raiseImport('Wajib diisi', NIM_COLUMN);
  }
  if (!/^[0-9]{1,15}$/.test(nimRaw)) {
    raiseImport(
      `Nilai "${displayValue}" bukan NIM valid (1-15 digit angka)`,
      NIM_COLUMN
    );
  }
  return nimRaw;
}

function validateClassGroup(classGroup) {
  if (!classGroup) {
    raiseImport('Wajib diisi', KELAS_COLUMN);
  }
  if (classGroup.length > 64) {
    raiseImport('Maksimal 64 karakter', KELAS_COLUMN);
  }
  return classGroup;
}

function pickSheet(wb) {
  const sheetNames = wb.SheetNames;
  if (sheetNames.length === 0) {
    return { sheetName: null, rows: [] };
  }

  const preferred = sheetNames.find((name) => name.trim().toLowerCase() === SHEET_NAME.toLowerCase());
  const sheetName = preferred || sheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  return { sheetName, rows };
}

async function ensurePracticumExists(client, practicumId) {
  const res = await client.query('SELECT id, name FROM practicums WHERE id = $1', [practicumId]);
  if (res.rows.length === 0) {
    const error = new Error('Praktikum tidak ditemukan');
    error.userFacing = true;
    throw error;
  }
  return res.rows[0];
}

async function buildNimProfileMap(nims) {
  const profiles = await profileModel.findByNipnims(nims);
  const map = new Map();
  for (const profile of profiles) {
    const key = String(profile.nipnim || '').trim().toLowerCase();
    if (key && !map.has(key)) {
      map.set(key, profile);
    }
  }
  return map;
}

/**
 * Process one Excel row into an enrollment insert (within transaction).
 */
async function processRow(client, row, practicumId, rowNum, sheetName, nimProfileMap, seenNims) {
  const nimRaw = validateNim(normalizeNim(row[NIM_COLUMN]), cellToString(row[NIM_COLUMN]));
  const classGroup = validateClassGroup(normalizeClassGroup(row[KELAS_COLUMN]));

  if (seenNims.has(nimRaw)) {
    raiseImport(`NIM "${nimRaw}" duplikat dalam file Excel`, NIM_COLUMN);
  }
  seenNims.add(nimRaw);

  const profile = nimProfileMap.get(nimRaw.toLowerCase());
  if (!profile) {
    raiseImport(`NIM "${nimRaw}" tidak ditemukan di user management`, NIM_COLUMN);
  }

  const insertRes = await client.query(
    `INSERT INTO practicum_enrollments (practicum_id, student_id, role, status, class_group)
     VALUES ($1, $2, 'mahasiswa', 'enrolled', $3)
     RETURNING id`,
    [practicumId, profile.user_id, classGroup]
  );

  return {
    sheet: sheetName,
    row: rowNum,
    enrollmentId: insertRes.rows[0].id,
    nim: nimRaw,
    classGroup,
    studentUserId: profile.user_id,
    studentName: profile.name || null,
  };
}

/**
 * Import practicum enrollments from Excel.
 * Re-import replaces existing mahasiswa enrollments for the practicum (role = mahasiswa).
 * All-or-nothing: any row error rolls back the entire import.
 *
 * @param {Buffer} buffer
 * @param {string} practicumId
 * @param {string|null} uploadedBy
 * @returns {Promise<{ success: Array, errors: Array }>}
 */
export async function importEnrollmentsFromExcel(buffer, practicumId, uploadedBy = null) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const { sheetName, rows } = pickSheet(wb);

  if (!sheetName) {
    return {
      success: [],
      errors: [{ sheet: null, row: 0, column: null, error: 'File Excel tidak memiliki sheet' }],
    };
  }

  const parsedRows = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    const allEmpty = Object.values(row).every((v) => v == null || String(v).trim() === '');
    if (allEmpty) continue;
    parsedRows.push({ row, rowNum });
  }

  if (parsedRows.length === 0) {
    return {
      success: [],
      errors: [{ sheet: sheetName, row: 0, column: null, error: 'Tidak ada data mahasiswa di sheet' }],
    };
  }

  const nimsForLookup = [];
  for (const { row } of parsedRows) {
    try {
      nimsForLookup.push(validateNim(normalizeNim(row[NIM_COLUMN]), cellToString(row[NIM_COLUMN])));
    } catch {
      // Validasi ulang saat proses baris; lookup partial tetap dilanjutkan.
    }
  }
  const nimProfileMap = await buildNimProfileMap(nimsForLookup);

  const results = { success: [], errors: [] };
  const client = await registrationDb.connect();

  try {
    await client.query('BEGIN');
    await ensurePracticumExists(client, practicumId);

    const deletedCount = await client.query(
      `DELETE FROM practicum_enrollments
       WHERE practicum_id = $1 AND role IN ('mahasiswa', 'student')`,
      [practicumId]
    );
    logger.info('Enrollment import: replaced student enrollments', {
      practicumId,
      deletedCount: deletedCount.rowCount,
      uploadedBy,
    });

    const seenNims = new Set();
    for (const { row, rowNum } of parsedRows) {
      try {
        const entry = await processRow(
          client,
          row,
          practicumId,
          rowNum,
          sheetName,
          nimProfileMap,
          seenNims
        );
        results.success.push(entry);
      } catch (err) {
        results.errors.push({
          sheet: sheetName,
          row: rowNum,
          column: err.importColumn ?? null,
          error: err.message,
        });
      }
    }

    if (results.errors.length === 0) {
      await client.query('COMMIT');
      logger.info('Enrollment import completed successfully', {
        practicumId,
        uploadedBy,
        totalRows: results.success.length,
      });
    } else {
      await client.query('ROLLBACK');
      logger.warn('Enrollment import rolled back due to errors', {
        practicumId,
        uploadedBy,
        successCount: results.success.length,
        errorCount: results.errors.length,
      });
    }
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Enrollment import failed:', {
      err: err.message,
      practicumId,
      uploadedBy,
    });
    const error = new Error(err.message);
    error.userFacing = Boolean(err.userFacing);
    throw error;
  } finally {
    client.release();
  }

  return results;
}
