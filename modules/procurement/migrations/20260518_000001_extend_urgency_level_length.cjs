exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE procurement_submission_items
    ALTER COLUMN urgency_level TYPE VARCHAR(500);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE procurement_submission_items
    ALTER COLUMN urgency_level TYPE VARCHAR(100);
  `);
};
