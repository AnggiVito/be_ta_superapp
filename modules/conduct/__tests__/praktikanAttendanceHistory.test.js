/**
 * Tests for Praktikan Attendance History Feature
 * Issue #24: Praktikan melihat riwayat kehadiran
 * 
 * Test Coverage:
 * - Fetch attendance history successfully
 * - Filter by praktikumId
 * - Pagination (limit & offset)
 * - Duration calculation
 * - Empty history
 * - Database query validation
 * - Logging
 * - Error handling
 */

import { jest } from '@jest/globals';

// Mock dependencies
const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

const mockConductDb = {
  connect: jest.fn().mockResolvedValue(mockClient),
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

// Setup mocks before importing module
jest.unstable_mockModule('../../../config/databases.js', () => ({
  conductDb: mockConductDb,
  registrationDb: mockRegistrationDb,
  userManagementDb: mockUserManagementDb,
}));

jest.unstable_mockModule('../../../core/utils/logger.js', () => ({
  logger: mockLogger,
}));

// Import service after mocks are set up
const { getAttendanceHistory } = await import('../services/attendanceService.js');

describe('Praktikan Attendance History - Issue #24', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClient.query.mockReset();
    mockConductDb.connect.mockResolvedValue(mockClient);
    mockRegistrationDb.query.mockReset();
    mockUserManagementDb.query.mockReset();
  });

  describe('Fetch Attendance History Successfully', () => {
    test('should return attendance history with check-in and check-out', async () => {
      const userId = 'user-456';
      const filters = { limit: 10, offset: 0 };

      const mockAttendance = [
        {
          id: 'attendance-001',
          jadwal_id: 'jadwal-123',
          user_id: userId,
          status: 'hadir',
          waktu_hadir: new Date('2024-01-15T10:00:00'),
          waktu_keluar: new Date('2024-01-15T12:30:00'),
          keterangan: null,
          created_at: new Date('2024-01-15T10:00:00'),
          updated_at: new Date('2024-01-15T12:30:00'),
        },
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: mockAttendance }) // SELECT attendance
        .mockResolvedValueOnce({ rows: [{ total: '1' }] }); // COUNT

      const result = await getAttendanceHistory(userId, filters);

      expect(result.history).toHaveLength(1);
      expect(result.history[0].id).toBe('attendance-001');
      expect(result.history[0].status).toBe('hadir');
      expect(result.history[0].durationMinutes).toBe(150); // 2.5 hours
      expect(result.pagination.total).toBe(1);
      expect(result.pagination.hasMore).toBe(false);
    });

    test('should return history without check-out (duration null)', async () => {
      const userId = 'user-456';
      const filters = { limit: 10, offset: 0 };

      const mockAttendance = [
        {
          id: 'attendance-002',
          jadwal_id: 'jadwal-124',
          user_id: userId,
          status: 'hadir',
          waktu_hadir: new Date('2024-01-16T10:00:00'),
          waktu_keluar: null, // Not checked out yet
          keterangan: null,
          created_at: new Date('2024-01-16T10:00:00'),
          updated_at: new Date('2024-01-16T10:00:00'),
        },
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: mockAttendance })
        .mockResolvedValueOnce({ rows: [{ total: '1' }] });

      const result = await getAttendanceHistory(userId, filters);

      expect(result.history[0].waktu_keluar).toBeNull();
      expect(result.history[0].durationMinutes).toBeNull();
    });

    test('should return multiple attendance records', async () => {
      const userId = 'user-456';
      const filters = { limit: 10, offset: 0 };

      const mockAttendance = [
        {
          id: 'attendance-001',
          jadwal_id: 'jadwal-123',
          user_id: userId,
          status: 'hadir',
          waktu_hadir: new Date('2024-01-15T10:00:00'),
          waktu_keluar: new Date('2024-01-15T12:00:00'),
          keterangan: null,
          created_at: new Date('2024-01-15T10:00:00'),
          updated_at: new Date('2024-01-15T12:00:00'),
        },
        {
          id: 'attendance-002',
          jadwal_id: 'jadwal-124',
          user_id: userId,
          status: 'terlambat',
          waktu_hadir: new Date('2024-01-14T10:15:00'),
          waktu_keluar: new Date('2024-01-14T12:00:00'),
          keterangan: null,
          created_at: new Date('2024-01-14T10:15:00'),
          updated_at: new Date('2024-01-14T12:00:00'),
        },
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: mockAttendance })
        .mockResolvedValueOnce({ rows: [{ total: '2' }] });

      const result = await getAttendanceHistory(userId, filters);

      expect(result.history).toHaveLength(2);
      expect(result.history[0].status).toBe('hadir');
      expect(result.history[1].status).toBe('terlambat');
    });
  });

  describe('Filter by PraktikumId', () => {
    test('should filter attendance by praktikumId', async () => {
      const userId = 'user-456';
      const filters = {
        praktikumId: 'praktikum-001',
        limit: 10,
        offset: 0,
      };

      const mockAttendance = [
        {
          id: 'attendance-001',
          jadwal_id: 'jadwal-123',
          user_id: userId,
          status: 'hadir',
          waktu_hadir: new Date('2024-01-15T10:00:00'),
          waktu_keluar: new Date('2024-01-15T12:00:00'),
          keterangan: null,
          created_at: new Date('2024-01-15T10:00:00'),
          updated_at: new Date('2024-01-15T12:00:00'),
        },
      ];

      mockRegistrationDb.query.mockResolvedValueOnce({
        rows: [{ id: 'jadwal-123' }],
      });

      mockClient.query
        .mockResolvedValueOnce({ rows: mockAttendance })
        .mockResolvedValueOnce({ rows: [{ total: '1' }] });

      const result = await getAttendanceHistory(userId, filters);

      expect(mockRegistrationDb.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM jadwal'),
        ['praktikum-001']
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('ANY'),
        expect.arrayContaining([userId, ['jadwal-123'], 10, 0])
      );
      expect(result.history).toHaveLength(1);
    });

    test('should work without praktikumId filter', async () => {
      const userId = 'user-456';
      const filters = { limit: 10, offset: 0 };

      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] });

      const result = await getAttendanceHistory(userId, filters);

      expect(mockRegistrationDb.query).not.toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.not.stringContaining('ANY'),
        expect.arrayContaining([userId, 10, 0])
      );
      expect(result.history).toHaveLength(0);
    });
  });

  describe('Pagination', () => {
    test('should apply limit and offset correctly', async () => {
      const userId = 'user-456';
      const filters = { limit: 5, offset: 10 };

      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '20' }] });

      const result = await getAttendanceHistory(userId, filters);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT'),
        expect.arrayContaining([userId, 5, 10])
      );
      expect(result.pagination.limit).toBe(5);
      expect(result.pagination.offset).toBe(10);
      expect(result.pagination.total).toBe(20);
      expect(result.pagination.hasMore).toBe(true);
    });

    test('should use default limit and offset', async () => {
      const userId = 'user-456';
      const filters = {};

      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] });

      const result = await getAttendanceHistory(userId, filters);

      expect(result.pagination.limit).toBe(10); // default
      expect(result.pagination.offset).toBe(0); // default
    });

    test('should set hasMore to false when no more records', async () => {
      const userId = 'user-456';
      const filters = { limit: 10, offset: 0 };

      const mockAttendance = [
        {
          id: 'attendance-001',
          jadwal_id: 'jadwal-123',
          user_id: userId,
          status: 'hadir',
          waktu_hadir: new Date('2024-01-15T10:00:00'),
          waktu_keluar: new Date('2024-01-15T12:00:00'),
          keterangan: null,
          created_at: new Date('2024-01-15T10:00:00'),
          updated_at: new Date('2024-01-15T12:00:00'),
        },
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: mockAttendance })
        .mockResolvedValueOnce({ rows: [{ total: '1' }] });

      const result = await getAttendanceHistory(userId, filters);

      expect(result.pagination.hasMore).toBe(false);
    });
  });

  describe('Duration Calculation', () => {
    test('should calculate short duration (30 minutes)', async () => {
      const userId = 'user-456';
      const filters = { limit: 10, offset: 0 };

      const mockAttendance = [
        {
          id: 'attendance-001',
          jadwal_id: 'jadwal-123',
          user_id: userId,
          status: 'hadir',
          waktu_hadir: new Date('2024-01-15T10:00:00'),
          waktu_keluar: new Date('2024-01-15T10:30:00'),
          keterangan: null,
          created_at: new Date('2024-01-15T10:00:00'),
          updated_at: new Date('2024-01-15T10:30:00'),
        },
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: mockAttendance })
        .mockResolvedValueOnce({ rows: [{ total: '1' }] });

      const result = await getAttendanceHistory(userId, filters);

      expect(result.history[0].durationMinutes).toBe(30);
    });

    test('should calculate long duration (4 hours)', async () => {
      const userId = 'user-456';
      const filters = { limit: 10, offset: 0 };

      const mockAttendance = [
        {
          id: 'attendance-001',
          jadwal_id: 'jadwal-123',
          user_id: userId,
          status: 'hadir',
          waktu_hadir: new Date('2024-01-15T09:00:00'),
          waktu_keluar: new Date('2024-01-15T13:00:00'),
          keterangan: null,
          created_at: new Date('2024-01-15T09:00:00'),
          updated_at: new Date('2024-01-15T13:00:00'),
        },
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: mockAttendance })
        .mockResolvedValueOnce({ rows: [{ total: '1' }] });

      const result = await getAttendanceHistory(userId, filters);

      expect(result.history[0].durationMinutes).toBe(240); // 4 hours
    });

    test('should return null duration when only check-in exists', async () => {
      const userId = 'user-456';
      const filters = { limit: 10, offset: 0 };

      const mockAttendance = [
        {
          id: 'attendance-001',
          jadwal_id: 'jadwal-123',
          user_id: userId,
          status: 'hadir',
          waktu_hadir: new Date('2024-01-15T10:00:00'),
          waktu_keluar: null,
          keterangan: null,
          created_at: new Date('2024-01-15T10:00:00'),
          updated_at: new Date('2024-01-15T10:00:00'),
        },
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: mockAttendance })
        .mockResolvedValueOnce({ rows: [{ total: '1' }] });

      const result = await getAttendanceHistory(userId, filters);

      expect(result.history[0].durationMinutes).toBeNull();
    });
  });

  describe('Empty History', () => {
    test('should return empty array when no attendance records', async () => {
      const userId = 'user-456';
      const filters = { limit: 10, offset: 0 };

      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] });

      const result = await getAttendanceHistory(userId, filters);

      expect(result.history).toEqual([]);
      expect(result.pagination.total).toBe(0);
      expect(result.pagination.hasMore).toBe(false);
    });
  });

  describe('Database Query Validation', () => {
    test('should query with correct parameters', async () => {
      const userId = 'user-456';
      const filters = { limit: 10, offset: 0 };

      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] });

      await getAttendanceHistory(userId, filters);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE a.user_id = $1'),
        expect.arrayContaining([userId, 10, 0])
      );
    });

    test('should exclude deleted records', async () => {
      const userId = 'user-456';
      const filters = { limit: 10, offset: 0 };

      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] });

      await getAttendanceHistory(userId, filters);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('deleted_at IS NULL'),
        expect.any(Array)
      );
    });

    test('should order by created_at DESC', async () => {
      const userId = 'user-456';
      const filters = { limit: 10, offset: 0 };

      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] });

      await getAttendanceHistory(userId, filters);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY a.created_at DESC'),
        expect.any(Array)
      );
    });
  });

  describe('Logging', () => {
    test('should log fetch attempt', async () => {
      const userId = 'user-456';
      const filters = { praktikumId: 'praktikum-001', limit: 10, offset: 0 };

      mockRegistrationDb.query.mockResolvedValueOnce({
        rows: [{ id: 'jadwal-123' }],
      });
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] });

      await getAttendanceHistory(userId, filters);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Fetching attendance history',
        expect.objectContaining({
          userId,
          praktikumId: 'praktikum-001',
          limit: 10,
          offset: 0,
        })
      );
    });

    test('should log successful retrieval', async () => {
      const userId = 'user-456';
      const filters = { limit: 10, offset: 0 };

      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] });

      await getAttendanceHistory(userId, filters);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Attendance history retrieved successfully',
        expect.objectContaining({
          userId,
          count: 0,
          total: 0,
        })
      );
    });
  });

  describe('Error Handling', () => {
    test('should handle database errors', async () => {
      const userId = 'user-456';
      const filters = { limit: 10, offset: 0 };
      const dbError = new Error('Database connection failed');

      mockClient.query.mockRejectedValueOnce(dbError);

      await expect(getAttendanceHistory(userId, filters)).rejects.toThrow(
        'Database connection failed'
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error fetching attendance history:',
        dbError
      );
    });

    test('should release client on error', async () => {
      const userId = 'user-456';
      const filters = { limit: 10, offset: 0 };

      mockClient.query.mockRejectedValueOnce(new Error('Query failed'));

      await expect(getAttendanceHistory(userId, filters)).rejects.toThrow();

      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('Return Value Structure', () => {
    test('should return correct structure with history and pagination', async () => {
      const userId = 'user-456';
      const filters = { limit: 10, offset: 0 };

      const mockAttendance = [
        {
          id: 'attendance-001',
          jadwal_id: 'jadwal-123',
          user_id: userId,
          status: 'hadir',
          waktu_hadir: new Date('2024-01-15T10:00:00'),
          waktu_keluar: new Date('2024-01-15T12:00:00'),
          keterangan: null,
          created_at: new Date('2024-01-15T10:00:00'),
          updated_at: new Date('2024-01-15T12:00:00'),
        },
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: mockAttendance })
        .mockResolvedValueOnce({ rows: [{ total: '5' }] });

      const result = await getAttendanceHistory(userId, filters);

      expect(result).toHaveProperty('history');
      expect(result).toHaveProperty('pagination');
      expect(result.history).toBeInstanceOf(Array);
      expect(result.pagination).toHaveProperty('total');
      expect(result.pagination).toHaveProperty('limit');
      expect(result.pagination).toHaveProperty('offset');
      expect(result.pagination).toHaveProperty('hasMore');
    });

    test('should return complete attendance object', async () => {
      const userId = 'user-456';
      const filters = { limit: 10, offset: 0 };

      const mockAttendance = [
        {
          id: 'attendance-001',
          jadwal_id: 'jadwal-123',
          user_id: userId,
          status: 'hadir',
          waktu_hadir: new Date('2024-01-15T10:00:00'),
          waktu_keluar: new Date('2024-01-15T12:00:00'),
          keterangan: 'Test',
          created_at: new Date('2024-01-15T10:00:00'),
          updated_at: new Date('2024-01-15T12:00:00'),
        },
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: mockAttendance })
        .mockResolvedValueOnce({ rows: [{ total: '1' }] });

      const result = await getAttendanceHistory(userId, filters);

      const attendance = result.history[0];
      expect(attendance).toHaveProperty('id');
      expect(attendance).toHaveProperty('jadwalId');
      expect(attendance).toHaveProperty('userId');
      expect(attendance).toHaveProperty('status');
      expect(attendance).toHaveProperty('waktu_hadir');
      expect(attendance).toHaveProperty('waktu_keluar');
      expect(attendance).toHaveProperty('durationMinutes');
      expect(attendance).toHaveProperty('keterangan');
      expect(attendance).toHaveProperty('createdAt');
      expect(attendance).toHaveProperty('updatedAt');
    });
  });
});
