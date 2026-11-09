import { procurementDb } from '../../../config/databases.js';

let tableReady = false;

async function ensureTable() {
  if (tableReady) return;

  await procurementDb.query(`
    CREATE TABLE IF NOT EXISTS procurement_submission_proposals (
      id SERIAL PRIMARY KEY,
      submission_id INTEGER NOT NULL REFERENCES procurement_submission(id) ON DELETE CASCADE,
      uploaded_by VARCHAR(128),
      file_name TEXT NOT NULL,
      mime_type VARCHAR(255),
      file_data BYTEA NOT NULL CHECK (octet_length(file_data) <= 10 * 1024 * 1024),
      created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
      updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
      CONSTRAINT procurement_submission_proposals_submission_id_unique UNIQUE (submission_id)
    )
  `);

  await procurementDb.query(
    'CREATE INDEX IF NOT EXISTS idx_proc_submission_proposals_submission_id ON procurement_submission_proposals(submission_id)'
  );

  tableReady = true;
}

export async function upsertProposalForSubmission({ submissionId, uploadedBy, fileName, mimeType, fileData }) {
  await ensureTable();
  const sql = `
    INSERT INTO procurement_submission_proposals
      (submission_id, uploaded_by, file_name, mime_type, file_data, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, now(), now())
    ON CONFLICT (submission_id)
    DO UPDATE SET
      uploaded_by = EXCLUDED.uploaded_by,
      file_name = EXCLUDED.file_name,
      mime_type = EXCLUDED.mime_type,
      file_data = EXCLUDED.file_data,
      updated_at = now()
    RETURNING
      id,
      submission_id AS "submissionId",
      uploaded_by AS "uploadedBy",
      file_name AS "fileName",
      mime_type AS "mimeType",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
  `;

  const { rows } = await procurementDb.query(sql, [submissionId, uploadedBy, fileName, mimeType, fileData]);
  return rows[0] || null;
}

export async function getProposalMetaBySubmissionId(submissionId) {
  await ensureTable();
  const sql = `
    SELECT
      id,
      submission_id AS "submissionId",
      uploaded_by AS "uploadedBy",
      file_name AS "fileName",
      mime_type AS "mimeType",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    FROM procurement_submission_proposals
    WHERE submission_id = $1
    LIMIT 1
  `;
  const { rows } = await procurementDb.query(sql, [submissionId]);
  return rows[0] || null;
}

export async function getProposalFileBySubmissionId(submissionId) {
  await ensureTable();
  const sql = `
    SELECT
      id,
      submission_id AS "submissionId",
      uploaded_by AS "uploadedBy",
      file_name AS "fileName",
      mime_type AS "mimeType",
      file_data AS "fileData",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    FROM procurement_submission_proposals
    WHERE submission_id = $1
    LIMIT 1
  `;
  const { rows } = await procurementDb.query(sql, [submissionId]);
  return rows[0] || null;
}

export async function deleteProposalBySubmissionId(submissionId) {
  await ensureTable();
  const sql = `
    DELETE FROM procurement_submission_proposals
    WHERE submission_id = $1
    RETURNING id
  `;
  const { rows } = await procurementDb.query(sql, [submissionId]);
  return !!rows[0];
}

export default {
  upsertProposalForSubmission,
  getProposalMetaBySubmissionId,
  getProposalFileBySubmissionId,
  deleteProposalBySubmissionId,
};
