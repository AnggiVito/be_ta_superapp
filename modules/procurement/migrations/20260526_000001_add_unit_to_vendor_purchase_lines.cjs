/** Store unit per vendor purchase line (manual entry on vendor form). */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE procurement_submission_vendor_purchase_lines
      ADD COLUMN IF NOT EXISTS unit VARCHAR(64);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE procurement_submission_vendor_purchase_lines
      DROP COLUMN IF EXISTS unit;
  `);
};
