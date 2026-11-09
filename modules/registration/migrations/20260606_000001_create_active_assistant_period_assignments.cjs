/**
 * Daftar asisten praktikum aktif per (periode akademik, praktikum).
 * Diimport laboran/kaur lab via Excel NIM setelah memilih praktikum.
 */

exports.up = (pgm) => {
  pgm.sql('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');

  pgm.sql(`
    CREATE TABLE IF NOT EXISTS active_assistant_period_assignments (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      practicum_id UUID NOT NULL,
      user_id VARCHAR(255) NOT NULL,
      nim VARCHAR(50) NOT NULL,
      periode_key VARCHAR(255) NOT NULL,
      periode_label VARCHAR(255),
      periode_snapshot JSONB,
      imported_at TIMESTAMP NOT NULL DEFAULT NOW(),
      imported_by VARCHAR(255),
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT fk_active_assistant_practicum
        FOREIGN KEY (practicum_id) REFERENCES practicums(id) ON DELETE CASCADE
    );
  `);

  pgm.sql(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_active_assistant_practicum_period_user
      ON active_assistant_period_assignments (practicum_id, periode_key, user_id);
  `);

  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_active_assistant_practicum_period
      ON active_assistant_period_assignments (practicum_id, periode_key);
  `);

  pgm.sql(`
    COMMENT ON TABLE active_assistant_period_assignments IS
      'Asisten praktikum aktif per praktikum & periode; re-import Excel mengganti daftar praktikum terkait saja';
  `);
};

exports.down = (pgm) => {
  pgm.dropTable('active_assistant_period_assignments', { ifExists: true, cascade: true });
};
