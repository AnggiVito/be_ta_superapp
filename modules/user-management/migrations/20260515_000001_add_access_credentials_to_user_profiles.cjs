/**
 * Migration: fingerprint & kartu akses disimpan sebagai TEXT
 * Boolean has_fingerprint / has_kartu_akses dihitung di API (view), bukan disimpan di DB
 */

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE user_profiles
      ADD COLUMN IF NOT EXISTS fingerprint TEXT,
      ADD COLUMN IF NOT EXISTS kartu_akses_number TEXT,
      ADD COLUMN IF NOT EXISTS access_credentials_updated_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS access_credentials_updated_by VARCHAR(255);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE user_profiles
      DROP COLUMN IF EXISTS fingerprint,
      DROP COLUMN IF EXISTS kartu_akses_number,
      DROP COLUMN IF EXISTS access_credentials_updated_at,
      DROP COLUMN IF EXISTS access_credentials_updated_by;
  `);
};
