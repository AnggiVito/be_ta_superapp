/** Add document title to vendor purchase header. */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE procurement_submission_vendor_purchase
      ADD COLUMN IF NOT EXISTS title VARCHAR(500) NOT NULL DEFAULT '';
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE procurement_submission_vendor_purchase
      DROP COLUMN IF EXISTS title;
  `);
};
