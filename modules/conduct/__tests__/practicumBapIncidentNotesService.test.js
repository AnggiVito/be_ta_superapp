import { jest } from '@jest/globals';

const mockConductDb = {
  query: jest.fn(),
};

jest.unstable_mockModule('../../../config/databases.js', () => ({
  conductDb: mockConductDb,
  registrationDb: { query: jest.fn() },
  userManagementDb: { query: jest.fn() },
}));

jest.unstable_mockModule('exceljs', () => ({
  default: class Workbook {},
}));

jest.unstable_mockModule('qrcode', () => ({
  default: {
    toDataURL: jest.fn(async () => 'data:image/png;base64,qr'),
  },
}));

const { updateBapIncidentNotes } = await import('../services/practicumBapService.js');

const sessionId = '11111111-1111-4111-8111-111111111111';

function completedSession(picUserId = 'pic-1') {
  return {
    id: sessionId,
    session_status: 'completed',
    pic_user_id: picUserId,
    registration_schedule_id: '22222222-2222-4222-8222-222222222222',
  };
}

function bapRow(overrides = {}) {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    operational_session_id: sessionId,
    registration_schedule_id: '22222222-2222-4222-8222-222222222222',
    bap_number: null,
    status: 'draft_generated',
    practicum_name: 'Praktikum',
    module_name: 'Modul 1',
    class_shift: 'IF-01',
    activity_type: 'Hands-On',
    scheduled_date: '2026-05-18',
    start_time: '08:00:00',
    end_time: '10:00:00',
    venue: 'Lab',
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
    metadata: {},
    generated_at: new Date('2026-05-18T00:00:00.000Z'),
    ...overrides,
  };
}

function mockSuccessfulReadFlow(initialBap, updatedBap = initialBap) {
  mockConductDb.query
    .mockResolvedValueOnce({ rowCount: 1, rows: [completedSession()] })
    .mockResolvedValueOnce({ rowCount: 1, rows: [initialBap] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rowCount: 1, rows: [] })
    .mockResolvedValueOnce({ rowCount: 1, rows: [updatedBap] })
    .mockResolvedValueOnce({ rows: [] });
}

describe('Practicum BAP incident notes service (#41)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('PIC can update incident notes before lecturer signature', async () => {
    mockSuccessfulReadFlow(
      bapRow(),
      bapRow({ incident_notes: 'Proyektor rusak saat praktikum.' })
    );

    const result = await updateBapIncidentNotes({
      operationalSessionId: sessionId,
      requesterUserId: 'pic-1',
      incidentNotes: '  Proyektor rusak saat praktikum.  ',
    });

    expect(result.incident_notes).toBe('Proyektor rusak saat praktikum.');
    expect(mockConductDb.query.mock.calls[3][0]).toContain('UPDATE practicum_baps');
    expect(mockConductDb.query.mock.calls[3][1][1]).toBe('Proyektor rusak saat praktikum.');
  });

  test('non-PIC cannot update incident notes', async () => {
    mockConductDb.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [completedSession('pic-1')],
    });

    await expect(
      updateBapIncidentNotes({
        operationalSessionId: sessionId,
        requesterUserId: 'assistant-2',
        incidentNotes: 'Catatan',
      })
    ).rejects.toThrow('Hanya PIC sesi yang dapat mengubah catatan kejadian BAP');
    expect(mockConductDb.query).toHaveBeenCalledTimes(1);
  });

  test('incident notes are locked after lecturer signature', async () => {
    mockConductDb.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [completedSession()] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [bapRow({ lecturer_signed_at: new Date('2026-05-18T01:00:00.000Z') })],
      })
      .mockResolvedValueOnce({ rows: [] });

    await expect(
      updateBapIncidentNotes({
        operationalSessionId: sessionId,
        requesterUserId: 'pic-1',
        incidentNotes: 'Catatan terkunci',
      })
    ).rejects.toThrow('Catatan kejadian tidak dapat diubah setelah dosen tanda tangan');
    expect(mockConductDb.query).toHaveBeenCalledTimes(3);
  });

  test('PIC can clear incident notes with empty text', async () => {
    mockSuccessfulReadFlow(
      bapRow({ incident_notes: 'Catatan lama' }),
      bapRow({ incident_notes: null })
    );

    const result = await updateBapIncidentNotes({
      operationalSessionId: sessionId,
      requesterUserId: 'pic-1',
      incidentNotes: '   ',
    });

    expect(result.incident_notes).toBeNull();
    expect(mockConductDb.query.mock.calls[3][1][1]).toBeNull();
  });
});
