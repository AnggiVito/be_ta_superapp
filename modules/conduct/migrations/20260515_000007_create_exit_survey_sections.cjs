exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS exit_survey_sections (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      exit_survey_id uuid NOT NULL REFERENCES exit_surveys(id) ON DELETE CASCADE,
      title varchar(255) DEFAULT 'Bagian Tanpa Judul' NOT NULL,
      description text,
      sort_order integer DEFAULT 0 NOT NULL,
      created_by varchar(255) NOT NULL,
      created_at timestamptz DEFAULT NOW() NOT NULL,
      updated_at timestamptz DEFAULT NOW() NOT NULL,
      deleted_at timestamptz
    )
  `);
  pgm.sql('ALTER TABLE exit_survey_questions ADD COLUMN IF NOT EXISTS section_id uuid REFERENCES exit_survey_sections(id) ON DELETE SET NULL');
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_exit_survey_sections_order ON exit_survey_sections (exit_survey_id, sort_order) WHERE deleted_at IS NULL');
};

exports.down = (pgm) => {
  pgm.sql('DROP INDEX IF EXISTS idx_exit_survey_sections_order');
  pgm.sql('ALTER TABLE exit_survey_questions DROP COLUMN IF EXISTS section_id');
  pgm.dropTable('exit_survey_sections', { ifExists: true });
};
