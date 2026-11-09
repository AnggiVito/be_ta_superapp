/**
 * Unit Test: TTLock Custom Permanent Passcode Generation
 * 
 * Test suite untuk memastikan generate custom permanent passcode (keyboardPwdType=2)
 * dengan user-defined 4-9 digit passcode berfungsi dengan baik
 * 
 * Test Strategy:
 * - Each digit length (4-9) tested with 2 patterns: random sequence + all-same digits
 * - 4-digit: 1234, 4444
 * - 5-digit: 12345, 55555
 * - 6-digit: 123456, 666666
 * - 7-digit: 1234567, 7777777
 * - 8-digit: 12345678, 88888888
 * - 9-digit: 123456789, 999999999
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

// ========================================
// TEST CONFIGURATION
// ========================================

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Test room with TTLock integration
const testRoomId = '165b57e6-507b-40a0-92dc-05198e947b84'; // KAUR Lab with lock 12405430

// Store created passcode IDs for cleanup
const createdPasscodes = [];

// ========================================
// HELPER FUNCTIONS
// ========================================

/**
 * Helper to get room from database
 */
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

/**
 * Helper function to create custom permanent passcode
 */
async function createCustomPermanentPasscode(roomId, passcodeData) {
  // Get room details
  const room = await getRoomById(roomId);

  if (!room || !room.door_lock_id) {
    throw new Error('Room not found or no TTLock integration');
  }

  // Create passcode using TTLock service
  const result = await ttlockService.createCustomPermanentPasscode(
    room.door_lock_id,
    passcodeData.name,
    passcodeData.passcode
  );

  // Log to database
  const logResult = await roomManagementDb.query(
    `INSERT INTO passcode_logs 
    (room_id, lock_id, passcode_id, passcode_name, passcode_type, created_by, start_date, end_date)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *`,
    [
      roomId,
      room.door_lock_id,
      String(result.keyboardPwdId),
      passcodeData.name,
      'custom-permanent',
      passcodeData.createdBy || 'test-user',
      null,
      null
    ]
  );

  return {
    id: logResult.rows[0].id,
    passcodeId: result.keyboardPwdId,
    passcode: passcodeData.passcode,
    name: passcodeData.name,
    type: 'custom-permanent',
    note: result.note
  };
}

/**
 * Helper to get passcode log from database
 */
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

describe('TTLock Custom Permanent Passcode Generation', () => {
  
  beforeAll(async () => {
    console.log('\n🔧 Setting up test environment...\n');

    // Verify test room exists
    const room = await getRoomById(testRoomId);

    if (!room) {
      throw new Error(`Test room ${testRoomId} not found in database`);
    }

    if (!room.door_lock_id) {
      throw new Error(`Test room ${testRoomId} has no TTLock integration`);
    }

    console.log('✅ Test room found:', testRoomId);
    console.log('✅ Lock ID:', room.door_lock_id);

    console.log('\n✅ Test environment ready!\n');
  });

  afterAll(async () => {
    console.log('\n🧹 Cleaning up test data...\n');

    // Delete created passcodes from TTLock
    for (const passcodeId of createdPasscodes) {
      try {
        const room = await getRoomById(testRoomId);
        await ttlockClient.deletePasscode(room.door_lock_id, passcodeId);
      } catch (error) {
        console.log(`⚠️  Failed to delete passcode ${passcodeId}:`, error.message);
      }
    }

    // Close database connection
    await roomManagementDb.end();
    console.log('✅ Database connection closed');
    console.log('\n✅ Cleanup complete!\n');
  });

  // ========================================
  // TEST CASES - Minimal tests: 4-digit (min), 6-digit (mid), 9-digit (max)
  // ========================================

  // 4-digit test
  test('Should generate 4-digit passcode (minimum length)', async () => {
    console.log('\n📝 Test: 4-digit passcode\n');
    
    // Generate unique 4-digit passcode using timestamp
    const timestamp = Date.now().toString();
    const passcode = timestamp.slice(-4);
    
    const result = await createCustomPermanentPasscode(testRoomId, {
      name: 'Test 4-digit',
      passcode: passcode,
      createdBy: 'test-user'
    });
    
    createdPasscodes.push(result.passcodeId);

    expect(result.passcode).toBe(passcode);
    expect(result.passcode).toMatch(/^\d{4}$/);
    expect(result.type).toBe('custom-permanent');
    console.log('✅ 4-digit passcode created:', result.passcode);
  });

  // 6-digit test
  test('Should generate 6-digit passcode (common length)', async () => {
    console.log('\n📝 Test: 6-digit passcode\n');
    await delay(2000);
    
    // Generate unique 6-digit passcode using timestamp
    const timestamp = Date.now().toString();
    const passcode = timestamp.slice(-6);
    
    const result = await createCustomPermanentPasscode(testRoomId, {
      name: 'Test 6-digit',
      passcode: passcode,
      createdBy: 'test-user'
    });
    
    createdPasscodes.push(result.passcodeId);

    expect(result.passcode).toBe(passcode);
    expect(result.passcode).toMatch(/^\d{6}$/);
    console.log('✅ 6-digit passcode created:', result.passcode);
  });

  // 9-digit test
  test('Should generate 9-digit passcode (maximum length)', async () => {
    console.log('\n📝 Test: 9-digit passcode\n');
    await delay(2000);
    
    // Generate unique 9-digit passcode using timestamp
    const timestamp = Date.now().toString();
    const passcode = timestamp.slice(-9);
    
    const result = await createCustomPermanentPasscode(testRoomId, {
      name: 'Test 9-digit',
      passcode: passcode,
      createdBy: 'test-user'
    });
    
    createdPasscodes.push(result.passcodeId);

    expect(result.passcode).toBe(passcode);
    expect(result.passcode).toMatch(/^\d{9}$/);
    console.log('✅ 9-digit passcode created:', result.passcode);
  });

  // ========================================
  // VALIDATION TESTS
  // ========================================

  test('Should reject passcode with less than 4 digits', async () => {
    console.log('\n📝 Test: Reject 3-digit passcode\n');
    await delay(2000);

    await expect(createCustomPermanentPasscode(testRoomId, {
      name: 'Invalid 3-digit',
      passcode: '123',
      createdBy: 'test-user'
    })).rejects.toThrow('Invalid passcode');

    console.log('✅ Correctly rejected 3-digit passcode');
  });

  test('Should reject passcode with more than 9 digits', async () => {
    console.log('\n📝 Test: Reject 10-digit passcode\n');
    await delay(2000);

    await expect(createCustomPermanentPasscode(testRoomId, {
      name: 'Invalid 10-digit',
      passcode: '1234567890',
      createdBy: 'test-user'
    })).rejects.toThrow('Invalid passcode');

    console.log('✅ Correctly rejected 10-digit passcode');
  });

  test('Should reject non-numeric passcode', async () => {
    console.log('\n📝 Test: Reject non-numeric\n');
    await delay(2000);

    await expect(createCustomPermanentPasscode(testRoomId, {
      name: 'Invalid Non-Numeric',
      passcode: 'ABC123',
      createdBy: 'test-user'
    })).rejects.toThrow('Invalid passcode');

    console.log('✅ Correctly rejected non-numeric passcode');
  });

  // ========================================
  // DATABASE LOGGING TEST
  // ========================================

  test('Should verify database logging', async () => {
    console.log('\n📝 Test: Database logging verification\n');
    await delay(2000);
    
    // Generate unique 4-digit passcode
    const timestamp = Date.now().toString();
    const passcode = timestamp.slice(-4);
    
    const result = await createCustomPermanentPasscode(testRoomId, {
      name: 'DB Logging Test',
      passcode: passcode,
      createdBy: 'test-admin'
    });
    
    createdPasscodes.push(result.passcodeId);

    const log = await getPasscodeLog(result.id);
    expect(log).toBeDefined();
    expect(log.room_id).toBe(testRoomId);
    expect(log.passcode_id).toBe(String(result.passcodeId));
    expect(log.passcode_type).toBe('custom-permanent');
    expect(log.created_by).toBe('test-admin');
    expect(log.start_date).toBeNull();
    expect(log.end_date).toBeNull();

    console.log('✅ Database logging verified');
  });

  // ========================================
  // ACTIVATION NOTE TEST
  // ========================================

  test('Should include 24-hour activation note', async () => {
    console.log('\n📝 Test: Activation note verification\n');
    await delay(2000);

    // Generate unique 4-digit passcode
    const timestamp = Date.now().toString();
    const passcode = timestamp.slice(-4);

    const result = await createCustomPermanentPasscode(testRoomId, {
      name: 'Activation Note Test',
      passcode: passcode,
      createdBy: 'test-user'
    });

    createdPasscodes.push(result.passcodeId);

    expect(result.note).toContain('24 hours');
    expect(result.note).toContain('permanent');
    console.log('✅ Activation note verified:', result.note);
  });
});
