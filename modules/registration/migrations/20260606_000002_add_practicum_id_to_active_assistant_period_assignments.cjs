/**
 * Upgrade registry asisten aktif: scope per praktikum (bukan hanya periode).
 * Idempotent — skip jika kolom practicum_id sudah ada (fresh install dari migrasi 000001 terbaru).
 */

exports.up = (pgm) => {
  pgm.sql(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'active_assistant_period_assignments'
          AND column_name = 'practicum_id'
      ) THEN
        -- Data lama tidak punya practicum_id; kosongkan agar NOT NULL aman.
        DELETE FROM active_assistant_period_assignments;

        ALTER TABLE active_assistant_period_assignments
          ADD COLUMN practicum_id UUID NOT NULL;

        ALTER TABLE active_assistant_period_assignments
          ADD CONSTRAINT fk_active_assistant_practicum
            FOREIGN KEY (practicum_id) REFERENCES practicums(id) ON DELETE CASCADE;

        DROP INDEX IF EXISTS uq_active_assistant_period_user;
        DROP INDEX IF EXISTS idx_active_assistant_period_key;

        CREATE UNIQUE INDEX uq_active_assistant_practicum_period_user
          ON active_assistant_period_assignments (practicum_id, periode_key, user_id);

        CREATE INDEX idx_active_assistant_practicum_period
          ON active_assistant_period_assignments (practicum_id, periode_key);

        COMMENT ON TABLE active_assistant_period_assignments IS
          'Asisten praktikum aktif per praktikum & periode; re-import Excel mengganti daftar praktikum terkait saja';
      END IF;
    END $$;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'active_assistant_period_assignments'
          AND column_name = 'practicum_id'
      ) THEN
        DELETE FROM active_assistant_period_assignments;

        ALTER TABLE active_assistant_period_assignments
          DROP CONSTRAINT IF EXISTS fk_active_assistant_practicum;

        ALTER TABLE active_assistant_period_assignments
          DROP COLUMN practicum_id;

        DROP INDEX IF EXISTS uq_active_assistant_practicum_period_user;
        DROP INDEX IF EXISTS idx_active_assistant_practicum_period;

        CREATE UNIQUE INDEX IF NOT EXISTS uq_active_assistant_period_user
          ON active_assistant_period_assignments (periode_key, user_id);

        CREATE INDEX IF NOT EXISTS idx_active_assistant_period_key
          ON active_assistant_period_assignments (periode_key);
      END IF;
    END $$;
  `);
};
