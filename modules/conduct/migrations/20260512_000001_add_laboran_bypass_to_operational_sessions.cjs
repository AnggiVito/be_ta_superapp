exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE practicum_operational_sessions
    ADD COLUMN IF NOT EXISTS bypass_evidence_file_path TEXT NULL,
    ADD COLUMN IF NOT EXISTS bypass_evidence_file_name TEXT NULL,
    ADD COLUMN IF NOT EXISTS bypass_evidence_mime_type VARCHAR(100) NULL,
    ADD COLUMN IF NOT EXISTS bypass_evidence_size INTEGER NULL,
    ADD COLUMN IF NOT EXISTS bypassed_by VARCHAR(255) NULL,
    ADD COLUMN IF NOT EXISTS bypassed_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS bypass_reason TEXT NULL;
  `);

  pgm.sql(`
    ALTER TABLE practicum_operational_sessions
    DROP CONSTRAINT IF EXISTS chk_operational_sessions_approval_status;
  `);

  pgm.sql(`
    ALTER TABLE practicum_operational_sessions
    ADD CONSTRAINT chk_operational_sessions_approval_status
      CHECK (approval_status IN (
        'pending_lecturer_approval',
        'approved',
        'rejected',
        'approved_by_laboran'
      ));
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    UPDATE practicum_operational_sessions
    SET approval_status = 'pending_lecturer_approval',
        bypass_evidence_file_path = NULL,
        bypass_evidence_file_name = NULL,
        bypass_evidence_mime_type = NULL,
        bypass_evidence_size = NULL,
        bypassed_by = NULL,
        bypassed_at = NULL,
        bypass_reason = NULL
    WHERE approval_status = 'approved_by_laboran';
  `);

  pgm.sql(`
    ALTER TABLE practicum_operational_sessions
    DROP CONSTRAINT IF EXISTS chk_operational_sessions_approval_status;
  `);

  pgm.sql(`
    ALTER TABLE practicum_operational_sessions
    ADD CONSTRAINT chk_operational_sessions_approval_status
      CHECK (approval_status IN (
        'pending_lecturer_approval',
        'approved',
        'rejected'
      ));
  `);

  pgm.sql(`
    ALTER TABLE practicum_operational_sessions
    DROP COLUMN IF EXISTS bypass_evidence_file_path,
    DROP COLUMN IF EXISTS bypass_evidence_file_name,
    DROP COLUMN IF EXISTS bypass_evidence_mime_type,
    DROP COLUMN IF EXISTS bypass_evidence_size,
    DROP COLUMN IF EXISTS bypassed_by,
    DROP COLUMN IF EXISTS bypassed_at,
    DROP COLUMN IF EXISTS bypass_reason;
  `);
};
