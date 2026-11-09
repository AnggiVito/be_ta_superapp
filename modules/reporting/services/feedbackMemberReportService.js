/**
 * Report Feedback — tampilan mahasiswa: respons sendiri + status exit survey.
 */

import { conductDb, registrationDb } from '../../../config/databases.js';
import { nipOrNimFromJwtPayload } from '../../../core/utils/jwtIdentityFromPayload.js';
import { resolveUserIdentifiers } from '../../conduct/utils/resolveUserIdentifiers.js';
import { resolveCanonicalPracticumName } from '../config/praktikumCatalog.js';
import { resolveFeedbackSemesterScope } from './feedbackSemesterScopeService.js';

function parseJsonValue(value) {
  if (value == null) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return value;
  }
}

function formatAnswerDisplay(question, answer) {
  if (answer == null) return null;
  const qType = String(question.question_type ?? '').toLowerCase();
  if (qType === 'multiple_choice' && Array.isArray(answer)) {
    return answer.join(', ');
  }
  if ((qType === 'multiple_choice_grid' || qType === 'checkbox_grid') && typeof answer === 'object') {
    return Object.entries(answer)
      .map(([row, val]) => {
        if (Array.isArray(val)) return `${row}: ${val.join(', ')}`;
        return `${row}: ${val}`;
      })
      .join('\n');
  }
  return String(answer);
}

async function resolveMemberFilters(filters = {}, user = null) {
  const semesterInput = filters.semesterCode ?? filters.semester_code ?? 'active';
  const scope = await resolveFeedbackSemesterScope(semesterInput);
  const userId = String(user?.id ?? '').trim();
  const nipnimHint = filters.nipnimHint || (user ? nipOrNimFromJwtPayload(user) : undefined);
  const identifiers = userId
    ? await resolveUserIdentifiers(userId, { nipnimHint })
    : [];
  const idSet = new Set(
    [...identifiers, userId].map((id) => String(id).toLowerCase()).filter(Boolean)
  );
  return {
    semesterCode: scope.semesterCode,
    scheduleIds: scope.scheduleIds,
    userId,
    identifiers: [...idSet],
  };
}

async function getActiveSurveySafe() {
  const res = await conductDb.query(
    `SELECT id, title, description, status, activated_at
     FROM exit_surveys
     WHERE status = 'active' AND deleted_at IS NULL
     ORDER BY activated_at DESC NULLS LAST
     LIMIT 1`
  );
  return res.rows[0] ?? null;
}

async function fetchEligibleSessions(parsed) {
  const { scheduleIds, identifiers } = parsed;
  if (!identifiers.length) return [];
  if (Array.isArray(scheduleIds) && scheduleIds.length === 0) return [];

  let scheduleFilter = '';
  const params = [identifiers];
  if (Array.isArray(scheduleIds) && scheduleIds.length > 0) {
    scheduleFilter = 'AND os.registration_schedule_id = ANY($2::uuid[])';
    params.push(scheduleIds);
  }

  const result = await conductDb.query(
    `SELECT
       os.id::text AS operational_session_id,
       os.registration_schedule_id::text AS registration_schedule_id,
       os.scheduled_date,
       os.start_time,
       os.end_time,
       os.venue,
       os.session_status,
       os.completed_at,
       att.user_id AS attendee_user_id,
       r.id::text AS response_id,
       r.submitted_at,
       r.practicum_name,
       r.module_name,
       r.module_id::text AS module_id
     FROM practicum_operational_sessions os
     INNER JOIN practicum_operational_session_attendances att
       ON att.operational_session_id = os.id
     LEFT JOIN exit_survey_responses r
       ON r.operational_session_id = os.id
       AND lower(r.respondent_user_id) = lower(att.user_id)
       AND r.deleted_at IS NULL
     WHERE os.deleted_at IS NULL
       AND os.session_status = 'completed'
       AND lower(att.user_id) = ANY($1::text[])
       ${scheduleFilter}
     ORDER BY os.completed_at DESC NULLS LAST, os.scheduled_date DESC NULLS LAST`,
    params
  );

  const enrichmentScheduleIds = [
    ...new Set(
      result.rows
        .map((row) => String(row.registration_schedule_id ?? '').trim())
        .filter(Boolean)
    ),
  ];
  const scheduleMap = await loadScheduleMetadata(enrichmentScheduleIds);

  return result.rows.map((row) => {
    const schedule = scheduleMap.get(String(row.registration_schedule_id ?? ''));
    const practicumName =
      row.practicum_name || schedule?.practicum_name || '';
    const moduleName = row.module_name || schedule?.module_name || '';
    const canonical = resolveCanonicalPracticumName(practicumName, moduleName);
    return {
      operational_session_id: row.operational_session_id,
      registration_schedule_id: row.registration_schedule_id,
      practicum_name: canonical ?? practicumName,
      module_name: moduleName,
      module_id: row.module_id || schedule?.module_id || null,
      scheduled_date: row.scheduled_date,
      start_time: row.start_time,
      end_time: row.end_time,
      venue: row.venue,
      session_status: row.session_status,
      completed_at: row.completed_at,
      status: row.response_id ? 'submitted' : 'pending',
      response_id: row.response_id,
      submitted_at: row.submitted_at,
    };
  });
}

async function loadScheduleMetadata(scheduleIds) {
  if (!scheduleIds.length) return new Map();
  const result = await registrationDb.query(
    `SELECT
       s.id::text AS id,
       s.module_id::text AS module_id,
       COALESCE(p.name, '') AS practicum_name,
       COALESCE(pm.name, '') AS module_name
     FROM schedules s
     LEFT JOIN practicum_modules pm ON pm.id = s.module_id
     LEFT JOIN practicums p ON p.id = pm.practicum_id
     WHERE s.id = ANY($1::uuid[])`,
    [scheduleIds]
  );
  return new Map(result.rows.map((row) => [String(row.id), row]));
}

function buildPeriodPayload(parsed) {
  const code = parsed.semesterCode ?? null;
  return {
    semester_code: code,
    label: code ? `Semester ${code}` : 'Periode aktif belum dikonfigurasi',
  };
}

export async function getMemberSummary(filters = {}, user = null) {
  const parsed = await resolveMemberFilters(filters, user);
  const sessions = await fetchEligibleSessions(parsed);
  const submitted = sessions.filter((s) => s.status === 'submitted');
  const pending = sessions.filter((s) => s.status === 'pending');
  const activeSurvey = await getActiveSurveySafe();

  return {
    eligible_count: sessions.length,
    submitted_count: submitted.length,
    pending_count: pending.length,
    active_survey: activeSurvey
      ? {
          id: activeSurvey.id,
          title: activeSurvey.title,
          description: activeSurvey.description,
        }
      : null,
    period: buildPeriodPayload(parsed),
  };
}

export async function listMemberResponses(filters = {}, user = null) {
  const parsed = await resolveMemberFilters(filters, user);
  const sessions = await fetchEligibleSessions(parsed);
  const activeSurvey = await getActiveSurveySafe();

  return {
    items: sessions,
    active_survey: activeSurvey
      ? {
          id: activeSurvey.id,
          title: activeSurvey.title,
          description: activeSurvey.description,
        }
      : null,
    period: buildPeriodPayload(parsed),
  };
}

export async function getMemberResponseDetail(operationalSessionId, filters = {}, user = null) {
  const sessionId = String(operationalSessionId ?? '').trim();
  if (!sessionId) throw new Error('operational_session_id wajib diisi');

  const parsed = await resolveMemberFilters(filters, user);
  if (!parsed.identifiers.length) {
    throw new Error('Data feedback tidak ditemukan atau akses ditolak');
  }

  const sessions = await fetchEligibleSessions(parsed);
  const session = sessions.find((s) => s.operational_session_id === sessionId);
  if (!session) {
    throw new Error('Data feedback tidak ditemukan atau akses ditolak');
  }

  if (session.status !== 'submitted' || !session.response_id) {
    return {
      ...session,
      submitted: false,
      survey: null,
      sections: [],
      questions: [],
      answers: [],
      period: buildPeriodPayload(parsed),
    };
  }

  const [responseRes, answersRes, surveyRes] = await Promise.all([
    conductDb.query(
      `SELECT *
       FROM exit_survey_responses
       WHERE id = $1::uuid AND deleted_at IS NULL
       LIMIT 1`,
      [session.response_id]
    ),
    conductDb.query(
      `SELECT a.question_id::text AS question_id, a.answer
       FROM exit_survey_response_answers a
       WHERE a.response_id = $1::uuid`,
      [session.response_id]
    ),
    conductDb.query(
      `SELECT id::text AS id, title, description, status
       FROM exit_surveys
       WHERE id = (
         SELECT exit_survey_id FROM exit_survey_responses WHERE id = $1::uuid
       )
       LIMIT 1`,
      [session.response_id]
    ),
  ]);

  const response = responseRes.rows[0];
  const survey = surveyRes.rows[0] ?? null;
  if (!response || !survey) {
    throw new Error('Data respons feedback tidak ditemukan');
  }

  const surveyId = response.exit_survey_id;
  const [sectionsRes, questionsRes] = await Promise.all([
    conductDb.query(
      `SELECT id::text AS id, exit_survey_id::text AS exit_survey_id, title, description, sort_order
       FROM exit_survey_sections
       WHERE exit_survey_id = $1::uuid AND deleted_at IS NULL
       ORDER BY sort_order ASC, created_at ASC`,
      [surveyId]
    ),
    conductDb.query(
      `SELECT
         id::text AS id,
         exit_survey_id::text AS exit_survey_id,
         section_id::text AS section_id,
         question_text,
         question_type,
         is_required,
         sort_order,
         options,
         rows,
         columns,
         min_rating,
         max_rating,
         scale_labels
       FROM exit_survey_questions
       WHERE exit_survey_id = $1::uuid AND deleted_at IS NULL
       ORDER BY sort_order ASC, created_at ASC`,
      [surveyId]
    ),
  ]);

  const answerMap = new Map(
    answersRes.rows.map((row) => [row.question_id, parseJsonValue(row.answer)])
  );

  const answers = questionsRes.rows.map((question) => {
    const raw = answerMap.get(question.id) ?? null;
    return {
      question_id: question.id,
      question_text: question.question_text,
      question_type: question.question_type,
      section_id: question.section_id,
      answer: raw,
      answer_display: formatAnswerDisplay(question, raw),
    };
  });

  return {
    ...session,
    submitted: true,
    survey: {
      id: survey.id,
      title: survey.title,
      description: survey.description,
      status: survey.status,
    },
    sections: sectionsRes.rows,
    questions: questionsRes.rows.map((q) => ({
      ...q,
      options: parseJsonValue(q.options),
      rows: parseJsonValue(q.rows),
      columns: parseJsonValue(q.columns),
      scale_labels: parseJsonValue(q.scale_labels),
    })),
    answers,
    period: buildPeriodPayload(parsed),
  };
}
