/** Scanned wet-signed reimbursement docs + optional BAST (BYTEA, one row per doc type per submission). */
exports.up = (pgm) => {
  pgm.sql(`
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
    );
    CREATE INDEX IF NOT EXISTS idx_proc_sub_reimb_wet_docs_submission_id
      ON procurement_submission_reimbursement_wet_documents(submission_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS procurement_submission_reimbursement_wet_documents;`);
};
