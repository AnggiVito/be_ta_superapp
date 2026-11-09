import { conductDb, registrationDb, userManagementDb } from '../../../config/databases.js';
import { getOperationalSessionById } from './practicumOperationalSessionService.js';
import { isScheduleAssistantByIdentifier } from './registrationUserIdentifierService.js';

function requireNonEmptyString(value, fieldName) {
  const s = String(value ?? '').trim();
  if (!s) throw new Error(`${fieldName} is required`);
  return s;
}

function normalizeScore(value, fieldName) {
  const score = Number(value);
  if (!Number.isFinite(score)) throw new Error(`${fieldName} must be a number`);
  if (score < 0) throw new Error(`${fieldName} cannot be less than 0`);
  return score;
}

function toNumber(value) {
  if (value === null || value === undefined) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

const REGISTRATION_COMPONENTS = [
  { type: 'tugas_pendahuluan', label: 'Preliminary Assignment' },
  { type: 'tes_awal', label: 'Pre-Test' },
  { type: 'jurnal', label: 'Journal' },
  { type: 'tes_akhir', label: 'Post-Test' },
  { type: 'audit', label: 'Audit' },
];
const REGISTRATION_COMPONENT_BY_TYPE = new Map(
  REGISTRATION_COMPONENTS.map((component, index) => [component.type, { ...component, sortOrder: index + 1 }])
);

function calculateFinalScore(items) {
  let totalWeight = 0;
  let weightedPercentageSum = 0;

  for (const item of items) {
    const maxScore = toNumber(item.component.max_score);
    const weight = toNumber(item.component.weight);
    if (maxScore <= 0) throw new Error(`${item.component.name} maximum score is invalid`);
    if (weight <= 0) throw new Error(`${item.component.name} weight is invalid`);
    totalWeight += weight;
    weightedPercentageSum += (item.score / maxScore) * weight;
  }

  if (totalWeight <= 0) throw new Error('Total rubric weight is invalid');
  return (weightedPercentageSum / totalWeight) * 100;
}

function mapGradeComponentBreakdown(component) {
  const score = toNumber(component.score);
  const maxScore = toNumber(component.max_score);
  const weight = toNumber(component.weight);
  const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;
  return {
    component_id: component.component_id,
    component_name: component.component_name,
    score,
    max_score: maxScore,
    weight,
    percentage: Number(percentage.toFixed(2)),
    weighted_contribution: Number(((percentage * weight) / 100).toFixed(2)),
    feedback: component.feedback,
  };
}

async function getUserProfiles(userIds) {
  const ids = [...new Set(userIds.map((id) => String(id ?? '').trim()).filter(Boolean))];
  if (ids.length === 0) return new Map();

  const result = await userManagementDb.query(
    `SELECT user_id, name, nipnim
     FROM user_profiles
     WHERE user_id = ANY($1::text[])
       AND deleted_at IS NULL`,
    [ids]
  );
  return new Map(result.rows.map((row) => [String(row.user_id), row]));
}

async function getSchedulesById(scheduleIds) {
  const ids = [...new Set(scheduleIds.map((id) => String(id ?? '').trim()).filter(Boolean))];
  if (ids.length === 0) return new Map();

  const result = await registrationDb.query(
    `SELECT
       s.id,
       s.tanggal,
       s.jam_mulai,
       s.jam_berakhir,
       s.detail_kegiatan,
       s.kelas,
       s.venue,
       s.start_time,
       s.end_time,
       s.module_id,
       COALESCE(p.name, '') AS practicum_name,
       COALESCE(pm.name, '') AS module_name
     FROM schedules s
     LEFT JOIN practicum_modules pm ON pm.id = s.module_id
     LEFT JOIN practicums p ON p.id = pm.practicum_id
     WHERE s.id = ANY($1::uuid[])`,
    [ids]
  );
  return new Map(result.rows.map((row) => [String(row.id), row]));
}

async function isAssignedScheduleAssistant(scheduleId, userId) {
  return isScheduleAssistantByIdentifier(registrationDb, scheduleId, userId);
}

async function isSessionActiveAssistant(sessionId, userId) {
  const result = await conductDb.query(
    `SELECT 1
     FROM practicum_operational_session_active_assistants
     WHERE operational_session_id = $1::uuid
       AND user_id = $2
     LIMIT 1`,
    [sessionId, userId]
  );
  return result.rowCount > 0;
}

function canMonitorAllStudentsInSession(session, requesterUserId) {
  return String(session.pic_user_id ?? '') === String(requesterUserId);
}

async function ensureCanGradeSession(session, requesterUserId) {
  if (!requesterUserId) throw new Error('User is not authenticated');
  if (session.session_status !== 'completed') {
    throw new Error('Grading is only available after the session is completed');
  }
  if (canMonitorAllStudentsInSession(session, requesterUserId)) return;
  if (await isSessionActiveAssistant(session.id, requesterUserId)) return;
  if (await isAssignedScheduleAssistant(session.registration_schedule_id, requesterUserId)) return;
  throw new Error('You are not allowed to grade this practicum session');
}

function ensureCanGradeAttendance(attendance, requesterUserId) {
  if (String(attendance?.assigned_assistant_user_id ?? '') === String(requesterUserId)) return;
  throw new Error('You can only grade students assigned to your plot.');
}

async function getAttendance(sessionId, studentUserId) {
  const result = await conductDb.query(
    `SELECT *
     FROM practicum_operational_session_attendances
     WHERE operational_session_id = $1::uuid
       AND user_id = $2
     LIMIT 1`,
    [sessionId, studentUserId]
  );
  if (result.rowCount === 0) throw new Error('Student is not checked in for this session');
  return result.rows[0];
}

function mapRegistrationComponentRows(rows) {
  return rows
    .map((row) => {
      const mapped = REGISTRATION_COMPONENT_BY_TYPE.get(String(row.component_type));
      if (!mapped) return null;
      return {
        component_type: row.component_type,
        name: mapped.label,
        weight: toNumber(row.weight_percent),
        sortOrder: mapped.sortOrder,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function assertRegistrationRubricReady(components) {
  if (components.length === 0) {
    throw new Error('Module assessment component configuration is not available in Registration');
  }
  const totalWeight = components.reduce((sum, row) => sum + row.weight, 0);
  if (totalWeight !== 100) {
    throw new Error(`The module rubric weight total must be 100%. Current total is ${totalWeight}%.`);
  }
}

async function listRegistrationAssessmentComponents(moduleId) {
  const id = String(moduleId ?? '').trim();
  if (!id) return [];
  const result = await registrationDb.query(
    `SELECT component_type, weight_percent
     FROM practicum_module_assessment_components
     WHERE module_id = $1::uuid
       AND enabled = true
       AND weight_percent > 0`,
    [id]
  );
  return mapRegistrationComponentRows(result.rows);
}

async function getRegistrationRubricStatus(moduleId) {
  const components = await listRegistrationAssessmentComponents(moduleId);
  const totalWeight = components.reduce((sum, row) => sum + row.weight, 0);
  return {
    has_registration_rubric: components.length > 0,
    rubric_weight_total: totalWeight,
    rubric_ready: components.length > 0 && totalWeight === 100,
  };
}

function assessmentToolTitle(schedule) {
  const titleParts = [schedule?.practicum_name, schedule?.module_name]
    .map((item) => String(item ?? '').trim())
    .filter(Boolean);
  return titleParts.length > 0
    ? `Grading ${titleParts.join(' - ')}`
    : 'Practicum Grading';
}

async function createAssessmentTool({ session, schedule, source, description, components }) {
  const toolResult = await conductDb.query(
    `INSERT INTO practicum_assessment_tools (
       registration_schedule_id,
       practicum_name,
       module_name,
       title,
       description,
       source,
       is_active
     ) VALUES ($1::uuid, $2, $3, $4, $5, $6, true)
     RETURNING *`,
    [
      session.registration_schedule_id,
      schedule?.practicum_name || null,
      schedule?.module_name || null,
      assessmentToolTitle(schedule),
      description,
      source,
    ]
  );
  const tool = toolResult.rows[0];

  for (const item of components) {
    await conductDb.query(
      `INSERT INTO practicum_assessment_components (
         tool_id, name, max_score, weight, sort_order, is_required
       ) VALUES ($1::uuid, $2, 100, $3, $4, true)`,
      [tool.id, item.name, item.weight, item.sortOrder]
    );
  }

  return tool;
}

async function ensureDefaultTool(session, schedule) {
  const registrationComponents = await listRegistrationAssessmentComponents(schedule?.module_id);
  assertRegistrationRubricReady(registrationComponents);

  const existing = await conductDb.query(
    `SELECT *
     FROM practicum_assessment_tools
     WHERE registration_schedule_id = $1::uuid
       AND is_active = true
       AND deleted_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1`,
    [session.registration_schedule_id]
  );

  if (existing.rowCount > 0) {
    const existingTool = existing.rows[0];
    if (existingTool.source === 'registration_module_config') return existingTool;
    await conductDb.query(
      `UPDATE practicum_assessment_tools
       SET is_active = false, deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1::uuid`,
      [existingTool.id]
    );
  }

  return createAssessmentTool({
    session,
    schedule,
    source: 'registration_module_config',
    description: 'Assessment rubric from Registration module configuration',
    components: registrationComponents,
  });
}

async function listComponents(toolId) {
  const result = await conductDb.query(
    `SELECT *
     FROM practicum_assessment_components
     WHERE tool_id = $1::uuid
       AND deleted_at IS NULL
     ORDER BY sort_order ASC, created_at ASC`,
    [toolId]
  );
  return result.rows;
}

async function normalizeDefaultTemporaryWeights(tool, components) {
  if (tool.source !== 'conduct_temporary') return components;
  const expected = new Map([
    ['tp', 30],
    ['pre-test', 30],
    ['jurnal', 40],
  ]);
  const defaultComponents = components.filter((component) =>
    expected.has(String(component.name ?? '').trim().toLowerCase())
  );
  if (defaultComponents.length !== expected.size) return components;
  const shouldNormalize = defaultComponents.every((component) => toNumber(component.weight) === 1);
  if (!shouldNormalize) return components;

  for (const component of defaultComponents) {
    const normalizedName = String(component.name).trim().toLowerCase();
    await conductDb.query(
      `UPDATE practicum_assessment_components
       SET weight = $2, updated_at = NOW()
       WHERE id = $1::uuid`,
      [component.id, expected.get(normalizedName)]
    );
  }
  return listComponents(tool.id);
}

async function getToolForSession(session) {
  const scheduleMap = await getSchedulesById([session.registration_schedule_id]);
  const schedule = scheduleMap.get(String(session.registration_schedule_id));
  const tool = await ensureDefaultTool(session, schedule);
  const components = await normalizeDefaultTemporaryWeights(tool, await listComponents(tool.id));
  return { tool, components, schedule };
}

function mapScheduleContext(session, schedule) {
  return {
    operational_session_id: session.id,
    registration_schedule_id: session.registration_schedule_id,
    session_status: session.session_status,
    completed_at: session.completed_at,
    practicum_name: schedule?.practicum_name || null,
    module_name: schedule?.module_name || null,
    class_group: schedule?.detail_kegiatan || schedule?.kelas || null,
    shift_label: schedule?.kelas || null,
    day_of_week: null,
    scheduled_at: schedule?.tanggal || null,
    start_time: schedule?.jam_mulai || schedule?.start_time || null,
    end_time: schedule?.jam_berakhir || schedule?.end_time || null,
    venue: schedule?.venue || null,
  };
}

function mapTool(tool, components) {
  return {
    id: tool.id,
    title: tool.title,
    description: tool.description,
    source: tool.source,
    components: components.map((component) => ({
      id: component.id,
      name: component.name,
      description: component.description,
      max_score: toNumber(component.max_score),
      weight: toNumber(component.weight),
      sort_order: component.sort_order,
      is_required: component.is_required,
    })),
  };
}

async function getExistingGrade({ sessionId, studentUserId, graderUserId }) {
  const gradeResult = await conductDb.query(
    `SELECT *
     FROM practicum_student_grades
     WHERE operational_session_id = $1::uuid
       AND student_user_id = $2
       AND grader_user_id = $3
       AND deleted_at IS NULL
     LIMIT 1`,
    [sessionId, studentUserId, graderUserId]
  );
  if (gradeResult.rowCount === 0) return null;

  const grade = gradeResult.rows[0];
  const componentResult = await conductDb.query(
    `SELECT *
     FROM practicum_student_grade_components
     WHERE grade_id = $1::uuid
     ORDER BY created_at ASC`,
    [grade.id]
  );

  return {
    id: grade.id,
    status: grade.status,
    total_score: toNumber(grade.total_score),
    submitted_at: grade.submitted_at,
    components: componentResult.rows.map((component) => ({
      component_id: component.component_id,
      score: toNumber(component.score),
      feedback: component.feedback,
    })),
  };
}

export async function listAssistantGradingSessions(requesterUserId) {
  const userId = requireNonEmptyString(requesterUserId, 'user_id');

  const assigned = await registrationDb.query(
    `SELECT schedule_id
     FROM schedule_assistants
     WHERE user_id = $1`,
    [userId]
  );
  const assignedScheduleIds = assigned.rows.map((row) => String(row.schedule_id));

  const result = await conductDb.query(
    `SELECT DISTINCT s.*
     FROM practicum_operational_sessions s
     LEFT JOIN practicum_operational_session_active_assistants aa
       ON aa.operational_session_id = s.id
      AND aa.user_id = $1
     WHERE s.deleted_at IS NULL
       AND s.session_status = 'completed'
       AND (
         s.pic_user_id = $1
         OR aa.user_id IS NOT NULL
         OR s.registration_schedule_id = ANY($2::uuid[])
       )
     ORDER BY s.completed_at DESC NULLS LAST, s.created_at DESC
     LIMIT 200`,
    [userId, assignedScheduleIds]
  );

  if (result.rowCount === 0) return [];

  const scheduleMap = await getSchedulesById(result.rows.map((row) => row.registration_schedule_id));
  const sessionIds = result.rows.map((row) => row.id);
  const progressResult = await conductDb.query(
    `SELECT
       a.operational_session_id,
       COUNT(DISTINCT a.user_id)::int AS total_students,
       COUNT(DISTINCT g.student_user_id)::int AS graded_students
     FROM practicum_operational_session_attendances a
     LEFT JOIN practicum_student_grades g
       ON g.operational_session_id = a.operational_session_id
      AND g.student_user_id = a.user_id
      AND g.grader_user_id = $2
      AND g.status = 'submitted'
      AND g.deleted_at IS NULL
     WHERE a.operational_session_id = ANY($1::uuid[])
     GROUP BY a.operational_session_id`,
    [sessionIds, userId]
  );
  const progressBySession = new Map(
    progressResult.rows.map((row) => [String(row.operational_session_id), row])
  );

  const rubricStatusBySchedule = new Map();
  for (const session of result.rows) {
    const schedule = scheduleMap.get(String(session.registration_schedule_id));
    rubricStatusBySchedule.set(
      String(session.registration_schedule_id),
      await getRegistrationRubricStatus(schedule?.module_id)
    );
  }

  return result.rows.map((session) => {
    const schedule = scheduleMap.get(String(session.registration_schedule_id));
    const progress = progressBySession.get(String(session.id));
    const totalStudents = Number(progress?.total_students ?? 0);
    const gradedStudents = Number(progress?.graded_students ?? 0);
    return {
      ...mapScheduleContext(session, schedule),
      pic_user_id: session.pic_user_id,
      total_students: totalStudents,
      graded_students: gradedStudents,
      pending_students: Math.max(totalStudents - gradedStudents, 0),
      ...(rubricStatusBySchedule.get(String(session.registration_schedule_id)) || {}),
    };
  });
}

export async function listGradingStudents({ operationalSessionId, requesterUserId }) {
  const sessionId = requireNonEmptyString(operationalSessionId, 'operational_session_id');
  const userId = requireNonEmptyString(requesterUserId, 'user_id');
  const session = await getOperationalSessionById(sessionId);
  await ensureCanGradeSession(session, userId);

  const canMonitorAll = canMonitorAllStudentsInSession(session, userId);
  const attendanceResult = await conductDb.query(
    `SELECT *
     FROM practicum_operational_session_attendances
     WHERE operational_session_id = $1::uuid
       AND assigned_assistant_user_id IS NOT NULL
       AND ($2::boolean = true OR assigned_assistant_user_id = $3)
     ORDER BY attendance_time ASC`,
    [sessionId, canMonitorAll, userId]
  );
  const profiles = await getUserProfiles([
    ...attendanceResult.rows.map((row) => row.user_id),
    ...attendanceResult.rows.map((row) => row.assigned_assistant_user_id),
  ]);

  const gradeResult = await conductDb.query(
    `SELECT DISTINCT ON (student_user_id) student_user_id, status, total_score, submitted_at
     FROM practicum_student_grades
     WHERE operational_session_id = $1::uuid
       AND deleted_at IS NULL
     ORDER BY student_user_id, submitted_at DESC NULLS LAST, updated_at DESC`,
    [sessionId]
  );
  const gradeByStudent = new Map(gradeResult.rows.map((row) => [String(row.student_user_id), row]));

  return attendanceResult.rows.map((attendance) => {
    const profile = profiles.get(String(attendance.user_id));
    const assignedAssistantId = String(attendance.assigned_assistant_user_id ?? '').trim();
    const assignedAssistant = assignedAssistantId ? profiles.get(assignedAssistantId) : null;
    const grade = gradeByStudent.get(String(attendance.user_id));
    const isOwnPlot = assignedAssistantId === String(userId);
    const canReassignPlot = canMonitorAll && session.session_status === 'ongoing' && !grade;
    const plotLockedReason = canMonitorAll && !canReassignPlot
      ? grade
        ? 'Grade has already been submitted'
        : session.session_status === 'completed'
          ? 'Session is already completed'
          : 'Plot can only be changed while the session is ongoing'
      : null;
    return {
      attendance_id: attendance.id,
      student_user_id: attendance.user_id,
      student_name: profile?.name || attendance.user_id,
      student_identifier: profile?.nipnim || null,
      attendance_time: attendance.attendance_time,
      attendance_status: attendance.attendance_status,
      assigned_assistant_user_id: assignedAssistantId || null,
      assigned_assistant_name: assignedAssistant?.name || assignedAssistantId || null,
      is_own_plot: isOwnPlot,
      is_pic_view: canMonitorAll,
      is_unassigned_plot: false,
      can_grade: isOwnPlot,
      can_reassign_plot: canReassignPlot,
      plot_locked_reason: plotLockedReason,
      grade_status: grade?.status || 'not_graded',
      total_score: grade ? toNumber(grade.total_score) : null,
      submitted_at: grade?.submitted_at || null,
    };
  });
}

export async function getGradingForm({ operationalSessionId, studentUserId, requesterUserId }) {
  const sessionId = requireNonEmptyString(operationalSessionId, 'operational_session_id');
  const targetStudentId = requireNonEmptyString(studentUserId, 'student_user_id');
  const graderUserId = requireNonEmptyString(requesterUserId, 'user_id');

  const session = await getOperationalSessionById(sessionId);
  await ensureCanGradeSession(session, graderUserId);
  const attendance = await getAttendance(sessionId, targetStudentId);
  ensureCanGradeAttendance(attendance, graderUserId);
  const { tool, components, schedule } = await getToolForSession(session);
  const profiles = await getUserProfiles([targetStudentId]);
  const profile = profiles.get(targetStudentId);
  const existingGrade = await getExistingGrade({
    sessionId,
    studentUserId: targetStudentId,
    graderUserId,
  });

  return {
    context: mapScheduleContext(session, schedule),
    student: {
      user_id: targetStudentId,
      name: profile?.name || targetStudentId,
      identifier: profile?.nipnim || null,
      attendance_id: attendance.id,
      attendance_status: attendance.attendance_status,
      attendance_time: attendance.attendance_time,
    },
    tool: mapTool(tool, components),
    grade: existingGrade,
  };
}

export async function submitStudentGrade({
  operationalSessionId,
  studentUserId,
  requesterUserId,
  components,
}) {
  const sessionId = requireNonEmptyString(operationalSessionId, 'operational_session_id');
  const targetStudentId = requireNonEmptyString(studentUserId, 'student_user_id');
  const graderUserId = requireNonEmptyString(requesterUserId, 'user_id');
  const submittedComponents = Array.isArray(components) ? components : [];
  if (submittedComponents.length === 0) throw new Error('Grade components are required');

  const session = await getOperationalSessionById(sessionId);
  await ensureCanGradeSession(session, graderUserId);
  const attendance = await getAttendance(sessionId, targetStudentId);
  ensureCanGradeAttendance(attendance, graderUserId);
  const { tool, components: toolComponents } = await getToolForSession(session);
  const componentById = new Map(toolComponents.map((component) => [String(component.id), component]));

  const normalized = submittedComponents.map((item) => {
    const componentId = requireNonEmptyString(item?.component_id ?? item?.componentId, 'component_id');
    const component = componentById.get(componentId);
    if (!component) throw new Error('Grade component not found');
    const score = normalizeScore(item?.score, `${component.name} score`);
    const maxScore = toNumber(component.max_score);
    if (score > maxScore) throw new Error(`${component.name} score cannot exceed ${maxScore}`);
    return {
      component,
      score,
      feedback: String(item?.feedback ?? '').trim() || null,
    };
  });

  for (const component of toolComponents) {
    const hasValue = normalized.some((item) => String(item.component.id) === String(component.id));
    if (component.is_required && !hasValue) {
      throw new Error(`${component.name} score is required`);
    }
  }

  const totalScore = calculateFinalScore(normalized);

  const client = await conductDb.connect();
  try {
    await client.query('BEGIN');
    const gradeResult = await client.query(
      `INSERT INTO practicum_student_grades (
         operational_session_id,
         student_user_id,
         grader_user_id,
         tool_id,
         status,
         total_score,
         submitted_at,
         updated_at
       ) VALUES ($1::uuid, $2, $3, $4::uuid, 'submitted', $5, NOW(), NOW())
       ON CONFLICT (operational_session_id, student_user_id, grader_user_id)
       DO UPDATE SET
         tool_id = EXCLUDED.tool_id,
         status = 'submitted',
         total_score = EXCLUDED.total_score,
         submitted_at = NOW(),
         updated_at = NOW(),
         deleted_at = NULL
       RETURNING *`,
      [sessionId, targetStudentId, graderUserId, tool.id, totalScore.toFixed(2)]
    );
    const grade = gradeResult.rows[0];

    for (const item of normalized) {
      await client.query(
        `INSERT INTO practicum_student_grade_components (
           grade_id,
           component_id,
           score,
           feedback,
           updated_at
         ) VALUES ($1::uuid, $2::uuid, $3, $4, NOW())
         ON CONFLICT (grade_id, component_id)
         DO UPDATE SET
           score = EXCLUDED.score,
           feedback = EXCLUDED.feedback,
           updated_at = NOW()`,
        [grade.id, item.component.id, item.score, item.feedback]
      );
    }

    await client.query('COMMIT');
    return getGradingForm({
      operationalSessionId: sessionId,
      studentUserId: targetStudentId,
      requesterUserId: graderUserId,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function listGradesForReporting({
  operationalSessionId,
  registrationScheduleId,
  studentUserId,
  gradeId,
  scheduleIds,
  operationalSessionIds,
  practicumName,
  limit = 500,
} = {}) {
  const args = [];
  let where = `WHERE g.deleted_at IS NULL AND g.status = 'submitted'`;

  if (gradeId) {
    args.push(String(gradeId).trim());
    where += ` AND g.id = $${args.length}::uuid`;
  }
  if (operationalSessionId) {
    args.push(String(operationalSessionId).trim());
    where += ` AND g.operational_session_id = $${args.length}::uuid`;
  }
  if (Array.isArray(operationalSessionIds)) {
    if (operationalSessionIds.length === 0) {
      return [];
    }
    args.push(operationalSessionIds.map((id) => String(id).trim()).filter(Boolean));
    where += ` AND g.operational_session_id = ANY($${args.length}::uuid[])`;
  }
  if (registrationScheduleId) {
    args.push(String(registrationScheduleId).trim());
    where += ` AND s.registration_schedule_id = $${args.length}::uuid`;
  }
  if (Array.isArray(scheduleIds)) {
    if (scheduleIds.length === 0) {
      return [];
    }
    args.push(scheduleIds.map((id) => String(id).trim()).filter(Boolean));
    where += ` AND s.registration_schedule_id = ANY($${args.length}::uuid[])`;
  }
  if (studentUserId) {
    args.push(String(studentUserId).trim());
    where += ` AND g.student_user_id = $${args.length}`;
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 500, 1), 2000);

  const result = await conductDb.query(
    `SELECT
       g.*,
       s.registration_schedule_id,
       s.scheduled_date,
       s.start_time,
       s.end_time,
       s.venue,
       t.title AS tool_title,
       t.source AS tool_source,
       COALESCE(
         json_agg(
           json_build_object(
             'component_id', c.id,
             'component_name', c.name,
             'score', gc.score,
             'max_score', c.max_score,
             'weight', c.weight,
             'feedback', gc.feedback
           ) ORDER BY c.sort_order ASC
         ) FILTER (WHERE gc.id IS NOT NULL),
         '[]'::json
       ) AS components
     FROM practicum_student_grades g
     JOIN practicum_operational_sessions s ON s.id = g.operational_session_id
     JOIN practicum_assessment_tools t ON t.id = g.tool_id
     LEFT JOIN practicum_student_grade_components gc ON gc.grade_id = g.id
     LEFT JOIN practicum_assessment_components c ON c.id = gc.component_id
     ${where}
     GROUP BY g.id, s.registration_schedule_id, s.scheduled_date, s.start_time, s.end_time, s.venue, t.title, t.source
     ORDER BY g.submitted_at DESC
     LIMIT ${safeLimit}`,
    args
  );

  const scheduleMap = await getSchedulesById(result.rows.map((row) => row.registration_schedule_id));
  const profiles = await getUserProfiles([
    ...result.rows.map((row) => row.student_user_id),
    ...result.rows.map((row) => row.grader_user_id),
  ]);

  return result.rows.map((row) => {
    const schedule = scheduleMap.get(String(row.registration_schedule_id));
    const student = profiles.get(String(row.student_user_id));
    const grader = profiles.get(String(row.grader_user_id));
    const practicumNameValue = schedule?.practicum_name || null;
    const moduleNameValue = schedule?.module_name || null;
    return {
      id: row.id,
      operational_session_id: row.operational_session_id,
      registration_schedule_id: row.registration_schedule_id,
      module_id: schedule?.module_id || null,
      practicum_name: practicumNameValue,
      module_name: moduleNameValue,
      class_group: schedule?.detail_kegiatan || schedule?.kelas || null,
      scheduled_date: row.scheduled_date,
      start_time: row.start_time,
      end_time: row.end_time,
      venue: row.venue,
      student_user_id: row.student_user_id,
      student_name: student?.name || row.student_user_id,
      student_identifier: student?.nipnim || null,
      grader_user_id: row.grader_user_id,
      grader_name: grader?.name || row.grader_user_id,
      total_score: toNumber(row.total_score),
      final_score: toNumber(row.total_score),
      submitted_at: row.submitted_at,
      tool_title: row.tool_title,
      tool_source: row.tool_source,
      components: (row.components || []).map(mapGradeComponentBreakdown),
      _filter_practicum_name: practicumNameValue,
      _filter_module_name: moduleNameValue,
    };
  }).filter((row) => {
    if (!practicumName) return true;
    const target = String(practicumName).trim().toLowerCase();
    const candidates = [
      row.practicum_name,
      row.module_name,
      row._filter_practicum_name,
      row._filter_module_name,
    ]
      .map((value) => String(value ?? '').trim().toLowerCase())
      .filter(Boolean);
    return candidates.some((value) => value === target || value.includes(target));
  }).map(({ _filter_practicum_name, _filter_module_name, ...row }) => row);
}
