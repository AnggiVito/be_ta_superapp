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

const {
  createOperationalSession,
  joinOperationalSessionViaQr,
  listOperationalSessions,
  reassessActiveAssistantAttendanceStatuses,
  reassessAndPersistActiveAssistantAttendanceStatuses,
  startOperationalSession,
  updateOperationalSessionStatus,
} = await import('../services/practicumOperationalSessionService.js');

describe('Practicum Operational Session Service (#133)', () => {
  function mockUserProfile(userId) {
    mockUserManagementDb.query.mockResolvedValueOnce({
      rows: [{ user_id: userId, nipnim: userId, name: '' }],
    });
  }

  beforeEach(() => {
    jest.resetAllMocks();
    jest.useRealTimers();
  });

  test('should create operational session auto-approved from Registration schedule', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-04T11:45:00+07:00'));
    const scheduleId = '11111111-1111-4111-8111-111111111111';
    mockUserProfile('koor-1');
    mockRegistrationDb.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: scheduleId }] }) // validateRegistrationSchedule
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ '?column?': 1 }] }) // isAssignedScheduleAssistant
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ start_time: new Date('2026-06-04T12:00:00+07:00') }],
      }); // classifyOperationalSessionAttendanceStatus
    mockConductDb.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'session-1',
            registration_schedule_id: scheduleId,
            session_status: 'scheduled',
            approval_status: 'approved',
            pic_user_id: 'koor-1',
          },
        ],
      })
      .mockResolvedValueOnce({}); // activateSessionAssistant insert

    const session = await createOperationalSession({
      creatorUserId: 'koor-1',
      payload: { registration_schedule_id: scheduleId },
    });

    expect(session.approval_status).toBe('approved');
    expect(session.session_status).toBe('scheduled');
    expect(session.pic_user_id).toBe('koor-1');
    expect(mockConductDb.query.mock.calls[0][0]).toContain("'scheduled', 'approved'");
    expect(mockConductDb.query.mock.calls[0][1][0]).toBe(scheduleId);
    expect(mockConductDb.query.mock.calls[1][0]).toContain(
      'practicum_operational_session_active_assistants'
    );
    expect(mockConductDb.query.mock.calls[1][1]).toEqual([
      'session-1',
      'koor-1',
      'pic_open',
      'present',
    ]);
  });

  test('should mark PIC as late when opening session after assistant activation cutoff', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-04T12:30:00+07:00'));
    const scheduleId = '11111111-1111-4111-8111-111111111111';
    mockUserProfile('koor-1');
    mockRegistrationDb.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: scheduleId }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ '?column?': 1 }] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ start_time: new Date('2026-06-04T12:00:00+07:00') }],
      });
    mockConductDb.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'session-late-pic',
            registration_schedule_id: scheduleId,
            session_status: 'scheduled',
            approval_status: 'approved',
            pic_user_id: 'koor-1',
          },
        ],
      })
      .mockResolvedValueOnce({});

    await createOperationalSession({
      creatorUserId: 'koor-1',
      payload: { registration_schedule_id: scheduleId },
    });

    expect(mockConductDb.query.mock.calls[1][1][3]).toBe('late');
  });

  test('should refuse creating session when requester is not assigned to schedule', async () => {
    const scheduleId = '11111111-1111-4111-8111-111111111111';
    mockUserProfile('random-user');
    mockRegistrationDb.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: scheduleId }] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] });

    await expect(
      createOperationalSession({
        creatorUserId: 'random-user',
        payload: { registration_schedule_id: scheduleId },
      })
    ).rejects.toThrow('Only assistants registered for the schedule can open a session');
    expect(mockConductDb.query).not.toHaveBeenCalled();
  });

  test('should activate joining assistant via QR scan as present before assistant cutoff', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-14T06:15:00'));
    mockUserProfile('assistant-2');
    mockConductDb.query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: 'session-1',
            session_status: 'scheduled',
            registration_schedule_id: 'sched-1',
          },
        ],
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: 'qr-session-1',
            expired_at: new Date(Date.now() + 10_000),
            is_active: true,
          },
        ],
      }) // validateActivationQrToken
      .mockResolvedValueOnce({}) // activateSessionAssistant
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 'session-1', session_status: 'scheduled' }],
      });
    mockRegistrationDb.query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ '?column?': 1 }],
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ tanggal: '2026-05-14', jam_mulai: '06:30:00', start_time: null }],
      });

    const result = await joinOperationalSessionViaQr({
      id: 'session-1',
      requesterUserId: 'assistant-2',
      qrToken: '22222222-2222-4222-8222-222222222222',
    });

    expect(result.id).toBe('session-1');
    expect(mockConductDb.query.mock.calls[2][0]).toContain(
      'practicum_operational_session_active_assistants'
    );
    expect(mockConductDb.query.mock.calls[2][1]).toEqual([
      'session-1',
      'assistant-2',
      'qr_scan',
      'present',
    ]);
  });

  test('should activate joining assistant via QR scan as late after assistant cutoff', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-14T06:16:00'));
    mockUserProfile('assistant-2');
    mockConductDb.query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: 'session-1',
            session_status: 'scheduled',
            registration_schedule_id: 'sched-1',
          },
        ],
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: 'qr-session-1',
            expired_at: new Date(Date.now() + 10_000),
            is_active: true,
          },
        ],
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 'session-1', session_status: 'scheduled' }],
      });
    mockRegistrationDb.query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ '?column?': 1 }],
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ tanggal: '2026-05-14', jam_mulai: '06:30:00', start_time: null }],
      });

    await joinOperationalSessionViaQr({
      id: 'session-1',
      requesterUserId: 'assistant-2',
      qrToken: '22222222-2222-4222-8222-222222222222',
    });

    expect(mockConductDb.query.mock.calls[2][1]).toEqual([
      'session-1',
      'assistant-2',
      'qr_scan',
      'late',
    ]);
  });

  test('should activate joining assistant via QR scan as late during ongoing session after assistant cutoff', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-14T06:40:00'));
    mockUserProfile('assistant-2');
    mockConductDb.query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: 'session-1',
            session_status: 'ongoing',
            registration_schedule_id: 'sched-1',
          },
        ],
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: 'qr-session-1',
            expired_at: new Date(Date.now() + 10_000),
            is_active: true,
          },
        ],
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 'session-1', session_status: 'ongoing' }],
      });
    mockRegistrationDb.query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ '?column?': 1 }],
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ tanggal: '2026-05-14', jam_mulai: '06:30:00', start_time: null }],
      });

    await joinOperationalSessionViaQr({
      id: 'session-1',
      requesterUserId: 'assistant-2',
      qrToken: '22222222-2222-4222-8222-222222222222',
    });

    expect(mockConductDb.query.mock.calls[2][1]).toEqual([
      'session-1',
      'assistant-2',
      'qr_scan',
      'late',
    ]);
    jest.useRealTimers();
  });

  test('should activate joining assistant via QR scan as late during ongoing session', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-14T06:46:00'));
    mockUserProfile('assistant-2');
    mockConductDb.query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: 'session-1',
            session_status: 'ongoing',
            registration_schedule_id: 'sched-1',
          },
        ],
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: 'qr-session-1',
            expired_at: new Date(Date.now() + 10_000),
            is_active: true,
          },
        ],
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 'session-1', session_status: 'ongoing' }],
      });
    mockRegistrationDb.query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ '?column?': 1 }],
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ tanggal: '2026-05-14', jam_mulai: '06:30:00', start_time: null }],
      });

    await joinOperationalSessionViaQr({
      id: 'session-1',
      requesterUserId: 'assistant-2',
      qrToken: '22222222-2222-4222-8222-222222222222',
    });

    expect(mockConductDb.query.mock.calls[2][1]).toEqual([
      'session-1',
      'assistant-2',
      'qr_scan',
      'late',
    ]);
    jest.useRealTimers();
  });

  test('should reject join via activation QR when session is completed', async () => {
    mockConductDb.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        {
          id: 'session-1',
          session_status: 'completed',
          registration_schedule_id: 'sched-1',
        },
      ],
    });

    await expect(
      joinOperationalSessionViaQr({
        id: 'session-1',
        requesterUserId: 'assistant-2',
        qrToken: '22222222-2222-4222-8222-222222222222',
      })
    ).rejects.toThrow(
      'Assistant activation QR can only be scanned while the session is scheduled or ongoing'
    );
    expect(mockConductDb.query).toHaveBeenCalledTimes(1);
  });

  test('should reject status change when requester is not PIC', async () => {
    mockConductDb.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        {
          id: 'session-1',
          session_status: 'scheduled',
          approval_status: 'approved',
          pic_user_id: 'assistant-1',
        },
      ],
    });

    await expect(
      updateOperationalSessionStatus({
        id: 'session-1',
        requesterUserId: 'assistant-2',
        targetStatus: 'ongoing',
      })
    ).rejects.toThrow('Only the session PIC can update the status');
  });

  test('should refuse creating session for unknown Registration schedule', async () => {
    const scheduleId = '11111111-1111-4111-8111-111111111111';
    mockRegistrationDb.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    await expect(
      createOperationalSession({
        creatorUserId: 'koor-1',
        payload: { registration_schedule_id: scheduleId },
      })
    ).rejects.toThrow('Registration schedule was not found');
    expect(mockConductDb.query).not.toHaveBeenCalled();
  });

  test('should start approved scheduled session when requester is PIC', async () => {
    mockConductDb.query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: 'session-1',
            session_status: 'scheduled',
            approval_status: 'approved',
            pic_user_id: 'assistant-1',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'session-1', session_status: 'ongoing' }],
      });

    const result = await startOperationalSession({
      id: 'session-1',
      requesterUserId: 'assistant-1',
    });

    expect(result.session_status).toBe('ongoing');
    expect(mockConductDb.query).toHaveBeenCalledTimes(2);
  });

  test('should set lifecycle audit when starting session', async () => {
    mockConductDb.query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: 'session-1',
            session_status: 'scheduled',
            approval_status: 'approved',
            pic_user_id: 'assistant-1',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'session-1',
            session_status: 'ongoing',
            status_changed_by: 'assistant-1',
          },
        ],
      });

    const result = await updateOperationalSessionStatus({
      id: 'session-1',
      requesterUserId: 'assistant-1',
      targetStatus: 'ongoing',
    });

    expect(result.session_status).toBe('ongoing');
    expect(mockConductDb.query.mock.calls[1][0]).toContain('status_changed_by = $3');
    expect(mockConductDb.query.mock.calls[1][0]).toContain('status_changed_at = NOW()');
    expect(mockConductDb.query.mock.calls[1][1]).toEqual([
      'session-1',
      'ongoing',
      'assistant-1',
    ]);
  });

  test('should complete only from ongoing session', async () => {
    mockConductDb.query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: 'session-1',
            session_status: 'ongoing',
            approval_status: 'approved',
            pic_user_id: 'assistant-1',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'session-1', session_status: 'completed' }],
      });

    const result = await updateOperationalSessionStatus({
      id: 'session-1',
      requesterUserId: 'assistant-1',
      targetStatus: 'completed',
    });

    expect(result.session_status).toBe('completed');
  });

  test('should reject completed directly from scheduled session', async () => {
    mockConductDb.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        {
          id: 'session-1',
          session_status: 'scheduled',
          approval_status: 'approved',
        },
      ],
    });

    await expect(
      updateOperationalSessionStatus({
        id: 'session-1',
        requesterUserId: 'assistant-1',
        targetStatus: 'completed',
      })
    ).rejects.toThrow('Invalid session status transition');
  });

  test('should reject terminal completed session transition', async () => {
    mockConductDb.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        {
          id: 'session-1',
          session_status: 'completed',
          approval_status: 'approved',
        },
      ],
    });

    await expect(
      updateOperationalSessionStatus({
        id: 'session-1',
        requesterUserId: 'assistant-1',
        targetStatus: 'ongoing',
      })
    ).rejects.toThrow('Invalid session status transition');
  });

  test('should reject cancelled transition because cancel feature is retired', async () => {
    mockConductDb.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        {
          id: 'session-1',
          session_status: 'scheduled',
          approval_status: 'approved',
        },
      ],
    });

    await expect(
      updateOperationalSessionStatus({
        id: 'session-1',
        requesterUserId: 'assistant-1',
        targetStatus: 'cancelled',
      })
    ).rejects.toThrow('Invalid session status transition');
  });

  test('should only list sessions backed by existing Registration schedules', async () => {
    mockConductDb.query.mockResolvedValueOnce({
      rowCount: 2,
      rows: [
        {
          id: 'session-valid',
          registration_schedule_id: '11111111-1111-4111-8111-111111111111',
        },
        {
          id: 'session-old',
          registration_schedule_id: '22222222-2222-4222-8222-222222222222',
        },
      ],
    });
    mockRegistrationDb.query.mockResolvedValueOnce({
      rows: [{ id: '11111111-1111-4111-8111-111111111111' }],
    });

    const result = await listOperationalSessions({});

    expect(result).toEqual([
      {
        id: 'session-valid',
        registration_schedule_id: '11111111-1111-4111-8111-111111111111',
      },
    ]);
    expect(mockRegistrationDb.query).toHaveBeenCalledTimes(1);
  });

  test('should list sessions for active assistant membership when assistantUserId is provided', async () => {
    mockConductDb.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        {
          id: 'session-joined',
          registration_schedule_id: '11111111-1111-4111-8111-111111111111',
          session_status: 'ongoing',
        },
      ],
    });
    mockRegistrationDb.query.mockResolvedValueOnce({
      rows: [{ id: '11111111-1111-4111-8111-111111111111' }],
    });

    await listOperationalSessions({ assistantUserId: 'assistant-qr-1' });

    expect(mockConductDb.query.mock.calls[0][0]).toContain(
      'practicum_operational_session_active_assistants'
    );
    expect(mockConductDb.query.mock.calls[0][0]).toContain('pic_user_id');
    expect(mockConductDb.query.mock.calls[0][1]).toEqual(['assistant-qr-1']);
  });

  test('reassessActiveAssistantAttendanceStatuses recomputes stored status from activation time', async () => {
    const scheduleId = '11111111-1111-4111-8111-111111111111';
    mockRegistrationDb.query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ start_time: new Date('2026-06-02T08:00:00+07:00') }],
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ start_time: new Date('2026-06-02T08:00:00+07:00') }],
      });

    const result = await reassessActiveAssistantAttendanceStatuses(
      { registration_schedule_id: scheduleId },
      [
        {
          user_id: 'pic-1',
          activation_method: 'pic_open',
          attendance_status: 'present',
          activated_at: new Date('2026-06-02T10:00:00+07:00'),
        },
        {
          user_id: 'assistant-1',
          activation_method: 'qr_scan',
          attendance_status: 'present',
          activated_at: new Date('2026-06-02T10:05:00+07:00'),
        },
      ]
    );

    expect(result[0].attendance_status).toBe('late');
    expect(result[1].attendance_status).toBe('late');
  });

  test('reassessAndPersistActiveAssistantAttendanceStatuses updates stored attendance_status', async () => {
    const scheduleId = '11111111-1111-4111-8111-111111111111';
    mockRegistrationDb.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ start_time: new Date('2026-06-02T08:00:00+07:00') }],
    });
    mockConductDb.query.mockResolvedValueOnce({ rowCount: 1, rows: [] });

    await reassessAndPersistActiveAssistantAttendanceStatuses(
      { id: 'session-persist', registration_schedule_id: scheduleId },
      [
        {
          user_id: 'pic-1',
          activation_method: 'pic_open',
          attendance_status: 'present',
          activated_at: new Date('2026-06-02T10:00:00+07:00'),
        },
      ]
    );

    expect(mockConductDb.query.mock.calls[0][0]).toContain(
      'UPDATE practicum_operational_session_active_assistants'
    );
    expect(mockConductDb.query.mock.calls[0][1]).toEqual(['session-persist', 'pic-1', 'late']);
  });
});
