import { jest } from '@jest/globals';

const mockConductDb = {
  query: jest.fn(),
};
const mockRegistrationDb = {
  query: jest.fn(),
};
const mockUserManagementDb = {
  query: jest.fn(),
};

jest.unstable_mockModule('../../../config/databases.js', () => ({
  conductDb: mockConductDb,
  registrationDb: mockRegistrationDb,
  userManagementDb: mockUserManagementDb,
}));

const { checkInOperationalSessionAttendance } = await import(
  '../services/practicumOperationalSessionAttendanceService.js'
);

describe('Practicum Operational Session Attendance Service (#140)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.useRealTimers();
    mockUserManagementDb.query.mockResolvedValue({ rowCount: 0, rows: [] });
    mockConductDb.query.mockImplementation(() => Promise.resolve({ rowCount: 0, rows: [] }));
  });

  function mockOngoingSessionAndQr() {
    mockConductDb.query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            registration_schedule_id: '33333333-3333-4333-8333-333333333333',
            session_status: 'ongoing',
          },
        ],
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: 'qr-session-1',
            operational_session_id: '11111111-1111-4111-8111-111111111111',
            qr_token: '22222222-2222-4222-8222-222222222222',
            generated_by: 'assistant-2',
            expired_at: new Date(Date.now() + 10_000),
            is_active: true,
          },
        ],
      });
  }

  function mockEnrollmentAndScheduleStart(scheduleRow = {
    tanggal: '2026-05-14',
    jam_mulai: '08:00:00',
    start_time: null,
  }) {
    mockRegistrationDb.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ '?column?': 1 }] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [scheduleRow],
      });
  }

  test('should create present attendance before late cutoff', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-14T08:10:00'));
    mockOngoingSessionAndQr();
    mockEnrollmentAndScheduleStart();
    mockConductDb.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        {
          id: 'attendance-1',
          operational_session_id: '11111111-1111-4111-8111-111111111111',
          user_id: 'm001',
          qr_session_id: 'qr-session-1',
          attendance_status: 'present',
        },
      ],
    });

    const result = await checkInOperationalSessionAttendance({
      operationalSessionId: '11111111-1111-4111-8111-111111111111',
      requesterUserId: 'm001',
      qrToken: '22222222-2222-4222-8222-222222222222',
    });

    expect(result.id).toBe('attendance-1');
    expect(result.already_checked_in).toBe(false);
    expect(mockConductDb.query.mock.calls[2][1][3]).toBe('assistant-2');
    expect(mockConductDb.query.mock.calls[2][1][4]).toBe('present');
  });

  test('should create present attendance exactly at late cutoff', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-14T08:15:00'));
    mockOngoingSessionAndQr();
    mockEnrollmentAndScheduleStart();
    mockConductDb.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ id: 'attendance-1', attendance_status: 'present' }],
    });

    await checkInOperationalSessionAttendance({
      operationalSessionId: '11111111-1111-4111-8111-111111111111',
      requesterUserId: 'm001',
      qrToken: '22222222-2222-4222-8222-222222222222',
    });

    expect(mockConductDb.query.mock.calls[2][1][4]).toBe('present');
  });

  test('should create late attendance after late cutoff', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-14T08:16:00'));
    mockOngoingSessionAndQr();
    mockEnrollmentAndScheduleStart();
    mockConductDb.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ id: 'attendance-1', attendance_status: 'late' }],
    });

    await checkInOperationalSessionAttendance({
      operationalSessionId: '11111111-1111-4111-8111-111111111111',
      requesterUserId: 'm001',
      qrToken: '22222222-2222-4222-8222-222222222222',
    });

    expect(mockConductDb.query.mock.calls[2][1][4]).toBe('late');
  });

  test('should return existing attendance on duplicate check-in without overwriting status', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-14T08:16:00'));
    mockOngoingSessionAndQr();
    mockEnrollmentAndScheduleStart();
    mockConductDb.query
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 'attendance-existing', user_id: 'm001', attendance_status: 'present' }],
      });

    const result = await checkInOperationalSessionAttendance({
      operationalSessionId: '11111111-1111-4111-8111-111111111111',
      requesterUserId: 'm001',
      qrToken: '22222222-2222-4222-8222-222222222222',
    });

    expect(result.id).toBe('attendance-existing');
    expect(result.attendance_status).toBe('present');
    expect(result.already_checked_in).toBe(true);
  });

  test('should reject check-in when session is not ongoing', async () => {
    mockConductDb.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ id: 'session-1', session_status: 'scheduled' }],
    });

    await expect(
      checkInOperationalSessionAttendance({
        operationalSessionId: '11111111-1111-4111-8111-111111111111',
        requesterUserId: 'm001',
        qrToken: '22222222-2222-4222-8222-222222222222',
      })
    ).rejects.toThrow('Check-in is only available while the session is ongoing');
  });

  test('should reject check-in when user is not enrolled in practicum', async () => {
    mockOngoingSessionAndQr();
    mockRegistrationDb.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    await expect(
      checkInOperationalSessionAttendance({
        operationalSessionId: '11111111-1111-4111-8111-111111111111',
        requesterUserId: 'm001',
        qrToken: '22222222-2222-4222-8222-222222222222',
      })
    ).rejects.toThrow('You are not enrolled in this practicum');
  });

  test('should reject check-in when schedule start cannot be computed', async () => {
    mockOngoingSessionAndQr();
    mockEnrollmentAndScheduleStart({ tanggal: null, jam_mulai: null, start_time: null });

    await expect(
      checkInOperationalSessionAttendance({
        operationalSessionId: '11111111-1111-4111-8111-111111111111',
        requesterUserId: 'm001',
        qrToken: '22222222-2222-4222-8222-222222222222',
      })
    ).rejects.toThrow('Practicum schedule start time is invalid');
  });
});
