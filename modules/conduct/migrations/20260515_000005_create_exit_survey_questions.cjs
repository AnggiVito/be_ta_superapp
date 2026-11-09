exports.up = (pgm) => {
  pgm.createTable('exit_survey_questions', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    exit_survey_id: {
      type: 'uuid',
      notNull: true,
      references: 'exit_surveys(id)',
      onDelete: 'CASCADE',
    },
    question_text: { type: 'text', notNull: true },
    question_type: { type: 'varchar(30)', notNull: true },
    is_required: { type: 'boolean', notNull: true, default: true },
    sort_order: { type: 'integer', notNull: true, default: 0 },
    options: { type: 'jsonb' },
    rows: { type: 'jsonb' },
    columns: { type: 'jsonb' },
    scale_labels: { type: 'jsonb' },
    min_rating: { type: 'integer' },
    max_rating: { type: 'integer' },
    created_by: { type: 'varchar(255)', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    deleted_at: { type: 'timestamptz' },
  });

  pgm.addConstraint('exit_survey_questions', 'chk_exit_survey_questions_type', {
    check: "question_type IN ('text','textarea','single_choice','multiple_choice','dropdown','file_upload','linear_scale','rating','multiple_choice_grid','checkbox_grid','date','time')",
  });

  pgm.addConstraint('exit_survey_questions', 'chk_exit_survey_questions_rating_range', {
    check: "question_type NOT IN ('rating','linear_scale') OR (min_rating IS NOT NULL AND max_rating IS NOT NULL AND min_rating < max_rating)",
  });

  pgm.sql(
    'CREATE INDEX idx_exit_survey_questions_order ON exit_survey_questions (exit_survey_id, sort_order) WHERE deleted_at IS NULL'
  );
};

exports.down = (pgm) => {
  pgm.sql('DROP INDEX IF EXISTS idx_exit_survey_questions_order');
  pgm.dropTable('exit_survey_questions', { ifExists: true });
};
