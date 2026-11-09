/**
 * Requester (mahasiswa/pengaju) signature for non-blockchain handover receipt
 * (berita acara / bukti penerimaan barang).
 */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE procurement_submission
    ADD COLUMN IF NOT EXISTS requester_handover_signature TEXT,
    ADD COLUMN IF NOT EXISTS requester_handover_signed_by VARCHAR(255),
    ADD COLUMN IF NOT EXISTS requester_handover_signed_at TIMESTAMP WITHOUT TIME ZONE,
    ADD COLUMN IF NOT EXISTS requester_handover_signer_name VARCHAR(500),
    ADD COLUMN IF NOT EXISTS requester_handover_signer_nipnim VARCHAR(100);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE procurement_submission
    DROP COLUMN IF EXISTS requester_handover_signer_nipnim,
    DROP COLUMN IF EXISTS requester_handover_signer_name,
    DROP COLUMN IF EXISTS requester_handover_signed_at,
    DROP COLUMN IF EXISTS requester_handover_signed_by,
    DROP COLUMN IF EXISTS requester_handover_signature;
  `);
};
