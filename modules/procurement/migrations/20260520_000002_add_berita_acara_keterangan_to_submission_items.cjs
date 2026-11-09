/** Optional remarks per item for handover berita acara PDF (not urgency). */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE procurement_submission_items
      ADD COLUMN IF NOT EXISTS berita_acara_keterangan VARCHAR(500);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE procurement_submission_items
      DROP COLUMN IF EXISTS berita_acara_keterangan;
  `);
};
