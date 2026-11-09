import { registrationDb } from '../../../config/databases.js';

export const LATE_TOLERANCE_MINUTES = 15;
export const SCHEDULE_WALL_CLOCK_OFFSET = '+07:00';

function normalizeScheduleDatePart(value) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  return raw.slice(0, 10);
}

function normalizeScheduleTimePart(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  const hours = String(match[1]).padStart(2, '0');
  const minutes = match[2];
  const seconds = match[3] ?? '00';
  return `${hours}:${minutes}:${seconds}`;
}

export function parseScheduleDateTime(schedule) {
  if (schedule?.start_time) {
    const startTime = new Date(schedule.start_time);
    if (!Number.isNaN(startTime.getTime())) return startTime;
  }

  if (schedule?.tanggal && schedule?.jam_mulai) {
    const datePart = normalizeScheduleDatePart(schedule.tanggal);
    const timePart = normalizeScheduleTimePart(schedule.jam_mulai);
    if (!datePart || !timePart) return null;
    const startTime = new Date(`${datePart}T${timePart}${SCHEDULE_WALL_CLOCK_OFFSET}`);
    if (!Number.isNaN(startTime.getTime())) return startTime;
  }

  return null;
}

export function buildAttendanceCutoffContext(scheduledStartAt) {
  const scheduled = scheduledStartAt
    ? (scheduledStartAt instanceof Date ? scheduledStartAt : new Date(scheduledStartAt))
    : null;

  if (!scheduled || Number.isNaN(scheduled.getTime())) {
    return {
      attendance_cutoff_context_code: 'schedule_start_unavailable',
      attendance_cutoff_context_label: 'Registration schedule start time is unavailable',
      scheduled_start_at: null,
      assistant_present_until: null,
      student_present_until: null,
      session_start_on_time_until: null,
    };
  }

  const toleranceMs = LATE_TOLERANCE_MINUTES * 60 * 1000;
  return {
    attendance_cutoff_context_code: 'available',
    attendance_cutoff_context_label: 'Attendance cutoffs follow the Registration schedule (WIB)',
    scheduled_start_at: scheduled.toISOString(),
    assistant_present_until: new Date(scheduled.getTime() - toleranceMs).toISOString(),
    student_present_until: new Date(scheduled.getTime() + toleranceMs).toISOString(),
    session_start_on_time_until: scheduled.toISOString(),
  };
}

function toIsoOrNull(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function isSessionStartedOnTime(ongoingAt, scheduledStartAt) {
  if (!ongoingAt || !scheduledStartAt) return null;
  const ongoing = ongoingAt instanceof Date ? ongoingAt : new Date(ongoingAt);
  const scheduled = scheduledStartAt instanceof Date ? scheduledStartAt : new Date(scheduledStartAt);
  // Session is on time only when started at or before the scheduled time (no tolerance).
  // Example: schedule 12:00, start 12:01 means late.
  return ongoing.getTime() <= scheduled.getTime();
}

function isAssistantOnTime(attendanceStatus) {
  return String(attendanceStatus || '').trim().toLowerCase() === 'present';
}

function buildAssistantLabel({ assistantOnTime, sessionStartedOnTime, sessionPending }) {
  if (sessionPending) {
    return assistantOnTime
      ? 'Assistant arrived on time per schedule; practicum session has not started yet'
      : 'Assistant arrived late per schedule; practicum session has not started yet';
  }
  if (assistantOnTime && sessionStartedOnTime) {
    return 'Assistant arrived on time, practicum session started on time';
  }
  if (!assistantOnTime && sessionStartedOnTime) {
    return 'Assistant arrived late, practicum session started on time';
  }
  if (assistantOnTime && !sessionStartedOnTime) {
    return 'Assistant arrived on time, practicum session started late';
  }
  return 'Assistant arrived late, practicum session started late';
}

function buildAssistantCode({ assistantOnTime, sessionStartedOnTime, sessionPending }) {
  if (sessionPending) return 'assistant_status_session_pending';
  if (assistantOnTime && sessionStartedOnTime) return 'both_on_time';
  if (!assistantOnTime && sessionStartedOnTime) return 'assistant_late_session_on_time';
  if (assistantOnTime && !sessionStartedOnTime) return 'assistant_on_time_session_late';
  return 'both_late';
}

export function buildSessionStartContext({ ongoingAt, scheduledStartAt } = {}) {
  const scheduled = scheduledStartAt
    ? (scheduledStartAt instanceof Date ? scheduledStartAt : new Date(scheduledStartAt))
    : null;
  const ongoing = ongoingAt
    ? (ongoingAt instanceof Date ? ongoingAt : new Date(ongoingAt))
    : null;

  if (!scheduled || Number.isNaN(scheduled.getTime())) {
    return {
      session_start_context_code: 'schedule_start_unavailable',
      session_start_context_label: 'Registration schedule unavailable',
      session_started_on_time: null,
      scheduled_start_at: null,
      session_started_at: toIsoOrNull(ongoing),
    };
  }

  if (!ongoing || Number.isNaN(ongoing.getTime())) {
    return {
      session_start_context_code: 'session_not_started',
      session_start_context_label: 'Practicum session has not started yet',
      session_started_on_time: null,
      scheduled_start_at: scheduled.toISOString(),
      session_started_at: null,
    };
  }

  const sessionStartedOnTime = isSessionStartedOnTime(ongoing, scheduled);
  return {
    session_start_context_code: sessionStartedOnTime ? 'session_started_on_time' : 'session_started_late',
    session_start_context_label: sessionStartedOnTime
      ? 'Practicum session started on time'
      : 'Practicum session started late',
    session_started_on_time: sessionStartedOnTime,
    scheduled_start_at: scheduled.toISOString(),
    session_started_at: ongoing.toISOString(),
  };
}

export function buildAssistantAttendanceContext({
  attendanceStatus,
  activatedAt,
  ongoingAt,
  scheduledStartAt,
} = {}) {
  const scheduled = scheduledStartAt
    ? (scheduledStartAt instanceof Date ? scheduledStartAt : new Date(scheduledStartAt))
    : null;
  const ongoing = ongoingAt
    ? (ongoingAt instanceof Date ? ongoingAt : new Date(ongoingAt))
    : null;
  let assistantOnTime = isAssistantOnTime(attendanceStatus);
  const sessionPending = !ongoing || Number.isNaN(ongoing.getTime());
  const sessionStartedOnTime = sessionPending
    ? null
    : isSessionStartedOnTime(ongoing, scheduled);

  // Late session start means all assistants (PIC and others) are treated as late in remarks.
  if (!sessionPending && sessionStartedOnTime === false) {
    assistantOnTime = false;
  }

  const code = buildAssistantCode({
    assistantOnTime,
    sessionStartedOnTime,
    sessionPending,
  });

  return {
    attendance_context_code: code,
    attendance_context_label: buildAssistantLabel({
      assistantOnTime,
      sessionStartedOnTime,
      sessionPending,
    }),
    assistant_on_time: assistantOnTime,
    session_started_on_time: sessionStartedOnTime,
    scheduled_start_at: scheduled && !Number.isNaN(scheduled.getTime()) ? scheduled.toISOString() : null,
    session_started_at: toIsoOrNull(ongoing),
    assistant_activated_at: toIsoOrNull(activatedAt),
  };
}

export async function resolveScheduleStartAt(registrationScheduleId) {
  const result = await registrationDb.query(
    `SELECT tanggal, jam_mulai, start_time
     FROM schedules
     WHERE id = $1
     LIMIT 1`,
    [registrationScheduleId]
  );
  if (result.rowCount === 0) return null;
  return parseScheduleDateTime(result.rows[0]);
}

export function enrichActiveAssistantWithAttendanceContext(assistant, { ongoingAt, scheduledStartAt }) {
  const attendanceContext = buildAssistantAttendanceContext({
    attendanceStatus: assistant.attendance_status,
    activatedAt: assistant.activated_at,
    ongoingAt,
    scheduledStartAt,
  });
  return {
    ...assistant,
    attendance_context: attendanceContext,
  };
}

export async function enrichOperationalSessionDetailContext(session, activeAssistants = []) {
  const scheduledStartAt = await resolveScheduleStartAt(session.registration_schedule_id);
  const sessionStartContext = buildSessionStartContext({
    ongoingAt: session.ongoing_at,
    scheduledStartAt,
  });
  const enrichedAssistants = activeAssistants.map((assistant) =>
    enrichActiveAssistantWithAttendanceContext(assistant, {
      ongoingAt: session.ongoing_at,
      scheduledStartAt,
    })
  );
  return {
    session_start_context: sessionStartContext,
    attendance_cutoff_context: buildAttendanceCutoffContext(scheduledStartAt),
    active_assistants: enrichedAssistants,
    scheduled_start_at: scheduledStartAt ? scheduledStartAt.toISOString() : null,
  };
}
