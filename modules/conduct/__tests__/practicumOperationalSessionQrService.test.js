import { jest } from '@jest/globals';

const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

const mockConductDb = {
  query: jest.fn(),
  connect: jest.fn(),
};

jest.unstable_mockModule('../../../config/databases.js', () => ({
  conductDb: mockConductDb,
  registrationDb: { query: jest.fn() },
  userManagementDb: { query: jest.fn() },
}));

jest.unstable_mockModule('qrcode', () => ({
  default: {
    toDataURL: jest.fn(async () => 'data:image/png;base64,qr'),
  },
}));

const {
  generateOperationalSessionActivationQr,
  generateOperationalSessionQr,
  getActiveOperationalSessionQr,
  validateOperationalSessionQrToken,
} = await import('../services/practicumOperationalSessionQrService.js');

describe('Practicum Operational Session QR Service (#134)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockConductDb.connect.mockResolvedValue(mockClient);
  });

  test('should generate assistant activation QR when requester is PIC and session is scheduled', async () => {
    mockConductDb.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          session_status: 'scheduled',
          pic_user_id: 'pic-1',
        },
      ],
    });
    mockClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'qr-session-1',
            operational_session_id: '11111111-1111-4111-8111-111111111111',
            qr_token: '22222222-2222-4222-8222-222222222222',
            qr_data: {
              token: '22222222-2222-4222-8222-222222222222',
              operationalSessionId: '11111111-1111-4111-8111-111111111111',
              type: 'operational_session_assistant_activation',
              expiredAt: '2026-05-14T00:00:15.000Z',
            },
            expired_at: new Date('2026-05-14T00:00:15.000Z'),
            created_at: new Date('2026-05-14T00:00:00.000Z'),
          },
        ],
      })
      .mockResolvedValueOnce({});

    const result = await generateOperationalSessionActivationQr({
      operationalSessionId: '11111111-1111-4111-8111-111111111111',
      generatedBy: 'pic-1',
    });

    expect(result.operationalSessionId).toBe('11111111-1111-4111-8111-111111111111');
    expect(result.qrToken).toBe('22222222-2222-4222-8222-222222222222');
    expect(mockClient.query.mock.calls[2][0]).toContain(
      "qr_data->>'type' = 'operational_session_assistant_activation'"
    );
  });

  test('should generate assistant activation QR when requester is PIC and session is ongoing', async () => {
    mockConductDb.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          session_status: 'ongoing',
          pic_user_id: 'pic-1',
        },
      ],
    });
    mockClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'qr-session-ongoing-activation',
            operational_session_id: '11111111-1111-4111-8111-111111111111',
            qr_token: '33333333-3333-4333-8333-333333333333',
            qr_data: {
              token: '33333333-3333-4333-8333-333333333333',
              operationalSessionId: '11111111-1111-4111-8111-111111111111',
              type: 'operational_session_assistant_activation',
              expiredAt: '2026-05-14T00:00:15.000Z',
            },
            expired_at: new Date('2026-05-14T00:00:15.000Z'),
            created_at: new Date('2026-05-14T00:00:00.000Z'),
          },
        ],
      })
      .mockResolvedValueOnce({});

    const result = await generateOperationalSessionActivationQr({
      operationalSessionId: '11111111-1111-4111-8111-111111111111',
      generatedBy: 'pic-1',
    });

    expect(result.operationalSessionId).toBe('11111111-1111-4111-8111-111111111111');
    expect(result.qrToken).toBe('33333333-3333-4333-8333-333333333333');
    expect(mockClient.query.mock.calls[2][0]).toContain(
      "qr_data->>'type' = 'operational_session_assistant_activation'"
    );
  });

  test('should reject assistant activation QR generation when session is completed', async () => {
    mockConductDb.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          session_status: 'completed',
          pic_user_id: 'pic-1',
        },
      ],
    });

    await expect(
      generateOperationalSessionActivationQr({
        operationalSessionId: '11111111-1111-4111-8111-111111111111',
        generatedBy: 'pic-1',
      })
    ).rejects.toThrow(
      'Assistant activation QR can only be generated while the session is scheduled or ongoing'
    );
    expect(mockConductDb.connect).not.toHaveBeenCalled();
  });

  test('should generate rolling QR when requester is PIC and session is ongoing', async () => {
    mockConductDb.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          session_status: 'ongoing',
          pic_user_id: 'pic-1',
        },
      ],
    });
    mockClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'qr-session-1',
            operational_session_id: '11111111-1111-4111-8111-111111111111',
            qr_token: '22222222-2222-4222-8222-222222222222',
            qr_data: {
              token: '22222222-2222-4222-8222-222222222222',
              operationalSessionId: '11111111-1111-4111-8111-111111111111',
              type: 'operational_session_attendance',
              expiredAt: '2026-05-14T00:00:15.000Z',
            },
            expired_at: new Date('2026-05-14T00:00:15.000Z'),
            created_at: new Date('2026-05-14T00:00:00.000Z'),
          },
        ],
      })
      .mockResolvedValueOnce({});

    const result = await generateOperationalSessionQr({
      operationalSessionId: '11111111-1111-4111-8111-111111111111',
      generatedBy: 'pic-1',
    });

    expect(result.operationalSessionId).toBe('11111111-1111-4111-8111-111111111111');
    expect(result.expirySeconds).toBe(15);
    expect(result.qrToken).toBe('22222222-2222-4222-8222-222222222222');
  });

  test('should reject generate when session is not ongoing', async () => {
    mockConductDb.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          session_status: 'scheduled',
          pic_user_id: 'pic-1',
        },
      ],
    });

    await expect(
      generateOperationalSessionQr({
        operationalSessionId: '11111111-1111-4111-8111-111111111111',
        generatedBy: 'pic-1',
      })
    ).rejects.toThrow('Attendance QR can only be generated while the session is ongoing');
    expect(mockConductDb.connect).not.toHaveBeenCalled();
  });

  test('should allow active assistant to generate own rolling QR', async () => {
    mockConductDb.query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            session_status: 'ongoing',
            pic_user_id: 'pic-1',
          },
        ],
      })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ '?column?': 1 }] });
    mockClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'qr-session-2',
            operational_session_id: '11111111-1111-4111-8111-111111111111',
            qr_token: '22222222-2222-4222-8222-222222222222',
            generated_by: 'assistant-2',
            qr_data: {
              token: '22222222-2222-4222-8222-222222222222',
              operationalSessionId: '11111111-1111-4111-8111-111111111111',
              type: 'operational_session_attendance',
              assistantUserId: 'assistant-2',
              expiredAt: '2026-05-14T00:00:15.000Z',
            },
            expired_at: new Date('2026-05-14T00:00:15.000Z'),
            created_at: new Date('2026-05-14T00:00:00.000Z'),
          },
        ],
      })
      .mockResolvedValueOnce({});

    const result = await generateOperationalSessionQr({
      operationalSessionId: '11111111-1111-4111-8111-111111111111',
      generatedBy: 'assistant-2',
    });

    expect(result.assistantUserId).toBe('assistant-2');
    expect(mockClient.query.mock.calls[2][0]).toContain('generated_by = $2');
    expect(mockClient.query.mock.calls[2][1]).toEqual([
      '11111111-1111-4111-8111-111111111111',
      'assistant-2',
    ]);
  });

  test('should reject generate when requester is not active assistant', async () => {
    mockConductDb.query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            session_status: 'ongoing',
            pic_user_id: 'pic-1',
          },
        ],
      })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] });

    await expect(
      generateOperationalSessionQr({
        operationalSessionId: '11111111-1111-4111-8111-111111111111',
        generatedBy: 'assistant-2',
      })
    ).rejects.toThrow('Only the session PIC or an active assistant can generate the attendance QR');
    expect(mockConductDb.connect).not.toHaveBeenCalled();
  });

  test('should return active QR only for PIC ongoing session', async () => {
    mockConductDb.query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            session_status: 'ongoing',
            pic_user_id: 'pic-1',
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
            qr_data: {
              token: '22222222-2222-4222-8222-222222222222',
              operationalSessionId: '11111111-1111-4111-8111-111111111111',
              type: 'operational_session_attendance',
              expiredAt: '2026-05-14T00:00:15.000Z',
            },
            expired_at: new Date('2026-05-14T00:00:15.000Z'),
            created_at: new Date('2026-05-14T00:00:00.000Z'),
          },
        ],
      });

    const result = await getActiveOperationalSessionQr({
      operationalSessionId: '11111111-1111-4111-8111-111111111111',
      requesterUserId: 'pic-1',
    });

    expect(result.sessionId).toBe('qr-session-1');
    expect(mockConductDb.query.mock.calls[1][0]).toContain('expired_at > NOW()');
  });

  test('should validate active unexpired token', async () => {
    mockConductDb.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        {
          id: 'qr-session-1',
          operational_session_id: '11111111-1111-4111-8111-111111111111',
          qr_token: '22222222-2222-4222-8222-222222222222',
          expired_at: new Date(Date.now() + 10_000),
          is_active: true,
        },
      ],
    });

    const result = await validateOperationalSessionQrToken({
      operationalSessionId: '11111111-1111-4111-8111-111111111111',
      qrToken: '22222222-2222-4222-8222-222222222222',
    });

    expect(result.id).toBe('qr-session-1');
  });

  test('should deactivate expired token during validation', async () => {
    mockConductDb.query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: 'qr-session-expired',
            operational_session_id: '11111111-1111-4111-8111-111111111111',
            qr_token: '22222222-2222-4222-8222-222222222222',
            expired_at: new Date(Date.now() - 5_000),
            is_active: true,
          },
        ],
      })
      .mockResolvedValueOnce({ rowCount: 1 });

    await expect(
      validateOperationalSessionQrToken({
        operationalSessionId: '11111111-1111-4111-8111-111111111111',
        qrToken: '22222222-2222-4222-8222-222222222222',
      })
    ).rejects.toThrow('QR token has expired');

    expect(mockConductDb.query.mock.calls[1][0]).toContain('SET is_active = false');
    expect(mockConductDb.query.mock.calls[1][1]).toEqual(['qr-session-expired']);
  });

  test('should include status active and remainingSeconds in response', async () => {
    const expiredAt = new Date(Date.now() + 12_000);
    mockConductDb.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          session_status: 'ongoing',
          pic_user_id: 'pic-1',
        },
      ],
    });
    mockClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'qr-session-1',
            operational_session_id: '11111111-1111-4111-8111-111111111111',
            qr_token: '22222222-2222-4222-8222-222222222222',
            qr_data: {
              token: '22222222-2222-4222-8222-222222222222',
              operationalSessionId: '11111111-1111-4111-8111-111111111111',
              type: 'operational_session_attendance',
              expiredAt: expiredAt.toISOString(),
            },
            expired_at: expiredAt,
            created_at: new Date(),
          },
        ],
      })
      .mockResolvedValueOnce({});

    const result = await generateOperationalSessionQr({
      operationalSessionId: '11111111-1111-4111-8111-111111111111',
      generatedBy: 'pic-1',
    });

    expect(result.status).toBe('active');
    expect(result.remainingSeconds).toBeGreaterThan(0);
    expect(result.remainingSeconds).toBeLessThanOrEqual(15);
  });
});
