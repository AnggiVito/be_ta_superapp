/** Auto-generated submission title: BHP_{lab}_{d/m/Y}_{seq per lab per year} */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE procurement_submission
    ADD COLUMN IF NOT EXISTS submission_reference VARCHAR(128);

    CREATE INDEX IF NOT EXISTS idx_procurement_submission_reference
      ON procurement_submission (submission_reference);

    CREATE INDEX IF NOT EXISTS idx_procurement_submission_lab_year
      ON procurement_submission (lab_id, created_at);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_procurement_submission_lab_year;
    DROP INDEX IF EXISTS idx_procurement_submission_reference;
    ALTER TABLE procurement_submission
    DROP COLUMN IF EXISTS submission_reference;
  `);
};
