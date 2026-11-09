import { procurementDb } from '../../../config/databases.js';

let tableReady = false;

async function ensureTable() {
  if (tableReady) return;

  await procurementDb.query(`
    CREATE TABLE IF NOT EXISTS procurement_template (
      slot TEXT PRIMARY KEY DEFAULT 'default',
      file_name TEXT NOT NULL,
      mime_type TEXT,
      file_data BYTEA NOT NULL CHECK (octet_length(file_data) <= 10 * 1024 * 1024),
      uploaded_by TEXT,
      uploaded_at TIMESTAMPTZ DEFAULT now()
    )
  `);

  await procurementDb.query(
    'CREATE INDEX IF NOT EXISTS procurement_template_uploaded_at_idx ON procurement_template (uploaded_at)'
  );

  tableReady = true;
}

export async function saveMetadata(meta) {
  await ensureTable();
  const { fileName, mimeType, uploadedBy, fileData } = meta;
  const sql = `
    INSERT INTO procurement_template (slot, file_name, mime_type, file_data, uploaded_by)
    VALUES ('default', $1, $2, $3, $4)
    RETURNING file_name AS "fileName", mime_type AS "mimeType", uploaded_by AS "uploadedBy", uploaded_at AS "uploadedAt"
  `;
  const res = await procurementDb.query(sql, [fileName, mimeType, fileData, uploadedBy]);
  return res.rows[0] || null;
}

export async function readMetadata() {
  await ensureTable();
  const sql = `
    SELECT
      file_name AS "fileName",
      mime_type AS "mimeType",
      uploaded_by AS "uploadedBy",
      uploaded_at AS "uploadedAt"
    FROM procurement_template
    WHERE slot = 'default'
    LIMIT 1
  `;
  const res = await procurementDb.query(sql);
  return res.rows[0] || null;
}

export async function readTemplateFile() {
  await ensureTable();
  const sql = `
    SELECT
      file_name AS "fileName",
      mime_type AS "mimeType",
      file_data AS "fileData"
    FROM procurement_template
    WHERE slot = 'default'
    LIMIT 1
  `;
  const res = await procurementDb.query(sql);
  return res.rows[0] || null;
}

export async function removeMetadata() {
  await ensureTable();
  await procurementDb.query(`DELETE FROM procurement_template WHERE slot = 'default'`);
}

export default { saveMetadata, readMetadata, readTemplateFile, removeMetadata };
