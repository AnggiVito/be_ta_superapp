/**
 * Migration: 2025-12-06
 * 
 * Rename column identifier to nipnim untuk konsistensi dengan field di JWT dari auth gateway
 */

exports.up = (pgm) => {
  // Rename column identifier to nipnim
  pgm.sql(`
    ALTER TABLE user_profiles 
    RENAME COLUMN identifier TO nipnim;
  `);

  // Rename index
  pgm.sql(`
    DROP INDEX IF EXISTS idx_user_profiles_identifier;
    CREATE INDEX IF NOT EXISTS idx_user_profiles_nipnim 
    ON user_profiles(nipnim) 
    WHERE deleted_at IS NULL;
  `);
};

exports.down = (pgm) => {
  // Rename back to identifier
  pgm.sql(`
    ALTER TABLE user_profiles 
    RENAME COLUMN nipnim TO identifier;
  `);

  // Rename index back
  pgm.sql(`
    DROP INDEX IF EXISTS idx_user_profiles_nipnim;
    CREATE INDEX IF NOT EXISTS idx_user_profiles_identifier 
    ON user_profiles(identifier) 
    WHERE deleted_at IS NULL;
  `);
};

