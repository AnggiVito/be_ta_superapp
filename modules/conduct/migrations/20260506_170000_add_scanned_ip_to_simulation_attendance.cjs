exports.up = (pgm) => {
  // Older dev databases might already have the table but without these columns.
  // Add them conditionally to avoid breaking existing environments.
  pgm.sql(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'practicum_simulation_attendance'
          AND column_name = 'scanned_ip'
      ) THEN
        ALTER TABLE practicum_simulation_attendance
        ADD COLUMN scanned_ip VARCHAR(64);
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'practicum_simulation_attendance'
          AND column_name = 'scanned_user_agent'
      ) THEN
        ALTER TABLE practicum_simulation_attendance
        ADD COLUMN scanned_user_agent TEXT;
      END IF;
    END$$;
  `);

  pgm.sql(`
    CREATE INDEX IF NOT EXISTS practicum_simulation_attendance_scanned_ip_index
      ON practicum_simulation_attendance(scanned_ip);
  `);
};

exports.down = (pgm) => {
  // Safe rollback (best-effort)
  pgm.sql(`DROP INDEX IF EXISTS practicum_simulation_attendance_scanned_ip_index;`);
  pgm.sql(`ALTER TABLE practicum_simulation_attendance DROP COLUMN IF EXISTS scanned_user_agent;`);
  pgm.sql(`ALTER TABLE practicum_simulation_attendance DROP COLUMN IF EXISTS scanned_ip;`);
};

