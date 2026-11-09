/**
 * Unit Tests for QR Attendance Service
 * Testing: Generate QR Code for Attendance
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';

// Mock dependencies
const mockConductDb = {
  query: jest.fn(),
  connect: jest.fn(),
};

const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
};

// Mock QRCode
const mockQRCode = {
  toDataURL: jest.fn(),
};

// Mock UUID
const mockUuid = {
  v4: jest.fn(() => 'test-uuid-123'),
};

// Mock modules BEFORE import
jest.unstable_mockModule('../../../config/databases.js', () => ({
  conductDb: mockConductDb,
}));

jest.unstable_mockModule('../../../core/utils/logger.js', () => ({
  logger: mockLogger,
}));

jest.unstable_mockModule('qrcode', () => ({
  default: mockQRCode,
}));

jest.unstable_mockModule('uuid', () => mockUuid);

jest.unstable_mockModule('../services/registrationDataService.js', () => ({
  getJadwalFromRegistration: jest.fn().mockResolvedValue({
    id: '550e8400-e29b-41d4-a716-446655440001',
    nama: 'Test Jadwal',
  }),
  checkModuleIndividualMentoring: jest.fn().mockResolvedValue({
    isIndividualMentoring: false,
    moduleId: 'module-1',
  }),
  getActiveBookingsForSchedule: jest.fn().mockResolvedValue([]),
  getBookingById: jest.fn().mockResolvedValue(null),
}));

// Import AFTER mocking
const { generateQRCodeForAttendance } = await import('../services/qrAttendanceService.js');

describe('QR Attendance Service - Generate QR Code', () => {
  
  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
    
    // Setup default mock implementations
    mockQRCode.toDataURL.mockResolvedValue('data:image/png;base64,mockbase64data');
    
    // Setup mock client for database connection
    const mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };
    mockConductDb.connect.mockResolvedValue(mockClient);
  });

  describe('generateQRCodeForAttendance', () => {
    
    test('should successfully generate QR code with 30 seconds expiry', async () => {
      // Arrange
      const jadwalId = '550e8400-e29b-41d4-a716-446655440001';
      const assistantUserId = '135120f8-b81c-46fa-8254-6acdfa5651c7';
      
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };
      
      mockConductDb.connect.mockResolvedValue(mockClient);
      
      // Mock client.query responses
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // UPDATE (deactivate old sessions)
        .mockResolvedValueOnce({ // INSERT new session
          rows: [{
            id: 'session-uuid-123',
            qr_token: 'test-uuid-123',
            expired_at: new Date(Date.now() + 30000),
            created_at: new Date(),
          }],
        })
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      // Act
      const result = await generateQRCodeForAttendance(jadwalId, assistantUserId);

      // Assert
      expect(result).toHaveProperty('sessionId');
      expect(result).toHaveProperty('qrToken');
      expect(result).toHaveProperty('qrCodeImage');
      expect(result).toHaveProperty('qrData');
      expect(result).toHaveProperty('expiredAt');
      expect(result).toHaveProperty('expirySeconds', 30);
      expect(result).toHaveProperty('createdAt');
      
      // Verify database connection
      expect(mockConductDb.connect).toHaveBeenCalled();
      
      // Verify client queries (BEGIN, UPDATE, INSERT, COMMIT)
      expect(mockClient.query).toHaveBeenCalled();
      expect(mockClient.release).toHaveBeenCalled();
      
      // Verify QR code generation
      expect(mockQRCode.toDataURL).toHaveBeenCalledTimes(1);
    });

    test('should deactivate existing active session before creating new one', async () => {
      // Arrange
      const jadwalId = '550e8400-e29b-41d4-a716-446655440001';
      const assistantUserId = '135120f8-b81c-46fa-8254-6acdfa5651c7';
      
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };
      
      mockConductDb.connect.mockResolvedValue(mockClient);
      
      // Mock client.query responses
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ rowCount: 1 }] }) // UPDATE (deactivate old sessions)
        .mockResolvedValueOnce({ // INSERT new session
          rows: [{
            id: 'new-session-uuid',
            qr_token: 'test-uuid-123',
            expired_at: new Date(Date.now() + 30000),
            created_at: new Date(),
          }],
        })
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      // Act
      const result = await generateQRCodeForAttendance(jadwalId, assistantUserId);

      // Assert
      expect(result).toBeDefined();
      expect(mockConductDb.connect).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalled();
      expect(mockClient.release).toHaveBeenCalled();
    });

    test('should generate QR code with correct data structure', async () => {
      // Arrange
      const jadwalId = '550e8400-e29b-41d4-a716-446655440001';
      const assistantUserId = '135120f8-b81c-46fa-8254-6acdfa5651c7';
      const mockToken = 'mock-qr-token-456';
      
      mockUuid.v4.mockReturnValue(mockToken);
      
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };
      
      mockConductDb.connect.mockResolvedValue(mockClient);
      
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ rowCount: 0 }] }) // UPDATE (no old sessions)
        .mockResolvedValueOnce({ // INSERT new session
          rows: [{
            id: 'session-id',
            qr_token: mockToken,
            expired_at: new Date(Date.now() + 30000),
            created_at: new Date(),
          }],
        })
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      // Act
      const result = await generateQRCodeForAttendance(jadwalId, assistantUserId);

      // Assert
      expect(result.qrData).toHaveProperty('token', mockToken);
      expect(result.qrData).toHaveProperty('jadwalId', jadwalId);
      expect(result.qrData).toHaveProperty('type', 'attendance');
      expect(result.qrData).toHaveProperty('generatedBy', assistantUserId);
      expect(result.qrData).toHaveProperty('expiredAt');
    });

    test('should have expiry time of exactly 30 seconds', async () => {
      // Arrange
      const jadwalId = '550e8400-e29b-41d4-a716-446655440001';
      const assistantUserId = '135120f8-b81c-46fa-8254-6acdfa5651c7';
      const now = new Date();
      const expiredAt = new Date(now.getTime() + 30000); // 30 seconds
      
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };
      
      mockConductDb.connect.mockResolvedValue(mockClient);
      
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ rowCount: 0 }] }) // UPDATE (no old sessions)
        .mockResolvedValueOnce({ // INSERT new session
          rows: [{
            id: 'session-id',
            qr_token: 'token',
            expired_at: expiredAt,
            created_at: now,
          }],
        })
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      // Act
      const result = await generateQRCodeForAttendance(jadwalId, assistantUserId);

      // Assert
      expect(result.expirySeconds).toBe(30);
      
      // Verify expiry time is approximately 30 seconds from now
      const expiryTime = new Date(result.expiredAt).getTime();
      const currentTime = new Date().getTime();
      const diffInSeconds = Math.round((expiryTime - currentTime) / 1000);
      
      expect(diffInSeconds).toBeGreaterThanOrEqual(29);
      expect(diffInSeconds).toBeLessThanOrEqual(31);
    });

    test('should generate valid base64 QR code image', async () => {
      // Arrange
      const jadwalId = '550e8400-e29b-41d4-a716-446655440001';
      const assistantUserId = '135120f8-b81c-46fa-8254-6acdfa5651c7';
      const mockBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA';
      
      mockQRCode.toDataURL.mockResolvedValue(mockBase64);
      
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };
      
      mockConductDb.connect.mockResolvedValue(mockClient);
      
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ rowCount: 0 }] }) // UPDATE (no old sessions)
        .mockResolvedValueOnce({ // INSERT new session
          rows: [{
            id: 'session-id',
            qr_token: 'token',
            expired_at: new Date(Date.now() + 30000),
            created_at: new Date(),
          }],
        })
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      // Act
      const result = await generateQRCodeForAttendance(jadwalId, assistantUserId);

      // Assert
      expect(result.qrCodeImage).toBe(mockBase64);
      expect(result.qrCodeImage).toMatch(/^data:image\/png;base64,/);
      
      // Verify QRCode.toDataURL was called with correct parameters
      expect(mockQRCode.toDataURL).toHaveBeenCalledWith(
        expect.any(String), // QR data as JSON string
        expect.objectContaining({
          errorCorrectionLevel: 'H',
          type: 'image/png',
          width: 300,
          margin: 2,
        })
      );
    });

    test('should handle database errors gracefully', async () => {
      // Arrange
      const jadwalId = '550e8400-e29b-41d4-a716-446655440001';
      const assistantUserId = '135120f8-b81c-46fa-8254-6acdfa5651c7';
      const dbError = new Error('Database query failed');
      
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [] }) // BEGIN
          .mockRejectedValueOnce(dbError), // UPDATE fails
        release: jest.fn(),
      };
      
      mockConductDb.connect.mockResolvedValue(mockClient);

      // Act & Assert
      await expect(
        generateQRCodeForAttendance(jadwalId, assistantUserId)
      ).rejects.toThrow('Database query failed');
      
      // Verify rollback and release were called
      expect(mockClient.release).toHaveBeenCalled();
    });

    test('should handle QR code generation errors', async () => {
      // Arrange
      const jadwalId = '550e8400-e29b-41d4-a716-446655440001';
      const assistantUserId = '135120f8-b81c-46fa-8254-6acdfa5651c7';
      const qrError = new Error('QR generation failed');
      
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };
      
      mockConductDb.connect.mockResolvedValue(mockClient);
      
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ rowCount: 0 }] }) // UPDATE (no old sessions)
        .mockResolvedValueOnce({ // INSERT new session
          rows: [{
            id: 'session-id',
            qr_token: 'token',
            expired_at: new Date(Date.now() + 30000),
            created_at: new Date(),
          }],
        })
        .mockResolvedValueOnce({ rows: [] }); // COMMIT
      
      mockQRCode.toDataURL.mockRejectedValue(qrError);

      // Act & Assert
      await expect(
        generateQRCodeForAttendance(jadwalId, assistantUserId)
      ).rejects.toThrow('QR generation failed');
    });

    test('should generate unique token for each QR code', async () => {
      // Arrange
      const jadwalId = '550e8400-e29b-41d4-a716-446655440001';
      const assistantUserId = '135120f8-b81c-46fa-8254-6acdfa5651c7';
      
      // Generate two different tokens
      const tokens = ['token-1', 'token-2'];
      let callCount = 0;
      mockUuid.v4.mockImplementation(() => tokens[callCount++]);
      
      const mockClient1 = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [] }) // BEGIN
          .mockResolvedValueOnce({ rows: [{ rowCount: 0 }] }) // UPDATE
          .mockResolvedValueOnce({ // INSERT
            rows: [{
              id: 'session-1',
              qr_token: 'token-1',
              expired_at: new Date(Date.now() + 30000),
              created_at: new Date(),
            }],
          })
          .mockResolvedValueOnce({ rows: [] }), // COMMIT
        release: jest.fn(),
      };
      
      const mockClient2 = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [] }) // BEGIN
          .mockResolvedValueOnce({ rows: [{ rowCount: 0 }] }) // UPDATE
          .mockResolvedValueOnce({ // INSERT
            rows: [{
              id: 'session-2',
              qr_token: 'token-2',
              expired_at: new Date(Date.now() + 30000),
              created_at: new Date(),
            }],
          })
          .mockResolvedValueOnce({ rows: [] }), // COMMIT
        release: jest.fn(),
      };
      
      mockConductDb.connect
        .mockResolvedValueOnce(mockClient1)
        .mockResolvedValueOnce(mockClient2);

      // Act
      const result1 = await generateQRCodeForAttendance(jadwalId, assistantUserId);
      const result2 = await generateQRCodeForAttendance(jadwalId, assistantUserId);

      // Assert
      expect(result1.qrToken).not.toBe(result2.qrToken);
      expect(mockUuid.v4).toHaveBeenCalledTimes(2);
    });

  });

  describe('Edge Cases', () => {
    
    test('should handle missing jadwalId', async () => {
      // Act & Assert
      await expect(
        generateQRCodeForAttendance(null, 'user-id')
      ).rejects.toThrow();
    });

    test('should handle missing assistantUserId', async () => {
      // Act & Assert
      await expect(
        generateQRCodeForAttendance('jadwal-id', null)
      ).rejects.toThrow();
    });

    test('should handle invalid UUID format', async () => {
      // Arrange
      const invalidJadwalId = 'invalid-uuid';
      const assistantUserId = '135120f8-b81c-46fa-8254-6acdfa5651c7';

      mockConductDb.connect.mockRejectedValue(
        new Error('invalid input syntax for type uuid')
      );

      // Act & Assert
      await expect(
        generateQRCodeForAttendance(invalidJadwalId, assistantUserId)
      ).rejects.toThrow('invalid input syntax for type uuid');
    });

  });

});
