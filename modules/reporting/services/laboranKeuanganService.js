/**
 * Upload & proses laporan keuangan laboran (multi-sheet Excel).
 */

import fs from 'fs';
import { logger } from '../../../core/utils/logger.js';
import { reportingDb } from '../../../config/databases.js';
import { parseKpaWorkbook } from './kpaParsingService.js';
import { normalizeLaboranTransactionsByBukti } from './laboranKeuanganNormalizationService.js';
import {
  insertLaboranUpload,
  insertLaboranSheet,
  bulkInsertLaboranTransactions,
  listLaboranUploads,
  getLaboranUploadById,
  listLaboranSheets,
} from '../models/laboranKeuanganModel.js';

const UPLOAD_DIR = 'uploads/laboran-keuangan';

function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

export async function processLaboranKeuanganUpload(file, userId, tahunParam) {
  ensureUploadDir();

  const tahun = parseInt(String(tahunParam), 10);
  if (!Number.isFinite(tahun) || tahun < 2000 || tahun > 2100) {
    throw new Error('Parameter tahun tidak valid (2000–2100).');
  }

  const sheets = parseKpaWorkbook(file.path);
  if (!sheets.length) {
    throw new Error('Tidak ada sheet valid dengan metadata prodi atau transaksi.');
  }

  const yearMismatch = sheets.find((s) => s.metadata?.tahun && s.metadata.tahun !== tahun);
  if (yearMismatch) {
    throw new Error(
      `Tahun di sheet "${yearMismatch.sheetName}" (${yearMismatch.metadata.tahun}) `
      + `tidak sama dengan tahun upload (${tahun}).`
    );
  }

  let totalTx = 0;
  const client = await reportingDb.connect();
  let committed = false;

  try {
    await client.query('BEGIN');

    const upload = await insertLaboranUpload(client, {
      tahun,
      fileName: file.originalname,
      filePath: file.path,
      fileSize: file.size,
      sheetCount: sheets.length,
      transactionCount: 0,
      uploadedBy: userId,
    });

    for (const sheet of sheets) {
      const normalized = normalizeLaboranTransactionsByBukti(sheet.transactions);
      if (!normalized.length && !sheet.metadata?.kode_pp && !sheet.metadata?.nama_pp) {
        continue;
      }

      const sheetRow = await insertLaboranSheet(client, {
        uploadId: upload.id,
        sheetName: sheet.sheetName,
        sheetIndex: sheet.sheetIndex,
        metadata: sheet.metadata,
        anggaranPerTw: sheet.anggaranPerTw,
      });

      const inserted = await bulkInsertLaboranTransactions(
        client,
        upload.id,
        sheetRow.id,
        normalized
      );
      totalTx += inserted;
    }

    if (totalTx === 0) {
      throw new Error('Tidak ada transaksi valid setelah normalisasi per No Bukti.');
    }

    await client.query(
      `UPDATE laboran_keuangan_uploads SET transaction_count = $2 WHERE id = $1`,
      [upload.id, totalTx]
    );

    await client.query('COMMIT');
    committed = true;

    return {
      upload: {
        ...upload,
        transaction_count: totalTx,
        sheet_count: sheets.length,
      },
      sheets: await listLaboranSheets(upload.id),
    };
  } catch (err) {
    if (!committed) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        logger.error('Laboran upload rollback failed:', rollbackErr);
      }
      if (file.path && fs.existsSync(file.path)) {
        try {
          fs.unlinkSync(file.path);
        } catch (_) {
          /* ignore */
        }
      }
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function getLaboranUploadDetail(uploadId) {
  const upload = await getLaboranUploadById(uploadId);
  if (!upload) return null;
  const sheets = await listLaboranSheets(uploadId);
  return { upload, sheets };
}

export { listLaboranUploads };
