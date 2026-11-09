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

const { getGradingForm } = await import('../services/practicumAssessmentService.js');

const sessionId = '11111111-1111-4111-8111-111111111111';
const scheduleId = '22222222-2222-4222-8222-222222222222';
const moduleId = '33333333-3333-4333-8333-333333333333';
const studentUserId = 'student-1';
const graderUserId = 'assistant-1';

function completedSession() {
  return {
    id: sessionId,
    registration_schedule_id: scheduleId,
    session_status: 'completed',
    pic_user_id: 'pic-1',
    completed_at: new Date('2026-05-25T03:00:00.000Z'),
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

function attendanceRow() {
  return {
    id: 'attendance-1',
    operational_session_id: sessionId,
    user_id: studentUserId,
    assigned_assistant_user_id: graderUserId,
    attendance_status: 'present',
    attendance_time: new Date('2026-05-25T01:00:00.000Z'),
  };
}

function profileRow() {
  return {
    user_id: studentUserId,
    name: 'RINA KUSUMA',
    nipnim: '2024005',
  };
}

function toolRow(overrides = {}) {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    registration_schedule_id: scheduleId,
    practicum_name: 'Praktikum Basis Data',
    module_name: 'Modul 1',
    title: 'Penilaian Praktikum Basis Data - Modul 1',
    description: 'Rubrik penilaian dari konfigurasi modul Registration',
    source: 'registration_module_config',
    is_active: true,
    ...overrides,
  };
}

function componentRow(id, name, weight, sortOrder) {
  return {
    id,
    tool_id: toolRow().id,
    name,
    description: null,
    max_score: 100,
    weight,
    sort_order: sortOrder,
    is_required: true,
  };
}

function setupBaseConductMocks({ existingTool = null, components = [] } = {}) {
  mockConductDb.query.mockImplementation((sql, params) => {
    const text = String(sql);
    if (text.includes('FROM practicum_operational_sessions')) {
      return Promise.resolve({ rowCount: 1, rows: [completedSession()] });
    }
    if (text.includes('FROM practicum_operational_session_active_assistants')) {
      return Promise.resolve({ rowCount: 1, rows: [{ '?column?': 1 }] });
    }
    if (text.includes('FROM practicum_operational_session_attendances')) {
      return Promise.resolve({ rowCount: 1, rows: [attendanceRow()] });
    }
    if (text.includes('FROM practicum_assessment_tools')) {
      return Promise.resolve(existingTool ? { rowCount: 1, rows: [existingTool] } : { rowCount: 0, rows: [] });
    }
    if (text.includes('INSERT INTO practicum_assessment_tools')) {
      return Promise.resolve({ rowCount: 1, rows: [toolRow({ source: params[5], description: params[4] })] });
    }
    if (text.includes('INSERT INTO practicum_assessment_components')) {
      return Promise.resolve({ rowCount: 1, rows: [] });
    }
    if (text.includes('FROM practicum_assessment_components')) {
      return Promise.resolve({ rowCount: components.length, rows: components });
    }
    if (text.includes('FROM practicum_student_grades') && text.includes('tool_id =')) {
      return Promise.resolve({ rowCount: 0, rows: [] });
    }
    if (text.includes('FROM practicum_student_grades')) {
      return Promise.resolve({ rowCount: 0, rows: [] });
    }
    if (text.includes('UPDATE practicum_assessment_tools')) {
      return Promise.resolve({ rowCount: 1, rows: [] });
    }
    return Promise.resolve({ rowCount: 0, rows: [] });
  });

  mockUserManagementDb.query.mockResolvedValue({ rowCount: 1, rows: [profileRow()] });
}

describe('Practicum assessment Registration rubric integration', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('creates Conduct grading tool from enabled Registration module components', async () => {
    const registrationRows = [
      { component_type: 'tugas_pendahuluan', weight_percent: 20 },
      { component_type: 'tes_awal', weight_percent: 30 },
      { component_type: 'jurnal', weight_percent: 50 },
    ];
    const generatedComponents = [
      componentRow('c1', 'Tugas Pendahuluan', 20, 1),
      componentRow('c2', 'Tes Awal', 30, 2),
      componentRow('c3', 'Jurnal', 50, 3),
    ];
    setupBaseConductMocks({ components: generatedComponents });
    mockRegistrationDb.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [scheduleContext()] })
      .mockResolvedValueOnce({ rowCount: registrationRows.length, rows: registrationRows });

    const result = await getGradingForm({
      operationalSessionId: sessionId,
      studentUserId,
      requesterUserId: graderUserId,
    });

    expect(result.tool.source).toBe('registration_module_config');
    expect(result.tool.components.map((component) => component.name)).toEqual([
      'Tugas Pendahuluan',
      'Tes Awal',
      'Jurnal',
    ]);
    expect(result.tool.components.map((component) => component.weight)).toEqual([20, 30, 50]);
  });

  test('does not include disabled Registration components', async () => {
    const registrationRows = [
      { component_type: 'tugas_pendahuluan', weight_percent: 20 },
      { component_type: 'tes_awal', weight_percent: 30 },
      { component_type: 'jurnal', weight_percent: 50 },
    ];
    const generatedComponents = [
      componentRow('c1', 'Tugas Pendahuluan', 20, 1),
      componentRow('c2', 'Tes Awal', 30, 2),
      componentRow('c3', 'Jurnal', 50, 3),
    ];
    setupBaseConductMocks({ components: generatedComponents });
    mockRegistrationDb.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [scheduleContext()] })
      .mockResolvedValueOnce({ rowCount: registrationRows.length, rows: registrationRows });

    const result = await getGradingForm({
      operationalSessionId: sessionId,
      studentUserId,
      requesterUserId: graderUserId,
    });

    expect(result.tool.components.map((component) => component.name)).not.toContain('Tes Akhir');
    expect(result.tool.components.map((component) => component.name)).not.toContain('Audit');
  });

  test('rejects Registration rubric when active weights do not total 100', async () => {
    setupBaseConductMocks();
    mockRegistrationDb.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [scheduleContext()] })
      .mockResolvedValueOnce({
        rowCount: 3,
        rows: [
          { component_type: 'tugas_pendahuluan', weight_percent: 20 },
          { component_type: 'tes_awal', weight_percent: 30 },
          { component_type: 'jurnal', weight_percent: 40 },
        ],
      });

    await expect(getGradingForm({
      operationalSessionId: sessionId,
      studentUserId,
      requesterUserId: graderUserId,
    })).rejects.toThrow('The module rubric weight total must be 100%. Current total is 90%.');
  });

  test('rejects grading when module has no Registration rubric config', async () => {
    setupBaseConductMocks();
    mockRegistrationDb.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [scheduleContext()] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] });

    await expect(getGradingForm({
      operationalSessionId: sessionId,
      studentUserId,
      requesterUserId: graderUserId,
    })).rejects.toThrow('Module assessment component configuration is not available in Registration');
  });
});
