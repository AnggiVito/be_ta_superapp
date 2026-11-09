exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE procurement_submission_items
    ADD COLUMN IF NOT EXISTS unit VARCHAR(64);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE procurement_submission_items
    DROP COLUMN IF EXISTS unit;
  `);
};
