exports.up = (pgm) => {
  pgm.sql('ALTER TABLE exit_survey_questions ADD COLUMN IF NOT EXISTS rows jsonb');
  pgm.sql('ALTER TABLE exit_survey_questions ADD COLUMN IF NOT EXISTS columns jsonb');
  pgm.sql('ALTER TABLE exit_survey_questions ADD COLUMN IF NOT EXISTS scale_labels jsonb');
  pgm.sql('ALTER TABLE exit_survey_questions DROP CONSTRAINT IF EXISTS chk_exit_survey_questions_type');
  pgm.addConstraint('exit_survey_questions', 'chk_exit_survey_questions_type', {
    check: "question_type IN ('text','textarea','single_choice','multiple_choice','dropdown','file_upload','linear_scale','rating','multiple_choice_grid','checkbox_grid','date','time')",
  });
  pgm.sql('ALTER TABLE exit_survey_questions DROP CONSTRAINT IF EXISTS chk_exit_survey_questions_rating_range');
  pgm.addConstraint('exit_survey_questions', 'chk_exit_survey_questions_rating_range', {
    check: "question_type NOT IN ('rating','linear_scale') OR (min_rating IS NOT NULL AND max_rating IS NOT NULL AND min_rating < max_rating)",
  });
};

exports.down = (pgm) => {
  pgm.sql('ALTER TABLE exit_survey_questions DROP CONSTRAINT IF EXISTS chk_exit_survey_questions_rating_range');
  pgm.addConstraint('exit_survey_questions', 'chk_exit_survey_questions_rating_range', {
    check: "question_type <> 'rating' OR (min_rating IS NOT NULL AND max_rating IS NOT NULL AND min_rating < max_rating)",
  });
  pgm.sql('ALTER TABLE exit_survey_questions DROP CONSTRAINT IF EXISTS chk_exit_survey_questions_type');
  pgm.addConstraint('exit_survey_questions', 'chk_exit_survey_questions_type', {
    check: "question_type IN ('text','textarea','rating','single_choice','multiple_choice')",
  });
  pgm.dropColumns('exit_survey_questions', ['rows', 'columns', 'scale_labels'], { ifExists: true });
};
