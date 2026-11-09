import { jest } from '@jest/globals';

const mockConductDb = {
  query: jest.fn(),
  connect: jest.fn(),
};

const mockRegistrationDb = {
  query: jest.fn(),
};

const mockUserManagementDb = {
  query: jest.fn(),
};

const mockRoleService = {
  userHasRole: jest.fn(),
};

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

jest.unstable_mockModule('../../../config/databases.js', () => ({
  conductDb: mockConductDb,
  registrationDb: mockRegistrationDb,
  userManagementDb: mockUserManagementDb,
}));

jest.unstable_mockModule('../../../core/utils/logger.js', () => ({
  logger: mockLogger,
}));

jest.unstable_mockModule('../../user-management/services/roleService.js', () => mockRoleService);

jest.unstable_mockModule('../services/practicumOperationalSessionService.js', () => ({
  getOperationalSessionById: jest.fn(),
  listSessionActiveAssistants: jest.fn(),
  reassessAndPersistActiveAssistantAttendanceStatuses: jest.fn(),
}));

jest.unstable_mockModule('../services/practicumOperationalSessionAttendanceContextService.js', () => ({
  buildSessionStartContext: jest.fn(),
  enrichActiveAssistantWithAttendanceContext: jest.fn(),
  resolveScheduleStartAt: jest.fn(),
}));

jest.unstable_mockModule('../services/practicumOperationalSessionAttendanceService.js', () => ({
  listOperationalSessionAttendances: jest.fn(),
}));

jest.unstable_mockModule('../../user-management/services/fileStorageService.js', () => ({
  getAbsoluteFilePath: jest.fn(),
}));

const { reviewPermitRequest } = await import('../services/permitService.js');
const { signBapByLecturer } = await import('../services/practicumBapService.js');

const ORIGINAL_SCHEDULE_ID = '11111111-1111-4111-8111-111111111111';
const SESSION_ID = '44444444-4444-4444-8444-444444444444';
const QR_SESSION_ID = '66666666-6666-4666-8666-666666666666';
const BAP_ID = '55555555-5555-4555-8555-555555555555';

describe('Permit + attendance + BAP integration flow', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    process.env.NODE_ENV = 'test';
  });

  test('approve permit syncs izin attendance on original operational session', async () => {
    mockConductDb.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'permit-flow-1',
            user_id: 'student-1',
            academic_role: 'praktikan',
            reason: 'izin',
            absent_date: '2026-03-20',
            status: 'pending',
            original_registration_schedule_id: ORIGINAL_SCHEDULE_ID,
            shift_registration_schedule_id: '22222222-2222-4222-8222-222222222222',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'permit-flow-1', status: 'approved' }],
      })
      .mockResolvedValueOnce({ rows: [{ id: SESSION_ID }] })
      .mockResolvedValueOnce({ rows: [{ id: 'attendance-flow-1' }] });

    const result = await reviewPermitRequest({
      permitId: 'permit-flow-1',
      reviewerId: 'pic-1',
      payload: { action: 'approve', review_note: 'OK' },
    });

    expect(result.status).toBe('approved');
    expect(mockConductDb.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO practicum_operational_session_attendances'),
      [SESSION_ID, 'student-1', 'izin']
    );
  });

  test('signBapByLecturer rejects user without dosen role', async () => {
    mockConductDb.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: QR_SESSION_ID,
            operational_session_id: SESSION_ID,
            is_active: true,
            expired_at: new Date(Date.now() + 60_000).toISOString(),
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: BAP_ID,
            operational_session_id: SESSION_ID,
            registration_schedule_id: ORIGINAL_SCHEDULE_ID,
            lecturer_signed_at: null,
          },
        ],
      });
    mockRoleService.userHasRole.mockResolvedValue(false);

    await expect(
      signBapByLecturer({
        qrToken: 'qr-token-1',
        requesterUserId: 'random-user',
      })
    ).rejects.toThrow('Only assigned lecturers can sign this BAP');
  });

  test('signBapByLecturer rejects dosen without matching supervised laboratory in production', async () => {
    process.env.NODE_ENV = 'production';

    mockConductDb.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: QR_SESSION_ID,
            operational_session_id: SESSION_ID,
            is_active: true,
            expired_at: new Date(Date.now() + 60_000).toISOString(),
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: BAP_ID,
            operational_session_id: SESSION_ID,
            registration_schedule_id: ORIGINAL_SCHEDULE_ID,
            lecturer_signed_at: null,
          },
        ],
      });
    mockRoleService.userHasRole.mockImplementation(async (_userId, role) => role === 'dosen');
    mockRegistrationDb.query.mockResolvedValueOnce({
      rows: [{ laboratory_id: '33333333-3333-4333-8333-333333333333' }],
    });
    mockUserManagementDb.query.mockResolvedValueOnce({
      rows: [{ procurement_supervised_lab_id: '99999999-9999-4999-8999-999999999999' }],
    });

    await expect(
      signBapByLecturer({
        qrToken: 'qr-token-2',
        requesterUserId: 'dosen-1',
      })
    ).rejects.toThrow('You are not the supervising lecturer for this practicum laboratory');
  });
});
