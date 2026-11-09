/**
 * Unit Test: TTLock Permanent Passcode Generation
 * 
 * Test suite untuk memastikan generate permanent passcode (keyboardPwdType=2)
 * berfungsi dengan baik
 * 
 * Test Cases:
 * 1. Generate permanent passcode dengan auto-generated 8-digit code
 * 2. Validation - name field required
 * 3. TTLock Service Integration
 * 4. Database logging
 * 5. Verify passcode properties (8 digits, permanent type)
 * 
 * IMPORTANT: 
 * - Database harus running: docker compose up -d
 * - Test ini akan create real passcodes di TTLock API
 * - Passcode akan auto-cleanup setelah test selesai
 * - Passcode harus digunakan dalam 24 jam untuk menjadi permanent
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

async function createPermanentPasscode(roomId, data) {
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

  // Create passcode via TTLock
  const ttlockResult = await ttlockService.createPermanentPasscode(
    room.door_lock_id,
    data.name
  );

  // Log to database
  const logResult = await roomManagementDb.query(
    `INSERT INTO passcode_logs 
    (room_id, lock_id, passcode_id, passcode_name, passcode_type, created_by)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *`,
    [
      roomId,
      room.door_lock_id,
      ttlockResult.keyboardPwdId,
      data.name,
      'permanent',
      data.createdBy || null
    ]
  );

  return {
    id: logResult.rows[0].id,
    passcodeId: ttlockResult.keyboardPwdId,
    passcode: ttlockResult.keyboardPwd,
    name: data.name,
    type: 'permanent',
    lockId: room.door_lock_id,
    roomId: roomId
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

describe('TTLock Permanent Passcode Generation', () => {
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

    // Get test room (room with door_lock_id)
    try {
      const result = await roomManagementDb.query(
        `SELECT id FROM rooms WHERE door_lock_id IS NOT NULL LIMIT 1`
      );
      
      if (result.rows.length === 0) {
        throw new Error('No rooms with door_lock_id found in database');
      }

      testRoomId = result.rows[0].id;
      console.log(`✅ Test room found: ${testRoomId}`);
    } catch (error) {
      console.error('❌ Failed to get test room:', error.message);
      throw error;
    }

    await delay(1000); // Prevent rate limiting
  });

  afterAll(async () => {
    console.log('\n🧹 Cleaning up test passcodes...\n');

    // Delete all created passcodes
    for (const passcodeId of createdPasscodes) {
      try {
        await ttlockService.deletePasscode(passcodeId.lockId, passcodeId.passcodeId);
        console.log(`✅ Deleted passcode: ${passcodeId.passcodeId}`);
        await delay(1000); // Prevent rate limiting
      } catch (error) {
        console.error(`❌ Failed to delete passcode ${passcodeId.passcodeId}:`, error.message);
      }
    }

    // Close database connection
    await roomManagementDb.end();
    console.log('✅ Database connection closed');
  });

  // ========================================
  // TEST CASE 1: Create Permanent Passcode
  // ========================================
  test('Should create permanent passcode with auto-generated 8-digit code', async () => {
    console.log('\n📝 Test: Create permanent passcode\n');

    const passcodeData = {
      name: 'Test Permanent Passcode',
      createdBy: 'test-user'
    };

    const result = await createPermanentPasscode(testRoomId, passcodeData);

    // Store for cleanup
    createdPasscodes.push({
      lockId: result.lockId,
      passcodeId: result.passcodeId
    });

    // Assertions
    expect(result).toBeDefined();
    expect(result.passcodeId).toBeDefined();
    expect(result.passcode).toBeDefined();
    expect(result.name).toBe(passcodeData.name);
    expect(result.type).toBe('permanent');

    // Verify passcode is 8 digits
    expect(result.passcode).toMatch(/^\d{8}$/);
    expect(result.passcode.length).toBe(8);

    // Verify database log
    const log = await getPasscodeLog(result.id);
    expect(log).toBeDefined();
    expect(log.passcode_type).toBe('permanent');
    expect(log.passcode_name).toBe(passcodeData.name);
    expect(log.start_date).toBeNull();
    expect(log.end_date).toBeNull();

    console.log(`✅ Passcode created: ${result.passcode} (ID: ${result.passcodeId})`);
    console.log(`✅ Type: Permanent (8 digits)`);
    console.log(`⚠️  Note: Passcode must be used within 24 hours to become permanent`);

    await delay(2000); // Prevent rate limiting
  }, 30000); // 30 second timeout

  // ========================================
  // TEST CASE 2: Validation - Name Required
  // ========================================
  test('Should fail when name is not provided', async () => {
    console.log('\n📝 Test: Validation - name required\n');

    const passcodeData = {
      name: '', // Empty name
      createdBy: 'test-user'
    };

    await expect(createPermanentPasscode(testRoomId, passcodeData))
      .rejects
      .toThrow('Passcode name is required');

    console.log('✅ Validation passed: Empty name rejected');

    await delay(1000);
  }, 10000);

  // ========================================
  // TEST CASE 3: Validation - Name Length
  // ========================================
  test('Should fail when name exceeds 100 characters', async () => {
    console.log('\n📝 Test: Validation - name length\n');

    const passcodeData = {
      name: 'A'.repeat(101), // 101 characters
      createdBy: 'test-user'
    };

    await expect(createPermanentPasscode(testRoomId, passcodeData))
      .rejects
      .toThrow('Passcode name must be less than 100 characters');

    console.log('✅ Validation passed: Long name rejected');

    await delay(1000);
  }, 10000);

  // ========================================
  // TEST CASE 4: Invalid Room ID
  // ========================================
  test('Should fail when room does not exist', async () => {
    console.log('\n📝 Test: Invalid room ID\n');

    const fakeRoomId = '00000000-0000-0000-0000-000000000000';
    const passcodeData = {
      name: 'Test Passcode',
      createdBy: 'test-user'
    };

    await expect(createPermanentPasscode(fakeRoomId, passcodeData))
      .rejects
      .toThrow('Room not found');

    console.log('✅ Validation passed: Invalid room rejected');

    await delay(1000);
  }, 10000);

  // ========================================
  // TEST CASE 5: Multiple Permanent Passcodes
  // ========================================
  test('Should create multiple permanent passcodes', async () => {
    console.log('\n📝 Test: Create multiple permanent passcodes\n');

    const passcodes = [];

    for (let i = 1; i <= 3; i++) {
      const passcodeData = {
        name: `Test Permanent ${i}`,
        createdBy: 'test-user'
      };

      const result = await createPermanentPasscode(testRoomId, passcodeData);
      passcodes.push(result);

      // Store for cleanup
      createdPasscodes.push({
        lockId: result.lockId,
        passcodeId: result.passcodeId
      });

      console.log(`✅ Created passcode ${i}/3: ${result.passcode}`);

      await delay(3000); // Prevent rate limiting
    }

    // Verify all passcodes are unique
    const passcodeValues = passcodes.map(p => p.passcode);
    const uniquePasscodes = new Set(passcodeValues);
    expect(uniquePasscodes.size).toBe(3);

    // Verify all are 8 digits
    passcodes.forEach(p => {
      expect(p.passcode).toMatch(/^\d{8}$/);
    });

    console.log('✅ All passcodes are unique and 8 digits');
  }, 60000); // 60 second timeout

  // ========================================
  // TEST CASE 6: TTLock API Integration
  // ========================================
  test('Should verify TTLock API returns valid response', async () => {
    console.log('\n📝 Test: TTLock API integration\n');

    const passcodeData = {
      name: 'API Integration Test',
      createdBy: 'test-user'
    };

    const result = await createPermanentPasscode(testRoomId, passcodeData);

    // Store for cleanup
    createdPasscodes.push({
      lockId: result.lockId,
      passcodeId: result.passcodeId
    });

    // Verify TTLock API response structure
    expect(result.passcodeId).toBeGreaterThan(0);
    expect(typeof result.passcode).toBe('string');
    expect(result.passcode.length).toBe(8);

    console.log(`✅ TTLock API response valid`);
    console.log(`   Passcode ID: ${result.passcodeId}`);
    console.log(`   Passcode: ${result.passcode}`);

    await delay(2000);
  }, 30000);
});
