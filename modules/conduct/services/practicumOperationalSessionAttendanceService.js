import { conductDb, userManagementDb } from '../../../config/databases.js';
import { getOperationalSessionById, listSessionActiveAssistants } from './practicumOperationalSessionService.js';
import { validateOperationalSessionQrToken } from './practicumOperationalSessionQrService.js';
import {
  OPERATIONAL_ATTENDANCE_LATE_RULE,
  classifyOperationalSessionAttendanceStatus,
} from './practicumOperationalSessionLateStatusService.js';
import {
  assertEnrolledPraktikanForSchedule,
} from './registrationDataService.js';

function requireNonEmptyString(value, fieldName) {
  const s = String(value ?? '').trim();
  if (!s) throw new Error(`${fieldName} is required`);
  return s;
}

function plotLabel(index) {
  let n = index + 1;
  let label = '';
  while (n > 0) {
    n -= 1;
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26);
  }
  return `Plot ${label}`;
}

export async function buildPlotGroupMapForSession(sessionId) {
  return buildPlotGroupByAssistant(sessionId);
}

export async function loadQrSessionGeneratedByMap(qrSessionIds = []) {
  const ids = [...new Set(
    qrSessionIds.map((id) => String(id ?? '').trim()).filter(Boolean)
  )];
  if (ids.length === 0) return new Map();

  const result = await conductDb.query(
    `SELECT id, generated_by
     FROM practicum_operational_session_qr_sessions
     WHERE id = ANY($1::uuid[])`,
    [ids]
  );
  return new Map(
    result.rows.map((row) => [String(row.id), String(row.generated_by)])
  );
}

export function resolveAssignedAssistantUserId(attendanceRow, qrSessionById = new Map()) {
  const direct = String(attendanceRow?.assigned_assistant_user_id ?? '').trim();
  if (direct) return direct;

  const qrSessionId = String(
    attendanceRow?.assigned_qr_session_id ?? attendanceRow?.qr_session_id ?? ''
  ).trim();
  if (!qrSessionId) return null;

  return qrSessionById.get(qrSessionId) || null;
}

async function buildPlotGroupByAssistant(sessionId) {
  const assistants = await listSessionActiveAssistants(sessionId);
  return new Map(
    assistants.map((assistant) => {
      const isPic = assistant.activation_method === 'pic_open';
      const rawName = String(assistant.user_name || '').trim();
      const rawId = String(assistant.user_id || '').trim();
      const shouldUseFallback = !rawName || rawName === rawId;
      const displayName = shouldUseFallback
        ? isPic
          ? 'Practicum PIC'
          : 'Practicum Assistant'
        : rawName;
      return [
        String(assistant.user_id),
        {
          plot_group: assistant.plot_group,
          plot_assistant_user_id: assistant.user_id,
          plot_assistant_name: displayName,
          plot_assistant_identifier: assistant.user_identifier || null,
        },
      ];
    })
  );
}

async function enrichAttendanceWithPlot(sessionId, attendance) {
  const plotGroupByAssistant = await buildPlotGroupByAssistant(sessionId);
  const userIds = [attendance.user_id, attendance.assigned_assistant_user_id].filter(Boolean);
  const users = userIds.length === 0
    ? { rows: [] }
    : await userManagementDb.query(
        `SELECT user_id, name, nipnim
         FROM user_profiles
         WHERE user_id = ANY($1::text[])
           AND deleted_at IS NULL`,
        [userIds]
      );
  const userById = new Map(users.rows.map((row) => [String(row.user_id), row]));
  const user = userById.get(String(attendance.user_id));
  const assignedAssistantId = attendance.assigned_assistant_user_id
    ? String(attendance.assigned_assistant_user_id)
    : null;
  const assignedAssistant = assignedAssistantId ? userById.get(assignedAssistantId) : null;
  const plot = assignedAssistantId ? plotGroupByAssistant.get(assignedAssistantId) : null;
  return {
    ...attendance,
    user_name: user?.name || attendance.user_id,
    user_identifier: user?.nipnim || null,
    assigned_assistant_name: assignedAssistant?.name || attendance.assigned_assistant_user_id || null,
    assigned_assistant_identifier: assignedAssistant?.nipnim || null,
    plot_group: plot?.plot_group || null,
    plot_assistant_user_id: plot?.plot_assistant_user_id || assignedAssistantId,
    plot_assistant_name: plot?.plot_assistant_name || assignedAssistant?.name || attendance.assigned_assistant_user_id || null,
    plot_assistant_identifier: plot?.plot_assistant_identifier || assignedAssistant?.nipnim || null,
  };
}

async function ensureRegisteredPraktikan(registrationScheduleId, userId) {
  await assertEnrolledPraktikanForSchedule(registrationScheduleId, userId);
}

export async function checkInOperationalSessionAttendance({
  operationalSessionId,
  requesterUserId,
  qrToken,
}) {
  if (!requesterUserId) throw new Error('User is not authenticated');
  const sessionId = requireNonEmptyString(operationalSessionId, 'operational_session_id');
  const token = requireNonEmptyString(qrToken, 'qr_token');

  const session = await getOperationalSessionById(sessionId);
  if (session.session_status !== 'ongoing') {
    throw new Error('Check-in is only available while the session is ongoing');
  }
  await ensureRegisteredPraktikan(session.registration_schedule_id, requesterUserId);

  const qrSession = await validateOperationalSessionQrToken({
    operationalSessionId: sessionId,
    qrToken: token,
  });
  const { attendanceStatus, shiftStartAt, lateCutoffAt } =
    await classifyOperationalSessionAttendanceStatus(session, {
      ruleType: OPERATIONAL_ATTENDANCE_LATE_RULE.STUDENT_CHECK_IN,
    });

  const assignedAssistantUserId = qrSession.generated_by;
  const insertResult = await conductDb.query(
    `INSERT INTO practicum_operational_session_attendances (
       operational_session_id,
       user_id,
       qr_session_id,
       assigned_qr_session_id,
       assigned_assistant_user_id,
       assigned_at,
       attendance_time,
       attendance_status,
       created_at,
       updated_at
     ) VALUES ($1::uuid, $2, $3::uuid, $3::uuid, $4, NOW(), NOW(), $5, NOW(), NOW())
     ON CONFLICT (operational_session_id, user_id) DO NOTHING
     RETURNING *`,
    [sessionId, requesterUserId, qrSession.id, assignedAssistantUserId, attendanceStatus]
  );

  if (insertResult.rowCount > 0) {
    const plotGroupByAssistant = await buildPlotGroupByAssistant(sessionId);
    const plot = plotGroupByAssistant.get(String(assignedAssistantUserId));
    return {
      ...insertResult.rows[0],
      already_checked_in: false,
      shift_start_at: shiftStartAt,
      late_cutoff_at: lateCutoffAt,
      plot_group: plot?.plot_group || null,
      plot_assistant_user_id: plot?.plot_assistant_user_id || assignedAssistantUserId,
      plot_assistant_name: plot?.plot_assistant_name || assignedAssistantUserId,
      plot_assistant_identifier: plot?.plot_assistant_identifier || null,
      assigned_assistant_name: plot?.plot_assistant_name || assignedAssistantUserId,
      assigned_assistant_identifier: plot?.plot_assistant_identifier || null,
    };
  }

  const existing = await conductDb.query(
    `SELECT *
     FROM practicum_operational_session_attendances
     WHERE operational_session_id = $1::uuid
       AND user_id = $2
     LIMIT 1`,
    [sessionId, requesterUserId]
  );

  const existingRow = existing.rows[0];
  const plotGroupByAssistant = await buildPlotGroupByAssistant(sessionId);
  const qrSessionById = await loadQrSessionGeneratedByMap([
    existingRow.assigned_qr_session_id,
    existingRow.qr_session_id,
  ]);
  const assignedAssistantId = resolveAssignedAssistantUserId(existingRow, qrSessionById);
  const plot = assignedAssistantId ? plotGroupByAssistant.get(assignedAssistantId) : null;
  return {
    ...existingRow,
    already_checked_in: true,
    shift_start_at: shiftStartAt,
    late_cutoff_at: lateCutoffAt,
    plot_group: plot?.plot_group || null,
    plot_assistant_user_id: plot?.plot_assistant_user_id || assignedAssistantId,
    plot_assistant_name: plot?.plot_assistant_name || assignedAssistantId,
    plot_assistant_identifier: plot?.plot_assistant_identifier || null,
    assigned_assistant_name: plot?.plot_assistant_name || assignedAssistantId,
    assigned_assistant_identifier: plot?.plot_assistant_identifier || null,
  };
}

export async function listOperationalSessionAttendancePlotHistory({ operationalSessionId, attendanceId, requesterUserId }) {
  const sessionId = requireNonEmptyString(operationalSessionId, 'operational_session_id');
  const targetAttendanceId = requireNonEmptyString(attendanceId, 'attendance_id');
  const userId = requireNonEmptyString(requesterUserId, 'user_id');
  const session = await getOperationalSessionById(sessionId);
  if (String(session.pic_user_id ?? '') !== String(userId)) {
    throw new Error('Only the session PIC can view student plot history');
  }

  const result = await conductDb.query(
    `SELECT *
     FROM practicum_attendance_plot_reassignments
     WHERE operational_session_id = $1::uuid
       AND attendance_id = $2::uuid
     ORDER BY created_at DESC
     LIMIT 20`,
    [sessionId, targetAttendanceId]
  );

  const userIds = result.rows
    .flatMap((row) => [
      row.from_assistant_user_id,
      row.to_assistant_user_id,
      row.changed_by_user_id,
      row.student_user_id,
    ])
    .filter(Boolean);
  const users = userIds.length === 0
    ? { rows: [] }
    : await userManagementDb.query(
        `SELECT user_id, name, nipnim
         FROM user_profiles
         WHERE user_id = ANY($1::text[])
           AND deleted_at IS NULL`,
        [[...new Set(userIds.map((id) => String(id)))]]
      );
  const userById = new Map(users.rows.map((row) => [String(row.user_id), row]));

  return result.rows.map((row) => ({
    id: row.id,
    attendance_id: row.attendance_id,
    operational_session_id: row.operational_session_id,
    student_user_id: row.student_user_id,
    student_name: userById.get(String(row.student_user_id))?.name || row.student_user_id,
    from_assistant_user_id: row.from_assistant_user_id,
    from_assistant_name: row.from_assistant_user_id
      ? userById.get(String(row.from_assistant_user_id))?.name || row.from_assistant_user_id
      : null,
    to_assistant_user_id: row.to_assistant_user_id,
    to_assistant_name: userById.get(String(row.to_assistant_user_id))?.name || row.to_assistant_user_id,
    changed_by_user_id: row.changed_by_user_id,
    changed_by_name: userById.get(String(row.changed_by_user_id))?.name || row.changed_by_user_id,
    reason: row.reason,
    created_at: row.created_at,
  }));
}

export async function reassignOperationalSessionAttendancePlot({
  operationalSessionId,
  attendanceId,
  targetAssistantUserId,
  requesterUserId,
  reason,
}) {
  const sessionId = requireNonEmptyString(operationalSessionId, 'operational_session_id');
  const targetAttendanceId = requireNonEmptyString(attendanceId, 'attendance_id');
  const targetAssistantId = requireNonEmptyString(targetAssistantUserId, 'target_assistant_user_id');
  const picUserId = requireNonEmptyString(requesterUserId, 'user_id');
  const normalizedReason = String(reason ?? '').trim();
  if (normalizedReason.length < 5) {
    throw new Error('Plot reassignment reason must be at least 5 characters');
  }

  const session = await getOperationalSessionById(sessionId);
  await assertPicCanReassignStudentPlots(session, picUserId);

  const attendanceResult = await conductDb.query(
    `SELECT *
     FROM practicum_operational_session_attendances
     WHERE id = $1::uuid
       AND operational_session_id = $2::uuid
     LIMIT 1`,
    [targetAttendanceId, sessionId]
  );
  if (attendanceResult.rowCount === 0) {
    throw new Error('Student attendance was not found');
  }
  const attendance = attendanceResult.rows[0];

  const gradeResult = await conductDb.query(
    `SELECT 1
     FROM practicum_student_grades
     WHERE operational_session_id = $1::uuid
       AND student_user_id = $2
       AND deleted_at IS NULL
       AND status = 'submitted'
     LIMIT 1`,
    [sessionId, attendance.user_id]
  );
  if (gradeResult.rowCount > 0) {
    throw new Error('Student plot cannot be changed because a grade has already been submitted');
  }

  const activeAssistants = await listSessionActiveAssistants(sessionId);
  const targetAssistant = activeAssistants.find((assistant) => String(assistant.user_id) === String(targetAssistantId));
  if (!targetAssistant) {
    throw new Error('Target assistant is not active in this session');
  }
  if (String(attendance.assigned_assistant_user_id ?? '') === String(targetAssistantId)) {
    throw new Error('Student is already assigned to that assistant');
  }

  const client = await conductDb.connect();
  try {
    await client.query('BEGIN');
    const updated = await client.query(
      `UPDATE practicum_operational_session_attendances
       SET assigned_assistant_user_id = $3,
           assigned_at = NOW(),
           updated_at = NOW()
       WHERE id = $1::uuid
         AND operational_session_id = $2::uuid
       RETURNING *`,
      [targetAttendanceId, sessionId, targetAssistantId]
    );
    await client.query(
      `INSERT INTO practicum_attendance_plot_reassignments (
         attendance_id,
         operational_session_id,
         student_user_id,
         from_assistant_user_id,
         to_assistant_user_id,
         changed_by_user_id,
         reason
       ) VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7)`,
      [
        targetAttendanceId,
        sessionId,
        attendance.user_id,
        attendance.assigned_assistant_user_id || null,
        targetAssistantId,
        picUserId,
        normalizedReason,
      ]
    );
    await client.query('COMMIT');
    return enrichAttendanceWithPlot(sessionId, updated.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function normalizeAttendanceIdList(attendanceIds) {
  const list = Array.isArray(attendanceIds) ? attendanceIds : [];
  const normalized = list.map((value) => String(value ?? '').trim()).filter(Boolean);
  return [...new Set(normalized)];
}

async function assertPicCanReassignStudentPlots(session, picUserId) {
  if (String(session.pic_user_id ?? '') !== String(picUserId)) {
    throw new Error('Only the session PIC can reassign student plots');
  }
  if (session.session_status === 'completed') {
    throw new Error('Student plot cannot be changed after the session is completed');
  }
  if (session.session_status !== 'ongoing') {
    throw new Error('Student plot can only be changed while the session is ongoing');
  }
}

export async function bulkReassignOperationalSessionAttendancePlot({
  operationalSessionId,
  attendanceIds,
  targetAssistantUserId,
  requesterUserId,
  reason,
}) {
  const sessionId = requireNonEmptyString(operationalSessionId, 'operational_session_id');
  const targetAssistantId = requireNonEmptyString(targetAssistantUserId, 'target_assistant_user_id');
  const picUserId = requireNonEmptyString(requesterUserId, 'user_id');
  const normalizedReason = String(reason ?? '').trim();
  if (normalizedReason.length < 5) {
    throw new Error('Plot reassignment reason must be at least 5 characters');
  }

  const normalizedAttendanceIds = normalizeAttendanceIdList(attendanceIds);
  if (normalizedAttendanceIds.length === 0) {
    throw new Error('At least one attendance_id is required');
  }

  const session = await getOperationalSessionById(sessionId);
  await assertPicCanReassignStudentPlots(session, picUserId);

  const activeAssistants = await listSessionActiveAssistants(sessionId);
  const targetAssistant = activeAssistants.find(
    (assistant) => String(assistant.user_id) === String(targetAssistantId)
  );
  if (!targetAssistant) {
    throw new Error('Target assistant is not active in this session');
  }

  const attendanceResult = await conductDb.query(
    `SELECT *
     FROM practicum_operational_session_attendances
     WHERE operational_session_id = $1::uuid
       AND id = ANY($2::uuid[])`,
    [sessionId, normalizedAttendanceIds]
  );
  if (attendanceResult.rowCount !== normalizedAttendanceIds.length) {
    throw new Error('One or more student attendances were not found');
  }

  const attendances = attendanceResult.rows;
  const studentUserIds = attendances.map((row) => row.user_id).filter(Boolean);
  const gradeResult = await conductDb.query(
    `SELECT student_user_id
     FROM practicum_student_grades
     WHERE operational_session_id = $1::uuid
       AND student_user_id = ANY($2::text[])
       AND deleted_at IS NULL
       AND status = 'submitted'`,
    [sessionId, studentUserIds]
  );
  if (gradeResult.rowCount > 0) {
    throw new Error('Student plot cannot be changed because a grade has already been submitted');
  }

  const alreadyAssigned = attendances.filter(
    (attendance) => String(attendance.assigned_assistant_user_id ?? '') === String(targetAssistantId)
  );
  if (alreadyAssigned.length === attendances.length) {
    throw new Error('All selected students are already assigned to that assistant');
  }

  const client = await conductDb.connect();
  const updatedRows = [];
  try {
    await client.query('BEGIN');
    for (const attendance of attendances) {
      if (String(attendance.assigned_assistant_user_id ?? '') === String(targetAssistantId)) {
        continue;
      }
      const updated = await client.query(
        `UPDATE practicum_operational_session_attendances
         SET assigned_assistant_user_id = $3,
             assigned_at = NOW(),
             updated_at = NOW()
         WHERE id = $1::uuid
           AND operational_session_id = $2::uuid
         RETURNING *`,
        [attendance.id, sessionId, targetAssistantId]
      );
      await client.query(
        `INSERT INTO practicum_attendance_plot_reassignments (
           attendance_id,
           operational_session_id,
           student_user_id,
           from_assistant_user_id,
           to_assistant_user_id,
           changed_by_user_id,
           reason
         ) VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7)`,
        [
          attendance.id,
          sessionId,
          attendance.user_id,
          attendance.assigned_assistant_user_id || null,
          targetAssistantId,
          picUserId,
          normalizedReason,
        ]
      );
      updatedRows.push(updated.rows[0]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  const enrichedRows = [];
  for (const row of updatedRows) {
    enrichedRows.push(await enrichAttendanceWithPlot(sessionId, row));
  }

  return {
    updated_count: enrichedRows.length,
    skipped_count: attendances.length - enrichedRows.length,
    rows: enrichedRows,
  };
}

export async function listMyOperationalSessionAttendances(requesterUserId) {
  const userId = requireNonEmptyString(requesterUserId, 'user_id');
  const result = await conductDb.query(
    `SELECT
       a.*,
       s.registration_schedule_id,
       s.session_status,
       s.ongoing_at,
       s.completed_at
     FROM practicum_operational_session_attendances a
     JOIN practicum_operational_sessions s ON s.id = a.operational_session_id
     WHERE a.user_id = $1
     ORDER BY a.attendance_time DESC`,
    [userId]
  );

  const enriched = [];
  for (const row of result.rows) {
    enriched.push(await enrichAttendanceWithPlot(row.operational_session_id, row));
  }
  return enriched;
}

export async function listOperationalSessionAttendances(operationalSessionId) {
  const sessionId = requireNonEmptyString(operationalSessionId, 'operational_session_id');
  const result = await conductDb.query(
    `SELECT
       a.*,
       EXISTS (
         SELECT 1
         FROM practicum_attendance_plot_reassignments r
         WHERE r.attendance_id = a.id
       ) AS has_plot_reassignment
     FROM practicum_operational_session_attendances a
     WHERE a.operational_session_id = $1::uuid
     ORDER BY a.attendance_time ASC NULLS LAST`,
    [sessionId]
  );

  const rows = result.rows;
  const plotGroupByAssistant = await buildPlotGroupByAssistant(sessionId);
  const qrSessionById = await loadQrSessionGeneratedByMap(
    rows.flatMap((row) => [row.assigned_qr_session_id, row.qr_session_id])
  );

  const userIds = rows
    .flatMap((row) => [
      row.user_id,
      resolveAssignedAssistantUserId(row, qrSessionById),
    ])
    .filter(Boolean);
  if (userIds.length === 0) return rows;

  const users = await userManagementDb.query(
    `SELECT user_id, name, nipnim
     FROM user_profiles
     WHERE user_id = ANY($1::text[])
       AND deleted_at IS NULL`,
    [userIds]
  );
  const userById = new Map(users.rows.map((row) => [String(row.user_id), row]));

  return rows.map((row) => {
    const user = userById.get(String(row.user_id));
    const assignedAssistantId = resolveAssignedAssistantUserId(row, qrSessionById);
    const assignedAssistant = assignedAssistantId ? userById.get(assignedAssistantId) : null;
    const plot = assignedAssistantId ? plotGroupByAssistant.get(assignedAssistantId) : null;
    return {
      ...row,
      user_name: user?.name || row.user_id,
      user_identifier: user?.nipnim || null,
      assigned_assistant_name: assignedAssistant?.name || row.assigned_assistant_user_id || null,
      assigned_assistant_identifier: assignedAssistant?.nipnim || null,
      plot_group: plot?.plot_group || null,
      plot_assistant_user_id: plot?.plot_assistant_user_id || assignedAssistantId,
      plot_assistant_name: plot?.plot_assistant_name || assignedAssistant?.name || row.assigned_assistant_user_id || null,
      plot_assistant_identifier: plot?.plot_assistant_identifier || assignedAssistant?.nipnim || null,
    };
  });
}
