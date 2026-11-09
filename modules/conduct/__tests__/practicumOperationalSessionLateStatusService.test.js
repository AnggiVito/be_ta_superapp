import { jest } from '@jest/globals';

const mockRegistrationDb = {
  query: jest.fn(),
};

jest.unstable_mockModule('../../../config/databases.js', () => ({
  registrationDb: mockRegistrationDb,
}));

const {
  OPERATIONAL_ATTENDANCE_LATE_RULE,
  classifyOperationalSessionAttendanceStatus,
} = await import('../services/practicumOperationalSessionLateStatusService.js');

describe('Practicum Operational Session Late Status Service (#201/#204)', () => {
  const session = {
    registration_schedule_id: '11111111-1111-4111-8111-111111111111',
  };

  beforeEach(() => {
    jest.resetAllMocks();
    mockRegistrationDb.query.mockResolvedValue({
      rowCount: 1,
      rows: [{ start_time: new Date('2026-06-04T12:00:00+07:00') }],
    });
  });

  test('assistant activation exactly at start minus 15 minutes is present', async () => {
    const result = await classifyOperationalSessionAttendanceStatus(session, {
      ruleType: OPERATIONAL_ATTENDANCE_LATE_RULE.ASSISTANT_ACTIVATION,
      scanTime: new Date('2026-06-04T11:45:00+07:00'),
    });

    expect(result.attendanceStatus).toBe('present');
    expect(result.lateCutoffAt.toISOString()).toBe(new Date('2026-06-04T11:45:00+07:00').toISOString());
  });

  test('assistant activation one minute after start minus 15 minutes is late', async () => {
    const result = await classifyOperationalSessionAttendanceStatus(session, {
      ruleType: OPERATIONAL_ATTENDANCE_LATE_RULE.ASSISTANT_ACTIVATION,
      scanTime: new Date('2026-06-04T11:46:00+07:00'),
    });

    expect(result.attendanceStatus).toBe('late');
  });

  test('assistant activation after scheduled start remains late', async () => {
    const result = await classifyOperationalSessionAttendanceStatus(session, {
      ruleType: OPERATIONAL_ATTENDANCE_LATE_RULE.ASSISTANT_ACTIVATION,
      scanTime: new Date('2026-06-04T12:05:00+07:00'),
    });

    expect(result.attendanceStatus).toBe('late');
    expect(result.lateCutoffAt.toISOString()).toBe(new Date('2026-06-04T11:45:00+07:00').toISOString());
  });

  test('assistant activation ignores operational session timestamps and uses Registration schedule', async () => {
    const result = await classifyOperationalSessionAttendanceStatus(
      {
        ...session,
        created_at: new Date('2026-06-04T10:00:00+07:00'),
        pic_opened_at: new Date('2026-06-04T10:30:00+07:00'),
        ongoing_at: new Date('2026-06-04T13:00:00+07:00'),
      },
      {
        ruleType: OPERATIONAL_ATTENDANCE_LATE_RULE.ASSISTANT_ACTIVATION,
        scanTime: new Date('2026-06-04T11:45:00+07:00'),
      }
    );

    expect(result.attendanceStatus).toBe('present');
    expect(result.shiftStartAt.toISOString()).toBe(new Date('2026-06-04T12:00:00+07:00').toISOString());
    expect(result.lateCutoffAt.toISOString()).toBe(new Date('2026-06-04T11:45:00+07:00').toISOString());
  });

  test('student check-in exactly at start plus 15 minutes is present', async () => {
    const result = await classifyOperationalSessionAttendanceStatus(session, {
      ruleType: OPERATIONAL_ATTENDANCE_LATE_RULE.STUDENT_CHECK_IN,
      scanTime: new Date('2026-06-04T12:15:00+07:00'),
    });

    expect(result.attendanceStatus).toBe('present');
    expect(result.lateCutoffAt.toISOString()).toBe(new Date('2026-06-04T12:15:00+07:00').toISOString());
  });

  test('student check-in one minute after start plus 15 minutes is late', async () => {
    const result = await classifyOperationalSessionAttendanceStatus(session, {
      ruleType: OPERATIONAL_ATTENDANCE_LATE_RULE.STUDENT_CHECK_IN,
      scanTime: new Date('2026-06-04T12:16:00+07:00'),
    });

    expect(result.attendanceStatus).toBe('late');
  });

  test('student check-in ignores operational session timestamps and uses Registration schedule', async () => {
    const result = await classifyOperationalSessionAttendanceStatus(
      {
        ...session,
        created_at: new Date('2026-06-04T10:00:00+07:00'),
        pic_opened_at: new Date('2026-06-04T10:30:00+07:00'),
        ongoing_at: new Date('2026-06-04T13:00:00+07:00'),
      },
      {
        ruleType: OPERATIONAL_ATTENDANCE_LATE_RULE.STUDENT_CHECK_IN,
        scanTime: new Date('2026-06-04T12:15:00+07:00'),
      }
    );

    expect(result.attendanceStatus).toBe('present');
    expect(result.shiftStartAt.toISOString()).toBe(new Date('2026-06-04T12:00:00+07:00').toISOString());
    expect(result.lateCutoffAt.toISOString()).toBe(new Date('2026-06-04T12:15:00+07:00').toISOString());
  });

  test('missing Registration schedule is rejected instead of using operational timestamps', async () => {
    mockRegistrationDb.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    await expect(
      classifyOperationalSessionAttendanceStatus(
        {
          ...session,
          ongoing_at: new Date('2026-06-04T12:00:00+07:00'),
        },
        {
          ruleType: OPERATIONAL_ATTENDANCE_LATE_RULE.STUDENT_CHECK_IN,
          scanTime: new Date('2026-06-04T12:10:00+07:00'),
        }
      )
    ).rejects.toThrow('Registration schedule was not found');
  });

  test('invalid Registration schedule time is rejected instead of using operational timestamps', async () => {
    mockRegistrationDb.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ start_time: 'invalid-date', tanggal: null, jam_mulai: null }],
    });

    await expect(
      classifyOperationalSessionAttendanceStatus(
        {
          ...session,
          ongoing_at: new Date('2026-06-04T12:00:00+07:00'),
        },
        {
          ruleType: OPERATIONAL_ATTENDANCE_LATE_RULE.STUDENT_CHECK_IN,
          scanTime: new Date('2026-06-04T12:10:00+07:00'),
        }
      )
    ).rejects.toThrow('Practicum schedule start time is invalid');
  });
});
