import XLSX from 'xlsx';
import { registrationDb } from '../../../config/databases.js';
import { logger } from '../../../core/utils/logger.js';
import {
  getActiveAssistantRegistryForPracticum,
} from './activeAssistantService.js';

const HARI_MAP = {
  0: 'Minggu',
  1: 'Senin',
  2: 'Selasa',
  3: 'Rabu',
  4: 'Kamis',
  5: 'Jumat',
  6: 'Sabtu',
};

/** Header kolom NIM di template (fallback import file lama: "Kode Asisten"). */
const NIM_COLUMN = 'NIM Asisten';

/**
 * Lempar error validasi import; `importColumn` dipakai API untuk menunjuk kolom Excel.
 * @param {string} message
 * @param {string|null} column
 * @returns {never}
 */
function raiseImport(message, column = null) {
  const err = new Error(message);
  if (column) err.importColumn = column;
  throw err;
}

/**
 * Parse time value from Excel cell.
 * Handles both string "HH:MM" and Excel serial number (fraction of day).
 */
function parseTime(val) {
  if (val == null || val === '') return null;

  if (typeof val === 'string') {
    const match = val.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (match) {
      const h = match[1].padStart(2, '0');
      const m = match[2];
      return `${h}:${m}`;
    }
    return null;
  }

  if (typeof val === 'number') {
    const totalMinutes = Math.round(val * 24 * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  return null;
}

/**
 * Parse date value from Excel cell.
 */
function parseDate(val) {
  if (val == null || val === '') return null;

  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const testDate = new Date(trimmed);
      if (!isNaN(testDate.getTime())) return trimmed;
    }
    const ddmmyyyy = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (ddmmyyyy) {
      return `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`;
    }
  }

  if (typeof val === 'number') {
    const excelEpoch = new Date(1899, 11, 30);
    const date = new Date(excelEpoch.getTime() + val * 86400000);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return null;
}

/**
 * Calculate hour duration between two time strings "HH:MM"
 */
function calculateHours(jamMulai, jamBerakhir) {
  const [h1, m1] = jamMulai.split(':').map(Number);
  const [h2, m2] = jamBerakhir.split(':').map(Number);
  const totalMinutes = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (totalMinutes <= 0) return null;
  return parseFloat((totalMinutes / 60).toFixed(2));
}

/** Nilai sel Excel → string (termasuk angka dari Excel). */
function cellToString(val) {
  if (val == null || val === '') return '';
  if (typeof val === 'number' && Number.isFinite(val)) return String(val);
  return String(val);
}

/** Pisahkan beberapa NIM: koma atau titik koma (sering salah ketik di Excel). */
function splitNimList(val) {
  const s = cellToString(val).trim();
  if (!s) return [];
  return s
    .split(/[,;]+/)
    .map((x) => x.trim())
    .filter((x) => x !== '');
}

/** Hilangkan duplikat NIM dalam satu baris (urutan tetap). */
function uniqueNimOrder(nims) {
  const seen = new Set();
  const out = [];
  for (const n of nims) {
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

/**
 * Daftar NIM dari kolom "NIM Asisten" (fallback header template lama: "Kode Asisten").
 * Hanya angka 1-15 digit per entri; pemisah: koma (,) atau titik koma (;).
 */
function parseExcelAssistantNims(row) {
  const rawNim = row['NIM Asisten'] ?? row['Kode Asisten'] ?? '';
  const nims = splitNimList(rawNim);
  if (nims.length === 0) return [];

  const validated = [];
  for (const token of nims) {
    const trimmed = token.trim();
    const nimRaw = trimmed.replace(/\s/g, '');
    if (nimRaw.length > 15 && /^[0-9]+$/.test(nimRaw)) {
      raiseImport(
        `Nilai "${trimmed}" terlalu panjang — kemungkinan beberapa NIM digabung tanpa pemisah. ` +
          'Pisahkan tiap NIM dengan koma (,) atau titik koma (;).',
        NIM_COLUMN
      );
    }
    if (!/^[0-9]{1,15}$/.test(nimRaw)) {
      raiseImport(
        `Nilai "${trimmed}" bukan NIM valid (per asisten: 1-15 digit angka). ` +
          'Pisahkan beberapa NIM dengan koma (,) atau titik koma (;). ' +
          'Jangan gunakan spasi, garis, atau huruf sebagai pemisah.',
        NIM_COLUMN
      );
    }
    validated.push(nimRaw);
  }
  return uniqueNimOrder(validated);
}

/**
 * Validate hierarchy: practicum belongs to laboratory, and laboratory belongs to study program.
 * Returns an object indicating which level failed.
 */
async function validateHierarchy(client, studyProgramId, laboratoryId, practicumId) {
  // Check lab belongs to study program
  const labRes = await client.query(
    `SELECT id FROM laboratories
     WHERE id = $1 AND study_program_id = $2`,
    [laboratoryId, studyProgramId]
  );
  if (labRes.rows.length === 0) {
    return { valid: false, reason: 'Laboratorium tidak ditemukan untuk program studi yang dipilih' };
  }

  // Check practicum belongs to lab
  const pracRes = await client.query(
    `SELECT id FROM practicums
     WHERE id = $1 AND laboratory_id = $2`,
    [practicumId, laboratoryId]
  );
  if (pracRes.rows.length === 0) {
    return { valid: false, reason: 'Praktikum tidak ditemukan untuk laboratorium yang dipilih' };
  }

  return { valid: true };
}

/**
 * Fetch all practicum_modules for a practicum, ordered by sequence.
 */
async function getOrderedModules(client, practicumId) {
  const res = await client.query(
    `SELECT id, name, sequence
     FROM practicum_modules
     WHERE practicum_id = $1
     ORDER BY sequence ASC, created_at ASC`,
    [practicumId]
  );
  return res.rows;
}

/**
 * Process a single row of schedule data within a transaction.
 * Inserts schedule + linked assistants.
 */
async function processRow(client, row, moduleId, rowNum, sheetName, activeAssistantNims = null) {
  const detailKegiatan = String(row['Detail Kegiatan'] || '').trim();
  const tanggal = parseDate(row['Tanggal']);
  const jamMulai = parseTime(row['Jam Mulai']);
  const jamBerakhir = parseTime(row['Jam Berakhir']);
  const kelasRaw = String(row['Kelas'] || '').trim().toLowerCase();

  if (!detailKegiatan) raiseImport('Wajib diisi', 'Detail Kegiatan');
  if (!tanggal) raiseImport('Wajib diisi (format: YYYY-MM-DD atau DD/MM/YYYY)', 'Tanggal');
  if (!jamMulai) raiseImport('Wajib diisi (format: HH:MM)', 'Jam Mulai');
  if (!jamBerakhir) raiseImport('Wajib diisi (format: HH:MM)', 'Jam Berakhir');
  if (!['reguler', 'inter'].includes(kelasRaw)) {
    raiseImport('Harus "reguler" atau "inter" (huruf kecil)', 'Kelas');
  }

  const assistantNims = parseExcelAssistantNims(row);

  if (assistantNims.length > 0) {
    if (!activeAssistantNims) {
      raiseImport(
        'Periode aktif belum dikonfigurasi atau daftar asisten aktif kosong',
        NIM_COLUMN
      );
    }
    for (const nim of assistantNims) {
      if (!activeAssistantNims.has(String(nim).toLowerCase())) {
        raiseImport(`NIM "${nim}" bukan asisten aktif terdaftar untuk praktikum ini`, NIM_COLUMN);
      }
    }
  }

  const hitunganJam = calculateHours(jamMulai, jamBerakhir);
  if (hitunganJam == null || hitunganJam <= 0) {
    raiseImport('Jam Berakhir harus setelah Jam Mulai', 'Jam Berakhir');
  }

  const dateObj = new Date(tanggal + 'T00:00:00');
  const hari = HARI_MAP[dateObj.getDay()];

  const startTime = `${tanggal} ${jamMulai}:00`;
  const endTime = `${tanggal} ${jamBerakhir}:00`;

  const insertRes = await client.query(
    `INSERT INTO schedules
       (module_id, start_time, end_time, venue, detail_kegiatan, tanggal, jam_mulai, jam_berakhir, hitungan_jam, kelas)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [moduleId, startTime, endTime, null, detailKegiatan, tanggal, jamMulai, jamBerakhir, hitunganJam, kelasRaw]
  );
  const scheduleId = insertRes.rows[0].id;

  for (const nim of assistantNims) {
    await client.query(
      `INSERT INTO schedule_assistants (schedule_id, user_id, nim)
       VALUES ($1, NULL, $2)`,
      [scheduleId, nim]
    );
  }

  return {
    sheet: sheetName,
    row: rowNum,
    scheduleId,
    moduleId,
    hari,
    detailKegiatan,
    tanggal,
    jamMulai,
    jamBerakhir,
    hitunganJam,
    kelas: kelasRaw,
    assistants: assistantNims.map((nim) => ({ nim })),
  };
}

/**
 * Import schedule data from an Excel buffer into the database.
 * Mapping logic:
 *   - Sheet ke-0 (urutan pertama) -> practicum_module dengan sequence terendah
 *   - Sheet ke-1 -> module sequence berikutnya, dst
 *   - Jika jumlah sheet < jumlah module: sisa module diabaikan (ACC)
 *   - Jika jumlah sheet > jumlah module: ERROR (kelebihan sheet tidak punya tujuan module)
 *   - Sebelum memproses tiap sheet: semua jadwal untuk practicum_module yang dipetakan ke sheet itu
 *     dihapus dulu, lalu baris Excel di-insert — re-import tidak menggandakan jadwal (CASCADE ke asisten, slot, booking).
 *   - Jika ada error pada salah satu baris: seluruh transaksi di-rollback (termasuk penghapusan tadi); tidak ada perubahan di DB.
 *
 * Hirarki yang divalidasi: study_program -> laboratory -> practicum -> module
 *
 * @param {Buffer} buffer - The uploaded Excel file buffer
 * @param {string} studyProgramId - Study program ID (UUID)
 * @param {string} laboratoryId - Laboratory ID (UUID), harus milik studyProgramId
 * @param {string} practicumId - Practicum ID (UUID), harus milik laboratoryId
 * @param {string} uploadedBy - The user ID who uploaded the file
 * @returns {{ success: Array, errors: Array }}
 */
export async function importScheduleFromExcel(buffer, studyProgramId, laboratoryId, practicumId, uploadedBy) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetNames = wb.SheetNames;

  if (sheetNames.length === 0) {
    return {
      success: [],
      errors: [{ sheet: null, row: 0, column: null, error: 'File Excel tidak memiliki sheet' }],
    };
  }

  const results = { success: [], errors: [] };
  const client = await registrationDb.connect();
  let activeAssistantNims = null;

  try {
    await client.query('BEGIN');

    // Validate hierarchy: study_program -> laboratory -> practicum
    const hierarchy = await validateHierarchy(client, studyProgramId, laboratoryId, practicumId);
    if (!hierarchy.valid) {
      throw new Error(hierarchy.reason);
    }

    // Fetch all modules for this practicum, ordered by sequence
    const modules = await getOrderedModules(client, practicumId);
    if (modules.length === 0) {
      throw new Error('Praktikum ini belum memiliki module. Tambahkan module terlebih dahulu.');
    }

    // Validate sheet count vs module count
    if (sheetNames.length > modules.length) {
      throw new Error(
        `Jumlah sheet di Excel (${sheetNames.length}) melebihi jumlah module di praktikum ini (${modules.length}). ` +
        `Hapus sheet yang berlebih atau tambahkan module di praktikum.`
      );
    }

    // Process each sheet -> module mapping
    for (let sheetIdx = 0; sheetIdx < sheetNames.length; sheetIdx++) {
      const sheetName = sheetNames[sheetIdx];
      const targetModule = modules[sheetIdx];
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

      // Timpa jadwal lama untuk module ini agar re-import tidak menggandakan baris jadwal.
      // CASCADE: schedule_assistants, schedule_slots, schedule_bookings ikut terhapus.
      const delRes = await client.query('DELETE FROM schedules WHERE module_id = $1', [targetModule.id]);
      logger.info('Schedule import: replaced module schedules', {
        moduleId: targetModule.id,
        sheetName,
        deletedCount: delRes.rowCount,
        practicumId,
      });

      if (rows.length === 0) {
        continue;
      }

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2; // Row 1 = header, data starts at row 2

        // Skip rows where all values are empty
        const allEmpty = Object.values(row).every(v => v == null || String(v).trim() === '');
        if (allEmpty) continue;

        try {
          if (!activeAssistantNims) {
            const assistantNims = parseExcelAssistantNims(row);
            if (assistantNims.length > 0) {
              const registry = await getActiveAssistantRegistryForPracticum(practicumId);
              activeAssistantNims = registry.nims;
            }
          }

          const entry = await processRow(
            client,
            row,
            targetModule.id,
            rowNum,
            sheetName,
            activeAssistantNims
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
    }

    if (results.errors.length === 0) {
      await client.query('COMMIT');

      logger.info('Schedule import completed successfully', {
        studyProgramId,
        laboratoryId,
        practicumId,
        uploadedBy,
        totalRows: results.success.length,
      });
    } else {
      await client.query('ROLLBACK');
      logger.warn('Schedule import rolled back due to errors', {
        studyProgramId,
        laboratoryId,
        practicumId,
        uploadedBy,
        successCount: results.success.length,
        errorCount: results.errors.length,
      });
    }
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Schedule import failed:', {
      err: err.message,
      studyProgramId,
      laboratoryId,
      practicumId,
      uploadedBy,
    });
    const error = new Error(err.message);
    error.userFacing = true;
    throw error;
  } finally {
    client.release();
  }

  return results;
}
