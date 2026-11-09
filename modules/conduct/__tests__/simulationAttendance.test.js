import { jest } from '@jest/globals';

const mockConductDb = {
  query: jest.fn(),
  connect: jest.fn(),
};

const mockUserManagementDb = {
  query: jest.fn(),
};

const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
};

const mockRollingQrService = {
  generateRollingQrToken: jest.fn(),
  validateQrToken: jest.fn(),
  getActiveQrSession: jest.fn(),
  QR_EXPIRY_SECONDS: 15,
};

jest.unstable_mockModule('../../../config/databases.js', () => ({
  conductDb: mockConductDb,
  userManagementDb: mockUserManagementDb,
}));

jest.unstable_mockModule('../../../core/utils/logger.js', () => ({
  logger: mockLogger,
}));

jest.unstable_mockModule('../services/rollingQrService.js', () => mockRollingQrService);

const { scanSimulationAttendance, getSimulationAttendanceList } = await import(
  '../services/simulationService.js'
);

describe('Simulation Attendance - Task #50', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('should record simulation attendance with ip and user agent', async () => {
    const mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };
    mockConductDb.connect.mockResolvedValue(mockClient);

    mockConductDb.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'simulation-1',
          simulation_date: '2026-05-10',
          start_time: '08:00:00',
          status: 'open',
        },
      ],
    });

    mockRollingQrService.validateQrToken.mockResolvedValueOnce({
      id: 'qr-session-1',
    });

    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // existingAttendance
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'attendance-1',
            simulation_id: 'simulation-1',
            scanned_by: 'assistant-1',
            scanned_at: new Date('2026-05-10T01:00:00Z'),
            scanned_ip: '127.0.0.1',
            scanned_user_agent: 'UnitTest-UA',
          },
        ],
      });

    const result = await scanSimulationAttendance({
      simulationId: 'simulation-1',
      qrToken: 'token-1',
      scannedByUserId: 'assistant-1',
      scannedIp: '127.0.0.1',
      scannedUserAgent: 'UnitTest-UA',
    });

    expect(result.attendanceId).toBe('attendance-1');
    expect(result.scannedIp).toBe('127.0.0.1');
    expect(result.scannedUserAgent).toBe('UnitTest-UA');
    expect(mockRollingQrService.validateQrToken).toHaveBeenCalledTimes(1);
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  test('should return alreadyScanned when user already attended', async () => {
    const mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };
    mockConductDb.connect.mockResolvedValue(mockClient);

    mockConductDb.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'simulation-1',
          simulation_date: '2026-05-10',
          start_time: '08:00:00',
          status: 'open',
        },
      ],
    });

    mockRollingQrService.validateQrToken.mockResolvedValueOnce({
      id: 'qr-session-1',
    });

    mockClient.query.mockResolvedValueOnce({
      rows: [{ id: 'attendance-existing' }],
    });

    const result = await scanSimulationAttendance({
      simulationId: 'simulation-1',
      qrToken: 'token-1',
      scannedByUserId: 'assistant-1',
    });

    expect(result.alreadyScanned).toBe(true);
    expect(result.attendanceId).toBe('attendance-existing');
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  test('should include user profile fields in attendance list', async () => {
    mockConductDb.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'attendance-1',
            simulation_id: 'simulation-1',
            scanned_by: 'assistant-1',
            scanned_at: new Date('2026-05-10T01:00:00Z'),
            scanned_ip: '127.0.0.1',
            scanned_user_agent: 'UnitTest-UA',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ total: 1 }] });

    mockUserManagementDb.query.mockResolvedValueOnce({
      rows: [
        {
          user_id: 'assistant-1',
          name: 'Assistant One',
          nipnim: 'A001',
        },
      ],
    });

    const result = await getSimulationAttendanceList({
      simulationId: 'simulation-1',
      limit: 10,
      offset: 0,
    });

    expect(result.attendance).toHaveLength(1);
    expect(result.attendance[0].userName).toBe('Assistant One');
    expect(result.attendance[0].userNipnim).toBe('A001');
    expect(result.pagination.total).toBe(1);
  });
});

