exports.up = (pgm) => {
  pgm.sql('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');

  pgm.sql(`
    CREATE TABLE IF NOT EXISTS practicum_sessions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      title TEXT NOT NULL,
      code VARCHAR(100) NOT NULL,
      room TEXT NOT NULL,
      start_time TIMESTAMPTZ NOT NULL,
      end_time TIMESTAMPTZ NOT NULL,
      capacity INTEGER NOT NULL,

      status VARCHAR(50) NOT NULL DEFAULT 'draft',
      approval_requested_at TIMESTAMPTZ NULL,
      approval_requested_note TEXT NULL,
      approved_at TIMESTAMPTZ NULL,
      approved_by VARCHAR(255) NULL,
      rejected_at TIMESTAMPTZ NULL,
      rejected_by VARCHAR(255) NULL,
      rejected_reason TEXT NULL,

      created_by VARCHAR(255) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ NULL,

      CONSTRAINT chk_practicum_sessions_capacity_positive CHECK (capacity > 0),
      CONSTRAINT chk_practicum_sessions_time_order CHECK (end_time > start_time)
    );
  `);

  pgm.sql(
    'CREATE INDEX IF NOT EXISTS idx_practicum_sessions_status ON practicum_sessions(status) WHERE deleted_at IS NULL;'
  );
  pgm.sql(
    'CREATE INDEX IF NOT EXISTS idx_practicum_sessions_created_by ON practicum_sessions(created_by) WHERE deleted_at IS NULL;'
  );
};

exports.down = (pgm) => {
  pgm.dropTable('practicum_sessions', { ifExists: true, cascade: true });
};

