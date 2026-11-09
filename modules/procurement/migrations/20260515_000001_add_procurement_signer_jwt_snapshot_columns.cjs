/**
 * Denormalized name / NIP|NIM from JWT (req.user) at signature time for proposal PDF.
 * Populated when each role POSTs their signature; PDF prefers these over user-management lookups.
 */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE procurement_submission
    ADD COLUMN IF NOT EXISTS dosen_pembina_signer_name VARCHAR(500),
    ADD COLUMN IF NOT EXISTS dosen_pembina_signer_nipnim VARCHAR(100),
    ADD COLUMN IF NOT EXISTS kordas_signer_name VARCHAR(500),
    ADD COLUMN IF NOT EXISTS kordas_signer_nipnim VARCHAR(100),
    ADD COLUMN IF NOT EXISTS kaur_lab_signer_name VARCHAR(500),
    ADD COLUMN IF NOT EXISTS kaur_lab_signer_nipnim VARCHAR(100),
    ADD COLUMN IF NOT EXISTS kaprodi_signer_name VARCHAR(500),
    ADD COLUMN IF NOT EXISTS kaprodi_signer_nipnim VARCHAR(100);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE procurement_submission
    DROP COLUMN IF EXISTS kaprodi_signer_nipnim,
    DROP COLUMN IF EXISTS kaprodi_signer_name,
    DROP COLUMN IF EXISTS kaur_lab_signer_nipnim,
    DROP COLUMN IF EXISTS kaur_lab_signer_name,
    DROP COLUMN IF EXISTS kordas_signer_nipnim,
    DROP COLUMN IF EXISTS kordas_signer_name,
    DROP COLUMN IF EXISTS dosen_pembina_signer_nipnim,
    DROP COLUMN IF EXISTS dosen_pembina_signer_name;
  `);
};
