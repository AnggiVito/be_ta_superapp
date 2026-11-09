/**
 * Unit Test: TTLock Custom Temporary Passcode Generation
 * 
 * Test suite untuk memastikan generate custom temporary passcode (keyboardPwdType=3)
 * dengan user-defined 4-9 digit passcode berfungsi dengan baik
 * 
 * Test Cases:
 * 1. Generate custom temporary passcode dengan 4-digit passcode
 * 2. Generate custom temporary passcode dengan 6-digit passcode  
 * 3. Generate custom temporary passcode dengan 9-digit passcode
 * 4. Validation - passcode must be 4-9 digits
 * 5. Validation - passcode must be numeric only
 * 6. Validation - dates required
 * 7. Validation - end date must be after start date
 * 8. Validation - start date tolerance (2 hours past allowed)
 * 9. TTLock Service Integration
 * 10. Database logging with correct type
 * 
 * IMPORTANT: 
 * - Database harus running: docker compose up -d
 * - Test ini akan create real passcodes di TTLock API
 * - Passcode akan auto-cleanup setelah test selesai
 * - Input menggunakan format WIB timezone
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

// Import timezone utilities
import { wibToUtcTimestamp } from '../services/timezoneUtil.js';

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

async function createCustomTemporaryPasscode(roomId, data) {
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

  // Validate passcode (4-9 digits)
  if (!data.passcode || !/^\d{4,9}$/.test(data.passcode)) {
    throw new Error('Invalid passcode. Must be 4-9 digits.');
  }

  // Validate dates
  if (!data.startDate || !data.endDate) {
    throw new Error('Start date and end date are required');
  }

  // Parse dates as WIB and convert to UTC timestamp
  const startTimestamp = wibToUtcTimestamp(data.startDate);
  const endTimestamp = wibToUtcTimestamp(data.endDate);
  const nowTimestamp = Date.now();

  // Validation - Allow 2 hours past tolerance
  if (startTimestamp < nowTimestamp - 2 * 60 * 60 * 1000) {
    throw new Error('Start date cannot be more than 2 hours in the past');
  }

  if (endTimestamp <= startTimestamp) {
    throw new Error('End date must be after start date');
  }

  // Create passcode via TTLock
  const ttlockResult = await ttlockService.createCustomTemporaryPasscode(
    room.door_lock_id,
    data.name,
    data.passcode,
    startTimestamp,
    endTimestamp
  );

  // Log to database
  const logResult = await roomManagementDb.query(
    `INSERT INTO passcode_logs 
    (room_id, lock_id, passcode_id, passcode_name, passcode_type, start_date, end_date, created_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *`,
    [
      roomId,
      room.door_lock_id,
      ttlockResult.keyboardPwdId,
      data.name,
      'custom-temporary',
      new Date(startTimestamp),
      new Date(endTimestamp),
      data.createdBy || null
    ]
  );

  return {
    id: logResult.rows[0].id,
    passcodeId: ttlockResult.keyboardPwdId,
    passcode: data.passcode, // User-defined passcode
    name: data.name,
    type: 'custom-temporary',
    startDate: data.startDate,
    endDate: data.endDate,
    startTimestamp: startTimestamp,
    endTimestamp: endTimestamp,
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

// Helper untuk generate datetime strings in WIB format
function getWibDateTime(hoursFromNow = 0) {
  // Get current time in milliseconds
  const now = Date.now();
  
  // Add offset hours in milliseconds
  const futureTime = now + (hoursFromNow * 60 * 60 * 1000);
  
  // Convert to Date object
  const futureDate = new Date(futureTime);
  
  // Get UTC components and add 7 hours for WIB
  const utcYear = futureDate.getUTCFullYear();
  const utcMonth = futureDate.getUTCMonth();
  const utcDate = futureDate.getUTCDate();
  const utcHours = futureDate.getUTCHours();
  const utcMinutes = futureDate.getUTCMinutes();
  const utcSeconds = futureDate.getUTCSeconds();
  
  // Create WIB date by adding 7 hours to UTC
  const wibDate = new Date(Date.UTC(utcYear, utcMonth, utcDate, utcHours + 7, utcMinutes, utcSeconds, 0));
  
  // Format as WIB string
  const year = wibDate.getUTCFullYear();
  const month = String(wibDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(wibDate.getUTCDate()).padStart(2, '0');
  const hours = String(wibDate.getUTCHours()).padStart(2, '0');
  const minutes = String(wibDate.getUTCMinutes()).padStart(2, '0');
  const seconds = String(wibDate.getUTCSeconds()).padStart(2, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.000`;
}

// ========================================
// TEST SUITE
// ========================================

describe('TTLock Custom Temporary Passcode Generation', () => {
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

    // Get test room from database
    try {
      const result = await roomManagementDb.query(
        `SELECT id, door_lock_id FROM rooms WHERE door_lock_id IS NOT NULL LIMIT 1`
      );
      
      if (result.rows.length === 0) {
        throw new Error('No test room found with door lock configured');
      }
      
      testRoomId = result.rows[0].id;
      console.log('✅ Test room found:', testRoomId);
      console.log('✅ Lock ID:', result.rows[0].door_lock_id);
    } catch (error) {
      console.error('❌ Failed to get test room:', error.message);
      throw error;
    }

    console.log('\n✅ Test environment ready!\n');
  });

  afterAll(async () => {
    console.log('\n🧹 Cleaning up test data...\n');
    
    // Delete all created passcodes from TTLock
    for (const passcodeId of createdPasscodes) {
      try {
        await delay(1000); // Rate limiting
        
        const room = await getRoomById(testRoomId);
        await ttlockClient.deletePasscode(room.door_lock_id, passcodeId, accessToken);
        console.log(`✅ Deleted passcode: ${passcodeId}`);
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
  // TEST CASES
  // ========================================

  test('Should generate custom temporary passcode with 4-digit code', async () => {
    console.log('\n📝 Test: Generate custom temporary with 4-digit passcode\n');
    
    // Generate unique 4-digit passcode
    const timestamp = Date.now().toString();
    const passcode = timestamp.slice(-4);
    
    const passcodeData = {
      name: 'Test Custom Temporary 4-digit',
      passcode: passcode,
      startDate: getWibDateTime(1), // 1 hour from now
      endDate: getWibDateTime(5),   // 5 hours from now
      createdBy: 'test-user'
    };

    const result = await createCustomTemporaryPasscode(testRoomId, passcodeData);
    
    // Store for cleanup
    createdPasscodes.push(result.passcodeId);

    // Assertions
    expect(result).toBeDefined();
    expect(result.passcodeId).toBeDefined();
    expect(result.passcode).toBe(passcode);
    expect(result.passcode).toMatch(/^\d{4}$/); // Exactly 4 digits
    expect(result.name).toBe(passcodeData.name);
    expect(result.type).toBe('custom-temporary');
    expect(result.roomId).toBe(testRoomId);

    // Verify database log
    const log = await getPasscodeLog(result.id);
    expect(log).toBeDefined();
    expect(log.passcode_type).toBe('custom-temporary');
    expect(log.passcode_id).toBe(String(result.passcodeId));
    expect(log.start_date).toBeDefined();
    expect(log.end_date).toBeDefined();

    console.log('✅ Passcode created:', {
      id: result.passcodeId,
      passcode: result.passcode,
      type: result.type,
      startDate: result.startDate,
      endDate: result.endDate
    });
  });

  test('Should generate custom temporary passcode with 6-digit code', async () => {
    console.log('\n📝 Test: Generate custom temporary with 6-digit passcode\n');
    
    await delay(2000); // Rate limiting

    // Generate unique 6-digit passcode
    const timestamp = Date.now().toString();
    const passcode = timestamp.slice(-6);

    const passcodeData = {
      name: 'Test Custom Temporary 6-digit',
      passcode: passcode,
      startDate: getWibDateTime(1),
      endDate: getWibDateTime(5),
      createdBy: 'test-user'
    };

    const result = await createCustomTemporaryPasscode(testRoomId, passcodeData);
    
    createdPasscodes.push(result.passcodeId);

    expect(result.passcode).toBe(passcode);
    expect(result.passcode).toMatch(/^\d{6}$/); // Exactly 6 digits
    expect(result.type).toBe('custom-temporary');

    console.log('✅ Passcode created:', result.passcode);
  });

  test('Should generate custom temporary passcode with 9-digit code', async () => {
    console.log('\n📝 Test: Generate custom temporary with 9-digit passcode\n');
    
    await delay(2000); // Rate limiting

    // Generate unique 9-digit passcode
    const timestamp = Date.now().toString();
    const passcode = timestamp.slice(-9);

    const passcodeData = {
      name: 'Test Custom Temporary 9-digit',
      passcode: passcode,
      startDate: getWibDateTime(1),
      endDate: getWibDateTime(5),
      createdBy: 'test-user'
    };

    const result = await createCustomTemporaryPasscode(testRoomId, passcodeData);
    
    createdPasscodes.push(result.passcodeId);

    expect(result.passcode).toBe(passcode);
    expect(result.passcode).toMatch(/^\d{9}$/); // Exactly 9 digits
    expect(result.type).toBe('custom-temporary');

    console.log('✅ Passcode created:', result.passcode);
  });

  test('Should reject passcode with less than 4 digits', async () => {
    console.log('\n📝 Test: Reject passcode with 3 digits\n');
    
    const passcodeData = {
      name: 'Invalid 3-digit',
      passcode: '123', // Too short
      startDate: getWibDateTime(1),
      endDate: getWibDateTime(5)
    };

    await expect(createCustomTemporaryPasscode(testRoomId, passcodeData))
      .rejects
      .toThrow('Invalid passcode. Must be 4-9 digits.');

    console.log('✅ Correctly rejected 3-digit passcode');
  });

  test('Should reject passcode with more than 9 digits', async () => {
    console.log('\n📝 Test: Reject passcode with 10 digits\n');
    
    const passcodeData = {
      name: 'Invalid 10-digit',
      passcode: '1234567890', // Too long
      startDate: getWibDateTime(1),
      endDate: getWibDateTime(5)
    };

    await expect(createCustomTemporaryPasscode(testRoomId, passcodeData))
      .rejects
      .toThrow('Invalid passcode. Must be 4-9 digits.');

    console.log('✅ Correctly rejected 10-digit passcode');
  });

  test('Should reject non-numeric passcode', async () => {
    console.log('\n📝 Test: Reject non-numeric passcode\n');
    
    const passcodeData = {
      name: 'Invalid non-numeric',
      passcode: '12AB', // Contains letters
      startDate: getWibDateTime(1),
      endDate: getWibDateTime(5)
    };

    await expect(createCustomTemporaryPasscode(testRoomId, passcodeData))
      .rejects
      .toThrow('Invalid passcode. Must be 4-9 digits.');

    console.log('✅ Correctly rejected non-numeric passcode');
  });

  test('Should reject when dates are missing', async () => {
    console.log('\n📝 Test: Reject missing dates\n');
    
    const passcodeData = {
      name: 'Missing dates',
      passcode: '1234'
      // No startDate and endDate
    };

    await expect(createCustomTemporaryPasscode(testRoomId, passcodeData))
      .rejects
      .toThrow('Start date and end date are required');

    console.log('✅ Correctly rejected missing dates');
  });

  test('Should reject when end date is before start date', async () => {
    console.log('\n📝 Test: Reject invalid date range\n');
    
    const passcodeData = {
      name: 'Invalid date range',
      passcode: '1234',
      startDate: getWibDateTime(5),
      endDate: getWibDateTime(1) // End before start
    };

    await expect(createCustomTemporaryPasscode(testRoomId, passcodeData))
      .rejects
      .toThrow('End date must be after start date');

    console.log('✅ Correctly rejected invalid date range');
  });

  test('Should allow start date up to 2 hours in the past', async () => {
    console.log('\n📝 Test: Allow 2 hours past tolerance\n');
    
    await delay(2000); // Rate limiting

    // Generate unique 4-digit passcode
    const timestamp = Date.now().toString();
    const passcode = timestamp.slice(-4);

    const passcodeData = {
      name: 'Test Past Tolerance',
      passcode: passcode,
      startDate: getWibDateTime(-1.5), // 1.5 hours ago (within 2 hour tolerance)
      endDate: getWibDateTime(3),
      createdBy: 'test-user'
    };

    const result = await createCustomTemporaryPasscode(testRoomId, passcodeData);
    
    createdPasscodes.push(result.passcodeId);

    expect(result).toBeDefined();
    expect(result.passcode).toBe(passcode);
    expect(result.type).toBe('custom-temporary');

    console.log('✅ Passcode created with past start date (within tolerance)');
  });

  test('Should reject start date more than 2 hours in the past', async () => {
    console.log('\n📝 Test: Reject start date beyond 2 hours past\n');
    
    const passcodeData = {
      name: 'Too far in past',
      passcode: '8888',
      startDate: getWibDateTime(-3), // 3 hours ago (beyond tolerance)
      endDate: getWibDateTime(3)
    };

    await expect(createCustomTemporaryPasscode(testRoomId, passcodeData))
      .rejects
      .toThrow('Start date cannot be more than 2 hours in the past');

    console.log('✅ Correctly rejected start date beyond tolerance');
  });

  test('Should verify database logging with correct type', async () => {
    console.log('\n📝 Test: Verify database logging\n');
    
    await delay(2000); // Rate limiting

    // Generate unique 4-digit passcode
    const timestamp = Date.now().toString();
    const passcode = timestamp.slice(-4);

    const passcodeData = {
      name: 'Test DB Logging',
      passcode: passcode,
      startDate: getWibDateTime(1),
      endDate: getWibDateTime(4),
      createdBy: 'test-admin'
    };

    const result = await createCustomTemporaryPasscode(testRoomId, passcodeData);
    
    createdPasscodes.push(result.passcodeId);

    // Get log from database
    const log = await getPasscodeLog(result.id);

    // Verify all fields
    expect(log).toBeDefined();
    expect(log.room_id).toBe(testRoomId);
    expect(log.passcode_id).toBe(String(result.passcodeId));
    expect(log.passcode_name).toBe(passcodeData.name);
    expect(log.passcode_type).toBe('custom-temporary');
    expect(log.created_by).toBe('test-admin');
    expect(log.start_date).toBeInstanceOf(Date);
    expect(log.end_date).toBeInstanceOf(Date);

    console.log('✅ Database log verified:', {
      id: log.id,
      type: log.passcode_type,
      passcodeId: log.passcode_id,
      createdBy: log.created_by
    });
  });
});
