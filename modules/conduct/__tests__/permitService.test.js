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

const mockLogger = {
  info: jest.fn(),
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

const {
  submitPermitRequest,
  getMyPermits,
  reviewPermitRequest,
  submitAssistantPermitRequest,
  getAssistantPermitSubmissions,
  getPermitStatisticsForLaboran,
  reviewAssistantPermitRequest,
} = await import('../services/permitService.js');

function dateOffset(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

const ORIGINAL_SCHEDULE_ID = '11111111-1111-4111-8111-111111111111';
const SHIFT_SCHEDULE_ID = '22222222-2222-4222-8222-222222222222';

function basePermitPayload(overrides = {}) {
  return {
    reason: 'izin',
    academic_role: 'praktikan',
    absent_date: '2026-03-20',
    original_registration_schedule_id: ORIGINAL_SCHEDULE_ID,
    shift_registration_schedule_id: SHIFT_SCHEDULE_ID,
    ...overrides,
  };
}

describe('Permit Service - Task #33, #34 & #36', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('should submit permit izin for praktikan successfully', async () => {
    mockUserManagementDb.query.mockResolvedValueOnce({
      rows: [{ user_id: 'user-1', name: 'Budi', nipnim: '1301234567' }],
    });

    mockConductDb.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'permit-1',
            user_id: 'user-1',
            user_name: 'Budi',
            user_nim: '1301234567',
            academic_role: 'praktikan',
            reason: 'izin',
            absent_date: '2026-03-20',
            status: 'pending',
          },
        ],
      });

    const result = await submitPermitRequest({
      userId: 'user-1',
      payload: basePermitPayload(),
    });

    expect(result.id).toBe('permit-1');
    expect(result.reason).toBe('izin');
    expect(result.status).toBe('pending');
    expect(mockConductDb.query).toHaveBeenCalledTimes(2);
  });

  test('should submit permit sakit for praktikan successfully', async () => {
    mockUserManagementDb.query.mockResolvedValueOnce({
      rows: [{ user_id: 'user-1', name: 'Budi', nipnim: '1301234567' }],
    });

    mockConductDb.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'permit-2',
            user_id: 'user-1',
            user_name: 'Budi',
            user_nim: '1301234567',
            academic_role: 'praktikan',
            reason: 'sakit',
            absent_date: '2026-03-21',
            status: 'pending',
          },
        ],
      });

    const result = await submitPermitRequest({
      userId: 'user-1',
      payload: basePermitPayload({
        reason: 'sakit',
        absent_date: '2026-03-21',
      }),
    });

    expect(result.id).toBe('permit-2');
    expect(result.reason).toBe('sakit');
    expect(result.status).toBe('pending');
    expect(mockConductDb.query).toHaveBeenCalledTimes(2);
  });

  test('should reject if reason is not izin or sakit', async () => {
    await expect(
      submitPermitRequest({
        userId: 'user-1',
        payload: basePermitPayload({
          reason: 'alpha',
          user_name: 'Budi',
          user_nim: '1301234567',
        }),
      })
    ).rejects.toThrow('Permit requests can only use reason "izin" or "sakit"');
  });

  test('should reject duplicate pending permit on same date', async () => {
    mockUserManagementDb.query.mockResolvedValueOnce({
      rows: [{ user_id: 'user-1', name: 'Budi', nipnim: '1301234567' }],
    });

    mockConductDb.query.mockResolvedValueOnce({ rows: [{ id: 'existing-permit' }] });

    await expect(
      submitPermitRequest({
        userId: 'user-1',
        payload: basePermitPayload({
          reason: 'sakit',
        }),
      })
    ).rejects.toThrow('You already have a pending leave/sick request for that date');
  });

  test('should return my permits ordered by created_at desc with schedule enrichment', async () => {
    mockConductDb.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'permit-2',
          user_id: 'user-1',
          original_registration_schedule_id: ORIGINAL_SCHEDULE_ID,
          shift_registration_schedule_id: SHIFT_SCHEDULE_ID,
        },
        { id: 'permit-1', user_id: 'user-1' },
      ],
    });
    mockRegistrationDb.query.mockResolvedValueOnce({
      rows: [
        {
          id: ORIGINAL_SCHEDULE_ID,
          tanggal: '2026-03-20',
          jam_mulai: '07:30:00',
          jam_berakhir: '10:30:00',
          practicum_name: 'Praktikum Basis Data',
          module_name: 'Modul 1',
          detail_kegiatan: 'Hands-On A',
        },
        {
          id: SHIFT_SCHEDULE_ID,
          tanggal: '2026-03-21',
          jam_mulai: '13:00:00',
          jam_berakhir: '15:00:00',
          practicum_name: 'Praktikum Basis Data',
          module_name: 'Modul 1',
          detail_kegiatan: 'Hands-On B',
        },
      ],
    });

    const result = await getMyPermits('user-1');

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('permit-2');
    expect(result[0].original_schedule?.label).toContain('Hands-On A');
    expect(result[0].shift_schedule?.label).toContain('Hands-On B');
    expect(mockConductDb.query).toHaveBeenCalledWith(
      expect.stringContaining('ORDER BY created_at DESC'),
      ['user-1']
    );
  });

  test('should approve pending izin permit for praktikan and sync attendance', async () => {
    mockConductDb.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'permit-approve-1',
            user_id: 'user-1',
            academic_role: 'praktikan',
            reason: 'izin',
            absent_date: '2026-03-20',
            status: 'pending',
            original_registration_schedule_id: ORIGINAL_SCHEDULE_ID,
            shift_registration_schedule_id: SHIFT_SCHEDULE_ID,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'permit-approve-1',
            status: 'approved',
            reviewed_by: 'pic-1',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'session-original-1' }],
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'attendance-1' }],
      });

    const result = await reviewPermitRequest({
      permitId: 'permit-approve-1',
      reviewerId: 'pic-1',
      payload: {
        action: 'approve',
        review_note: 'Disetujui PIC',
      },
    });

    expect(result.status).toBe('approved');
    expect(result.reviewed_by).toBe('pic-1');
    expect(mockConductDb.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO practicum_operational_session_attendances'),
      expect.arrayContaining(['session-original-1', 'user-1', 'izin'])
    );
  });

  test('should reject review when permit already processed', async () => {
    mockConductDb.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'permit-processed-1',
          academic_role: 'praktikan',
          reason: 'izin',
          status: 'approved',
        },
      ],
    });

    await expect(
      reviewPermitRequest({
        permitId: 'permit-processed-1',
        reviewerId: 'pic-1',
        payload: { action: 'reject' },
      })
    ).rejects.toThrow('Request has already been processed');
  });

  test('should reject review when permit reason is not izin or sakit', async () => {
    mockConductDb.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'permit-other-1',
          academic_role: 'praktikan',
          reason: 'other',
          status: 'pending',
        },
      ],
    });

    await expect(
      reviewPermitRequest({
        permitId: 'permit-other-1',
        reviewerId: 'pic-1',
        payload: { action: 'approve' },
      })
    ).rejects.toThrow('Review is only for submissions with reason "izin" or "sakit"');
  });

  test('should submit assistant permit successfully with evidence', async () => {
    mockUserManagementDb.query.mockResolvedValueOnce({
      rows: [{ user_id: 'assistant-1', name: 'Asisten A', nipnim: 'A001' }],
    });

    mockConductDb.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'assistant-permit-1',
            user_id: 'assistant-1',
            academic_role: 'asisten_praktikum',
            reason: 'izin',
            absent_date: '2026-03-20',
            status: 'pending',
          },
        ],
      });

    const result = await submitAssistantPermitRequest({
      userId: 'assistant-1',
      payload: basePermitPayload({
        academic_role: 'asisten_praktikum',
        evidence_base64: 'Zm9v',
      }),
    });

    expect(result.id).toBe('assistant-permit-1');
    expect(result.reason).toBe('izin');
    expect(result.status).toBe('pending');
  });

  test('should reject assistant permit when original schedule is missing', async () => {
    await expect(
      submitAssistantPermitRequest({
        userId: 'assistant-1',
        payload: {
          reason: 'izin',
          absent_date: '2026-03-20',
          shift_registration_schedule_id: SHIFT_SCHEDULE_ID,
          evidence_base64: 'Zm9v',
        },
      })
    ).rejects.toThrow('original_registration_schedule_id is required');
  });

  test('should reject assistant permit when evidence is missing', async () => {
    await expect(
      submitAssistantPermitRequest({
        userId: 'assistant-1',
        payload: basePermitPayload({
          academic_role: 'asisten_praktikum',
        }),
      })
    ).rejects.toThrow('For active assistants, permit proof must be uploaded');
  });

  test('should get assistant permit submissions by status', async () => {
    mockConductDb.query.mockResolvedValueOnce({
      rows: [
        { id: 'assistant-permit-1', status: 'pending', academic_role: 'asisten_praktikum' },
      ],
    });

    const result = await getAssistantPermitSubmissions({ status: 'pending' });

    expect(result).toHaveLength(1);
    expect(mockConductDb.query).toHaveBeenCalledWith(expect.stringContaining('AND status = $1'), ['pending']);
  });

  test('should reject assistant submissions query when status filter invalid', async () => {
    await expect(getAssistantPermitSubmissions({ status: 'draft' })).rejects.toThrow(
      'status filter is invalid, use pending/approved/rejected'
    );
  });

  test('should approve assistant permit with review note and sync attendance', async () => {
    mockConductDb.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'assistant-review-1',
            user_id: 'assistant-1',
            academic_role: 'asisten_praktikum',
            reason: 'izin',
            absent_date: '2026-03-20',
            status: 'pending',
            original_registration_schedule_id: ORIGINAL_SCHEDULE_ID,
            shift_registration_schedule_id: SHIFT_SCHEDULE_ID,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'assistant-review-1',
            status: 'approved',
            review_note: 'Disetujui koordinator',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'session-original-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'attendance-assistant-1' }] });

    const result = await reviewAssistantPermitRequest({
      permitId: 'assistant-review-1',
      reviewerId: 'koordinator-1',
      payload: { action: 'approve', review_note: 'Disetujui koordinator' },
    });

    expect(result.status).toBe('approved');
    expect(result.review_note).toBe('Disetujui koordinator');
    expect(mockConductDb.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO practicum_operational_session_attendances'),
      expect.arrayContaining(['session-original-1', 'assistant-1', 'izin'])
    );
  });

  test('should approve assistant sakit permit and sync attendance', async () => {
    mockConductDb.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'assistant-review-3',
            user_id: 'assistant-3',
            academic_role: 'asisten_praktikum',
            reason: 'sakit',
            absent_date: '2026-03-21',
            status: 'pending',
            original_registration_schedule_id: ORIGINAL_SCHEDULE_ID,
            shift_registration_schedule_id: SHIFT_SCHEDULE_ID,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'assistant-review-3',
            status: 'approved',
            review_note: 'Disetujui koordinator',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'session-original-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'attendance-assistant-3' }] });

    const result = await reviewAssistantPermitRequest({
      permitId: 'assistant-review-3',
      reviewerId: 'koordinator-1',
      payload: { action: 'approve', review_note: 'Disetujui koordinator' },
    });

    expect(result.status).toBe('approved');
    expect(mockConductDb.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO practicum_operational_session_attendances'),
      expect.arrayContaining(['session-original-1', 'assistant-3', 'sakit'])
    );
  });

  test('should reject assistant review when review_note missing', async () => {
    await expect(
      reviewAssistantPermitRequest({
        permitId: 'assistant-review-2',
        reviewerId: 'koordinator-1',
        payload: { action: 'reject' },
      })
    ).rejects.toThrow('review_note is required');
  });

  test('should return permit statistics for laboran', async () => {
    mockConductDb.query.mockResolvedValueOnce({
      rows: [
        {
          total: 12,
          approved: 9,
          rejected: 3,
        },
      ],
    });

    const result = await getPermitStatisticsForLaboran();

    expect(result).toEqual({
      total: 12,
      approved: 9,
      rejected: 3,
    });
    expect(mockConductDb.query).toHaveBeenCalledWith(expect.stringContaining('FROM permit_requests'));
  });
});
