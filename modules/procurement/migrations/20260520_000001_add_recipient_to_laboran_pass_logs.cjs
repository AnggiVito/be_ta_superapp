/** Store which Kaur/Kaprodi user laboran represents on bypass handover. */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE procurement_submission_laboran_pass_logs
      ADD COLUMN IF NOT EXISTS recipient_user_id VARCHAR(128),
      ADD COLUMN IF NOT EXISTS recipient_name VARCHAR(500),
      ADD COLUMN IF NOT EXISTS recipient_nipnim VARCHAR(100);

    CREATE INDEX IF NOT EXISTS idx_laboran_pass_logs_recipient
      ON procurement_submission_laboran_pass_logs (recipient_user_id)
      WHERE recipient_user_id IS NOT NULL;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_laboran_pass_logs_recipient;
    ALTER TABLE procurement_submission_laboran_pass_logs
      DROP COLUMN IF EXISTS recipient_nipnim,
      DROP COLUMN IF EXISTS recipient_name,
      DROP COLUMN IF EXISTS recipient_user_id;
  `);
};
