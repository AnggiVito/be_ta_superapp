/** Laboran (TPA) handover proof when passing items to Kaur / Kaprodi. */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS procurement_submission_laboran_pass_logs (
      id BIGSERIAL PRIMARY KEY,
      submission_id BIGINT NOT NULL REFERENCES procurement_submission(id) ON DELETE CASCADE,
      pass_kind VARCHAR(16) NOT NULL CHECK (pass_kind IN ('kaur', 'kaprodi')),
      notes TEXT,
      from_status VARCHAR(64),
      to_status VARCHAR(64),
      uploaded_by VARCHAR(128),
      uploader_name VARCHAR(255),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_laboran_pass_logs_submission
      ON procurement_submission_laboran_pass_logs (submission_id);

    CREATE INDEX IF NOT EXISTS idx_laboran_pass_logs_kind_created
      ON procurement_submission_laboran_pass_logs (pass_kind, created_at DESC);

    CREATE TABLE IF NOT EXISTS procurement_submission_laboran_pass_photos (
      id BIGSERIAL PRIMARY KEY,
      pass_log_id BIGINT NOT NULL REFERENCES procurement_submission_laboran_pass_logs(id) ON DELETE CASCADE,
      file_path TEXT NOT NULL,
      file_name VARCHAR(512),
      mime_type VARCHAR(128),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_laboran_pass_photos_log
      ON procurement_submission_laboran_pass_photos (pass_log_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS procurement_submission_laboran_pass_photos;
    DROP TABLE IF EXISTS procurement_submission_laboran_pass_logs;
  `);
};
