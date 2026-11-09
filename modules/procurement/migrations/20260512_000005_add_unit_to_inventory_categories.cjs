exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE procurement_inventory_categories
    ADD COLUMN IF NOT EXISTS unit VARCHAR(64);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE procurement_inventory_categories
    DROP COLUMN IF EXISTS unit;
  `);
};
