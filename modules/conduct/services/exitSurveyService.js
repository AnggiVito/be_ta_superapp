import { conductDb, registrationDb } from '../../../config/databases.js';

function requireNonEmptyString(value, fieldName) {
  const s = String(value ?? '').trim();
  if (!s) throw new Error(`${fieldName} is required`);
  return s;
}

const QUESTION_TYPES = [
  'text',
  'textarea',
  'single_choice',
  'multiple_choice',
  'dropdown',
  'file_upload',
  'linear_scale',
  'rating',
  'multiple_choice_grid',
  'checkbox_grid',
  'date',
  'time',
];
const CHOICE_QUESTION_TYPES = ['single_choice', 'multiple_choice', 'dropdown'];
const GRID_QUESTION_TYPES = ['multiple_choice_grid', 'checkbox_grid'];
const SCALE_QUESTION_TYPES = ['rating', 'linear_scale'];

function normalizeStatus(value) {
  const status = String(value ?? 'draft').trim().toLowerCase();
  if (!['draft', 'active', 'archived'].includes(status)) {
    throw new Error('status must be draft, active, or archived');
  }
  return status;
}

function normalizeQuestionType(value) {
  const questionType = String(value ?? '').trim().toLowerCase();
  if (!QUESTION_TYPES.includes(questionType)) {
    throw new Error('question_type is invalid');
  }
  return questionType;
}

function normalizeStringList(value, fieldName, minLength = 2) {
  const source = Array.isArray(value) ? value : [];
  const items = source
    .map((item) => String(item ?? '').trim())
    .filter(Boolean);
  if (items.length < minLength) {
    throw new Error(`${fieldName} requires at least ${minLength} items`);
  }
  return JSON.stringify(items);
}

function normalizeQuestionOptions(value, questionType) {
  if (!CHOICE_QUESTION_TYPES.includes(questionType)) return null;
  return normalizeStringList(value, 'Answer options');
}

function normalizeGridList(value, questionType, fieldName) {
  if (!GRID_QUESTION_TYPES.includes(questionType)) return null;
  return normalizeStringList(value, fieldName);
}

function normalizeScaleRange(payload, questionType) {
  if (!SCALE_QUESTION_TYPES.includes(questionType)) return { minRating: null, maxRating: null, scaleLabels: null };
  const minRating = Number.parseInt(payload?.min_rating ?? payload?.minRating ?? 1, 10);
  const maxRating = Number.parseInt(payload?.max_rating ?? payload?.maxRating ?? 5, 10);
  if (!Number.isInteger(minRating) || !Number.isInteger(maxRating) || minRating >= maxRating) {
    throw new Error('Scale range is invalid');
  }
  const leftLabel = String(payload?.scale_labels?.left ?? payload?.scaleLabels?.left ?? '').trim();
  const rightLabel = String(payload?.scale_labels?.right ?? payload?.scaleLabels?.right ?? '').trim();
  const scaleLabels = questionType === 'linear_scale' && (leftLabel || rightLabel)
    ? JSON.stringify({ left: leftLabel, right: rightLabel })
    : null;
  return { minRating, maxRating, scaleLabels };
}

function normalizeSectionPayload(payload) {
  const title = String(payload?.title ?? 'Untitled Section').trim() || 'Untitled Section';
  const description = String(payload?.description ?? '').trim() || null;
  return { title, description };
}

function normalizeQuestionPayload(payload) {
  const questionText = requireNonEmptyString(payload?.question_text ?? payload?.questionText, 'question_text');
  const questionType = normalizeQuestionType(payload?.question_type ?? payload?.questionType);
  const isRequired = payload?.is_required ?? payload?.isRequired ?? true;
  const options = normalizeQuestionOptions(payload?.options, questionType);
  const rows = normalizeGridList(payload?.rows, questionType, 'Row');
  const columns = normalizeGridList(payload?.columns, questionType, 'Column');
  const { minRating, maxRating, scaleLabels } = normalizeScaleRange(payload, questionType);
  return {
    questionText,
    questionType,
    isRequired: Boolean(isRequired),
    options,
    rows,
    columns,
    scaleLabels,
    minRating,
    maxRating,
    sectionId: payload?.section_id ?? payload?.sectionId ?? null,
  };
}

async function archiveActiveSurvey(client, excludeId = null) {
  await client.query(
    `UPDATE exit_surveys
     SET status = 'archived', archived_at = NOW(), updated_at = NOW()
     WHERE status = 'active'
       AND deleted_at IS NULL
       AND ($1::uuid IS NULL OR id <> $1::uuid)`,
    [excludeId]
  );
}

export async function createExitSurvey({ requesterUserId, payload }) {
  if (!requesterUserId) throw new Error('User is not authenticated');
  const title = requireNonEmptyString(payload?.title, 'title');
  const description = String(payload?.description ?? '').trim() || null;
  const status = normalizeStatus(payload?.status ?? (payload?.activate ? 'active' : 'draft'));

  const client = await conductDb.connect();
  try {
    await client.query('BEGIN');
    if (status === 'active') await archiveActiveSurvey(client);

    const surveyResult = await client.query(
      `INSERT INTO exit_surveys (
         title,
         description,
         status,
         created_by,
         activated_at,
         created_at,
         updated_at
       ) VALUES ($1, $2, $3::varchar, $4, CASE WHEN $3::varchar = 'active' THEN NOW() ELSE NULL END, NOW(), NOW())
       RETURNING *`,
      [title, description, status, requesterUserId]
    );
    await client.query('COMMIT');
    return surveyResult.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function listExitSurveys({ includeArchived = true } = {}) {
  const result = await conductDb.query(
    `SELECT *
     FROM exit_surveys
     WHERE deleted_at IS NULL
       AND ($1::boolean = true OR status <> 'archived')
     ORDER BY created_at DESC`,
    [includeArchived]
  );
  return result.rows;
}

export async function getExitSurveyById(id) {
  const result = await conductDb.query(
    `SELECT *
     FROM exit_surveys
     WHERE id = $1::uuid
       AND deleted_at IS NULL
     LIMIT 1`,
    [id]
  );
  if (result.rowCount === 0) throw new Error('Exit survey not found');
  return result.rows[0];
}

export async function activateExitSurvey({ id, requesterUserId }) {
  if (!requesterUserId) throw new Error('User is not authenticated');
  const client = await conductDb.connect();
  try {
    await client.query('BEGIN');
    await archiveActiveSurvey(client, id);
    const result = await client.query(
      `UPDATE exit_surveys
       SET status = 'active', activated_at = NOW(), archived_at = NULL, updated_at = NOW()
       WHERE id = $1::uuid
         AND deleted_at IS NULL
       RETURNING *`,
      [id]
    );
    if (result.rowCount === 0) throw new Error('Exit survey not found');
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function updateExitSurvey({ id, requesterUserId, payload }) {
  if (!requesterUserId) throw new Error('User is not authenticated');
  const title = requireNonEmptyString(payload?.title, 'title');
  const description = String(payload?.description ?? '').trim() || null;

  const result = await conductDb.query(
    `UPDATE exit_surveys
     SET title = $2,
         description = $3,
         updated_at = NOW()
     WHERE id = $1::uuid
       AND deleted_at IS NULL
     RETURNING *`,
    [id, title, description]
  );
  if (result.rowCount === 0) throw new Error('Exit survey not found');
  return result.rows[0];
}

export async function archiveExitSurvey({ id, requesterUserId }) {
  if (!requesterUserId) throw new Error('User is not authenticated');
  const result = await conductDb.query(
    `UPDATE exit_surveys
     SET status = 'archived', archived_at = NOW(), updated_at = NOW()
     WHERE id = $1::uuid
       AND deleted_at IS NULL
     RETURNING *`,
    [id]
  );
  if (result.rowCount === 0) throw new Error('Exit survey not found');
  return result.rows[0];
}

export async function deleteExitSurvey({ id, requesterUserId }) {
  if (!requesterUserId) throw new Error('User is not authenticated');
  const result = await conductDb.query(
    `UPDATE exit_surveys
     SET deleted_at = NOW(), updated_at = NOW()
     WHERE id = $1::uuid
       AND deleted_at IS NULL
     RETURNING *`,
    [id]
  );
  if (result.rowCount === 0) throw new Error('Exit survey not found');
  return result.rows[0];
}

export async function listExitSurveySections({ surveyId }) {
  await getExitSurveyById(surveyId);
  const result = await conductDb.query(
    `SELECT *
     FROM exit_survey_sections
     WHERE exit_survey_id = $1::uuid
       AND deleted_at IS NULL
     ORDER BY sort_order ASC, created_at ASC`,
    [surveyId]
  );
  return result.rows;
}

export async function createExitSurveySection({ surveyId, requesterUserId, payload }) {
  if (!requesterUserId) throw new Error('User is not authenticated');
  await getExitSurveyById(surveyId);
  const section = normalizeSectionPayload(payload);
  const result = await conductDb.query(
    `INSERT INTO exit_survey_sections (
       exit_survey_id, title, description, sort_order, created_by, created_at, updated_at
     ) VALUES (
       $1::uuid, $2, $3,
       COALESCE((SELECT MAX(sort_order) + 1 FROM exit_survey_sections WHERE exit_survey_id = $1::uuid AND deleted_at IS NULL), 0),
       $4, NOW(), NOW()
     )
     RETURNING *`,
    [surveyId, section.title, section.description, requesterUserId]
  );
  return result.rows[0];
}

export async function updateExitSurveySection({ surveyId, sectionId, requesterUserId, payload }) {
  if (!requesterUserId) throw new Error('User is not authenticated');
  const section = normalizeSectionPayload(payload);
  const result = await conductDb.query(
    `UPDATE exit_survey_sections
     SET title = $3, description = $4, updated_at = NOW()
     WHERE exit_survey_id = $1::uuid
       AND id = $2::uuid
       AND deleted_at IS NULL
     RETURNING *`,
    [surveyId, sectionId, section.title, section.description]
  );
  if (result.rowCount === 0) throw new Error('Exit survey section not found');
  return result.rows[0];
}

export async function deleteExitSurveySection({ surveyId, sectionId, requesterUserId }) {
  if (!requesterUserId) throw new Error('User is not authenticated');
  const client = await conductDb.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE exit_survey_sections
       SET deleted_at = NOW(), updated_at = NOW()
       WHERE exit_survey_id = $1::uuid
         AND id = $2::uuid
         AND deleted_at IS NULL
       RETURNING *`,
      [surveyId, sectionId]
    );
    if (result.rowCount === 0) throw new Error('Exit survey section not found');
    await client.query(
      `UPDATE exit_survey_questions
       SET section_id = NULL, updated_at = NOW()
       WHERE exit_survey_id = $1::uuid
         AND section_id = $2::uuid
         AND deleted_at IS NULL`,
      [surveyId, sectionId]
    );
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function reorderExitSurveySections({ surveyId, requesterUserId, sectionIds }) {
  if (!requesterUserId) throw new Error('User is not authenticated');
  if (!Array.isArray(sectionIds)) throw new Error('Section order is required');

  const client = await conductDb.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(
      `SELECT id
       FROM exit_survey_sections
       WHERE exit_survey_id = $1::uuid
         AND deleted_at IS NULL`,
      [surveyId]
    );
    const existingIds = existing.rows.map((row) => row.id);
    const requestedIds = sectionIds.map((id) => String(id));
    if (existingIds.length !== requestedIds.length || !existingIds.every((id) => requestedIds.includes(id))) {
      throw new Error('Section order is invalid');
    }

    for (const [index, sectionId] of requestedIds.entries()) {
      await client.query(
        `UPDATE exit_survey_sections
         SET sort_order = $3, updated_at = NOW()
         WHERE exit_survey_id = $1::uuid
           AND id = $2::uuid
           AND deleted_at IS NULL`,
        [surveyId, sectionId, index]
      );
    }

    const result = await client.query(
      `SELECT *
       FROM exit_survey_sections
       WHERE exit_survey_id = $1::uuid
         AND deleted_at IS NULL
       ORDER BY sort_order ASC, created_at ASC`,
      [surveyId]
    );
    await client.query('COMMIT');
    return result.rows;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function reorderExitSurveyBuilderItems({ surveyId, requesterUserId, items }) {
  if (!requesterUserId) throw new Error('User is not authenticated');
  if (!Array.isArray(items)) throw new Error('Builder order is required');

  const client = await conductDb.connect();
  try {
    await client.query('BEGIN');
    const sections = await client.query(
      `SELECT id FROM exit_survey_sections WHERE exit_survey_id = $1::uuid AND deleted_at IS NULL`,
      [surveyId]
    );
    const questions = await client.query(
      `SELECT id FROM exit_survey_questions WHERE exit_survey_id = $1::uuid AND deleted_at IS NULL`,
      [surveyId]
    );
    const validIds = new Set([
      ...sections.rows.map((row) => `section:${row.id}`),
      ...questions.rows.map((row) => `question:${row.id}`),
    ]);
    const requestedIds = items.map((item) => `${item.type}:${item.id}`);
    if (validIds.size !== requestedIds.length || !requestedIds.every((id) => validIds.has(id))) {
      throw new Error('Builder order is invalid');
    }

    for (const [index, item] of items.entries()) {
      if (item.type === 'section') {
        await client.query(
          `UPDATE exit_survey_sections
           SET sort_order = $3, updated_at = NOW()
           WHERE exit_survey_id = $1::uuid AND id = $2::uuid AND deleted_at IS NULL`,
          [surveyId, item.id, index]
        );
      } else if (item.type === 'question') {
        await client.query(
          `UPDATE exit_survey_questions
           SET sort_order = $3, section_id = NULL, updated_at = NOW()
           WHERE exit_survey_id = $1::uuid AND id = $2::uuid AND deleted_at IS NULL`,
          [surveyId, item.id, index]
        );
      }
    }

    await client.query('COMMIT');
    return { success: true };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function listExitSurveyQuestions({ surveyId }) {
  await getExitSurveyById(surveyId);
  const result = await conductDb.query(
    `SELECT *
     FROM exit_survey_questions
     WHERE exit_survey_id = $1::uuid
       AND deleted_at IS NULL
     ORDER BY sort_order ASC, created_at ASC`,
    [surveyId]
  );
  return result.rows;
}

export async function createExitSurveyQuestion({ surveyId, requesterUserId, payload }) {
  if (!requesterUserId) throw new Error('User is not authenticated');
  const question = normalizeQuestionPayload(payload);
  await getExitSurveyById(surveyId);

  const result = await conductDb.query(
    `INSERT INTO exit_survey_questions (
       exit_survey_id,
       question_text,
       question_type,
       is_required,
       section_id,
       sort_order,
       options,
       rows,
       columns,
       scale_labels,
       min_rating,
       max_rating,
       created_by,
       created_at,
       updated_at
     ) VALUES (
       $1::uuid,
       $2,
       $3,
       $4,
       $5::uuid,
       COALESCE((SELECT MAX(sort_order) + 1 FROM exit_survey_questions WHERE exit_survey_id = $1::uuid AND deleted_at IS NULL), 0),
       $6::jsonb,
       $7::jsonb,
       $8::jsonb,
       $9::jsonb,
       $10,
       $11,
       $12,
       NOW(),
       NOW()
     )
     RETURNING *`,
    [
      surveyId,
      question.questionText,
      question.questionType,
      question.isRequired,
      question.sectionId,
      question.options,
      question.rows,
      question.columns,
      question.scaleLabels,
      question.minRating,
      question.maxRating,
      requesterUserId,
    ]
  );
  return result.rows[0];
}

export async function updateExitSurveyQuestion({ surveyId, questionId, requesterUserId, payload }) {
  if (!requesterUserId) throw new Error('User is not authenticated');
  const question = normalizeQuestionPayload(payload);

  const result = await conductDb.query(
    `UPDATE exit_survey_questions
     SET question_text = $3,
         question_type = $4,
         is_required = $5,
         section_id = $6::uuid,
         options = $7::jsonb,
         rows = $8::jsonb,
         columns = $9::jsonb,
         scale_labels = $10::jsonb,
         min_rating = $11,
         max_rating = $12,
         updated_at = NOW()
     WHERE exit_survey_id = $1::uuid
       AND id = $2::uuid
       AND deleted_at IS NULL
     RETURNING *`,
    [
      surveyId,
      questionId,
      question.questionText,
      question.questionType,
      question.isRequired,
      question.sectionId,
      question.options,
      question.rows,
      question.columns,
      question.scaleLabels,
      question.minRating,
      question.maxRating,
    ]
  );
  if (result.rowCount === 0) throw new Error('Question exit survey not found');
  return result.rows[0];
}

export async function deleteExitSurveyQuestion({ surveyId, questionId, requesterUserId }) {
  if (!requesterUserId) throw new Error('User is not authenticated');
  const result = await conductDb.query(
    `UPDATE exit_survey_questions
     SET deleted_at = NOW(), updated_at = NOW()
     WHERE exit_survey_id = $1::uuid
       AND id = $2::uuid
       AND deleted_at IS NULL
     RETURNING *`,
    [surveyId, questionId]
  );
  if (result.rowCount === 0) throw new Error('Question exit survey not found');
  return result.rows[0];
}

async function getActiveExitSurvey() {
  const result = await conductDb.query(
    `SELECT *
     FROM exit_surveys
     WHERE status = 'active'
       AND deleted_at IS NULL
     ORDER BY activated_at DESC NULLS LAST, created_at DESC
     LIMIT 1`
  );
  if (result.rowCount === 0) throw new Error('Active exit survey is not available yet');
  return result.rows[0];
}

async function getSurveyBuilderPayload(surveyId) {
  const [sectionsResult, questionsResult] = await Promise.all([
    conductDb.query(
      `SELECT *
       FROM exit_survey_sections
       WHERE exit_survey_id = $1::uuid
         AND deleted_at IS NULL
       ORDER BY sort_order ASC, created_at ASC`,
      [surveyId]
    ),
    conductDb.query(
      `SELECT *
       FROM exit_survey_questions
       WHERE exit_survey_id = $1::uuid
         AND deleted_at IS NULL
       ORDER BY sort_order ASC, created_at ASC`,
      [surveyId]
    ),
  ]);
  return { sections: sectionsResult.rows, questions: questionsResult.rows };
}

async function getOperationalSessionContext(operationalSessionId, requesterUserId) {
  const sessionResult = await conductDb.query(
    `SELECT *
     FROM practicum_operational_sessions
     WHERE id = $1::uuid
       AND deleted_at IS NULL
     LIMIT 1`,
    [operationalSessionId]
  );
  if (sessionResult.rowCount === 0) throw new Error('Practicum session not found');
  const session = sessionResult.rows[0];
  if (session.session_status !== 'completed') {
    throw new Error('Exit survey can only be filled after the practicum session is completed');
  }

  const attendanceResult = await conductDb.query(
    `SELECT 1
     FROM practicum_operational_session_attendances
     WHERE operational_session_id = $1::uuid
       AND user_id = $2
     LIMIT 1`,
    [operationalSessionId, requesterUserId]
  );
  if (attendanceResult.rowCount === 0) {
    throw new Error('Exit survey can only be filled by students who attended this session');
  }

  const scheduleResult = await registrationDb.query(
    `SELECT
       s.id AS registration_schedule_id,
       s.module_id,
       pm.name AS module_name,
       pm.practicum_id,
       p.name AS practicum_name
     FROM schedules s
     INNER JOIN practicum_modules pm ON s.module_id = pm.id
     INNER JOIN practicums p ON pm.practicum_id = p.id
     WHERE s.id = $1::uuid
     LIMIT 1`,
    [session.registration_schedule_id]
  );
  const schedule = scheduleResult.rows[0] || {};
  return {
    session,
    context: {
      operational_session_id: session.id,
      registration_schedule_id: session.registration_schedule_id,
      practicum_id: schedule.practicum_id || null,
      practicum_name: schedule.practicum_name || null,
      module_id: schedule.module_id || null,
      module_name: schedule.module_name || null,
      session_status: session.session_status,
      completed_at: session.completed_at,
    },
  };
}

async function getExistingResponse({ surveyId, operationalSessionId, requesterUserId }) {
  const result = await conductDb.query(
    `SELECT *
     FROM exit_survey_responses
     WHERE exit_survey_id = $1::uuid
       AND operational_session_id = $2::uuid
       AND respondent_user_id = $3
       AND deleted_at IS NULL
     LIMIT 1`,
    [surveyId, operationalSessionId, requesterUserId]
  );
  return result.rows[0] || null;
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  return [];
}

function validateAnswer(question, value) {
  if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) {
    if (question.is_required) throw new Error(`Question "${question.question_text}" is required`);
    return null;
  }

  const options = parseJsonArray(question.options);
  const rows = parseJsonArray(question.rows);
  const columns = parseJsonArray(question.columns);
  switch (question.question_type) {
    case 'text':
    case 'textarea':
    case 'date':
    case 'time':
      return String(value).trim();
    case 'single_choice':
    case 'dropdown': {
      const answer = String(value).trim();
      if (!options.includes(answer)) throw new Error('Choice answer is invalid');
      return answer;
    }
    case 'multiple_choice': {
      if (!Array.isArray(value)) throw new Error('Checkbox answer is invalid');
      const answer = value.map((item) => String(item).trim()).filter(Boolean);
      if (!answer.every((item) => options.includes(item))) throw new Error('Checkbox answer is invalid');
      return answer;
    }
    case 'linear_scale':
    case 'rating': {
      const answer = Number.parseInt(value, 10);
      const min = Number.parseInt(question.min_rating ?? 1, 10);
      const max = Number.parseInt(question.max_rating ?? 5, 10);
      if (!Number.isInteger(answer) || answer < min || answer > max) throw new Error('Scale answer is invalid');
      return answer;
    }
    case 'multiple_choice_grid': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Grid answer is invalid');
      for (const row of rows) {
        if (question.is_required && !value[row]) throw new Error(`Row "${row}" is required`);
        if (value[row] && !columns.includes(value[row])) throw new Error('Grid answer is invalid');
      }
      return value;
    }
    case 'checkbox_grid': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Checkbox grid answer is invalid');
      for (const row of rows) {
        const selected = Array.isArray(value[row]) ? value[row] : [];
        if (question.is_required && selected.length === 0) throw new Error(`Row "${row}" is required`);
        if (!selected.every((item) => columns.includes(item))) throw new Error('Checkbox grid answer is invalid');
      }
      return value;
    }
    case 'file_upload':
      if (question.is_required) throw new Error('File upload is not supported for Exit Survey yet');
      return null;
    default:
      throw new Error('Question type is invalid');
  }
}

export async function getActiveExitSurveyForStudent({ requesterUserId, operationalSessionId }) {
  if (!requesterUserId) throw new Error('User is not authenticated');
  const survey = await getActiveExitSurvey();
  const { context } = await getOperationalSessionContext(operationalSessionId, requesterUserId);
  const builder = await getSurveyBuilderPayload(survey.id);
  const existingResponse = await getExistingResponse({
    surveyId: survey.id,
    operationalSessionId,
    requesterUserId,
  });
  return {
    survey,
    ...builder,
    context,
    submitted: Boolean(existingResponse),
    response: existingResponse,
  };
}

async function getResponseByOperationalSession({ operationalSessionId, requesterUserId }) {
  const result = await conductDb.query(
    `SELECT *
     FROM exit_survey_responses
     WHERE operational_session_id = $1::uuid
       AND respondent_user_id = $2
       AND deleted_at IS NULL
     LIMIT 1`,
    [operationalSessionId, requesterUserId]
  );
  return result.rows[0] || null;
}

export async function getStudentExitSurveySubmissionDetail({
  requesterUserId,
  operationalSessionId,
}) {
  if (!requesterUserId) throw new Error('User is not authenticated');

  const response = await getResponseByOperationalSession({
    operationalSessionId,
    requesterUserId,
  });
  if (!response) return null;

  const { context } = await getOperationalSessionContext(operationalSessionId, requesterUserId);
  const survey = await getExitSurveyById(response.exit_survey_id);
  const builder = await getSurveyBuilderPayload(response.exit_survey_id);

  const answersResult = await conductDb.query(
    `SELECT question_id, answer
     FROM exit_survey_response_answers
     WHERE response_id = $1::uuid`,
    [response.id]
  );
  const answers = {};
  for (const row of answersResult.rows) {
    answers[row.question_id] = row.answer;
  }

  return {
    survey,
    ...builder,
    context,
    submitted: true,
    response,
    answers,
  };
}

export async function getMyExitSurveyResponse({ requesterUserId, operationalSessionId }) {
  return getStudentExitSurveySubmissionDetail({ requesterUserId, operationalSessionId });
}

export async function submitExitSurveyResponse({ requesterUserId, operationalSessionId, answers }) {
  if (!requesterUserId) throw new Error('User is not authenticated');
  const survey = await getActiveExitSurvey();
  const { context } = await getOperationalSessionContext(operationalSessionId, requesterUserId);
  const existingResponse = await getExistingResponse({ surveyId: survey.id, operationalSessionId, requesterUserId });
  if (existingResponse) throw new Error('Exit survey for this session has already been submitted');
  const { questions } = await getSurveyBuilderPayload(survey.id);
  const answerMap = answers && typeof answers === 'object' ? answers : {};
  const normalizedAnswers = [];
  for (const question of questions) {
    const answer = validateAnswer(question, answerMap[question.id]);
    if (answer != null) normalizedAnswers.push({ questionId: question.id, answer });
  }

  const client = await conductDb.connect();
  try {
    await client.query('BEGIN');
    const responseResult = await client.query(
      `INSERT INTO exit_survey_responses (
         exit_survey_id,
         operational_session_id,
         registration_schedule_id,
         practicum_id,
         practicum_name,
         module_id,
         module_name,
         respondent_user_id,
         submitted_at,
         created_at,
         updated_at
       ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6::uuid, $7, $8, NOW(), NOW(), NOW())
       RETURNING *`,
      [
        survey.id,
        operationalSessionId,
        context.registration_schedule_id,
        context.practicum_id,
        context.practicum_name,
        context.module_id,
        context.module_name,
        requesterUserId,
      ]
    );
    const response = responseResult.rows[0];
    for (const item of normalizedAnswers) {
      await client.query(
        `INSERT INTO exit_survey_response_answers (response_id, question_id, answer, created_at, updated_at)
         VALUES ($1::uuid, $2::uuid, $3::jsonb, NOW(), NOW())`,
        [response.id, item.questionId, JSON.stringify(item.answer)]
      );
    }
    await client.query('COMMIT');
    return response;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function reorderExitSurveyQuestions({ surveyId, requesterUserId, questionIds }) {
  if (!requesterUserId) throw new Error('User is not authenticated');
  if (!Array.isArray(questionIds) || questionIds.length === 0) {
    throw new Error('Question order is required');
  }

  const client = await conductDb.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(
      `SELECT id
       FROM exit_survey_questions
       WHERE exit_survey_id = $1::uuid
         AND deleted_at IS NULL`,
      [surveyId]
    );
    const existingIds = existing.rows.map((row) => row.id);
    const requestedIds = questionIds.map((id) => String(id));
    if (existingIds.length !== requestedIds.length || !existingIds.every((id) => requestedIds.includes(id))) {
      throw new Error('Question order is invalid');
    }

    for (const [index, questionId] of requestedIds.entries()) {
      await client.query(
        `UPDATE exit_survey_questions
         SET sort_order = $3, updated_at = NOW()
         WHERE exit_survey_id = $1::uuid
           AND id = $2::uuid
           AND deleted_at IS NULL`,
        [surveyId, questionId, index]
      );
    }

    const result = await client.query(
      `SELECT *
       FROM exit_survey_questions
       WHERE exit_survey_id = $1::uuid
         AND deleted_at IS NULL
       ORDER BY sort_order ASC, created_at ASC`,
      [surveyId]
    );
    await client.query('COMMIT');
    return result.rows;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

