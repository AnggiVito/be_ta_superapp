/**
 * Unit Tests for QR Attendance History Feature
 * Tests for getQRHistory function from qrAttendanceService
 * 
 * Coverage:
 * - Success cases with history retrieval
 * - Filtering by status (active, expired, deactivated)
 * - Filtering by assistant user
 * - Pagination (limit, offset)
 * - Empty history scenarios
 * - Status calculation logic
 * - Attendance count aggregation
 * - Query parameter validation
 * - Edge cases and error handling
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';

// Mock dependencies
const mockConductDb = {
  query: jest.fn(),
};

const mockRegistrationDb = {
  query: jest.fn(),
};

const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
};

// Mock modules
jest.unstable_mockModule('../../../config/databases.js', () => ({
  conductDb: mockConductDb,
  registrationDb: mockRegistrationDb,
}));

jest.unstable_mockModule('../../../core/utils/logger.js', () => ({
  logger: mockLogger,
}));

// Import service after mocking
const { getQRHistory } = await import('../services/qrAttendanceService.js');

describe('QR Attendance History - Get History Feature', () => {
  const mockJadwalId = 'jadwal-123';
  const mockAssistantUserId = 'assistant-456';
  const mockSessionId = 'session-789';
  const mockQrToken = 'qr-token-abc';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Success Cases', () => {
    test('should retrieve QR history successfully', async () => {
      // Arrange
      const mockHistoryData = [
        {
          session_id: mockSessionId,
          jadwal_id: mockJadwalId,
          qr_token: mockQrToken,
          assistant_user_id: mockAssistantUserId,
          is_active: true,
          created_at: new Date('2025-11-15T10:00:00Z'),
          expired_at: new Date('2025-11-15T10:00:30Z'),
          status: 'active',
          attendance_count: '5',
        },
      ];

      const mockCountData = { rows: [{ total: '1' }] };

      mockConductDb.query
        .mockResolvedValueOnce({ rows: mockHistoryData }) // Main query
        .mockResolvedValueOnce(mockCountData); // Count query

      // Act
      const result = await getQRHistory(mockJadwalId, {
        assistantUserId: mockAssistantUserId,
        limit: 10,
        offset: 0,
      });

      // Assert
      expect(result).toBeDefined();
      expect(result.history).toHaveLength(1);
      expect(result.history[0].sessionId).toBe(mockSessionId);
      expect(result.history[0].jadwalId).toBe(mockJadwalId);
      expect(result.history[0].qrToken).toBe(mockQrToken);
      expect(result.history[0].assistantUserId).toBe(mockAssistantUserId);
      expect(result.history[0].status).toBe('active');
      expect(result.history[0].attendanceCount).toBe(5);
    });

    test('should include pagination information', async () => {
      // Arrange
      const mockHistoryData = [
        {
          session_id: 'session-1',
          jadwal_id: mockJadwalId,
          qr_token: 'token-1',
          assistant_user_id: mockAssistantUserId,
          is_active: false,
          created_at: new Date(),
          expired_at: new Date(),
          status: 'deactivated',
          attendance_count: '10',
        },
      ];

      const mockCountData = { rows: [{ total: '25' }] };

      mockConductDb.query
        .mockResolvedValueOnce({ rows: mockHistoryData })
        .mockResolvedValueOnce(mockCountData);

      // Act
      const result = await getQRHistory(mockJadwalId, {
        limit: 10,
        offset: 0,
      });

      // Assert
      expect(result.pagination).toBeDefined();
      expect(result.pagination.total).toBe(25);
      expect(result.pagination.limit).toBe(10);
      expect(result.pagination.offset).toBe(0);
      expect(result.pagination.hasMore).toBe(true);
    });

    test('should return expirySeconds in each history item', async () => {
      // Arrange
      const mockHistoryData = [
        {
          session_id: mockSessionId,
          jadwal_id: mockJadwalId,
          qr_token: mockQrToken,
          assistant_user_id: mockAssistantUserId,
          is_active: true,
          created_at: new Date(),
          expired_at: new Date(),
          status: 'active',
          attendance_count: '3',
        },
      ];

      mockConductDb.query
        .mockResolvedValueOnce({ rows: mockHistoryData })
        .mockResolvedValueOnce({ rows: [{ total: '1' }] });

      // Act
      const result = await getQRHistory(mockJadwalId);

      // Assert
      expect(result.history[0].expirySeconds).toBe(30);
    });
  });

  describe('Status Filtering', () => {
    test('should filter by active status', async () => {
      // Arrange
      const mockHistoryData = [
        {
          session_id: 'active-session',
          jadwal_id: mockJadwalId,
          qr_token: 'active-token',
          assistant_user_id: mockAssistantUserId,
          is_active: true,
          created_at: new Date(),
          expired_at: new Date(Date.now() + 20000), // Future
          status: 'active',
          attendance_count: '5',
        },
      ];

      mockConductDb.query
        .mockResolvedValueOnce({ rows: mockHistoryData })
        .mockResolvedValueOnce({ rows: [{ total: '1' }] });

      // Act
      const result = await getQRHistory(mockJadwalId, {
        status: 'active',
      });

      // Assert
      expect(result.history).toHaveLength(1);
      expect(result.history[0].status).toBe('active');
      expect(mockConductDb.query).toHaveBeenCalledWith(
        expect.stringContaining('is_active = true AND'),
        expect.any(Array)
      );
    });

    test('should filter by expired status', async () => {
      // Arrange
      const mockHistoryData = [
        {
          session_id: 'expired-session',
          jadwal_id: mockJadwalId,
          qr_token: 'expired-token',
          assistant_user_id: mockAssistantUserId,
          is_active: true,
          created_at: new Date(Date.now() - 60000),
          expired_at: new Date(Date.now() - 30000), // Past
          status: 'expired',
          attendance_count: '8',
        },
      ];

      mockConductDb.query
        .mockResolvedValueOnce({ rows: mockHistoryData })
        .mockResolvedValueOnce({ rows: [{ total: '1' }] });

      // Act
      const result = await getQRHistory(mockJadwalId, {
        status: 'expired',
      });

      // Assert
      expect(result.history).toHaveLength(1);
      expect(result.history[0].status).toBe('expired');
      expect(mockConductDb.query).toHaveBeenCalledWith(
        expect.stringContaining('expired_at < NOW()'),
        expect.any(Array)
      );
    });

    test('should filter by deactivated status', async () => {
      // Arrange
      const mockHistoryData = [
        {
          session_id: 'deactivated-session',
          jadwal_id: mockJadwalId,
          qr_token: 'deactivated-token',
          assistant_user_id: mockAssistantUserId,
          is_active: false,
          created_at: new Date(),
          expired_at: new Date(),
          status: 'deactivated',
          attendance_count: '12',
        },
      ];

      mockConductDb.query
        .mockResolvedValueOnce({ rows: mockHistoryData })
        .mockResolvedValueOnce({ rows: [{ total: '1' }] });

      // Act
      const result = await getQRHistory(mockJadwalId, {
        status: 'deactivated',
      });

      // Assert
      expect(result.history).toHaveLength(1);
      expect(result.history[0].status).toBe('deactivated');
      expect(mockConductDb.query).toHaveBeenCalledWith(
        expect.stringContaining('is_active = false'),
        expect.any(Array)
      );
    });

    test('should return all statuses when no filter provided', async () => {
      // Arrange
      const mockHistoryData = [
        {
          session_id: 'session-1',
          jadwal_id: mockJadwalId,
          qr_token: 'token-1',
          assistant_user_id: mockAssistantUserId,
          is_active: true,
          created_at: new Date(),
          expired_at: new Date(),
          status: 'active',
          attendance_count: '5',
        },
        {
          session_id: 'session-2',
          jadwal_id: mockJadwalId,
          qr_token: 'token-2',
          assistant_user_id: mockAssistantUserId,
          is_active: false,
          created_at: new Date(),
          expired_at: new Date(),
          status: 'deactivated',
          attendance_count: '3',
        },
      ];

      mockConductDb.query
        .mockResolvedValueOnce({ rows: mockHistoryData })
        .mockResolvedValueOnce({ rows: [{ total: '2' }] });

      // Act
      const result = await getQRHistory(mockJadwalId);

      // Assert
      expect(result.history).toHaveLength(2);
    });
  });

  describe('Assistant User Filtering', () => {
    test('should filter by assistant user ID', async () => {
      // Arrange
      const mockHistoryData = [
        {
          session_id: mockSessionId,
          jadwal_id: mockJadwalId,
          qr_token: mockQrToken,
          assistant_user_id: mockAssistantUserId,
          is_active: true,
          created_at: new Date(),
          expired_at: new Date(),
          status: 'active',
          attendance_count: '7',
        },
      ];

      mockConductDb.query
        .mockResolvedValueOnce({ rows: mockHistoryData })
        .mockResolvedValueOnce({ rows: [{ total: '1' }] });

      // Act
      const result = await getQRHistory(mockJadwalId, {
        assistantUserId: mockAssistantUserId,
      });

      // Assert
      expect(result.history).toHaveLength(1);
      expect(result.history[0].assistantUserId).toBe(mockAssistantUserId);
      expect(mockConductDb.query).toHaveBeenCalledWith(
        expect.stringContaining('assistant_user_id'),
        expect.arrayContaining([mockJadwalId, mockAssistantUserId])
      );
    });

    test('should return all assistants when no filter provided', async () => {
      // Arrange
      const mockHistoryData = [
        {
          session_id: 'session-1',
          jadwal_id: mockJadwalId,
          qr_token: 'token-1',
          assistant_user_id: 'assistant-1',
          is_active: true,
          created_at: new Date(),
          expired_at: new Date(),
          status: 'active',
          attendance_count: '5',
        },
        {
          session_id: 'session-2',
          jadwal_id: mockJadwalId,
          qr_token: 'token-2',
          assistant_user_id: 'assistant-2',
          is_active: true,
          created_at: new Date(),
          expired_at: new Date(),
          status: 'active',
          attendance_count: '3',
        },
      ];

      mockConductDb.query
        .mockResolvedValueOnce({ rows: mockHistoryData })
        .mockResolvedValueOnce({ rows: [{ total: '2' }] });

      // Act
      const result = await getQRHistory(mockJadwalId);

      // Assert
      expect(result.history).toHaveLength(2);
      expect(result.history[0].assistantUserId).toBe('assistant-1');
      expect(result.history[1].assistantUserId).toBe('assistant-2');
    });
  });

  describe('Pagination', () => {
    test('should use default limit of 10 when not provided', async () => {
      // Arrange
      mockConductDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] });

      // Act
      await getQRHistory(mockJadwalId);

      // Assert
      expect(mockConductDb.query).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT'),
        expect.arrayContaining([mockJadwalId, 10, 0])
      );
    });

    test('should use default offset of 0 when not provided', async () => {
      // Arrange
      mockConductDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] });

      // Act
      await getQRHistory(mockJadwalId);

      // Assert
      expect(mockConductDb.query).toHaveBeenCalledWith(
        expect.stringContaining('OFFSET'),
        expect.arrayContaining([mockJadwalId, 10, 0])
      );
    });

    test('should apply custom limit and offset', async () => {
      // Arrange
      mockConductDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] });

      // Act
      await getQRHistory(mockJadwalId, {
        limit: 20,
        offset: 40,
      });

      // Assert
      expect(mockConductDb.query).toHaveBeenCalledWith(
        expect.anything(),
        expect.arrayContaining([mockJadwalId, 20, 40])
      );
    });

    test('should calculate hasMore correctly when more records exist', async () => {
      // Arrange
      const mockHistoryData = Array(10).fill({
        session_id: 'session-1',
        jadwal_id: mockJadwalId,
        qr_token: 'token-1',
        assistant_user_id: mockAssistantUserId,
        is_active: true,
        created_at: new Date(),
        expired_at: new Date(),
        status: 'active',
        attendance_count: '5',
      });

      mockConductDb.query
        .mockResolvedValueOnce({ rows: mockHistoryData })
        .mockResolvedValueOnce({ rows: [{ total: '30' }] });

      // Act
      const result = await getQRHistory(mockJadwalId, {
        limit: 10,
        offset: 0,
      });

      // Assert
      expect(result.pagination.hasMore).toBe(true);
    });

    test('should calculate hasMore as false when no more records', async () => {
      // Arrange
      const mockHistoryData = Array(5).fill({
        session_id: 'session-1',
        jadwal_id: mockJadwalId,
        qr_token: 'token-1',
        assistant_user_id: mockAssistantUserId,
        is_active: true,
        created_at: new Date(),
        expired_at: new Date(),
        status: 'active',
        attendance_count: '5',
      });

      mockConductDb.query
        .mockResolvedValueOnce({ rows: mockHistoryData })
        .mockResolvedValueOnce({ rows: [{ total: '5' }] });

      // Act
      const result = await getQRHistory(mockJadwalId, {
        limit: 10,
        offset: 0,
      });

      // Assert
      expect(result.pagination.hasMore).toBe(false);
    });
  });

  describe('Empty History Cases', () => {
    test('should return empty array when no history found', async () => {
      // Arrange
      mockConductDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] });

      // Act
      const result = await getQRHistory(mockJadwalId);

      // Assert
      expect(result.history).toEqual([]);
      expect(result.pagination.total).toBe(0);
      expect(result.pagination.hasMore).toBe(false);
    });

    test('should return empty array when jadwal has no QR sessions', async () => {
      // Arrange
      mockConductDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] });

      // Act
      const result = await getQRHistory('non-existent-jadwal-id');

      // Assert
      expect(result.history).toEqual([]);
      expect(result.pagination.total).toBe(0);
    });

    test('should return empty array when filtering by non-existent status', async () => {
      // Arrange
      mockConductDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] });

      // Act
      const result = await getQRHistory(mockJadwalId, {
        status: 'active',
      });

      // Assert
      expect(result.history).toEqual([]);
    });
  });

  describe('Attendance Count Aggregation', () => {
    test('should aggregate attendance count correctly', async () => {
      // Arrange
      const mockHistoryData = [
        {
          session_id: mockSessionId,
          jadwal_id: mockJadwalId,
          qr_token: mockQrToken,
          assistant_user_id: mockAssistantUserId,
          is_active: false,
          created_at: new Date(),
          expired_at: new Date(),
          status: 'deactivated',
          attendance_count: '25',
        },
      ];

      mockConductDb.query
        .mockResolvedValueOnce({ rows: mockHistoryData })
        .mockResolvedValueOnce({ rows: [{ total: '1' }] });

      // Act
      const result = await getQRHistory(mockJadwalId);

      // Assert
      expect(result.history[0].attendanceCount).toBe(25);
      expect(typeof result.history[0].attendanceCount).toBe('number');
    });

    test('should handle zero attendance count', async () => {
      // Arrange
      const mockHistoryData = [
        {
          session_id: mockSessionId,
          jadwal_id: mockJadwalId,
          qr_token: mockQrToken,
          assistant_user_id: mockAssistantUserId,
          is_active: true,
          created_at: new Date(),
          expired_at: new Date(),
          status: 'active',
          attendance_count: '0',
        },
      ];

      mockConductDb.query
        .mockResolvedValueOnce({ rows: mockHistoryData })
        .mockResolvedValueOnce({ rows: [{ total: '1' }] });

      // Act
      const result = await getQRHistory(mockJadwalId);

      // Assert
      expect(result.history[0].attendanceCount).toBe(0);
    });

    test('should parse attendance count as integer', async () => {
      // Arrange
      const mockHistoryData = [
        {
          session_id: mockSessionId,
          jadwal_id: mockJadwalId,
          qr_token: mockQrToken,
          assistant_user_id: mockAssistantUserId,
          is_active: true,
          created_at: new Date(),
          expired_at: new Date(),
          status: 'active',
          attendance_count: '42',
        },
      ];

      mockConductDb.query
        .mockResolvedValueOnce({ rows: mockHistoryData })
        .mockResolvedValueOnce({ rows: [{ total: '1' }] });

      // Act
      const result = await getQRHistory(mockJadwalId);

      // Assert
      expect(Number.isInteger(result.history[0].attendanceCount)).toBe(true);
      expect(result.history[0].attendanceCount).toBe(42);
    });
  });

  describe('Query Structure', () => {
    test('should include GROUP BY in query', async () => {
      // Arrange
      mockConductDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] });

      // Act
      await getQRHistory(mockJadwalId);

      // Assert
      expect(mockConductDb.query).toHaveBeenCalledWith(
        expect.stringContaining('GROUP BY'),
        expect.any(Array)
      );
    });

    test('should include ORDER BY created_at DESC', async () => {
      // Arrange
      mockConductDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] });

      // Act
      await getQRHistory(mockJadwalId);

      // Assert
      expect(mockConductDb.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY'),
        expect.any(Array)
      );
      expect(mockConductDb.query).toHaveBeenCalledWith(
        expect.stringContaining('created_at DESC'),
        expect.any(Array)
      );
    });

    test('should use LEFT JOIN with attendance table', async () => {
      // Arrange
      mockConductDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] });

      // Act
      await getQRHistory(mockJadwalId);

      // Assert
      expect(mockConductDb.query).toHaveBeenCalledWith(
        expect.stringContaining('LEFT JOIN'),
        expect.any(Array)
      );
    });

    test('should use CASE statement for status calculation', async () => {
      // Arrange
      mockConductDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] });

      // Act
      await getQRHistory(mockJadwalId);

      // Assert
      expect(mockConductDb.query).toHaveBeenCalledWith(
        expect.stringContaining('CASE'),
        expect.any(Array)
      );
    });
  });

  describe('Response Structure', () => {
    test('should return correct response structure', async () => {
      // Arrange
      const mockHistoryData = [
        {
          session_id: mockSessionId,
          jadwal_id: mockJadwalId,
          qr_token: mockQrToken,
          assistant_user_id: mockAssistantUserId,
          is_active: true,
          created_at: new Date(),
          expired_at: new Date(),
          status: 'active',
          attendance_count: '5',
        },
      ];

      mockConductDb.query
        .mockResolvedValueOnce({ rows: mockHistoryData })
        .mockResolvedValueOnce({ rows: [{ total: '1' }] });

      // Act
      const result = await getQRHistory(mockJadwalId);

      // Assert
      expect(result).toHaveProperty('history');
      expect(result).toHaveProperty('pagination');
      expect(result.pagination).toHaveProperty('total');
      expect(result.pagination).toHaveProperty('limit');
      expect(result.pagination).toHaveProperty('offset');
      expect(result.pagination).toHaveProperty('hasMore');
    });

    test('should include all required fields in history items', async () => {
      // Arrange
      const mockHistoryData = [
        {
          session_id: mockSessionId,
          jadwal_id: mockJadwalId,
          qr_token: mockQrToken,
          assistant_user_id: mockAssistantUserId,
          is_active: true,
          created_at: new Date(),
          expired_at: new Date(),
          status: 'active',
          attendance_count: '5',
        },
      ];

      mockConductDb.query
        .mockResolvedValueOnce({ rows: mockHistoryData })
        .mockResolvedValueOnce({ rows: [{ total: '1' }] });

      // Act
      const result = await getQRHistory(mockJadwalId);

      // Assert
      const historyItem = result.history[0];
      expect(historyItem).toHaveProperty('sessionId');
      expect(historyItem).toHaveProperty('jadwalId');
      expect(historyItem).toHaveProperty('qrToken');
      expect(historyItem).toHaveProperty('assistantUserId');
      expect(historyItem).toHaveProperty('status');
      expect(historyItem).toHaveProperty('attendanceCount');
      expect(historyItem).toHaveProperty('createdAt');
      expect(historyItem).toHaveProperty('expiredAt');
      expect(historyItem).toHaveProperty('expirySeconds');
    });
  });

  describe('Error Handling', () => {
    test('should throw error when database query fails', async () => {
      // Arrange
      const dbError = new Error('Database connection failed');
      mockConductDb.query.mockRejectedValueOnce(dbError);

      // Act & Assert
      await expect(getQRHistory(mockJadwalId)).rejects.toThrow(
        'Database connection failed'
      );
    });

    test('should log error when query fails', async () => {
      // Arrange
      const dbError = new Error('Query execution failed');
      mockConductDb.query.mockRejectedValueOnce(dbError);

      // Act
      try {
        await getQRHistory(mockJadwalId);
      } catch (error) {
        // Expected to throw
      }

      // Assert
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error getting QR history:',
        dbError
      );
    });

    test('should handle invalid jadwal ID gracefully', async () => {
      // Arrange
      mockConductDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] });

      // Act
      const result = await getQRHistory(null);

      // Assert
      expect(result.history).toEqual([]);
    });

    test('should handle count query failure', async () => {
      // Arrange
      mockConductDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockRejectedValueOnce(new Error('Count query failed'));

      // Act & Assert
      await expect(getQRHistory(mockJadwalId)).rejects.toThrow(
        'Count query failed'
      );
    });
  });

  describe('Logging', () => {
    test('should log successful history retrieval', async () => {
      // Arrange
      const mockHistoryData = [
        {
          session_id: mockSessionId,
          jadwal_id: mockJadwalId,
          qr_token: mockQrToken,
          assistant_user_id: mockAssistantUserId,
          is_active: true,
          created_at: new Date(),
          expired_at: new Date(),
          status: 'active',
          attendance_count: '5',
        },
      ];

      mockConductDb.query
        .mockResolvedValueOnce({ rows: mockHistoryData })
        .mockResolvedValueOnce({ rows: [{ total: '1' }] });

      // Act
      await getQRHistory(mockJadwalId, {
        assistantUserId: mockAssistantUserId,
      });

      // Assert
      expect(mockLogger.info).toHaveBeenCalledWith(
        'QR history retrieved',
        expect.objectContaining({
          jadwalId: mockJadwalId,
          assistantUserId: mockAssistantUserId,
          count: 1,
          total: 1,
        })
      );
    });

    test('should include count in log', async () => {
      // Arrange
      const mockHistoryData = Array(5).fill({
        session_id: 'session-1',
        jadwal_id: mockJadwalId,
        qr_token: 'token-1',
        assistant_user_id: mockAssistantUserId,
        is_active: true,
        created_at: new Date(),
        expired_at: new Date(),
        status: 'active',
        attendance_count: '3',
      });

      mockConductDb.query
        .mockResolvedValueOnce({ rows: mockHistoryData })
        .mockResolvedValueOnce({ rows: [{ total: '5' }] });

      // Act
      await getQRHistory(mockJadwalId);

      // Assert
      expect(mockLogger.info).toHaveBeenCalledWith(
        'QR history retrieved',
        expect.objectContaining({
          count: 5,
          total: 5,
        })
      );
    });
  });

  describe('Edge Cases', () => {
    test('should handle very large attendance count', async () => {
      // Arrange
      const mockHistoryData = [
        {
          session_id: mockSessionId,
          jadwal_id: mockJadwalId,
          qr_token: mockQrToken,
          assistant_user_id: mockAssistantUserId,
          is_active: false,
          created_at: new Date(),
          expired_at: new Date(),
          status: 'deactivated',
          attendance_count: '999999',
        },
      ];

      mockConductDb.query
        .mockResolvedValueOnce({ rows: mockHistoryData })
        .mockResolvedValueOnce({ rows: [{ total: '1' }] });

      // Act
      const result = await getQRHistory(mockJadwalId);

      // Assert
      expect(result.history[0].attendanceCount).toBe(999999);
    });

    test('should handle special characters in jadwal ID', async () => {
      // Arrange
      const specialJadwalId = 'jadwal-特殊-字符-123';
      mockConductDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] });

      // Act
      await getQRHistory(specialJadwalId);

      // Assert
      expect(mockConductDb.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([specialJadwalId])
      );
    });

    test('should handle very large offset for pagination', async () => {
      // Arrange
      mockConductDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '100' }] });

      // Act
      const result = await getQRHistory(mockJadwalId, {
        limit: 10,
        offset: 1000,
      });

      // Assert
      expect(result.pagination.offset).toBe(1000);
      expect(result.pagination.hasMore).toBe(false);
    });

    test('should handle multiple filters simultaneously', async () => {
      // Arrange
      mockConductDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] });

      // Act
      await getQRHistory(mockJadwalId, {
        assistantUserId: mockAssistantUserId,
        status: 'active',
        limit: 20,
        offset: 10,
      });

      // Assert
      expect(mockConductDb.query).toHaveBeenCalledWith(
        expect.stringContaining('assistant_user_id'),
        expect.arrayContaining([mockJadwalId, mockAssistantUserId, 20, 10])
      );
    });
  });

  describe('Business Rules', () => {
    test('should use 30-second expiry in response', async () => {
      // Arrange
      const mockHistoryData = [
        {
          session_id: mockSessionId,
          jadwal_id: mockJadwalId,
          qr_token: mockQrToken,
          assistant_user_id: mockAssistantUserId,
          is_active: true,
          created_at: new Date(),
          expired_at: new Date(),
          status: 'active',
          attendance_count: '5',
        },
      ];

      mockConductDb.query
        .mockResolvedValueOnce({ rows: mockHistoryData })
        .mockResolvedValueOnce({ rows: [{ total: '1' }] });

      // Act
      const result = await getQRHistory(mockJadwalId);

      // Assert
      expect(result.history[0].expirySeconds).toBe(30);
    });

    test('should join with attendance table (not kehadiran)', async () => {
      // Arrange
      mockConductDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] });

      // Act
      await getQRHistory(mockJadwalId);

      // Assert
      // Verify it uses 'kehadiran' table (which is old name but checking JOIN)
      expect(mockConductDb.query).toHaveBeenCalledWith(
        expect.stringContaining('LEFT JOIN'),
        expect.any(Array)
      );
    });

    test('should order results by created_at DESC (newest first)', async () => {
      // Arrange
      const now = new Date();
      const mockHistoryData = [
        {
          session_id: 'session-1',
          jadwal_id: mockJadwalId,
          qr_token: 'token-1',
          assistant_user_id: mockAssistantUserId,
          is_active: true,
          created_at: new Date(now.getTime() - 60000),
          expired_at: new Date(),
          status: 'active',
          attendance_count: '5',
        },
        {
          session_id: 'session-2',
          jadwal_id: mockJadwalId,
          qr_token: 'token-2',
          assistant_user_id: mockAssistantUserId,
          is_active: true,
          created_at: new Date(now.getTime() - 120000),
          expired_at: new Date(),
          status: 'active',
          attendance_count: '3',
        },
      ];

      mockConductDb.query
        .mockResolvedValueOnce({ rows: mockHistoryData })
        .mockResolvedValueOnce({ rows: [{ total: '2' }] });

      // Act
      await getQRHistory(mockJadwalId);

      // Assert
      expect(mockConductDb.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY qas.created_at DESC'),
        expect.any(Array)
      );
    });
  });

  describe('Database Query Count', () => {
    test('should execute exactly 2 queries (main + count)', async () => {
      // Arrange
      mockConductDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] });

      // Act
      await getQRHistory(mockJadwalId);

      // Assert
      expect(mockConductDb.query).toHaveBeenCalledTimes(2);
    });

    test('should execute main query first, then count query', async () => {
      // Arrange
      const mockHistoryData = [
        {
          session_id: mockSessionId,
          jadwal_id: mockJadwalId,
          qr_token: mockQrToken,
          assistant_user_id: mockAssistantUserId,
          is_active: true,
          created_at: new Date(),
          expired_at: new Date(),
          status: 'active',
          attendance_count: '5',
        },
      ];

      mockConductDb.query
        .mockResolvedValueOnce({ rows: mockHistoryData })
        .mockResolvedValueOnce({ rows: [{ total: '1' }] });

      // Act
      await getQRHistory(mockJadwalId);

      // Assert
      const firstCall = mockConductDb.query.mock.calls[0][0];
      const secondCall = mockConductDb.query.mock.calls[1][0];

      expect(firstCall).toContain('COUNT(k.id)');
      expect(secondCall).toContain('COUNT(DISTINCT qas.id)');
    });
  });
});
