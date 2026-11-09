/** Audit trail for submission status changes (requester timeline). */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS procurement_submission_status_logs (
      id BIGSERIAL PRIMARY KEY,
      submission_id BIGINT NOT NULL REFERENCES procurement_submission(id) ON DELETE CASCADE,
      from_status VARCHAR(64),
      to_status VARCHAR(64) NOT NULL,
      actor_user_id VARCHAR(255),
      actor_name VARCHAR(500),
      actor_role VARCHAR(64),
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_proc_sub_status_logs_submission_created
      ON procurement_submission_status_logs (submission_id, created_at ASC);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS procurement_submission_status_logs;`);
};
