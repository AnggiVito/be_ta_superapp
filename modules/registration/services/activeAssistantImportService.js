import XLSX from 'xlsx';
import { registrationDb } from '../../../config/databases.js';
import { logger } from '../../../core/utils/logger.js';
import * as profileModel from '../../user-management/models/profileModel.js';
import * as activeAssistantModel from '../models/activeAssistantModel.js';
import { SHEET_NAME } from './activeAssistantTemplateService.js';
import {
  requirePracticumAssignmentContext,
  applyActiveAssistantRolesOnAssignment,
} from './activeAssistantService.js';

const NIM_COLUMN = 'NIM';

function raiseImport(message, column = null) {
  const err = new Error(message);
  if (column) err.importColumn = column;
  throw err;
}

function cellToString(val) {
  if (val == null || val === '') return '';
  if (typeof val === 'number' && Number.isFinite(val)) return String(Math.trunc(val));
  return String(val);
}

function normalizeNim(val) {
  return cellToString(val).trim().replace(/\s/g, '');
}

function validateNim(nimRaw, displayValue) {
  if (!nimRaw) {
    raiseImport('Wajib diisi', NIM_COLUMN);
  }
  if (!/^[0-9]{1,15}$/.test(nimRaw)) {
    raiseImport(`Nilai "${displayValue}" bukan NIM valid (1-15 digit angka)`, NIM_COLUMN);
  }
  return nimRaw;
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

function parseRows(wb) {
  const { sheetName, rows } = pickSheet(wb);

  if (!sheetName) {
    return {
      sheetName: null,
      parsedRows: [],
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
      sheetName,
      parsedRows: [],
      errors: [{ sheet: sheetName, row: 0, column: null, error: 'Tidak ada data asisten aktif di sheet' }],
    };
  }

  return { sheetName, parsedRows, errors: [] };
}

function validateParsedRows(sheetName, parsedRows, nimProfileMap) {
  const results = { success: [], errors: [] };
  const seenNims = new Set();

  for (const { row, rowNum } of parsedRows) {
    try {
      const nimRaw = validateNim(normalizeNim(row[NIM_COLUMN]), cellToString(row[NIM_COLUMN]));

      if (seenNims.has(nimRaw)) {
        raiseImport(`NIM "${nimRaw}" duplikat dalam file Excel`, NIM_COLUMN);
      }
      seenNims.add(nimRaw);

      const profile = nimProfileMap.get(nimRaw.toLowerCase());
      if (!profile) {
        raiseImport(`NIM "${nimRaw}" tidak ditemukan di user management`, NIM_COLUMN);
      }

      results.success.push({
        sheet: sheetName,
        row: rowNum,
        nim: nimRaw,
        user_id: profile.user_id,
        name: profile.name || null,
      });
    } catch (err) {
      results.errors.push({
        sheet: sheetName,
        row: rowNum,
        column: err.importColumn ?? null,
        error: err.message,
      });
    }
  }

  return results;
}

/**
 * Import asisten praktikum aktif from Excel for a selected practicum in the current active periode.
 * Re-import hanya mengganti daftar praktikum terpilih (bukan seluruh periode).
 * Role asisten_praktikum + asisten_praktikum_aktif di-assign segera setelah import.
 *
 * @param {Buffer} buffer
 * @param {string} practicumId
 * @param {string|null} uploadedBy
 */
export async function importActiveAssistantsFromExcel(buffer, practicumId, uploadedBy = null) {
  const practicumCtx = await requirePracticumAssignmentContext(practicumId);
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const { sheetName, parsedRows, errors: sheetErrors } = parseRows(wb);

  if (sheetErrors.length > 0) {
    return { success: [], errors: sheetErrors };
  }

  const nimsForLookup = [];
  for (const { row } of parsedRows) {
    try {
      nimsForLookup.push(validateNim(normalizeNim(row[NIM_COLUMN]), cellToString(row[NIM_COLUMN])));
    } catch {
      // Validated again per row below.
    }
  }
  const nimProfileMap = await buildNimProfileMap(nimsForLookup);
  const validation = validateParsedRows(sheetName, parsedRows, nimProfileMap);

  if (validation.errors.length > 0) {
    return {
      success: [],
      errors: validation.errors,
      preview: validation.success,
    };
  }

  const client = await registrationDb.connect();

  try {
    await client.query('BEGIN');

    const savedRows = await activeAssistantModel.replaceForPracticum(
      practicumCtx.practicum_id,
      practicumCtx.periode_key,
      practicumCtx.periode_label,
      practicumCtx.active_periode,
      validation.success.map((entry) => ({ user_id: entry.user_id, nim: entry.nim })),
      uploadedBy,
      client
    );

    await client.query('COMMIT');

    const userIds = validation.success.map((entry) => entry.user_id).filter(Boolean);
    await applyActiveAssistantRolesOnAssignment(userIds, uploadedBy);

    logger.info('Active assistant import completed', {
      practicum_id: practicumCtx.practicum_id,
      periode_key: practicumCtx.periode_key,
      uploadedBy,
      totalRows: validation.success.length,
    });

    return {
      success: validation.success.map((entry, index) => ({
        ...entry,
        assignmentId: savedRows[index]?.id || null,
      })),
      errors: [],
      active_periode: practicumCtx.active_periode,
      periode_key: practicumCtx.periode_key,
      practicum_id: practicumCtx.practicum_id,
      practicum: practicumCtx.practicum,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Active assistant import failed:', {
      err: err.message,
      practicum_id: practicumCtx.practicum_id,
      periode_key: practicumCtx.periode_key,
      uploadedBy,
    });
    const error = new Error(err.message);
    error.userFacing = Boolean(err.userFacing);
    throw error;
  } finally {
    client.release();
  }
}
