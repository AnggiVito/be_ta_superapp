exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS practicum_simulation_qr_sessions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      simulation_id UUID NOT NULL REFERENCES practicum_simulations(id),
      qr_token VARCHAR(255) NOT NULL UNIQUE,
      qr_data JSONB NOT NULL,
      generated_by VARCHAR(255) NOT NULL,
      expired_at TIMESTAMP NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMP NULL
    );
  `);

  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_practicum_simulation_qr_sessions_simulation_id
      ON practicum_simulation_qr_sessions(simulation_id)
      WHERE deleted_at IS NULL;
  `);

  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_practicum_simulation_qr_sessions_token
      ON practicum_simulation_qr_sessions(qr_token)
      WHERE deleted_at IS NULL;
  `);

  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_practicum_simulation_qr_sessions_active_expired
      ON practicum_simulation_qr_sessions(is_active, expired_at)
      WHERE deleted_at IS NULL;
  `);
};

exports.down = (pgm) => {
  pgm.dropTable('practicum_simulation_qr_sessions', {
    ifExists: true,
    cascade: true,
  });
};
