exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS procurement_handover_sessions (
      id SERIAL PRIMARY KEY,
      submission_id INTEGER NOT NULL UNIQUE REFERENCES procurement_submission(id) ON DELETE CASCADE,
      student_id_hash TEXT NOT NULL,
      items_hash TEXT NOT NULL,
      student_confirmed_at TIMESTAMP WITHOUT TIME ZONE,
      student_user_id VARCHAR(255),
      student_ip VARCHAR(255),
      confirmation_code_hash TEXT,
      confirmation_code_expires_at TIMESTAMP WITHOUT TIME ZONE,
      confirmation_code_verified_at TIMESTAMP WITHOUT TIME ZONE,
      laboran_wallet TEXT,
      laboran_verified_at TIMESTAMP WITHOUT TIME ZONE,
      eip712_payload JSONB,
      signature TEXT,
      nonce BIGINT,
      typed_timestamp BIGINT,
      status VARCHAR(64) NOT NULL DEFAULT 'WAITING_VERIFICATION',
      tx_hash TEXT,
      tx_submitted_at TIMESTAMP WITHOUT TIME ZONE,
      tx_confirmed_at TIMESTAMP WITHOUT TIME ZONE,
      proof JSONB,
      created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
    );
  `);

  pgm.sql(`
    CREATE TABLE IF NOT EXISTS procurement_handover_authorized_laborans (
      wallet_address TEXT PRIMARY KEY,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      revoked_at TIMESTAMP WITHOUT TIME ZONE,
      revoked_by VARCHAR(255),
      created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
    );
  `);

  pgm.sql(`
    CREATE TABLE IF NOT EXISTS procurement_handover_nonce_ledger (
      id SERIAL PRIMARY KEY,
      submission_id INTEGER NOT NULL REFERENCES procurement_submission(id) ON DELETE CASCADE,
      nonce BIGINT NOT NULL UNIQUE,
      used_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
      used_by_wallet TEXT,
      created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
    );
  `);

  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_proc_handover_sessions_status ON procurement_handover_sessions(status);`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_proc_handover_sessions_student_user_id ON procurement_handover_sessions(student_user_id);`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_proc_handover_sessions_laboran_wallet ON procurement_handover_sessions(laboran_wallet);`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_proc_handover_nonce_ledger_submission_id ON procurement_handover_nonce_ledger(submission_id);`);
};

exports.down = (pgm) => {
  pgm.dropTable('procurement_handover_nonce_ledger', { ifExists: true, cascade: true });
  pgm.dropTable('procurement_handover_authorized_laborans', { ifExists: true, cascade: true });
  pgm.dropTable('procurement_handover_sessions', { ifExists: true, cascade: true });
};
