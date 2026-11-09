/**
 * Unit Test: TTLock Temporary Passcode Generation
 * 
 * Test suite untuk memastikan generate temporary passcode dengan start/end date
 * berfungsi dengan baik
 * 
 * Test Cases:
 * 1. Generate temporary passcode dengan date range valid
 * 2. Validation - start date dan end date
 * 3. TTLock Service Integration
 * 4. Database logging
 * 
 * IMPORTANT: 
 * - Database harus running: docker compose up -d
 * - Test ini akan create real passcodes di TTLock API
 * - Passcode akan auto-cleanup setelah test selesai
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

import { ttlockClient } from '../../../services/ttlock/ttlockClient.js';
import { ttlockService } from '../../../services/ttlock/ttlockService.js';

// Import test database config (localhost:5436) instead of production config
import { roomManagementDb } from './testDatabaseConfig.js';

// Helper function untuk delay (menghindari rate limiting)
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper functions untuk database operations menggunakan test database
async function getRoomById(roomId) {
  try {
    const result = await roomManagementDb.query(
      `SELECT * FROM rooms WHERE id = $1`,
      [roomId]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error getting room:', error.message);
    throw error;
  }
}

async function createTemporaryPasscode(roomId, data) {
  // Validate room exists
  const room = await getRoomById(roomId);
  if (!room) {
    throw new Error('Room not found');
  }

  if (!room.door_lock_id) {
    throw new Error('Room does not have a door lock configured');
  }

  // Parse and validate dates
  const startDate = new Date(data.startDate);
  const endDate = new Date(data.endDate);
  const now = new Date();

  // Validate dates
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (startDate < oneDayAgo) {
    throw new Error('Start date must be in the future or recent');
  }

  if (endDate <= startDate) {
    throw new Error('End date must be after start date');
  }

  // Convert to timestamps
  const startTimestamp = startDate.getTime();
  const endTimestamp = endDate.getTime();

  // Create passcode via TTLock
  const ttlockResult = await ttlockService.createTemporaryPasscode(
    room.door_lock_id,
    data.name,
    startTimestamp,
    endTimestamp,
    data.passcode || null
  );

  // Log to database
  const logResult = await roomManagementDb.query(
    `INSERT INTO passcode_logs 
      (room_id, lock_id, passcode_id, passcode_name, passcode_type, start_date, end_date, created_by, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      roomId,
      room.door_lock_id,
      ttlockResult.keyboardPwdId,
      data.name,
      'temporary',
      startDate.toISOString(),
      endDate.toISOString(),
      data.createdBy || 'system',
      JSON.stringify({ 
        passcode: ttlockResult.keyboardPwd,
        startTimestamp: startTimestamp,
        endTimestamp: endTimestamp
      })
    ]
  );

  const log = logResult.rows[0];
  const metadata = log.metadata || {}; // JSONB already parsed by pg driver

  return {
    id: log.id,
    passcodeId: log.passcode_id,
    passcode: metadata.passcode,
    name: log.passcode_name,
    type: log.passcode_type,
    startDate: log.start_date,
    endDate: log.end_date,
    startTimestamp: metadata.startTimestamp,
    endTimestamp: metadata.endTimestamp,
    roomId: log.room_id,
    roomName: room.name,
    lockId: log.lock_id,
    createdAt: log.created_at
  };
}

describe('TTLock Temporary Passcode Generation Tests', () => {
  let accessToken = null;
  let testRoomId = '131deb03-6c33-4505-9a73-630bc740c419'; // Room 1
  let testLockId = 12405430;
  let createdPasscodeIds = []; // Track untuk cleanup

  // Setup: Get access token and verify test room
  beforeAll(async () => {
    try {
      console.log('🔍 Connecting to test database: localhost:5441');
      
      accessToken = await ttlockClient.getAccessToken();
      
      // Verify test room exists using test database
      const room = await getRoomById(testRoomId);
      if (!room) {
        throw new Error('Test room not found. Please run: node modules/room-management/scripts/setup-test-rooms.js');
      }
      
      console.log('✓ Test room found:', room.name, 'Lock ID:', room.door_lock_id);
      testLockId = room.door_lock_id;
    } catch (error) {
      console.error('❌ Setup failed:', error.message);
      throw error;
    }
  });

  // Cleanup: Delete created passcodes
  afterAll(async () => {
    try {
      if (createdPasscodeIds.length > 0) {
        console.log(`\nCleaning up ${createdPasscodeIds.length} passcode(s)...`);
        
        for (const passcodeId of createdPasscodeIds) {
          try {
            await ttlockService.deletePasscode(testLockId, passcodeId);
            console.log('✓ Cleaned up passcode:', passcodeId);
            await delay(1000); // Delay untuk menghindari rate limiting
          } catch (error) {
            console.warn('⚠ Failed to cleanup passcode:', passcodeId, error.message);
          }
        }
      }
      
      // Close database connection
      await roomManagementDb.end();
      console.log('✓ Database connection closed');
    } catch (error) {
      console.error('❌ Cleanup error:', error.message);
    }
  });

  describe('1. Basic Temporary Passcode Generation via TTLock Client', () => {
    test('should generate temporary passcode with valid date range', async () => {
      const now = Date.now();
      // Add random minutes to avoid time conflicts with previous tests
      const randomMinutes = Math.floor(Math.random() * 10) + 5; // 5-15 minutes
      const startDate = now + randomMinutes * 60 * 1000;
      const endDate = now + 7 * 24 * 60 * 60 * 1000; // 7 days from now

      const result = await ttlockClient.createTemporaryPasscode(
        testLockId,
        'Test Temporary - Auto Generated',
        startDate,
        endDate,
        null, // Auto-generate passcode
        accessToken
      );

      expect(result).toBeDefined();
      expect(result.keyboardPwdId).toBeDefined();
      expect(result.keyboardPwd).toBeDefined();
      expect(result.keyboardPwd).toMatch(/^\d{6}$/); // 6-digit passcode
      expect(typeof result.keyboardPwdId).toBe('number');
      
      // Track for cleanup
      createdPasscodeIds.push(result.keyboardPwdId);
      
      // Delay untuk menghindari rate limiting
      await delay(2000);
    });

    test('should generate random 6-digit passcode when not provided', async () => {
      const now = Date.now();
      const startDate = now + 10 * 60 * 1000; // 10 minutes
      const endDate = now + 24 * 60 * 60 * 1000; // 1 day

      const result = await ttlockClient.createTemporaryPasscode(
        testLockId,
        'Test Temporary - Random Passcode',
        startDate,
        endDate,
        null,
        accessToken
      );

      expect(result).toBeDefined();
      expect(result.keyboardPwd).toBeDefined();
      expect(result.keyboardPwd).toMatch(/^\d{6}$/);
      expect(result.keyboardPwd.length).toBe(6);
      
      // Verify it's a valid number
      const passcodeNum = parseInt(result.keyboardPwd);
      expect(passcodeNum).toBeGreaterThanOrEqual(100000);
      expect(passcodeNum).toBeLessThanOrEqual(999999);
      
      createdPasscodeIds.push(result.keyboardPwdId);
      await delay(2000);
    });
  });

  describe('2. Date Range Validation', () => {
    test('should accept start date starting now', async () => {
      const now = Date.now();
      const startDate = now; // Start now
      const endDate = now + 24 * 60 * 60 * 1000; // 1 day

      const result = await ttlockClient.createTemporaryPasscode(
        testLockId,
        'Test Temporary - Start Now',
        startDate,
        endDate,
        null,
        accessToken
      );

      expect(result).toBeDefined();
      expect(result.keyboardPwdId).toBeDefined();
      
      createdPasscodeIds.push(result.keyboardPwdId);
      await delay(2000);
    });

    test('should handle long validity period (30 days)', async () => {
      const now = Date.now();
      const startDate = now + 5 * 60 * 1000; // 5 min
      const endDate = now + 30 * 24 * 60 * 60 * 1000; // 30 days

      const result = await ttlockClient.createTemporaryPasscode(
        testLockId,
        'Test Temporary - 30 Days',
        startDate,
        endDate,
        null,
        accessToken
      );

      expect(result).toBeDefined();
      expect(result.keyboardPwdId).toBeDefined();
      
      createdPasscodeIds.push(result.keyboardPwdId);
      await delay(2000);
    });

    test('should handle short validity period (2 hours)', async () => {
      const now = Date.now();
      const startDate = now + 5 * 60 * 1000; // 5 min
      const endDate = now + 2 * 60 * 60 * 1000; // 2 hours

      const result = await ttlockClient.createTemporaryPasscode(
        testLockId,
        'Test Temporary - 2 Hours',
        startDate,
        endDate,
        null,
        accessToken
      );

      expect(result).toBeDefined();
      expect(result.keyboardPwdId).toBeDefined();
      
      createdPasscodeIds.push(result.keyboardPwdId);
      await delay(2000);
    });
  });

  describe('3. TTLock Service Integration (with Token Caching)', () => {
    test('should create temporary passcode via service', async () => {
      const now = Date.now();
      const startDate = now + 10 * 60 * 1000; // 10 min
      const endDate = now + 7 * 24 * 60 * 60 * 1000; // 7 days

      const result = await ttlockService.createTemporaryPasscode(
        testLockId,
        'Test Temporary - Via Service',
        startDate,
        endDate,
        null
      );

      expect(result).toBeDefined();
      expect(result.keyboardPwdId).toBeDefined();
      expect(result.keyboardPwd).toBeDefined();
      expect(result.keyboardPwd).toMatch(/^\d{6}$/);
      
      createdPasscodeIds.push(result.keyboardPwdId);
      await delay(2000);
    });

    test('should cache access token in service', async () => {
      const now = Date.now();
      
      // Get initial token
      const token1 = await ttlockService.getValidToken();
      
      // Create passcode (should use cached token)
      const result = await ttlockService.createTemporaryPasscode(
        testLockId,
        'Test Temporary - Token Cache',
        now + 15 * 60 * 1000,
        now + 3 * 24 * 60 * 60 * 1000,
        null
      );
      
      // Get token again (should be same as token1)
      const token2 = await ttlockService.getValidToken();

      expect(result).toBeDefined();
      expect(result.keyboardPwdId).toBeDefined();
      expect(token1).toBe(token2); // Should use cached token
      
      createdPasscodeIds.push(result.keyboardPwdId);
      await delay(2000);
    });
  });

  describe('4. Passcode Service with Database Logging', () => {
    test('should create temporary passcode and log to database', async () => {
      const now = new Date();
      const startDate = new Date(now.getTime() + 20 * 60 * 1000); // 20 min
      const endDate = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); // 14 days

      const data = {
        name: 'Test Temporary - Database Log',
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        createdBy: 'test-user-temporary'
      };

      const result = await createTemporaryPasscode(testRoomId, data);

      // Verify result structure
      expect(result).toBeDefined();
      expect(result.id).toBeDefined(); // Database log ID
      expect(result.passcodeId).toBeDefined(); // TTLock passcode ID
      expect(result.passcode).toBeDefined();
      expect(result.passcode).toMatch(/^\d{6}$/);
      expect(result.type).toBe('temporary');
      expect(result.name).toBe(data.name);
      expect(result.roomId).toBe(testRoomId);
      expect(result.lockId).toBe(testLockId);
      expect(result.startDate).toBeDefined();
      expect(result.endDate).toBeDefined();
      expect(result.startTimestamp).toBeDefined();
      expect(result.endTimestamp).toBeDefined();
      expect(result.createdAt).toBeDefined();
      
      // Verify timestamps are in the future
      expect(result.startTimestamp).toBeGreaterThan(Date.now());
      expect(result.endTimestamp).toBeGreaterThan(result.startTimestamp);
      
      createdPasscodeIds.push(result.passcodeId);
      await delay(2000);
    });

    test('should handle WIB to UTC timezone conversion correctly', async () => {
      // WIB is UTC+7 - use tomorrow's date so it's always in the future
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const yyyy = tomorrow.getUTCFullYear();
      const mm = String(tomorrow.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(tomorrow.getUTCDate()).padStart(2, '0');
      const wibStartString = `${yyyy}-${mm}-${dd}T09:00:00+07:00`; // 9 AM WIB
      const wibEndString = `${yyyy}-${mm}-${dd}T17:00:00+07:00`; // 5 PM WIB

      const data = {
        name: 'Test Temporary - Timezone WIB',
        startDate: wibStartString,
        endDate: wibEndString,
        createdBy: 'test-user-timezone'
      };

      const result = await createTemporaryPasscode(testRoomId, data);

      expect(result).toBeDefined();
      expect(result.startTimestamp).toBeDefined();
      expect(result.endTimestamp).toBeDefined();
      
      // Verify timestamps are properly converted
      expect(typeof result.startTimestamp).toBe('number');
      expect(typeof result.endTimestamp).toBe('number');
      expect(result.endTimestamp).toBeGreaterThan(result.startTimestamp);
      
      // Duration should be 8 hours (9 AM to 5 PM)
      const durationHours = (result.endTimestamp - result.startTimestamp) / (60 * 60 * 1000);
      expect(durationHours).toBe(8);
      
      createdPasscodeIds.push(result.passcodeId);
      await delay(2000);
    });
  });

  describe('5. Error Handling for Temporary Passcode', () => {
    test('should validate room exists before creating passcode', async () => {
      const fakeRoomId = '00000000-0000-0000-0000-000000000000';
      const now = new Date();
      const startDate = new Date(now.getTime() + 5 * 60 * 1000);
      const endDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      const data = {
        name: 'Test Invalid Room',
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      };

      await expect(
        createTemporaryPasscode(fakeRoomId, data)
      ).rejects.toThrow('Room not found');
    });

    test('should reject if end date is before start date', async () => {
      const now = new Date();
      const startDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days
      const endDate = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000); // 1 day (before start)

      const data = {
        name: 'Test Invalid Date Range',
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      };

      await expect(
        createTemporaryPasscode(testRoomId, data)
      ).rejects.toThrow('End date must be after start date');
    });

    test('should reject if start date is too far in the past', async () => {
      const now = new Date();
      const startDate = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000); // 3 days ago
      const endDate = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000); // Tomorrow

      const data = {
        name: 'Test Past Start Date',
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      };

      await expect(
        createTemporaryPasscode(testRoomId, data)
      ).rejects.toThrow('Start date must be in the future or recent');
    });

    test('should handle invalid lock ID gracefully', async () => {
      const now = Date.now();
      const startDate = now + 5 * 60 * 1000;
      const endDate = now + 24 * 60 * 60 * 1000;
      const invalidLockId = 99999999;

      await expect(
        ttlockClient.createTemporaryPasscode(
          invalidLockId,
          'Test Invalid Lock',
          startDate,
          endDate,
          null,
          accessToken
        )
      ).rejects.toThrow();
    });

    test('should handle invalid access token gracefully', async () => {
      const now = Date.now();
      const startDate = now + 5 * 60 * 1000;
      const endDate = now + 24 * 60 * 60 * 1000;
      const invalidToken = 'invalid_token_xyz123';

      await expect(
        ttlockClient.createTemporaryPasscode(
          testLockId,
          'Test Invalid Token',
          startDate,
          endDate,
          null,
          invalidToken
        )
      ).rejects.toThrow();
    });
  });

  describe('6. Response Data Structure for Temporary Passcode', () => {
    test('should return complete passcode data from TTLock', async () => {
      const now = Date.now();
      const startDate = now + 30 * 60 * 1000; // 30 min
      const endDate = now + 5 * 24 * 60 * 60 * 1000; // 5 days

      const result = await ttlockClient.createTemporaryPasscode(
        testLockId,
        'Test Temporary - Complete Data',
        startDate,
        endDate,
        null,
        accessToken
      );

      // Verify response structure from TTLock
      expect(result).toHaveProperty('keyboardPwdId');
      expect(result).toHaveProperty('keyboardPwd');
      expect(typeof result.keyboardPwdId).toBe('number');
      expect(typeof result.keyboardPwd).toBe('string');
      expect(result.keyboardPwd).toMatch(/^\d{6}$/);
      
      createdPasscodeIds.push(result.keyboardPwdId);
      await delay(2000);
    });

    test('should return database log with complete metadata', async () => {
      const now = new Date();
      const startDate = new Date(now.getTime() + 40 * 60 * 1000); // 40 min
      const endDate = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000); // 10 days

      const data = {
        name: 'Test Temporary - Metadata',
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        createdBy: 'test-metadata-user'
      };

      const result = await createTemporaryPasscode(testRoomId, data);

      // Verify complete result structure from service
      expect(result).toHaveProperty('id'); // DB log ID
      expect(result).toHaveProperty('passcodeId'); // TTLock ID
      expect(result).toHaveProperty('passcode');
      expect(result).toHaveProperty('name');
      expect(result).toHaveProperty('type');
      expect(result).toHaveProperty('startDate');
      expect(result).toHaveProperty('endDate');
      expect(result).toHaveProperty('startTimestamp');
      expect(result).toHaveProperty('endTimestamp');
      expect(result).toHaveProperty('roomId');
      expect(result).toHaveProperty('roomName');
      expect(result).toHaveProperty('lockId');
      expect(result).toHaveProperty('createdAt');
      
      // Verify type is temporary
      expect(result.type).toBe('temporary');
      
      createdPasscodeIds.push(result.passcodeId);
      await delay(2000);
    });
  });
});
