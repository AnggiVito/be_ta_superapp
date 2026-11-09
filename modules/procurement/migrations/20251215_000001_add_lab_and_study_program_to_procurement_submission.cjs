/**
 * Add lab_id and study_program_id to procurement_submission
 * Uses UUID to match registration.master tables (study_programs, laboratories)
 */

exports.up = (pgm) => {
  // Use SQL with IF NOT EXISTS to be idempotent in case columns/indexes already present
  pgm.sql(`ALTER TABLE procurement_submission ADD COLUMN IF NOT EXISTS study_program_id uuid;`);
  pgm.sql(`ALTER TABLE procurement_submission ADD COLUMN IF NOT EXISTS lab_id uuid;`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_procurement_submission_study_program_id ON procurement_submission (study_program_id);`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_procurement_submission_lab_id ON procurement_submission (lab_id);`);
};

exports.down = (pgm) => {
  pgm.dropIndex('procurement_submission', 'idx_procurement_submission_lab_id');
  pgm.dropIndex('procurement_submission', 'idx_procurement_submission_study_program_id');
  pgm.dropColumns('procurement_submission', ['study_program_id', 'lab_id']);
};
