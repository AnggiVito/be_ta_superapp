import fs from 'fs/promises';
import path from 'path';
import { registrationDb } from '../../../config/databases.js';
import { logger } from '../../../core/utils/logger.js';

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

export async function createKsmImport(uploadedBy, filename, originalFilename, moduleId = null) {
  // Require a valid uploader id for per-user imports. If missing, create a standalone import (admin/system use)
  // Use a single-row lookup and update to avoid accidentally touching other users' records.
  try {
    if (uploadedBy == null || String(uploadedBy).trim() === '') {
      // No uploader provided: insert a standalone import (do not attempt to reuse/replace)
      const sql = `INSERT INTO ksm_imports (uploaded_by, filename, original_filename, module_id, status) VALUES ($1, $2, $3, $4, 'pending') RETURNING id`;
      const res = await registrationDb.query(sql, [null, filename, originalFilename, moduleId]);
      return { id: res.rows[0]?.id, replaced: false };
    }

    // Lookup most recent import for this specific user (cast to text to avoid UUID/text mismatch issues)
    const existingSql = `SELECT id, filename FROM ksm_imports WHERE uploaded_by::text = $1 ORDER BY created_at DESC LIMIT 1`;
    const existingRes = await registrationDb.query(existingSql, [String(uploadedBy)]);
    if (existingRes.rows.length > 0) {
      const existingId = existingRes.rows[0].id;
      const previousFilename = existingRes.rows[0].filename || null;

      const updateSql = `UPDATE ksm_imports SET filename = $1, original_filename = $2, module_id = $3, status = 'pending' WHERE id = $4 RETURNING id`;
      const updateRes = await registrationDb.query(updateSql, [filename, originalFilename, moduleId, existingId]);
      return { id: updateRes.rows[0]?.id, replaced: true, previousFilename };
    }

    const sql = `INSERT INTO ksm_imports (uploaded_by, filename, original_filename, module_id, status) VALUES ($1, $2, $3, $4, 'pending') RETURNING id`;
    const res = await registrationDb.query(sql, [uploadedBy, filename, originalFilename, moduleId]);
    return { id: res.rows[0]?.id, replaced: false };
  } catch (e) {
    logger.error('Error in createKsmImport:', { err: e, uploadedBy, filename });
    throw e;
  }
}

export async function markImportStatus(importId, status, note = null) {
  const sql = `UPDATE ksm_imports SET status = $1, note = $2 WHERE id = $3`;
  await registrationDb.query(sql, [status, note, importId]);
}

/**
 * Stub processor: simulate OCR + parsing by inserting a sample entry and marking completed
 */
export async function processKsmStub(importId, filePath, uploadedBy) {
  try {
    await markImportStatus(importId, 'processing');

    // In a real implementation: run OCR on filePath, parse text and extract rows
    // Here we insert a sample entry to demonstrate the flow
    const sampleSql = `INSERT INTO ksm_entries (ksm_import_id, nim, course_code, course_name, day, time_range, location, mapped) VALUES ($1,$2,$3,$4,$5,$6,$7,false)`;
    await registrationDb.query(sampleSql, [importId, '202210001', 'KSM101', 'Praktikum Dasar', 'Senin', '08:00-10:00', 'Lab A']);

    await markImportStatus(importId, 'completed');
    logger.info('KSM stub processing completed', { importId, filePath, uploadedBy });
  } catch (error) {
    logger.error('Error processing KSM stub', { error, importId });
    try { await markImportStatus(importId, 'failed', String(error)); } catch (e) { /* ignore */ }
  }
}
