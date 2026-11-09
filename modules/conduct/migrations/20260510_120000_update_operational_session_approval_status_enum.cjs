exports.up = (pgm) => {
  // Expand approval_status values to align with new approval gate flow.
  // New default after create: pending_lecturer_approval
  pgm.sql(`
    ALTER TABLE practicum_operational_sessions
    DROP CONSTRAINT IF EXISTS chk_operational_sessions_approval_status;
  `);

  pgm.sql(`
    UPDATE practicum_operational_sessions
    SET approval_status = 'pending_lecturer_approval'
    WHERE approval_status IN ('draft','pending_approval');
  `);

  pgm.sql(`
    ALTER TABLE practicum_operational_sessions
    ALTER COLUMN approval_status SET DEFAULT 'pending_lecturer_approval';
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
};

exports.down = (pgm) => {
  // Revert to old values.
  pgm.sql(`
    ALTER TABLE practicum_operational_sessions
    DROP CONSTRAINT IF EXISTS chk_operational_sessions_approval_status;
  `);

  pgm.sql(`
    UPDATE practicum_operational_sessions
    SET approval_status = 'draft'
    WHERE approval_status = 'pending_lecturer_approval';
  `);

  pgm.sql(`
    ALTER TABLE practicum_operational_sessions
    ALTER COLUMN approval_status SET DEFAULT 'draft';
  `);

  pgm.sql(`
    ALTER TABLE practicum_operational_sessions
    ADD CONSTRAINT chk_operational_sessions_approval_status
      CHECK (approval_status IN ('draft', 'pending_approval', 'approved', 'rejected'));
  `);
};

