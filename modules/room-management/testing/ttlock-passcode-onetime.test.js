/**
 * Unit Test: TTLock One-Time Passcode Generation
 * 
 * Test suite untuk memastikan generate one-time passcode (keyboardPwdType=1)
 * berfungsi dengan baik
 * 
 * Test Cases:
 * 1. Generate one-time passcode dengan auto-generated 8-digit code
 * 2. Validation - name field required
 * 3. TTLock Service Integration
 * 4. Database logging
 * 5. Verify passcode properties (8 digits, one-time type, validity period)
 * 6. Verify timestamp rounding (rounded to hour)
 * 
 * IMPORTANT: 
 * - Database harus running: docker compose up -d
 * - Test ini akan create real passcodes di TTLock API
 * - Passcode akan auto-cleanup setelah test selesai
 * - One-time passcode valid untuk 1x penggunaan dalam 6 jam
 * - Smart lock firmware harus up-to-date untuk support one-time via API
 */

// IMPORTANT: Load environment variables FIRST before importing modules
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from project root (3 levels up from testing folder)
dotenv.config({ path: resolve(__dirname, '../../../.env') });

// Verify env vars loaded
console.log('Environment check:', {
  clientId: process.env.TTLOCK_CLIENT_ID ? '✓ Loaded' : '✗ Missing',
  clientSecret: process.env.TTLOCK_CLIENT_SECRET ? '✓ Loaded' : '✗ Missing'
});

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';

// Dynamic import untuk memastikan env vars sudah ter-load
const { ttlockClient } = await import('../../../services/ttlock/ttlockClient.js');
const { ttlockService } = await import('../../../services/ttlock/ttlockService.js');

// Import test database config (localhost:5436) instead of production config
import { roomManagementDb } from './testDatabaseConfig.js';

// Helper function untuk delay (menghindari rate limiting)
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Store created passcode IDs for cleanup
const createdPasscodes = [];

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

async function createOneTimePasscode(roomId, data) {
  // Validate room exists
  const room = await getRoomById(roomId);
  if (!room) {
    throw new Error('Room not found');
  }

  if (!room.door_lock_id) {
    throw new Error('Room does not have a door lock configured');
  }

  // Validate name
  if (!data.name || data.name.trim().length === 0) {
    throw new Error('Passcode name is required');
  }

  if (data.name.length > 100) {
    throw new Error('Passcode name must be less than 100 characters');
  }

  const validityHours = data.validityHours || 6;

  // Create passcode via TTLock
  const ttlockResult = await ttlockService.createOnetimePasscode(
    room.door_lock_id,
    data.name,
    validityHours
  );

  // Calculate timestamps (for database logging)
  const now = new Date();
  now.setMinutes(0, 0, 0); // Round to hour
  const startDate = now;
  const endDate = new Date(now.getTime() + validityHours * 60 * 60 * 1000);

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
      'onetime',
      startDate,
      endDate,
      data.createdBy || null,
      JSON.stringify({
        passcode: ttlockResult.keyboardPwd,
        validityHours: validityHours,
        note: ttlockResult.note
      })
    ]
  );

  return {
    id: logResult.rows[0].id,
    passcodeId: ttlockResult.keyboardPwdId,
    passcode: ttlockResult.keyboardPwd,
    name: data.name,
    type: 'onetime',
    lockId: room.door_lock_id,
    roomId: roomId,
    startDate: startDate,
    endDate: endDate,
    validityHours: validityHours
  };
}

async function getPasscodeLog(logId) {
  try {
    const result = await roomManagementDb.query(
      `SELECT * FROM passcode_logs WHERE id = $1`,
      [logId]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error getting passcode log:', error.message);
    throw error;
  }
}

// ========================================
// TEST SUITE
// ========================================

describe('TTLock One-Time Passcode Generation', () => {
  let testRoomId;
  let accessToken;

  beforeAll(async () => {
    console.log('\n🔧 Setting up test environment...\n');
    
    // Get access token
    try {
      accessToken = await ttlockClient.getAccessToken();
      console.log('✅ TTLock authentication successful');
    } catch (error) {
      console.error('❌ Failed to get access token:', error.message);
      throw error;
    }

    // Get test room (Lab 101)
    try {
      const roomResult = await roomManagementDb.query(
        `SELECT id, name, door_lock_id FROM rooms WHERE name ILIKE '%lab%' LIMIT 1`
      );
      
      if (roomResult.rows.length === 0) {
        throw new Error('No test room found. Please create a room with a lock first.');
      }

      testRoomId = roomResult.rows[0].id;
      console.log(`✅ Test room found: ${roomResult.rows[0].name} (ID: ${testRoomId})`);
      console.log(`   Lock ID: ${roomResult.rows[0].door_lock_id}`);
    } catch (error) {
      console.error('❌ Failed to get test room:', error.message);
      throw error;
    }

    console.log('\n✅ Test environment ready\n');
  });

  afterAll(async () => {
    console.log('\n🧹 Cleaning up test data...\n');

    // Delete created passcodes from TTLock
    if (createdPasscodes.length > 0) {
      console.log(`Deleting ${createdPasscodes.length} test passcode(s) from TTLock...`);
      
      for (const passcodeData of createdPasscodes) {
        try {
          await ttlockService.deletePasscode(passcodeData.lockId, passcodeData.passcodeId);
          console.log(`✅ Deleted passcode: ${passcodeData.name} (ID: ${passcodeData.passcodeId})`);
          await delay(500); // Rate limiting
        } catch (error) {
          console.warn(`⚠️  Failed to delete passcode ${passcodeData.passcodeId}:`, error.message);
        }
      }
    }

    // Close database connection
    await roomManagementDb.end();
    console.log('\n✅ Cleanup complete\n');
  });

  // ========================================
  // TEST 1: Basic One-Time Passcode Generation
  // ========================================
  test('should successfully generate one-time passcode with 8-digit code', async () => {
    console.log('\n🧪 TEST 1: Generate one-time passcode');

    const passcodeData = {
      name: `Test One-Time ${Date.now()}`,
      validityHours: 6
    };

    const result = await createOneTimePasscode(testRoomId, passcodeData);
    
    // Store for cleanup
    createdPasscodes.push({
      passcodeId: result.passcodeId,
      lockId: result.lockId,
      name: result.name
    });

    // Assertions
    expect(result).toBeDefined();
    expect(result.passcodeId).toBeDefined();
    expect(result.passcode).toBeDefined();
    expect(result.type).toBe('onetime');
    
    // Verify 8-digit passcode
    expect(result.passcode).toMatch(/^\d{8}$/);
    expect(result.passcode.length).toBe(8);
    
    console.log(`✅ One-time passcode created: ${result.passcode}`);
    console.log(`   Passcode ID: ${result.passcodeId}`);
    console.log(`   Validity: 6 hours`);
    console.log(`   Start: ${result.startDate.toISOString()}`);
    console.log(`   End: ${result.endDate.toISOString()}`);

    await delay(1000);
  }, 30000); // 30 second timeout

  // ========================================
  // TEST 2: Validation - Name Required
  // ========================================
  test('should fail when name is missing', async () => {
    console.log('\n🧪 TEST 2: Validation - name required');

    const passcodeData = {
      // No name provided
      validityHours: 6
    };

    await expect(createOneTimePasscode(testRoomId, passcodeData))
      .rejects
      .toThrow('Passcode name is required');

    console.log('✅ Validation works correctly');
  });

  // ========================================
  // TEST 3: Validation - Name Too Long
  // ========================================
  test('should fail when name exceeds 100 characters', async () => {
    console.log('\n🧪 TEST 3: Validation - name length limit');

    const longName = 'A'.repeat(101); // 101 characters
    const passcodeData = {
      name: longName,
      validityHours: 6
    };

    await expect(createOneTimePasscode(testRoomId, passcodeData))
      .rejects
      .toThrow('Passcode name must be less than 100 characters');

    console.log('✅ Length validation works correctly');
  });

  // ========================================
  // TEST 4: Database Logging
  // ========================================
  test('should correctly log passcode to database', async () => {
    console.log('\n🧪 TEST 4: Database logging');

    const passcodeData = {
      name: `Test DB Log ${Date.now()}`,
      validityHours: 6
    };

    const result = await createOneTimePasscode(testRoomId, passcodeData);
    
    // Store for cleanup
    createdPasscodes.push({
      passcodeId: result.passcodeId,
      lockId: result.lockId,
      name: result.name
    });

    // Verify database record
    const dbRecord = await getPasscodeLog(result.id);
    
    expect(dbRecord).toBeDefined();
    expect(dbRecord.passcode_id).toBe(result.passcodeId.toString());
    expect(dbRecord.passcode_name).toBe(passcodeData.name);
    expect(dbRecord.passcode_type).toBe('onetime');
    expect(dbRecord.start_date).toBeDefined();
    expect(dbRecord.end_date).toBeDefined();
    
    console.log(`✅ Database record created: ID ${dbRecord.id}`);
    console.log(`   Passcode name: ${dbRecord.passcode_name}`);
    console.log(`   Type: ${dbRecord.passcode_type}`);

    await delay(1000);
  }, 30000);

  // ========================================
  // TEST 5: Timestamp Rounding (Hour Boundary)
  // ========================================
  test('should round startDate to current hour (minutes/seconds/ms = 0)', async () => {
    console.log('\n🧪 TEST 5: Timestamp rounding to hour');

    const passcodeData = {
      name: `Test Timestamp ${Date.now()}`,
      validityHours: 6
    };

    const result = await createOneTimePasscode(testRoomId, passcodeData);
    
    // Store for cleanup
    createdPasscodes.push({
      passcodeId: result.passcodeId,
      lockId: result.lockId,
      name: result.name
    });

    // Verify start date is rounded to hour
    const startDate = new Date(result.startDate);
    expect(startDate.getMinutes()).toBe(0);
    expect(startDate.getSeconds()).toBe(0);
    expect(startDate.getMilliseconds()).toBe(0);
    
    console.log(`✅ Start date rounded to hour: ${startDate.toISOString()}`);
    console.log(`   Minutes: ${startDate.getMinutes()}`);
    console.log(`   Seconds: ${startDate.getSeconds()}`);

    await delay(1000);
  }, 30000);

  // ========================================
  // TEST 6: Custom Validity Hours
  // ========================================
  test('should accept custom validityHours parameter', async () => {
    console.log('\n🧪 TEST 6: Custom validity hours');

    const customHours = 12;
    const passcodeData = {
      name: `Test Custom Hours ${Date.now()}`,
      validityHours: customHours
    };

    const result = await createOneTimePasscode(testRoomId, passcodeData);
    
    // Store for cleanup
    createdPasscodes.push({
      passcodeId: result.passcodeId,
      lockId: result.lockId,
      name: result.name
    });

    // Verify validity period
    expect(result.validityHours).toBe(customHours);
    
    const startTime = new Date(result.startDate).getTime();
    const endTime = new Date(result.endDate).getTime();
    const diffHours = (endTime - startTime) / (1000 * 60 * 60);
    
    expect(diffHours).toBe(customHours);
    
    console.log(`✅ Custom validity hours set: ${customHours} hours`);
    console.log(`   End date: ${result.endDate.toISOString()}`);

    await delay(1000);
  }, 30000);

  // ========================================
  // TEST 7: TTLock Service Integration
  // ========================================
  test('should successfully integrate with TTLock service', async () => {
    console.log('\n🧪 TEST 7: TTLock service integration');

    const room = await getRoomById(testRoomId);
    const passcodeData = {
      name: `Test Service ${Date.now()}`,
      validityHours: 6
    };

    // Direct call to TTLock service
    const result = await ttlockService.createOnetimePasscode(
      room.door_lock_id,
      passcodeData.name,
      passcodeData.validityHours
    );

    // Store for cleanup
    createdPasscodes.push({
      passcodeId: result.keyboardPwdId,
      lockId: room.door_lock_id,
      name: passcodeData.name
    });

    // Assertions
    expect(result).toBeDefined();
    expect(result.keyboardPwdId).toBeDefined();
    expect(result.keyboardPwd).toBeDefined();
    expect(result.keyboardPwd).toMatch(/^\d{8}$/);
    expect(result.type).toBe('onetime');
    
    console.log(`✅ TTLock service integration successful`);
    console.log(`   Passcode: ${result.keyboardPwd}`);
    console.log(`   ID: ${result.keyboardPwdId}`);

    await delay(1000);
  }, 30000);

  // ========================================
  // TEST 8: Default Validity Hours (6 hours)
  // ========================================
  test('should use default 6 hours when validityHours not specified', async () => {
    console.log('\n🧪 TEST 8: Default validity hours');

    const passcodeData = {
      name: `Test Default Hours ${Date.now()}`
      // No validityHours specified - should default to 6
    };

    const result = await createOneTimePasscode(testRoomId, passcodeData);
    
    // Store for cleanup
    createdPasscodes.push({
      passcodeId: result.passcodeId,
      lockId: result.lockId,
      name: result.name
    });

    // Verify default is 6 hours
    expect(result.validityHours).toBe(6);
    
    const startTime = new Date(result.startDate).getTime();
    const endTime = new Date(result.endDate).getTime();
    const diffHours = (endTime - startTime) / (1000 * 60 * 60);
    
    expect(diffHours).toBe(6);
    
    console.log(`✅ Default validity hours applied: 6 hours`);

    await delay(1000);
  }, 30000);
});
