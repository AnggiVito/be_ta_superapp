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

const {
  getGradingForm,
  listGradingStudents,
  submitStudentGrade,
} = await import('../services/practicumAssessmentService.js');

const sessionId = '11111111-1111-4111-8111-111111111111';
const scheduleId = '22222222-2222-4222-8222-222222222222';
const moduleId = '33333333-3333-4333-8333-333333333333';
const toolId = '44444444-4444-4444-8444-444444444444';
const assistantA = 'assistant-a';
const assistantB = 'assistant-b';
const picUserId = 'pic-1';
const studentA = 'student-a';
const studentB = 'student-b';
const studentUnassigned = 'student-unassigned';

function completedSession(overrides = {}) {
  return {
    id: sessionId,
    registration_schedule_id: scheduleId,
    session_status: 'completed',
    pic_user_id: picUserId,
    completed_at: new Date('2026-05-25T03:00:00.000Z'),
    ...overrides,
  };
}

function attendanceRow(userId, assignedAssistantUserId) {
  return {
    id: `attendance-${userId}`,
    operational_session_id: sessionId,
    user_id: userId,
    assigned_assistant_user_id: assignedAssistantUserId,
    attendance_status: 'present',
    attendance_time: new Date('2026-05-25T01:00:00.000Z'),
  };
}

function scheduleContext() {
  return {
    id: scheduleId,
    module_id: moduleId,
    tanggal: '2026-05-25',
    jam_mulai: '07:30:00',
    jam_berakhir: '10:30:00',
    detail_kegiatan: 'Kelas SI-47-04',
    kelas: 'SI-47-04',
    venue: 'Integra R2',
    start_time: null,
    end_time: null,
    practicum_name: 'Praktikum Basis Data',
    module_name: 'Modul 1',
  };
}

function toolRow() {
  return {
    id: toolId,
    registration_schedule_id: scheduleId,
    practicum_name: 'Praktikum Basis Data',
    module_name: 'Modul 1',
    title: 'Penilaian Praktikum Basis Data - Modul 1',
    description: 'Rubrik penilaian dari konfigurasi modul Registration',
    source: 'registration_module_config',
    is_active: true,
  };
}

function componentRow() {
  return {
    id: 'component-1',
    tool_id: toolId,
    name: 'Jurnal',
    description: null,
    max_score: 100,
    weight: 100,
    sort_order: 1,
    is_required: true,
  };
}

function gradeRow(studentUserId, graderUserId = assistantA) {
  return {
    student_user_id: studentUserId,
    grader_user_id: graderUserId,
    status: 'submitted',
    total_score: 88,
    submitted_at: new Date('2026-05-25T04:00:00.000Z'),
    updated_at: new Date('2026-05-25T04:00:00.000Z'),
  };
}

function setupMocks({ requesterUserId = assistantA, attendanceRows = [], gradeRows = [] } = {}) {
  mockConductDb.query.mockImplementation((sql, params) => {
    const text = String(sql);
    if (text.includes('FROM practicum_operational_sessions')) {
      return Promise.resolve({ rowCount: 1, rows: [completedSession()] });
    }
    if (text.includes('FROM practicum_operational_session_active_assistants')) {
      return Promise.resolve({ rowCount: requesterUserId === picUserId ? 0 : 1, rows: requesterUserId === picUserId ? [] : [{ '?column?': 1 }] });
    }
    if (text.includes('FROM practicum_operational_session_attendances') && text.includes('AND ($2::boolean = true OR assigned_assistant_user_id = $3)')) {
      const canMonitorAll = params[1] === true;
      const assistantId = params[2];
      const rows = canMonitorAll
        ? attendanceRows
        : attendanceRows.filter((row) => String(row.assigned_assistant_user_id ?? '') === String(assistantId));
      return Promise.resolve({ rowCount: rows.length, rows });
    }
    if (text.includes('FROM practicum_operational_session_attendances')) {
      const studentUserId = params[1];
      const row = attendanceRows.find((item) => String(item.user_id) === String(studentUserId));
      return Promise.resolve(row ? { rowCount: 1, rows: [row] } : { rowCount: 0, rows: [] });
    }
    if (text.includes('FROM practicum_assessment_tools')) {
      return Promise.resolve({ rowCount: 1, rows: [toolRow()] });
    }
    if (text.includes('FROM practicum_assessment_components')) {
      return Promise.resolve({ rowCount: 1, rows: [componentRow()] });
    }
    if (text.includes('FROM practicum_student_grades')) {
      return Promise.resolve({ rowCount: gradeRows.length, rows: gradeRows });
    }
    return Promise.resolve({ rowCount: 0, rows: [] });
  });

  mockRegistrationDb.query.mockImplementation((sql) => {
    const text = String(sql);
    if (text.includes('FROM schedules s')) {
      return Promise.resolve({ rowCount: 1, rows: [scheduleContext()] });
    }
    if (text.includes('FROM practicum_module_assessment_components')) {
      return Promise.resolve({ rowCount: 1, rows: [{ component_type: 'jurnal', weight_percent: 100 }] });
    }
    return Promise.resolve({ rowCount: 0, rows: [] });
  });

  mockUserManagementDb.query.mockImplementation((sql, params) => {
    const ids = params[0] || [];
    return Promise.resolve({
      rowCount: ids.length,
      rows: ids.map((id) => ({ user_id: id, name: `Student ${id}`, nipnim: `NIM-${id}` })),
    });
  });
}

function setupSubmitClient() {
  const client = {
    query: jest.fn((sql) => {
      const text = String(sql);
      if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') {
        return Promise.resolve({ rowCount: 0, rows: [] });
      }
      if (text.includes('INSERT INTO practicum_student_grades')) {
        return Promise.resolve({ rowCount: 1, rows: [{ id: 'grade-1', status: 'submitted', total_score: 90 }] });
      }
      return Promise.resolve({ rowCount: 1, rows: [] });
    }),
    release: jest.fn(),
  };
  mockConductDb.connect.mockResolvedValue(client);
  return client;
}

describe('Practicum assessment assistant plot scope', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('lists only students assigned to requester assistant plot', async () => {
    setupMocks({
      requesterUserId: assistantA,
      attendanceRows: [
        attendanceRow(studentA, assistantA),
        attendanceRow(studentB, assistantB),
        attendanceRow(studentUnassigned, null),
      ],
    });

    const result = await listGradingStudents({
      operationalSessionId: sessionId,
      requesterUserId: assistantA,
    });

    expect(result.map((row) => row.student_user_id)).toEqual([studentA]);
    expect(result[0].can_grade).toBe(true);
  });

  test('allows PIC to list all checked-in students grouped by plot without grading actions', async () => {
    setupMocks({
      requesterUserId: picUserId,
      attendanceRows: [
        attendanceRow(studentA, assistantA),
        attendanceRow(studentB, assistantB),
      ],
    });

    const result = await listGradingStudents({
      operationalSessionId: sessionId,
      requesterUserId: picUserId,
    });

    expect(result.map((row) => row.student_user_id)).toEqual([studentA, studentB]);
    expect(result.every((row) => row.is_pic_view)).toBe(true);
    expect(result.every((row) => row.can_grade === false)).toBe(true);
    expect(result.every((row) => row.is_unassigned_plot === false)).toBe(true);
  });

  test('PIC sees submitted grade status from assistant grader', async () => {
    setupMocks({
      requesterUserId: picUserId,
      attendanceRows: [attendanceRow(studentA, assistantA)],
      gradeRows: [gradeRow(studentA, assistantA)],
    });

    const result = await listGradingStudents({
      operationalSessionId: sessionId,
      requesterUserId: picUserId,
    });

    expect(result[0].grade_status).toBe('submitted');
    expect(result[0].total_score).toBe(88);
  });

  test('rejects PIC opening grading form for plotted student', async () => {
    setupMocks({
      requesterUserId: picUserId,
      attendanceRows: [attendanceRow(studentA, assistantA)],
    });

    await expect(getGradingForm({
      operationalSessionId: sessionId,
      studentUserId: studentA,
      requesterUserId: picUserId,
    })).rejects.toThrow('You can only grade students assigned to your plot.');
  });

  test('rejects PIC submitting grade for plotted student', async () => {
    setupMocks({
      requesterUserId: picUserId,
      attendanceRows: [attendanceRow(studentA, assistantA)],
    });

    await expect(submitStudentGrade({
      operationalSessionId: sessionId,
      studentUserId: studentA,
      requesterUserId: picUserId,
      components: [{ component_id: 'component-1', score: 90 }],
    })).rejects.toThrow('You can only grade students assigned to your plot.');
    expect(mockConductDb.connect).not.toHaveBeenCalled();
  });

  test('rejects grading form for student assigned to another assistant plot', async () => {
    setupMocks({
      requesterUserId: assistantA,
      attendanceRows: [attendanceRow(studentB, assistantB)],
    });

    await expect(getGradingForm({
      operationalSessionId: sessionId,
      studentUserId: studentB,
      requesterUserId: assistantA,
    })).rejects.toThrow('You can only grade students assigned to your plot.');
  });

  test('rejects submitting grade for student assigned to another assistant plot', async () => {
    setupMocks({
      requesterUserId: assistantA,
      attendanceRows: [attendanceRow(studentB, assistantB)],
    });

    await expect(submitStudentGrade({
      operationalSessionId: sessionId,
      studentUserId: studentB,
      requesterUserId: assistantA,
      components: [{ component_id: 'component-1', score: 90 }],
    })).rejects.toThrow('You can only grade students assigned to your plot.');
    expect(mockConductDb.connect).not.toHaveBeenCalled();
  });

  test('allows assistant to submit grade for own plotted student', async () => {
    setupMocks({
      requesterUserId: assistantA,
      attendanceRows: [attendanceRow(studentA, assistantA)],
    });
    setupSubmitClient();

    const result = await submitStudentGrade({
      operationalSessionId: sessionId,
      studentUserId: studentA,
      requesterUserId: assistantA,
      components: [{ component_id: 'component-1', score: 90 }],
    });

    expect(result.student.user_id).toBe(studentA);
    expect(mockConductDb.connect).toHaveBeenCalledTimes(1);
  });
});
