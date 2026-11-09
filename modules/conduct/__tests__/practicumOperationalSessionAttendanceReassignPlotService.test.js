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

jest.unstable_mockModule('../../../config/databases.js', () => ({
  conductDb: mockConductDb,
  registrationDb: mockRegistrationDb,
  userManagementDb: mockUserManagementDb,
}));

const { reassignOperationalSessionAttendancePlot, bulkReassignOperationalSessionAttendancePlot } = await import('../services/practicumOperationalSessionAttendanceService.js');

const sessionId = '11111111-1111-4111-8111-111111111111';
const attendanceId = '22222222-2222-4222-8222-222222222222';
const scheduleId = '33333333-3333-4333-8333-333333333333';
const picUserId = 'pic-1';
const assistantA = 'assistant-a';
const assistantB = 'assistant-b';
const studentUserId = 'student-1';

function sessionRow(overrides = {}) {
  return {
    id: sessionId,
    registration_schedule_id: scheduleId,
    session_status: 'ongoing',
    pic_user_id: picUserId,
    ...overrides,
  };
}

function attendanceRow(overrides = {}) {
  return {
    id: attendanceId,
    operational_session_id: sessionId,
    user_id: studentUserId,
    assigned_assistant_user_id: assistantA,
    attendance_status: 'present',
    attendance_time: new Date('2026-05-26T03:00:00.000Z'),
    ...overrides,
  };
}

function activeAssistants() {
  return [
    { user_id: assistantA, user_name: 'Assistant A', user_identifier: 'AS-A', activation_method: 'join_qr' },
    { user_id: assistantB, user_name: 'Assistant B', user_identifier: 'AS-B', activation_method: 'join_qr' },
  ];
}

function setupMocks({ session = sessionRow(), attendance = attendanceRow(), hasGrade = false, assistants = activeAssistants() } = {}) {
  mockConductDb.query.mockImplementation((sql, params = []) => {
    const text = String(sql);
    if (text.includes('FROM practicum_operational_sessions')) {
      return Promise.resolve({ rowCount: 1, rows: [session] });
    }
    if (text.includes('FROM practicum_operational_session_attendances')) {
      return Promise.resolve(attendance ? { rowCount: 1, rows: [attendance] } : { rowCount: 0, rows: [] });
    }
    if (text.includes('FROM practicum_student_grades')) {
      return Promise.resolve(hasGrade ? { rowCount: 1, rows: [{ '?column?': 1 }] } : { rowCount: 0, rows: [] });
    }
    if (text.includes('FROM practicum_operational_session_active_assistants')) {
      return Promise.resolve({ rowCount: assistants.length, rows: assistants });
    }
    return Promise.resolve({ rowCount: 0, rows: [] });
  });

  mockUserManagementDb.query.mockImplementation((_sql, params = []) => {
    const ids = params[0] || [];
    return Promise.resolve({
      rowCount: ids.length,
      rows: ids.map((id) => ({ user_id: id, name: `Name ${id}`, nipnim: `NIM-${id}` })),
    });
  });
}

function setupClient() {
  const updatedAttendance = attendanceRow({ assigned_assistant_user_id: assistantB });
  const client = {
    query: jest.fn((sql) => {
      const text = String(sql);
      if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') {
        return Promise.resolve({ rowCount: 0, rows: [] });
      }
      if (text.includes('UPDATE practicum_operational_session_attendances')) {
        return Promise.resolve({ rowCount: 1, rows: [updatedAttendance] });
      }
      if (text.includes('INSERT INTO practicum_attendance_plot_reassignments')) {
        return Promise.resolve({ rowCount: 1, rows: [] });
      }
      return Promise.resolve({ rowCount: 0, rows: [] });
    }),
    release: jest.fn(),
  };
  mockConductDb.connect.mockResolvedValue(client);
  return client;
}

describe('Operational session attendance plot reassign', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('allows PIC to reassign plot while session is ongoing and student has no grade', async () => {
    setupMocks();
    const client = setupClient();

    const result = await reassignOperationalSessionAttendancePlot({
      operationalSessionId: sessionId,
      attendanceId,
      targetAssistantUserId: assistantB,
      requesterUserId: picUserId,
      reason: 'Salah scan QR plot',
    });

    expect(result.assigned_assistant_user_id).toBe(assistantB);
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE practicum_operational_session_attendances'), expect.any(Array));
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO practicum_attendance_plot_reassignments'), expect.any(Array));
  });

  test('rejects non-PIC requester', async () => {
    setupMocks();

    await expect(reassignOperationalSessionAttendancePlot({
      operationalSessionId: sessionId,
      attendanceId,
      targetAssistantUserId: assistantB,
      requesterUserId: assistantA,
      reason: 'Salah scan QR plot',
    })).rejects.toThrow('Only the session PIC can reassign student plots');
  });

  test('rejects completed session', async () => {
    setupMocks({ session: sessionRow({ session_status: 'completed' }) });

    await expect(reassignOperationalSessionAttendancePlot({
      operationalSessionId: sessionId,
      attendanceId,
      targetAssistantUserId: assistantB,
      requesterUserId: picUserId,
      reason: 'Salah scan QR plot',
    })).rejects.toThrow('Student plot cannot be changed after the session is completed');
  });

  test('rejects when submitted grade exists', async () => {
    setupMocks({ hasGrade: true });

    await expect(reassignOperationalSessionAttendancePlot({
      operationalSessionId: sessionId,
      attendanceId,
      targetAssistantUserId: assistantB,
      requesterUserId: picUserId,
      reason: 'Salah scan QR plot',
    })).rejects.toThrow('Student plot cannot be changed because a grade has already been submitted');
  });

  test('rejects target assistant that is not active in session', async () => {
    setupMocks({ assistants: activeAssistants().filter((assistant) => assistant.user_id !== assistantB) });

    await expect(reassignOperationalSessionAttendancePlot({
      operationalSessionId: sessionId,
      attendanceId,
      targetAssistantUserId: assistantB,
      requesterUserId: picUserId,
      reason: 'Salah scan QR plot',
    })).rejects.toThrow('Target assistant is not active in this session');
  });

  test('requires a meaningful reason', async () => {
    setupMocks();

    await expect(reassignOperationalSessionAttendancePlot({
      operationalSessionId: sessionId,
      attendanceId,
      targetAssistantUserId: assistantB,
      requesterUserId: picUserId,
      reason: 'abc',
    })).rejects.toThrow('Plot reassignment reason must be at least 5 characters');
  });

  test('allows PIC to bulk reassign multiple student plots', async () => {
    const attendanceB = '44444444-4444-4444-8444-444444444444';
    setupMocks({
      attendance: null,
    });
    mockConductDb.query.mockImplementation((sql, params = []) => {
      const text = String(sql);
      if (text.includes('FROM practicum_operational_sessions')) {
        return Promise.resolve({ rowCount: 1, rows: [sessionRow()] });
      }
      if (text.includes('AND id = ANY($2::uuid[])')) {
        return Promise.resolve({
          rowCount: 2,
          rows: [
            attendanceRow({ id: attendanceId, user_id: 'student-1' }),
            attendanceRow({ id: attendanceB, user_id: 'student-2', assigned_assistant_user_id: assistantB }),
          ],
        });
      }
      if (text.includes('FROM practicum_student_grades')) {
        return Promise.resolve({ rowCount: 0, rows: [] });
      }
      if (text.includes('FROM practicum_operational_session_active_assistants')) {
        return Promise.resolve({ rowCount: 2, rows: activeAssistants() });
      }
      return Promise.resolve({ rowCount: 0, rows: [] });
    });

    const client = {
      query: jest.fn((sql) => {
        const text = String(sql);
        if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') {
          return Promise.resolve({ rowCount: 0, rows: [] });
        }
        if (text.includes('UPDATE practicum_operational_session_attendances')) {
          return Promise.resolve({
            rowCount: 1,
            rows: [attendanceRow({ assigned_assistant_user_id: assistantB })],
          });
        }
        if (text.includes('INSERT INTO practicum_attendance_plot_reassignments')) {
          return Promise.resolve({ rowCount: 1, rows: [] });
        }
        return Promise.resolve({ rowCount: 0, rows: [] });
      }),
      release: jest.fn(),
    };
    mockConductDb.connect.mockResolvedValueOnce(client);

    const result = await bulkReassignOperationalSessionAttendancePlot({
      operationalSessionId: sessionId,
      attendanceIds: [attendanceId, attendanceB],
      targetAssistantUserId: assistantB,
      requesterUserId: picUserId,
      reason: 'Plot A assistant arrived late',
    });

    expect(result.updated_count).toBe(1);
    expect(result.skipped_count).toBe(1);
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO practicum_attendance_plot_reassignments'), expect.any(Array));
  });
});
