import { procurementDb } from '../../../config/databases.js';
import * as justifSigningSvc from './justificationSigningService.js';

export const WET_DOC_FINANCIAL_PROPOSAL = 'financial_proposal_wet';
export const WET_DOC_JUSTIFICATION = 'justification_wet';
export const WET_DOC_BAST = 'bast';

const WET_DOC_TYPES = new Set([
  WET_DOC_FINANCIAL_PROPOSAL,
  WET_DOC_JUSTIFICATION,
  WET_DOC_BAST,
]);

const URL_ALIASES = {
  financial_proposal_wet: WET_DOC_FINANCIAL_PROPOSAL,
  'financial-proposal-wet': WET_DOC_FINANCIAL_PROPOSAL,
  justification_wet: WET_DOC_JUSTIFICATION,
  'justification-wet': WET_DOC_JUSTIFICATION,
  bast: WET_DOC_BAST,
};

let tableReady = false;

function normStatus(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s\-–—]+/g, '_');
}

export function normalizeWetDocType(raw) {
  const key = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s]+/g, '_');
  if (WET_DOC_TYPES.has(key)) return key;
  return URL_ALIASES[key] || URL_ALIASES[String(raw ?? '').trim().toLowerCase()] || null;
}

export function isAllowedWetUploadMime(mime, fileName) {
  const m = String(mime ?? '').toLowerCase();
  const n = String(fileName ?? '').toLowerCase();
  const okMime =
    m.includes('pdf') ||
    m.includes('jpeg') ||
    m.includes('jpg') ||
    m.includes('png') ||
    m.includes('webp');
  const okExt = /\.(pdf|jpe?g|png|webp)$/.test(n);
  return okMime || okExt;
}

export function assertMayManageReimbursementWetDocs(submission) {
  const st = normStatus(submission?.status);
  if (st !== 'completed' && st !== 'closed') {
    const err = new Error('Wet reimbursement documents are only for completed or closed submissions.');
    err.code = 'INVALID_STATUS';
    throw err;
  }
}

export function validateWetDocUpload(submission, docType) {
  assertMayManageReimbursementWetDocs(submission);
  if (!WET_DOC_TYPES.has(docType)) {
    const err = new Error('Invalid document type.');
    err.code = 'INVALID_DOC_TYPE';
    throw err;
  }
  const finMode = String(submission.financial_proposal_signing_mode ?? '').trim().toLowerCase();
  const justMode = String(submission.justification_signing_mode ?? '').trim().toLowerCase();

  if (docType === WET_DOC_FINANCIAL_PROPOSAL) {
    if (finMode !== 'wet') {
      const err = new Error('Upload is only allowed when financial proposal signing mode is wet.');
      err.code = 'WRONG_SIGNING_MODE';
      throw err;
    }
    return;
  }
  if (docType === WET_DOC_JUSTIFICATION) {
    if (!justifSigningSvc.submissionMeetsJustificationThreshold(submission)) {
      const err = new Error('Justification upload is not required for this submission total.');
      err.code = 'JUSTIFICATION_NOT_REQUIRED';
      throw err;
    }
    if (justMode !== 'wet') {
      const err = new Error('Upload is only allowed when justification signing mode is wet.');
      err.code = 'WRONG_SIGNING_MODE';
      throw err;
    }
    return;
  }
  // bast — optional, no signing-mode gate
}

async function ensureTable() {
  if (tableReady) return;
  await procurementDb.query(`
    CREATE TABLE IF NOT EXISTS procurement_submission_reimbursement_wet_documents (
      id SERIAL PRIMARY KEY,
      submission_id INTEGER NOT NULL REFERENCES procurement_submission(id) ON DELETE CASCADE,
      doc_type VARCHAR(48) NOT NULL,
      uploaded_by VARCHAR(128),
      file_name TEXT NOT NULL,
      mime_type VARCHAR(255),
      file_data BYTEA NOT NULL CHECK (octet_length(file_data) <= 10 * 1024 * 1024),
      created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
      updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
      CONSTRAINT procurement_sub_reimb_wet_docs_submission_type_unique
        UNIQUE (submission_id, doc_type)
    )
  `);
  await procurementDb.query(
    'CREATE INDEX IF NOT EXISTS idx_proc_sub_reimb_wet_docs_submission_id ON procurement_submission_reimbursement_wet_documents(submission_id)',
  );
  tableReady = true;
}

export async function upsertWetDocument({
  submissionId,
  docType,
  uploadedBy,
  fileName,
  mimeType,
  fileData,
}) {
  await ensureTable();
  const sql = `
    INSERT INTO procurement_submission_reimbursement_wet_documents
      (submission_id, doc_type, uploaded_by, file_name, mime_type, file_data, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, now(), now())
    ON CONFLICT (submission_id, doc_type)
    DO UPDATE SET
      uploaded_by = EXCLUDED.uploaded_by,
      file_name = EXCLUDED.file_name,
      mime_type = EXCLUDED.mime_type,
      file_data = EXCLUDED.file_data,
      updated_at = now()
    RETURNING
      id,
      submission_id AS "submissionId",
      doc_type AS "docType",
      uploaded_by AS "uploadedBy",
      file_name AS "fileName",
      mime_type AS "mimeType",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
  `;
  const { rows } = await procurementDb.query(sql, [
    submissionId,
    docType,
    uploadedBy,
    fileName,
    mimeType,
    fileData,
  ]);
  return rows[0] || null;
}

export async function getWetDocumentMeta(submissionId, docType) {
  await ensureTable();
  const { rows } = await procurementDb.query(
    `SELECT
      id,
      submission_id AS "submissionId",
      doc_type AS "docType",
      uploaded_by AS "uploadedBy",
      file_name AS "fileName",
      mime_type AS "mimeType",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
     FROM procurement_submission_reimbursement_wet_documents
     WHERE submission_id = $1 AND doc_type = $2
     LIMIT 1`,
    [submissionId, docType],
  );
  return rows[0] || null;
}

export async function getWetDocumentFile(submissionId, docType) {
  await ensureTable();
  const { rows } = await procurementDb.query(
    `SELECT
      id,
      submission_id AS "submissionId",
      doc_type AS "docType",
      uploaded_by AS "uploadedBy",
      file_name AS "fileName",
      mime_type AS "mimeType",
      file_data AS "fileData",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
     FROM procurement_submission_reimbursement_wet_documents
     WHERE submission_id = $1 AND doc_type = $2
     LIMIT 1`,
    [submissionId, docType],
  );
  return rows[0] || null;
}

export async function listWetDocumentMetaBySubmissionId(submissionId) {
  await ensureTable();
  const { rows } = await procurementDb.query(
    `SELECT
      id,
      submission_id AS "submissionId",
      doc_type AS "docType",
      uploaded_by AS "uploadedBy",
      file_name AS "fileName",
      mime_type AS "mimeType",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
     FROM procurement_submission_reimbursement_wet_documents
     WHERE submission_id = $1
     ORDER BY doc_type`,
    [submissionId],
  );
  const map = {};
  for (const row of rows) {
    map[row.docType] = row;
  }
  return map;
}

export async function deleteWetDocument(submissionId, docType) {
  await ensureTable();
  const { rows } = await procurementDb.query(
    `DELETE FROM procurement_submission_reimbursement_wet_documents
     WHERE submission_id = $1 AND doc_type = $2
     RETURNING id`,
    [submissionId, docType],
  );
  return !!rows[0];
}

export default {
  normalizeWetDocType,
  upsertWetDocument,
  getWetDocumentMeta,
  getWetDocumentFile,
  listWetDocumentMetaBySubmissionId,
  deleteWetDocument,
};
