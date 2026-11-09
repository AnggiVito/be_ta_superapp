exports.up = (pgm) => {
  pgm.sql('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');

  pgm.sql(`
    CREATE TABLE IF NOT EXISTS practicum_operational_sessions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

      registration_schedule_id UUID NOT NULL,

      session_status VARCHAR(50) NOT NULL DEFAULT 'scheduled',
      approval_status VARCHAR(50) NOT NULL DEFAULT 'draft',

      approval_requested_at TIMESTAMPTZ NULL,
      approval_requested_note TEXT NULL,
      approved_at TIMESTAMPTZ NULL,
      approved_by VARCHAR(255) NULL,
      rejected_at TIMESTAMPTZ NULL,
      rejected_by VARCHAR(255) NULL,
      rejected_reason TEXT NULL,

      ongoing_at TIMESTAMPTZ NULL,
      completed_at TIMESTAMPTZ NULL,
      cancelled_at TIMESTAMPTZ NULL,
      cancel_reason TEXT NULL,

      operational_notes TEXT NULL,

      created_by VARCHAR(255) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ NULL,

      CONSTRAINT chk_operational_sessions_approval_status
        CHECK (approval_status IN ('draft', 'pending_approval', 'approved', 'rejected')),
      CONSTRAINT chk_operational_sessions_session_status
        CHECK (session_status IN ('scheduled', 'ongoing', 'completed', 'cancelled')),
      CONSTRAINT chk_operational_sessions_completion_order
        CHECK (
          (completed_at IS NULL) OR (ongoing_at IS NOT NULL AND completed_at >= ongoing_at)
        )
    );
  `);

  // One active operational session per registration schedule (soft-delete aware)
  pgm.sql(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_operational_session_per_schedule
    ON practicum_operational_sessions (registration_schedule_id)
    WHERE deleted_at IS NULL;
  `);

  pgm.sql(
    'CREATE INDEX IF NOT EXISTS idx_operational_sessions_created_by ON practicum_operational_sessions(created_by) WHERE deleted_at IS NULL;'
  );
  pgm.sql(
    'CREATE INDEX IF NOT EXISTS idx_operational_sessions_status ON practicum_operational_sessions(session_status, approval_status) WHERE deleted_at IS NULL;'
  );
};

exports.down = (pgm) => {
  pgm.dropTable('practicum_operational_sessions', { ifExists: true, cascade: true });
};
