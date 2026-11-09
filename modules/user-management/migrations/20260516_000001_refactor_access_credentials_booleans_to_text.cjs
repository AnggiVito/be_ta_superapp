/**
 * Migration: hapus kolom boolean lama (jika sempat ter-deploy) dan pastikan kolom TEXT ada
 */

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE user_profiles
      ADD COLUMN IF NOT EXISTS fingerprint TEXT,
      ADD COLUMN IF NOT EXISTS kartu_akses_number TEXT,
      ADD COLUMN IF NOT EXISTS access_credentials_updated_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS access_credentials_updated_by VARCHAR(255);

    ALTER TABLE user_profiles
      DROP COLUMN IF EXISTS has_fingerprint,
      DROP COLUMN IF EXISTS has_kartu_akses;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE user_profiles
      ADD COLUMN IF NOT EXISTS has_fingerprint BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS has_kartu_akses BOOLEAN NOT NULL DEFAULT false;

    ALTER TABLE user_profiles
      DROP COLUMN IF EXISTS fingerprint;
  `);
};
