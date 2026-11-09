/** Justifikasi (reimbursement ≥ Rp 1jt): mode basah vs digital + tanda tangan Kaur/Kaprodi terpisah. */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE procurement_submission
      ADD COLUMN IF NOT EXISTS justification_signing_mode VARCHAR(16),
      ADD COLUMN IF NOT EXISTS justification_digital_status VARCHAR(32),
      ADD COLUMN IF NOT EXISTS justification_forwarded_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS justification_kaur_signature TEXT,
      ADD COLUMN IF NOT EXISTS justification_kaur_signed_by VARCHAR(64),
      ADD COLUMN IF NOT EXISTS justification_kaur_signed_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS justification_kaur_signer_name VARCHAR(255),
      ADD COLUMN IF NOT EXISTS justification_kaur_signer_nipnim VARCHAR(64),
      ADD COLUMN IF NOT EXISTS justification_kaprodi_signature TEXT,
      ADD COLUMN IF NOT EXISTS justification_kaprodi_signed_by VARCHAR(64),
      ADD COLUMN IF NOT EXISTS justification_kaprodi_signed_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS justification_kaprodi_signer_name VARCHAR(255),
      ADD COLUMN IF NOT EXISTS justification_kaprodi_signer_nipnim VARCHAR(64);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE procurement_submission
      DROP COLUMN IF EXISTS justification_signing_mode,
      DROP COLUMN IF EXISTS justification_digital_status,
      DROP COLUMN IF EXISTS justification_forwarded_at,
      DROP COLUMN IF EXISTS justification_kaur_signature,
      DROP COLUMN IF EXISTS justification_kaur_signed_by,
      DROP COLUMN IF EXISTS justification_kaur_signed_at,
      DROP COLUMN IF EXISTS justification_kaur_signer_name,
      DROP COLUMN IF EXISTS justification_kaur_signer_nipnim,
      DROP COLUMN IF EXISTS justification_kaprodi_signature,
      DROP COLUMN IF EXISTS justification_kaprodi_signed_by,
      DROP COLUMN IF EXISTS justification_kaprodi_signed_at,
      DROP COLUMN IF EXISTS justification_kaprodi_signer_name,
      DROP COLUMN IF EXISTS justification_kaprodi_signer_nipnim;
  `);
};
