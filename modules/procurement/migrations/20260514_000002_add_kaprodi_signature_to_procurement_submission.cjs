exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE procurement_submission
    ADD COLUMN IF NOT EXISTS kaprodi_signature TEXT,
    ADD COLUMN IF NOT EXISTS kaprodi_signed_by VARCHAR(255),
    ADD COLUMN IF NOT EXISTS kaprodi_signed_at TIMESTAMP WITHOUT TIME ZONE;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE procurement_submission
    DROP COLUMN IF EXISTS kaprodi_signed_at,
    DROP COLUMN IF EXISTS kaprodi_signed_by,
    DROP COLUMN IF EXISTS kaprodi_signature;
  `);
};
