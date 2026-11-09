import { jest } from '@jest/globals';

const client = {
  query: jest.fn(),
  release: jest.fn(),
};

const mockConductDb = {
  query: jest.fn(),
  connect: jest.fn(() => client),
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

jest.unstable_mockModule('../../../core/utils/logger.js', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

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

const { getOperationalSessionById, listSessionActiveAssistants, reassessAndPersistActiveAssistantAttendanceStatuses } =
  await import('../services/practicumOperationalSessionService.js');
const { buildSessionStartContext, enrichActiveAssistantWithAttendanceContext, resolveScheduleStartAt } =
  await import('../services/practicumOperationalSessionAttendanceContextService.js');
const { listOperationalSessionAttendances } =
  await import('../services/practicumOperationalSessionAttendanceService.js');
const { generateBapForCompletedSession } = await import('../services/practicumBapService.js');

const SESSION_ID = '44444444-4444-4444-8444-444444444444';
const SCHEDULE_ID = '11111111-1111-4111-8111-111111111111';

describe('practicumBapService attendance reconciliation', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockConductDb.connect.mockReturnValue(client);
    buildSessionStartContext.mockReturnValue({ label: 'On time', session_started_on_time: true });
    enrichActiveAssistantWithAttendanceContext.mockImplementation((assistant) => assistant);
    resolveScheduleStartAt.mockResolvedValue(new Date('2026-06-01T01:00:00.000Z'));

    getOperationalSessionById.mockResolvedValue({
      id: SESSION_ID,
      registration_schedule_id: SCHEDULE_ID,
      session_status: 'completed',
      completed_at: new Date('2026-06-01T03:00:00.000Z'),
      ongoing_at: new Date('2026-06-01T01:00:00.000Z'),
      pic_user_id: 'pic-1',
    });

    const activeAssistantRows = [
      { user_id: 'asst-1', user_identifier: '2022002', user_name: 'Asisten 1', activation_method: 'pic_open' },
      { user_id: 'asst-2', user_identifier: '2023003', user_name: 'Asisten 2', activation_method: 'qr_join' },
    ];
    listSessionActiveAssistants.mockResolvedValue(activeAssistantRows);
    reassessAndPersistActiveAssistantAttendanceStatuses.mockResolvedValue(activeAssistantRows);
    listOperationalSessionAttendances.mockResolvedValue([
      {
        user_id: 'student-1',
        user_identifier: '2024001',
        user_name: 'Mahasiswa 1',
        attendance_status: 'present',
        assigned_assistant_user_id: 'asst-1',
      },
      {
        user_id: 'student-2',
        user_identifier: '2024002',
        user_name: 'Mahasiswa 2',
        attendance_status: 'present',
        assigned_assistant_user_id: 'asst-1',
      },
      {
        user_id: 'student-3',
        user_identifier: '2024003',
        user_name: 'Mahasiswa 3',
        attendance_status: 'present',
        assigned_assistant_user_id: 'asst-2',
      },
    ]);

    mockUserManagementDb.query.mockImplementation(async (sql) => {
      const text = String(sql);
      if (text.includes('FROM user_roles')) return { rows: [] };
      if (text.includes('FROM user_profiles')) return { rows: [] };
      return { rows: [] };
    });
  });

  test('does not mark enrolled-but-not-checked-in students as absent in draft BAP', async () => {
    client.query.mockImplementation(async (sql) => {
      const text = String(sql);
      if (text === 'BEGIN' || text === 'COMMIT' || text.includes('DELETE FROM practicum_bap_attendance_rows')) {
        return {};
      }
      if (text.includes('INSERT INTO practicum_baps')) {
        return {
          rows: [{
            id: 'bap-1',
            operational_session_id: SESSION_ID,
            present_count: 3,
            sick_count: 0,
            permission_count: 0,
            absent_count: 0,
            student_count: 3,
            assistant_count: 2,
            metadata: {},
          }],
        };
      }
      if (text.includes('INSERT INTO practicum_bap_attendance_rows')) {
        return {};
      }
      return {};
    });

    mockConductDb.query.mockImplementation(async (sql) => {
      const text = String(sql);
      if (text.includes('FROM practicum_baps') && text.includes('lecturer_signed_at')) {
        return { rows: [{ lecturer_signed_at: null }] };
      }
      if (text.includes('FROM practicum_baps')) {
        return {
          rows: [{
            id: 'bap-1',
            operational_session_id: SESSION_ID,
            present_count: 3,
            sick_count: 0,
            permission_count: 0,
            absent_count: 0,
            student_count: 3,
            assistant_count: 2,
            metadata: {},
          }],
        };
      }
      if (text.includes('FROM practicum_bap_attendance_rows')) {
        return { rows: [] };
      }
      if (text.includes('FROM permit_requests')) return { rows: [] };
      return { rows: [] };
    });

    mockRegistrationDb.query.mockImplementation(async (sql) => {
      const text = String(sql);
      if (text.includes('FROM schedules s') && text.includes('practicum_modules')) {
        return {
          rows: [{
            id: SCHEDULE_ID,
            practicum_name: 'Datmin',
            module_name: 'Modul 1',
            detail_kegiatan: 'Shift 1',
            tanggal: '2026-06-01',
            jam_mulai: '08:00:00',
            jam_berakhir: '10:00:00',
            venue: 'Lab',
          }],
        };
      }
      if (text.includes('registration_settings')) {
        return { rows: [{ value: { id: '2526-2', label: '2526-2' } }] };
      }
      if (text.includes('FROM schedule_assistants')) {
        return {
          rows: [
            { user_id: 'asst-1', nim: '2022002' },
            { user_id: 'asst-2', nim: '2023003' },
          ],
        };
      }
      if (text.includes('practicum_enrollments')) {
        return {
          rows: [
            { user_id: 'student-1', student_number: '2024001', student_name: 'Mahasiswa 1' },
            { user_id: 'student-2', student_number: '2024002', student_name: 'Mahasiswa 2' },
            { user_id: 'student-3', student_number: '2024003', student_name: 'Mahasiswa 3' },
            { user_id: 'student-4', student_number: '2024004', student_name: 'Mahasiswa 4' },
            { user_id: 'student-5', student_number: '2024005', student_name: 'Mahasiswa 5' },
          ],
        };
      }
      return { rows: [] };
    });

    const result = await generateBapForCompletedSession(SESSION_ID);

    expect(result.present_count).toBe(3);
    expect(result.absent_count).toBe(0);
    expect(result.student_count).toBe(3);
    expect(result.assistant_count).toBe(2);

    const insertBapCall = client.query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO practicum_baps'));
    expect(insertBapCall?.[1]?.[9]).toBe(3);
    expect(insertBapCall?.[1]?.[12]).toBe(0);
  });

  test('reconciles enrollment and scan attendance by NIM when user_id differs', async () => {
    const enrollmentUserId = '55ee59d8-031c-4947-971d-acf396001266';
    const scanUserId = '7ed35e7c-aaaa-bbbb-cccc-ddddeeeeffff';

    listOperationalSessionAttendances.mockResolvedValue([
      {
        user_id: scanUserId,
        user_identifier: '2024004',
        user_name: 'ANDI WIJAYA',
        attendance_status: 'present',
        assigned_assistant_user_id: 'asst-1',
      },
      {
        user_id: 'student-2',
        user_identifier: '2024005',
        user_name: 'RINA KUSUMA',
        attendance_status: 'present',
        assigned_assistant_user_id: 'asst-1',
      },
      {
        user_id: 'student-3',
        user_identifier: '2521005',
        user_name: 'EKA NUGROHO',
        attendance_status: 'present',
        assigned_assistant_user_id: 'asst-2',
      },
    ]);

    const attendanceRowInserts = [];
    client.query.mockImplementation(async (sql, params) => {
      const text = String(sql);
      if (text === 'BEGIN' || text === 'COMMIT' || text.includes('DELETE FROM practicum_bap_attendance_rows')) {
        return {};
      }
      if (text.includes('INSERT INTO practicum_baps')) {
        return {
          rows: [{
            id: 'bap-1',
            operational_session_id: SESSION_ID,
            present_count: 3,
            sick_count: 0,
            permission_count: 0,
            absent_count: 0,
            student_count: 3,
            assistant_count: 2,
            metadata: {},
          }],
        };
      }
      if (text.includes('INSERT INTO practicum_bap_attendance_rows')) {
        attendanceRowInserts.push(params);
        return {};
      }
      return {};
    });

    mockConductDb.query.mockImplementation(async (sql) => {
      const text = String(sql);
      if (text.includes('FROM practicum_baps') && text.includes('lecturer_signed_at')) {
        return { rows: [{ lecturer_signed_at: null }] };
      }
      if (text.includes('FROM practicum_baps')) {
        return {
          rows: [{
            id: 'bap-1',
            operational_session_id: SESSION_ID,
            present_count: 3,
            sick_count: 0,
            permission_count: 0,
            absent_count: 0,
            student_count: 3,
            assistant_count: 2,
            metadata: {},
          }],
        };
      }
      if (text.includes('FROM practicum_bap_attendance_rows')) {
        return { rows: [] };
      }
      if (text.includes('FROM permit_requests')) return { rows: [] };
      return { rows: [] };
    });

    mockRegistrationDb.query.mockImplementation(async (sql) => {
      const text = String(sql);
      if (text.includes('FROM schedules s') && text.includes('practicum_modules')) {
        return {
          rows: [{
            id: SCHEDULE_ID,
            practicum_name: 'Datmin',
            module_name: 'Modul 1',
            detail_kegiatan: 'Shift 1',
            tanggal: '2026-06-01',
            jam_mulai: '08:00:00',
            jam_berakhir: '10:00:00',
            venue: 'Lab',
          }],
        };
      }
      if (text.includes('registration_settings')) {
        return { rows: [{ value: { id: '2526-2', label: '2526-2' } }] };
      }
      if (text.includes('FROM schedule_assistants')) {
        return {
          rows: [
            { user_id: 'asst-1', nim: '2022002' },
            { user_id: 'asst-2', nim: '2023003' },
          ],
        };
      }
      if (text.includes('practicum_enrollments')) {
        return {
          rows: [
            { user_id: enrollmentUserId, student_number: '2024004', student_name: 'ANDI WIJAYA' },
            { user_id: 'student-2', student_number: '2024005', student_name: 'RINA KUSUMA' },
            { user_id: 'student-3', student_number: '2521005', student_name: 'EKA NUGROHO' },
          ],
        };
      }
      return { rows: [] };
    });

    const result = await generateBapForCompletedSession(SESSION_ID);

    expect(result.present_count).toBe(3);
    expect(result.absent_count).toBe(0);
    expect(result.student_count).toBe(3);
    expect(attendanceRowInserts).toHaveLength(3);

    const andiRow = attendanceRowInserts.find((params) => params?.[3] === '2024004');
    expect(andiRow?.[2]).toBe(scanUserId);
    expect(andiRow?.[6]).toBe('present');
  });
});
