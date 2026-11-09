import { registrationDb } from '../../../config/databases.js';
import {
  LATE_TOLERANCE_MINUTES,
  parseScheduleDateTime,
} from './practicumOperationalSessionAttendanceContextService.js';

export const OPERATIONAL_ATTENDANCE_LATE_RULE = Object.freeze({
  ASSISTANT_ACTIVATION: 'assistant_activation',
  STUDENT_CHECK_IN: 'student_check_in',
});

export async function classifyOperationalSessionAttendanceStatus(
  session,
  { scanTime = new Date(), ruleType = OPERATIONAL_ATTENDANCE_LATE_RULE.STUDENT_CHECK_IN } = {}
) {
  if (!Object.values(OPERATIONAL_ATTENDANCE_LATE_RULE).includes(ruleType)) {
    throw new Error('Invalid operational attendance late rule type');
  }

  const result = await registrationDb.query(
    `SELECT tanggal, jam_mulai, start_time
     FROM schedules
     WHERE id = $1
     LIMIT 1`,
    [session.registration_schedule_id]
  );

  if (result.rowCount === 0) {
    throw new Error('Registration schedule was not found');
  }

  const shiftStartAt = parseScheduleDateTime(result.rows[0]);
  if (!shiftStartAt) {
    throw new Error('Practicum schedule start time is invalid');
  }

  const multiplier = ruleType === OPERATIONAL_ATTENDANCE_LATE_RULE.ASSISTANT_ACTIVATION ? -1 : 1;
  const lateCutoffAt = new Date(
    shiftStartAt.getTime() + multiplier * LATE_TOLERANCE_MINUTES * 60 * 1000
  );
  const attendanceStatus = scanTime.getTime() <= lateCutoffAt.getTime() ? 'present' : 'late';

  return {
    attendanceStatus,
    shiftStartAt,
    lateCutoffAt,
  };
}
