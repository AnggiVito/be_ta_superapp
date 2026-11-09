import { conductDb, registrationDb, userManagementDb } from '../../../config/databases.js';
import {
  OPERATIONAL_ATTENDANCE_LATE_RULE,
  classifyOperationalSessionAttendanceStatus,
} from './practicumOperationalSessionLateStatusService.js';
import { isScheduleAssistantByIdentifier } from './registrationUserIdentifierService.js';

const SESSION_TRANSITIONS = {
  scheduled: ['ongoing'],
  ongoing: ['completed'],
  completed: [],
};

function requireNonEmptyString(value, fieldName) {
  const s = String(value ?? '').trim();
  if (!s) throw new Error(`${fieldName} is required`);
  return s;
}

function normalizeUuid(value, fieldName) {
  const s = requireNonEmptyString(value, fieldName);
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(s)) {
    throw new Error(`${fieldName} must be a valid uuid`);
  }
  return s;
}

function assertLifecycleTransition(session, targetStatus) {
  const allowedTargets = SESSION_TRANSITIONS[session.session_status];
  if (!allowedTargets || !allowedTargets.includes(targetStatus)) {
    throw new Error(
      `Invalid session status transition (${session.session_status} -> ${targetStatus})`
    );
  }
}

function buildLifecycleUpdate(targetStatus) {
  switch (targetStatus) {
    case 'ongoing':
      return {
        timestampColumn: 'ongoing_at',
        extraSet: 'cancel_reason = NULL, status_change_note = NULL',
      };
    case 'completed':
      return {
        timestampColumn: 'completed_at',
        extraSet: 'status_change_note = NULL',
      };
    default:
      throw new Error('status must be ongoing, completed, or cancelled');
  }
}

async function isAssignedScheduleAssistant(scheduleId, userId) {
  return isScheduleAssistantByIdentifier(registrationDb, scheduleId, userId);
}

async function isSessionActiveAssistant(sessionId, userId) {
  const result = await conductDb.query(
    `SELECT 1 FROM practicum_operational_session_active_assistants
     WHERE operational_session_id = $1 AND user_id = $2 LIMIT 1`,
    [sessionId, userId]
  );
  return result.rowCount > 0;
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

async function activateSessionAssistant(sessionId, userId, method, attendanceStatus = 'present') {
  await conductDb.query(
    `INSERT INTO practicum_operational_session_active_assistants
       (operational_session_id, user_id, activation_method, attendance_status)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (operational_session_id, user_id) DO NOTHING`,
    [sessionId, userId, method, attendanceStatus]
  );
}

async function validateActivationQrToken(sessionId, qrToken) {
  const token = requireNonEmptyString(qrToken, 'qr_token');
  const result = await conductDb.query(
    `SELECT id, expired_at, is_active
     FROM practicum_operational_session_qr_sessions
     WHERE operational_session_id = $1::uuid
       AND qr_token = $2
       AND qr_data->>'type' = 'operational_session_assistant_activation'
     LIMIT 1`,
    [sessionId, token]
  );

  if (result.rowCount === 0) throw new Error('Activation QR token was not found');
  const qrSession = result.rows[0];
  if (!qrSession.is_active) throw new Error('Activation QR token is no longer active');
  if (new Date(qrSession.expired_at).getTime() <= Date.now()) {
    throw new Error('Activation QR token has expired');
  }
}

export async function listOperationalSessionQrAuditLogs(sessionId) {
  const result = await userManagementDb.query(
    `SELECT user_id, action, metadata, created_at
     FROM activity_logs
     WHERE action = ANY($1::text[])
       AND metadata->>'operational_session_id' = $2
       AND (
         affected_table = 'practicum_operational_session_qr_sessions'
         OR affected_table = 'practicum_operational_session_active_assistants'
       )
     ORDER BY created_at DESC
     LIMIT 50`,
    [
      [
        'GENERATE_OPERATIONAL_SESSION_ACTIVATION_QR',
        'GENERATE_OPERATIONAL_SESSION_ATTENDANCE_QR',
        'SCAN_OPERATIONAL_SESSION_ACTIVATION_QR',
      ],
      sessionId,
    ]
  );

  const userIds = result.rows.map((row) => row.user_id).filter(Boolean);
  let userById = new Map();
  if (userIds.length > 0) {
    const users = await userManagementDb.query(
      `SELECT user_id, name, nipnim
       FROM user_profiles
       WHERE user_id = ANY($1::text[])
         AND deleted_at IS NULL`,
      [userIds]
    );
    userById = new Map(users.rows.map((row) => [String(row.user_id), row]));
  }

  return result.rows.map((row) => {
    const user = userById.get(String(row.user_id));
    return {
      user_id: row.user_id,
      user_name: user?.name || row.user_id,
      user_identifier: user?.nipnim || null,
      action: row.action,
      metadata: row.metadata || {},
      created_at: row.created_at,
    };
  });
}

async function enrichOperationalSessionsWithPic(rows) {
  const list = Array.isArray(rows) ? rows : [rows].filter(Boolean);
  const picIds = [...new Set(list.map((row) => row.pic_user_id).filter(Boolean).map(String))];
  if (picIds.length === 0) return Array.isArray(rows) ? list : rows;

  const users = await userManagementDb.query(
    `SELECT user_id, name, nipnim
     FROM user_profiles
     WHERE user_id = ANY($1::text[])
       AND deleted_at IS NULL`,
    [picIds]
  );
  const userById = new Map((users?.rows || []).map((row) => [String(row.user_id), row]));
  const enriched = list.map((row) => {
    const user = row.pic_user_id ? userById.get(String(row.pic_user_id)) : null;
    return {
      ...row,
      pic_user_name: user?.name || null,
      pic_user_identifier: user?.nipnim || null,
    };
  });
  return Array.isArray(rows) ? enriched : enriched[0];
}

export async function listSessionActiveAssistants(sessionId) {
  const result = await conductDb.query(
    `SELECT user_id, activation_method, activated_at, attendance_status
     FROM practicum_operational_session_active_assistants
     WHERE operational_session_id = $1
     ORDER BY
       CASE WHEN activation_method = 'pic_open' THEN 0 ELSE 1 END,
       activated_at ASC,
       user_id ASC`,
    [sessionId]
  );

  const userIds = result.rows.map((row) => row.user_id).filter(Boolean);
  if (userIds.length === 0) return result.rows;

  const users = await userManagementDb.query(
    `SELECT user_id, name, nipnim
     FROM user_profiles
     WHERE user_id = ANY($1::text[])
       AND deleted_at IS NULL`,
    [userIds]
  );
  const userById = new Map((users?.rows || []).map((row) => [String(row.user_id), row]));

  return result.rows.map((row, index) => {
    const user = userById.get(String(row.user_id));
    return {
      ...row,
      user_name: user?.name || row.user_id,
      user_identifier: user?.nipnim || null,
      plot_group: plotLabel(index),
    };
  });
}

export async function reassessActiveAssistantAttendanceStatuses(session, assistants = []) {
  const list = Array.isArray(assistants) ? assistants : [];
  return Promise.all(
    list.map(async (assistant) => {
      if (!assistant?.activated_at) return assistant;
      try {
        const { attendanceStatus } = await classifyOperationalSessionAttendanceStatus(session, {
          ruleType: OPERATIONAL_ATTENDANCE_LATE_RULE.ASSISTANT_ACTIVATION,
          scanTime: new Date(assistant.activated_at),
        });
        return { ...assistant, attendance_status: attendanceStatus };
      } catch {
        return assistant;
      }
    })
  );
}

export async function persistActiveAssistantAttendanceStatuses(sessionId, assistants = []) {
  const list = Array.isArray(assistants) ? assistants : [];
  await Promise.all(
    list.map(async (assistant) => {
      if (!assistant?.user_id || !assistant?.attendance_status) return;
      await conductDb.query(
        `UPDATE practicum_operational_session_active_assistants
         SET attendance_status = $3
         WHERE operational_session_id = $1
           AND user_id = $2
           AND attendance_status IS DISTINCT FROM $3`,
        [sessionId, assistant.user_id, assistant.attendance_status]
      );
    })
  );
}

export async function reassessAndPersistActiveAssistantAttendanceStatuses(session, assistants = []) {
  const reassessed = await reassessActiveAssistantAttendanceStatuses(session, assistants);
  if (session?.id) {
    await persistActiveAssistantAttendanceStatuses(session.id, reassessed);
  }
  return reassessed;
}

async function validateRegistrationSchedule(scheduleId) {
  const result = await registrationDb.query(
    `SELECT id FROM schedules WHERE id = $1 LIMIT 1`,
    [scheduleId]
  );
  if (result.rowCount === 0) {
    throw new Error('Registration schedule was not found');
  }
}

export async function createOperationalSession({ creatorUserId, payload }) {
  if (!creatorUserId) throw new Error('User is not authenticated');

  const scheduleId = normalizeUuid(
    payload?.registration_schedule_id,
    'registration_schedule_id'
  );

  const notes = String(payload?.operational_notes ?? '').trim();

  await validateRegistrationSchedule(scheduleId);

  const assigned = await isAssignedScheduleAssistant(scheduleId, creatorUserId);
  if (!assigned) {
    throw new Error('Only assistants registered for the schedule can open a session');
  }

  try {
    const result = await conductDb.query(
      `
        INSERT INTO practicum_operational_sessions (
          registration_schedule_id,
          session_status,
          approval_status,
          operational_notes,
          created_by,
          pic_user_id,
          pic_opened_at
        )
        VALUES ($1, 'scheduled', 'approved', $2, $3, $3, NOW())
        RETURNING *
      `,
      [scheduleId, notes || null, creatorUserId]
    );
    const session = result.rows[0];
    const { attendanceStatus } = await classifyOperationalSessionAttendanceStatus(session, {
      ruleType: OPERATIONAL_ATTENDANCE_LATE_RULE.ASSISTANT_ACTIVATION,
    });
    await activateSessionAssistant(session.id, creatorUserId, 'pic_open', attendanceStatus);
    return enrichOperationalSessionsWithPic(session);
  } catch (err) {
    if (err?.code === '23505') {
      throw new Error('An operational session already exists for this schedule');
    }
    throw err;
  }
}

export async function listOperationalSessions({
  assistantUserId,
  registrationScheduleId,
} = {}) {
  const args = [];
  let where = 'WHERE deleted_at IS NULL';

  if (assistantUserId) {
    args.push(String(assistantUserId).trim());
    where += `
      AND (
        created_by = $${args.length}
        OR pic_user_id = $${args.length}
        OR EXISTS (
          SELECT 1
          FROM practicum_operational_session_active_assistants aa
          WHERE aa.operational_session_id = practicum_operational_sessions.id
            AND aa.user_id = $${args.length}
        )
      )
    `;
  }

  if (registrationScheduleId) {
    args.push(String(registrationScheduleId).trim());
    where += ` AND registration_schedule_id = $${args.length}`;
  }

  const result = await conductDb.query(
    `
      SELECT *
      FROM practicum_operational_sessions
      ${where}
      ORDER BY created_at DESC
      LIMIT 200
    `,
    args
  );

  if (result.rowCount === 0) return [];

  const scheduleIds = result.rows.map((row) => row.registration_schedule_id);
  const validSchedules = await registrationDb.query(
    `SELECT id FROM schedules WHERE id = ANY($1::uuid[])`,
    [scheduleIds]
  );
  const validScheduleIds = new Set(validSchedules.rows.map((row) => String(row.id)));

  const rows = result.rows.filter((row) => validScheduleIds.has(String(row.registration_schedule_id)));
  return enrichOperationalSessionsWithPic(rows);
}

export async function getOperationalSessionById(id) {
  const result = await conductDb.query(
    'SELECT * FROM practicum_operational_sessions WHERE id = $1 AND deleted_at IS NULL',
    [id]
  );
  if (result.rowCount === 0) throw new Error('Operational session was not found');
  return enrichOperationalSessionsWithPic(result.rows[0]);
}

export async function updateOperationalSessionStatus({ id, requesterUserId, targetStatus }) {
  if (!requesterUserId) throw new Error('User is not authenticated');
  const normalizedStatus = String(targetStatus ?? '').trim().toLowerCase();
  const current = await getOperationalSessionById(id);

  assertLifecycleTransition(current, normalizedStatus);

  if (['ongoing', 'completed'].includes(normalizedStatus) && current.pic_user_id !== requesterUserId) {
    throw new Error('Only the session PIC can update the status');
  }

  const update = buildLifecycleUpdate(normalizedStatus);
  const params = [id, normalizedStatus, requesterUserId];

  const result = await conductDb.query(
    `
      UPDATE practicum_operational_sessions
      SET session_status = $2,
          ${update.timestampColumn} = NOW(),
          ${update.extraSet},
          status_changed_by = $3,
          status_changed_at = NOW(),
          updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *
    `,
    params
  );
  return result.rows[0];
}

export async function joinOperationalSessionViaQr({ id, requesterUserId, qrToken }) {
  if (!requesterUserId) throw new Error('User is not authenticated');
  const session = await getOperationalSessionById(id);
  if (!['scheduled', 'ongoing'].includes(session.session_status)) {
    throw new Error(
      'Assistant activation QR can only be scanned while the session is scheduled or ongoing'
    );
  }
  await validateActivationQrToken(id, qrToken);
  const assigned = await isAssignedScheduleAssistant(
    session.registration_schedule_id,
    requesterUserId
  );
  if (!assigned) {
    throw new Error('Only assistants registered for the Registration schedule can join');
  }
  const { attendanceStatus } = await classifyOperationalSessionAttendanceStatus(session, {
    ruleType: OPERATIONAL_ATTENDANCE_LATE_RULE.ASSISTANT_ACTIVATION,
  });
  await activateSessionAssistant(id, requesterUserId, 'qr_scan', attendanceStatus);
  return getOperationalSessionById(id);
}

export async function startOperationalSession({ id, requesterUserId }) {
  return updateOperationalSessionStatus({
    id,
    requesterUserId,
    targetStatus: 'ongoing',
  });
}

export async function completeOperationalSession({ id, requesterUserId }) {
  return updateOperationalSessionStatus({
    id,
    requesterUserId,
    targetStatus: 'completed',
  });
}

