exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE procurement_submission_items
    ADD COLUMN IF NOT EXISTS urgency_level VARCHAR(100),
    ADD COLUMN IF NOT EXISTS purchase_link TEXT;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE procurement_submission_items
    DROP COLUMN IF EXISTS purchase_link,
    DROP COLUMN IF EXISTS urgency_level;
  `);
};
