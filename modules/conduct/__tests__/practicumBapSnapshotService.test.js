import { jest } from '@jest/globals';

const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

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

jest.unstable_mockModule('../../../config/databases.js', () => ({
  conductDb: mockConductDb,
  registrationDb: mockRegistrationDb,
  userManagementDb: mockUserManagementDb,
}));

jest.unstable_mockModule('exceljs', () => ({
  default: class Workbook {},
}));

jest.unstable_mockModule('qrcode', () => ({
  default: {
    toDataURL: jest.fn(async () => 'data:image/png;base64,qr'),
  },
}));

const { generateBapForCompletedSession } = await import('../services/practicumBapService.js');

const sessionId = '11111111-1111-4111-8111-111111111111';
const scheduleId = '22222222-2222-4222-8222-222222222222';
const bapId = '33333333-3333-4333-8333-333333333333';

function completedSession() {
  return {
    id: sessionId,
    session_status: 'completed',
    registration_schedule_id: scheduleId,
    pic_user_id: 'pic-1',
    completed_at: new Date('2026-05-22T03:00:00.000Z'),
  };
}

function scheduleContext() {
  return {
    id: scheduleId,
    tanggal: '2026-03-02',
    jam_mulai: '07:30:00',
    jam_berakhir: '10:30:00',
    detail_kegiatan: 'Shift 1',
    kelas: 'reguler',
    venue: 'Integra R2',
    start_time: null,
    end_time: null,
    study_program_id: 'sp-si',
    study_program_code: 'SI',
    study_program_name: 'S1 Sistem Informasi',
    laboratory_id: 'lab-db',
    laboratory_code: 'LD',
    laboratory_name: 'Lab Database',
    practicum_id: 'pbd',
    practicum_code: 'PBD',
    practicum_name: 'Praktikum Basis Data',
    module_id: 'mod-1',
    module_code: 'M1',
    module_name: 'Modul 1',
  };
}

function bapRow(metadata) {
  return {
    id: bapId,
    operational_session_id: sessionId,
    registration_schedule_id: scheduleId,
    bap_number: null,
    status: 'draft_generated',
    practicum_name: 'Praktikum Basis Data',
    module_name: 'Modul 1',
    class_shift: 'Shift 1',
    activity_type: 'Hands-On',
    scheduled_date: '2026-03-02',
    start_time: '07:30:00',
    end_time: '10:30:00',
    venue: 'Integra R2',
    present_count: 0,
    sick_count: 0,
    permission_count: 0,
    absent_count: 0,
    student_count: 0,
    assistant_count: 0,
    incident_notes: null,
    lecturer_signed_at: null,
    lecturer_signed_by: null,
    laboran_review_status: 'pending',
    laboran_reviewed_at: null,
    laboran_reviewed_by: null,
    laboran_review_note: null,
    metadata,
    generated_at: new Date('2026-05-22T03:00:00.000Z'),
  };
}

describe('Practicum BAP registration snapshot', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockConductDb.connect.mockResolvedValue(mockClient);
    mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 });
    mockConductDb.query.mockResolvedValue({ rows: [], rowCount: 0 });
    mockUserManagementDb.query.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  test('stores active periode and registration hierarchy snapshot when BAP is generated', async () => {
    const metadata = {
      active_assistants: [],
      pic_user_id: 'pic-1',
      registration_snapshot: {
        active_periode: { id: '2526-2', label: '2526-2' },
        study_program: { id: 'sp-si', code: 'SI', name: 'S1 Sistem Informasi' },
        laboratory: { id: 'lab-db', code: 'LD', name: 'Lab Database' },
        practicum: { id: 'pbd', code: 'PBD', name: 'Praktikum Basis Data' },
        module: { id: 'mod-1', code: 'M1', name: 'Modul 1' },
        schedule: {
          id: scheduleId,
          date: '2026-03-02',
          start_time: '07:30:00',
          end_time: '10:30:00',
          class_shift: 'Shift 1',
          venue: 'Integra R2',
        },
      },
      active_periode: { id: '2526-2', label: '2526-2' },
      study_program: { id: 'sp-si', code: 'SI', name: 'S1 Sistem Informasi' },
      laboratory: { id: 'lab-db', code: 'LD', name: 'Lab Database' },
      practicum: { id: 'pbd', code: 'PBD', name: 'Praktikum Basis Data' },
      schedule: {
        id: scheduleId,
        date: '2026-03-02',
        start_time: '07:30:00',
        end_time: '10:30:00',
        class_shift: 'Shift 1',
        venue: 'Integra R2',
      },
      source: 'auto_generated_from_completed_session',
    };

    mockConductDb.query.mockImplementation((sql) => {
      const text = String(sql);
      if (text.includes('FROM practicum_operational_sessions')) {
        return Promise.resolve({ rowCount: 1, rows: [completedSession()] });
      }
      if (text.includes('FROM practicum_baps')) {
        return Promise.resolve({ rowCount: 1, rows: [bapRow(metadata)] });
      }
      return Promise.resolve({ rowCount: 0, rows: [] });
    });
    mockRegistrationDb.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [scheduleContext()] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ value: { id: '2526-2', label: '2526-2' } }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    mockClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [bapRow(metadata)] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const result = await generateBapForCompletedSession(sessionId);

    expect(mockClient.query.mock.calls[1][1][15]).toContain('"active_periode":{"id":"2526-2","label":"2526-2"}');
    expect(result.metadata.registration_snapshot.active_periode.id).toBe('2526-2');
    expect(result.metadata.registration_snapshot.study_program.code).toBe('SI');
    expect(result.metadata.registration_snapshot.laboratory.code).toBe('LD');
    expect(result.metadata.registration_snapshot.practicum.code).toBe('PBD');
  });

  test('falls back to base64 TTD when stored file path is not available', async () => {
    const metadata = {
      active_assistants: [],
      pic_user_id: 'pic-1',
      registration_snapshot: {},
    };
    const attendanceRow = {
      id: '44444444-4444-4444-8444-444444444444',
      row_number: 1,
      user_id: 'student-auth-1',
      user_identifier: '2024004',
      user_name: 'ANDI WIJAYA',
      student_user_id: 'student-auth-1',
      student_identifier: '2024004',
      student_name: 'ANDI WIJAYA',
      assistant_code: 'Plot A',
      attendance_status: 'late',
      attendance_time: new Date('2026-03-02T01:00:00.000Z'),
      student_signature_status: 'qr_attended',
      assistant_signature_status: 'qr_validated',
      assigned_assistant_user_id: 'assistant-auth-1',
      assigned_assistant_name: 'ASISTEN SATU',
      assigned_assistant_identifier: 'A001',
    };

    mockConductDb.query.mockImplementation((sql) => {
      const text = String(sql);
      if (text.includes('FROM practicum_operational_sessions')) {
        return Promise.resolve({ rowCount: 1, rows: [completedSession()] });
      }
      if (text.includes('FROM practicum_operational_session_active_assistants')) {
        return Promise.resolve({ rows: [] });
      }
      if (text.includes('FROM practicum_operational_session_attendances')) {
        return Promise.resolve({ rows: [attendanceRow] });
      }
      if (text.includes('FROM permit_requests')) {
        return Promise.resolve({ rows: [] });
      }
      if (text.includes('FROM practicum_baps')) {
        return Promise.resolve({ rowCount: 1, rows: [bapRow(metadata)] });
      }
      return Promise.resolve({ rowCount: 0, rows: [] });
    });
    mockRegistrationDb.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [scheduleContext()] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ value: null }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    mockUserManagementDb.query.mockImplementation((sql) => {
      const text = String(sql);
      if (text.includes('FROM user_roles')) return Promise.resolve({ rows: [] });
      if (text.includes('ttd_file_path')) {
        return Promise.resolve({
          rows: [
            {
              user_id: 'student-auth-1',
              name: 'ANDI WIJAYA',
              nipnim: '2024004',
              ttd: 'c3R1ZGVudC10dGQ=',
              ttd_file_path: '/uploads/ttd/student-auth-1.png',
            },
          ],
        });
      }
      return Promise.resolve({ rows: [] });
    });
    mockClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [bapRow(metadata)] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    await generateBapForCompletedSession(sessionId);

    const attendanceInsert = mockClient.query.mock.calls.find((call) =>
      String(call[0]).includes('INSERT INTO practicum_bap_attendance_rows') &&
      Array.isArray(call[1])
    );
    expect(attendanceInsert?.[1]?.[11]).toBe('data:image/png;base64,c3R1ZGVudC10dGQ=');
  });
});
