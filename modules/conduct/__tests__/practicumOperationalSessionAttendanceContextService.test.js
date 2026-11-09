import { jest } from '@jest/globals';
import {
  buildAssistantAttendanceContext,
  buildAttendanceCutoffContext,
  buildSessionStartContext,
  parseScheduleDateTime,
} from '../services/practicumOperationalSessionAttendanceContextService.js';

describe('Practicum Operational Session Attendance Context Service (#200)', () => {
  const scheduledStart = new Date('2026-06-04T12:00:00+07:00');

  test('both_on_time when assistant present and session started exactly on schedule', () => {
    const result = buildAssistantAttendanceContext({
      attendanceStatus: 'present',
      activatedAt: new Date('2026-06-04T11:50:00+07:00'),
      ongoingAt: new Date('2026-06-04T12:00:00+07:00'),
      scheduledStartAt: scheduledStart,
    });

    expect(result.attendance_context_code).toBe('both_on_time');
    expect(result.assistant_on_time).toBe(true);
    expect(result.session_started_on_time).toBe(true);
  });

  test('assistant_late_session_on_time when assistant late but session on time', () => {
    const result = buildAssistantAttendanceContext({
      attendanceStatus: 'late',
      activatedAt: new Date('2026-06-04T12:05:00+07:00'),
      ongoingAt: new Date('2026-06-04T12:00:00+07:00'),
      scheduledStartAt: scheduledStart,
    });

    expect(result.attendance_context_code).toBe('assistant_late_session_on_time');
    expect(result.attendance_context_label).toContain('Assistant arrived late');
    expect(result.attendance_context_label).toContain('practicum session started on time');
  });

  test('both_late when session starts after schedule even if assistant scanned present', () => {
    const result = buildAssistantAttendanceContext({
      attendanceStatus: 'present',
      activatedAt: new Date('2026-06-04T11:50:00+07:00'),
      ongoingAt: new Date('2026-06-04T12:01:00+07:00'),
      scheduledStartAt: scheduledStart,
    });

    expect(result.attendance_context_code).toBe('both_late');
    expect(result.assistant_on_time).toBe(false);
    expect(result.session_started_on_time).toBe(false);
    expect(result.attendance_context_label).toContain('Assistant arrived late');
    expect(result.attendance_context_label).toContain('practicum session started late');
  });

  test('both_late when assistant and session are both late', () => {
    const result = buildAssistantAttendanceContext({
      attendanceStatus: 'late',
      activatedAt: new Date('2026-06-04T12:05:00+07:00'),
      ongoingAt: new Date('2026-06-04T12:01:00+07:00'),
      scheduledStartAt: scheduledStart,
    });

    expect(result.attendance_context_code).toBe('both_late');
  });

  test('assistant_status_session_pending when session has not started', () => {
    const result = buildAssistantAttendanceContext({
      attendanceStatus: 'present',
      activatedAt: new Date('2026-06-04T11:50:00+07:00'),
      ongoingAt: null,
      scheduledStartAt: scheduledStart,
    });

    expect(result.attendance_context_code).toBe('assistant_status_session_pending');
    expect(result.session_started_on_time).toBeNull();
    expect(result.attendance_context_label).toContain('has not started yet');
  });

  test('session started exactly at scheduled time is on time', () => {
    const sessionContext = buildSessionStartContext({
      ongoingAt: new Date('2026-06-04T12:00:00+07:00'),
      scheduledStartAt: scheduledStart,
    });

    expect(sessionContext.session_start_context_code).toBe('session_started_on_time');
    expect(sessionContext.session_started_on_time).toBe(true);
  });

  test('session started one minute after schedule is late', () => {
    const sessionContext = buildSessionStartContext({
      ongoingAt: new Date('2026-06-04T12:01:00+07:00'),
      scheduledStartAt: scheduledStart,
    });

    expect(sessionContext.session_start_context_code).toBe('session_started_late');
    expect(sessionContext.session_started_on_time).toBe(false);
  });

  test('parseScheduleDateTime treats tanggal+jam_mulai as WIB wall clock', () => {
    const parsed = parseScheduleDateTime({
      tanggal: '2026-06-02',
      jam_mulai: '08:00:00',
    });

    expect(parsed?.toISOString()).toBe(new Date('2026-06-02T08:00:00+07:00').toISOString());
  });

  test('buildAttendanceCutoffContext exposes assistant and student cutoffs', () => {
    const result = buildAttendanceCutoffContext(new Date('2026-06-04T12:00:00+07:00'));

    expect(result.attendance_cutoff_context_code).toBe('available');
    expect(result.assistant_present_until).toBe(new Date('2026-06-04T11:45:00+07:00').toISOString());
    expect(result.student_present_until).toBe(new Date('2026-06-04T12:15:00+07:00').toISOString());
    expect(result.session_start_on_time_until).toBe(new Date('2026-06-04T12:00:00+07:00').toISOString());
  });
});
