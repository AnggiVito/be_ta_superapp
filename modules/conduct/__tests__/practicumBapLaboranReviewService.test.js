import { jest } from '@jest/globals';

const mockConductDb = {
  query: jest.fn(),
};
const mockUserManagementDb = {
  query: jest.fn(),
};

jest.unstable_mockModule('../../../config/databases.js', () => ({
  conductDb: mockConductDb,
  registrationDb: { query: jest.fn() },
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

const {
  reviewBapByLaboran,
  exportBapCsvBySession,
  exportBapPdfBySession,
} = await import('../services/practicumBapService.js');

const sessionId = '11111111-1111-4111-8111-111111111111';

function bapRow(overrides = {}) {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    operational_session_id: sessionId,
    registration_schedule_id: '22222222-2222-4222-8222-222222222222',
    bap_number: null,
    status: 'lecturer_signed',
    practicum_name: 'Praktikum Sistem Produksi',
    module_name: 'Modul Insiden',
    class_shift: 'IF-01',
    activity_type: 'Hands-On',
    scheduled_date: '2026-05-18',
    start_time: '08:00:00',
    end_time: '10:00:00',
    venue: 'Lab A',
    present_count: 1,
    sick_count: 0,
    permission_count: 0,
    absent_count: 0,
    student_count: 1,
    assistant_count: 1,
    incident_notes: 'Kerusakan alat ukur.',
    lecturer_signed_at: new Date('2026-05-18T01:00:00.000Z'),
    lecturer_signed_by: null,
    laboran_review_status: 'pending',
    laboran_reviewed_at: null,
    laboran_reviewed_by: null,
    laboran_review_note: null,
    metadata: {
      active_assistants: [
        {
          user_id: 'assistant-1',
          user_name: 'Assistant One',
          user_identifier: 'AS001',
          activation_method: 'pic_open',
          attendance_status: 'present',
          attendance_context: {
            attendance_context_label:
              'Assistant arrived on time, practicum session started on time',
          },
        },
      ],
      registration_snapshot: {
        schedule: {
          date: '2026-05-19',
        },
      },
    },
    generated_at: new Date('2026-05-18T00:00:00.000Z'),
    ...overrides,
  };
}

const attendanceRows = [
  {
    row_number: 1,
    student_user_id: 'student-1',
    student_identifier: 'M001',
    student_name: 'Mahasiswa Satu',
    assistant_code: 'AS001',
    attendance_status: 'present',
    attendance_time: new Date('2026-05-18T00:10:00.000Z'),
    student_signature_status: 'qr_attended',
    assistant_signature_status: 'pending',
  },
];

function mockBapRead(row) {
  mockConductDb.query
    .mockResolvedValueOnce({ rowCount: 1, rows: [row] })
    .mockResolvedValueOnce({ rows: attendanceRows });
}

function mockReviewFlow(initialRow, updatedRow) {
  mockConductDb.query
    .mockResolvedValueOnce({ rowCount: 1, rows: [initialRow] })
    .mockResolvedValueOnce({ rows: attendanceRows })
    .mockResolvedValueOnce({ rowCount: 1, rows: [] })
    .mockResolvedValueOnce({ rowCount: 1, rows: [updatedRow] })
    .mockResolvedValueOnce({ rows: attendanceRows });
}

describe('Practicum BAP laboran review service (#42)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockUserManagementDb.query.mockResolvedValue({
      rows: [
        { user_id: 'laboran-1', name: 'Laboran Satu', nipnim: 'L001' },
      ],
    });
  });

  test('laboran can approve BAP after lecturer signature', async () => {
    mockReviewFlow(
      bapRow(),
      bapRow({
        status: 'final_approved',
        laboran_review_status: 'approved',
        laboran_reviewed_by: 'laboran-1',
        laboran_review_note: 'Valid.',
      })
    );

    const result = await reviewBapByLaboran({
      operationalSessionId: sessionId,
      requesterUserId: 'laboran-1',
      reviewStatus: 'approved',
      reviewNote: ' Valid. ',
    });

    expect(result.status).toBe('final_approved');
    expect(result.laboran_review_status).toBe('approved');
    expect(mockConductDb.query.mock.calls[2][0]).toContain('UPDATE practicum_baps');
    expect(mockConductDb.query.mock.calls[2][1][4]).toBe('final_approved');
  });

  test('laboran review is rejected before lecturer signature', async () => {
    mockBapRead(bapRow({ lecturer_signed_at: null, status: 'draft_generated' }));

    await expect(
      reviewBapByLaboran({
        operationalSessionId: sessionId,
        requesterUserId: 'laboran-1',
        reviewStatus: 'approved',
        reviewNote: '',
      })
    ).rejects.toThrow('BAP can only be reviewed by laboratory staff after lecturer signature');
    expect(mockConductDb.query).toHaveBeenCalledTimes(2);
  });

  test('revision_required requires review note', async () => {
    await expect(
      reviewBapByLaboran({
        operationalSessionId: sessionId,
        requesterUserId: 'laboran-1',
        reviewStatus: 'revision_required',
        reviewNote: '   ',
      })
    ).rejects.toThrow('Review note is required when requesting revision');
    expect(mockConductDb.query).not.toHaveBeenCalled();
  });

  test('CSV final export is rejected before laboran approval', async () => {
    mockBapRead(bapRow({ laboran_review_status: 'pending' }));

    await expect(exportBapCsvBySession(sessionId)).rejects.toThrow(
      'Final CSV/PDF export is only available after the BAP is approved by laboratory staff'
    );
  });

  test('CSV final export includes incident and laboran review fields', async () => {
    mockBapRead(
      bapRow({
        status: 'final_approved',
        laboran_review_status: 'approved',
        laboran_review_note: 'Insiden sudah ditindaklanjuti.',
      })
    );

    const result = await exportBapCsvBySession(sessionId);
    const csv = result.buffer.toString('utf8');

    expect(result.filename).toBe('BAP-IF-01.csv');
    expect(csv).toContain('Kerusakan alat ukur.');
    expect(csv).toContain('Insiden sudah ditindaklanjuti.');
    expect(csv).toContain('Tanggal,19-05-2026');
    expect(csv).toContain('Mahasiswa Satu');
    expect(csv).toContain('Keterangan');
    expect(csv).toContain('Assistant arrived on time, practicum session started on time');
  });

  test('PDF final export is rejected before laboran approval', async () => {
    mockBapRead(bapRow({ laboran_review_status: 'revision_required' }));

    await expect(exportBapPdfBySession(sessionId)).rejects.toThrow(
      'Final CSV/PDF export is only available after the BAP is approved by laboratory staff'
    );
  });
});
