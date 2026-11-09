/** Audit log for item handover (requester receipt + laboran delivery signatures). */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS procurement_submission_handover_event_logs (
      id BIGSERIAL PRIMARY KEY,
      submission_id BIGINT NOT NULL REFERENCES procurement_submission(id) ON DELETE CASCADE,
      event_type VARCHAR(64) NOT NULL,
      actor_user_id VARCHAR(128),
      actor_name VARCHAR(255),
      actor_role VARCHAR(64),
      actor_nipnim VARCHAR(64),
      submission_status VARCHAR(64),
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_handover_event_logs_submission_created
      ON procurement_submission_handover_event_logs (submission_id, created_at ASC);

    CREATE INDEX IF NOT EXISTS idx_handover_event_logs_created
      ON procurement_submission_handover_event_logs (created_at DESC);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS procurement_submission_handover_event_logs;`);
};
