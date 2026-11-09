exports.up = (pgm) => {
  pgm.createTable('exit_survey_responses', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    exit_survey_id: { type: 'uuid', notNull: true, references: 'exit_surveys(id)', onDelete: 'CASCADE' },
    operational_session_id: { type: 'uuid', notNull: true, references: 'practicum_operational_sessions(id)', onDelete: 'CASCADE' },
    registration_schedule_id: { type: 'uuid', notNull: true },
    practicum_id: { type: 'uuid' },
    practicum_name: { type: 'text' },
    module_id: { type: 'uuid' },
    module_name: { type: 'text' },
    respondent_user_id: { type: 'varchar(255)', notNull: true },
    submitted_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    deleted_at: { type: 'timestamptz' },
  });

  pgm.createTable('exit_survey_response_answers', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    response_id: { type: 'uuid', notNull: true, references: 'exit_survey_responses(id)', onDelete: 'CASCADE' },
    question_id: { type: 'uuid', notNull: true, references: 'exit_survey_questions(id)', onDelete: 'CASCADE' },
    answer: { type: 'jsonb', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
  });

  pgm.sql(
    'CREATE UNIQUE INDEX uniq_exit_survey_response_once ON exit_survey_responses (exit_survey_id, operational_session_id, respondent_user_id) WHERE deleted_at IS NULL'
  );
};

exports.down = (pgm) => {
  pgm.sql('DROP INDEX IF EXISTS uniq_exit_survey_response_once');
  pgm.dropTable('exit_survey_response_answers', { ifExists: true });
  pgm.dropTable('exit_survey_responses', { ifExists: true });
};
