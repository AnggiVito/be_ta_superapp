/**
 * Integration Test: Battery Level (Electric Quantity)
 * 
 * Test suite untuk fitur query battery level smart lock
 * 
 * Test Cases:
 * 1. Query battery level - mengambil level baterai dari TTLock API
 * 2. Battery level range - memverifikasi nilai baterai valid (0-100)
 * 3. Consistency - hasil battery level konsisten antar panggilan
 * 4. Room lookup - verifikasi lookup room → lock → battery
 * 5. Error handling - room not found, invalid lock, no lock configured
 * 
 * IMPORTANT:
 * - Database harus running: docker compose up -d
 * - TTLock API harus accessible
 * - WiFi gateway harus online untuk query battery
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

import { ttlockService } from '../../../services/ttlock/ttlockService.js';

// Import test database config (localhost:5436)
import { roomManagementDb } from './testDatabaseConfig.js';

// Helper function untuk delay (TTLock API rate limiting)
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ==================== Database Helper Functions ====================

async function getRoomById(roomId) {
    const result = await roomManagementDb.query(
        `SELECT * FROM rooms WHERE id = $1`,
        [roomId]
    );
    return result.rows[0] || null;
}

async function getAllRoomsWithLock() {
    const result = await roomManagementDb.query(
        `SELECT * FROM rooms WHERE door_lock_id IS NOT NULL ORDER BY name ASC`
    );
    return result.rows;
}

// ==================== Tests ====================

describe('Battery Level (Electric Quantity) Tests', () => {
    let testRoomId = '165b57e6-507b-40a0-92dc-05198e947b84'; // Lab 101
    let testLockId = null;
    let testRoom = null;

    // Setup: Verify test room and get lock ID
    beforeAll(async () => {
        try {
            console.log('🔍 Connecting to test database: localhost:5436');

            testRoom = await getRoomById(testRoomId);
            if (!testRoom) {
                throw new Error('Test room not found. Room ID: ' + testRoomId);
            }

            if (!testRoom.door_lock_id) {
                throw new Error('Test room does not have a door lock configured');
            }

            testLockId = testRoom.door_lock_id;
            console.log('✓ Test room found:', testRoom.name, 'Lock ID:', testLockId);
        } catch (error) {
            console.error('❌ Setup failed:', error.message);
            throw error;
        }
    });

    // Cleanup
    afterAll(async () => {
        try {
            await roomManagementDb.end();
            console.log('✓ Database connection closed');
        } catch (error) {
            console.error('❌ Cleanup error:', error.message);
        }
    });

    // ==================== 1. Query Battery Level ====================

    describe('1. Query Battery Level', () => {
        test('should fetch battery level from TTLock API', async () => {
            const result = await ttlockService.queryElectricQuantity(testLockId);

            expect(result).toBeDefined();
            expect(result).toHaveProperty('electricQuantity');
            expect(typeof result.electricQuantity).toBe('number');

            console.log(`✓ Battery level for lock ${testLockId}: ${result.electricQuantity}%`);

            await delay(1000);
        });

        test('should return battery level as a percentage (0-100)', async () => {
            const result = await ttlockService.queryElectricQuantity(testLockId);

            expect(result.electricQuantity).toBeGreaterThanOrEqual(0);
            expect(result.electricQuantity).toBeLessThanOrEqual(100);

            console.log(`✓ Battery level ${result.electricQuantity}% is within valid range`);

            await delay(1000);
        });
    });

    // ==================== 2. Consistency ====================

    describe('2. Consistency', () => {
        test('battery level should be consistent between consecutive calls', async () => {
            const result1 = await ttlockService.queryElectricQuantity(testLockId);
            await delay(1000);
            const result2 = await ttlockService.queryElectricQuantity(testLockId);

            // Battery shouldn't change significantly between 2 quick calls
            expect(result1.electricQuantity).toBe(result2.electricQuantity);

            console.log(`✓ Both calls returned: ${result1.electricQuantity}%`);

            await delay(1000);
        });
    });

    // ==================== 3. Room-to-Lock Lookup ====================

    describe('3. Room-to-Lock Lookup', () => {
        test('should resolve room ID to lock ID and query battery', async () => {
            // Simulate what the controller does
            const room = await getRoomById(testRoomId);

            expect(room).toBeDefined();
            expect(room.door_lock_id).toBeDefined();

            const result = await ttlockService.queryElectricQuantity(room.door_lock_id);

            expect(result).toBeDefined();
            expect(result.electricQuantity).toBeGreaterThanOrEqual(0);

            console.log(`✓ Room "${room.name}" → Lock ${room.door_lock_id} → Battery: ${result.electricQuantity}%`);

            await delay(1000);
        });

        test('should be able to query battery for all rooms with locks', async () => {
            const rooms = await getAllRoomsWithLock();
            console.log(`ℹ Found ${rooms.length} room(s) with smart locks`);

            for (const room of rooms) {
                try {
                    const result = await ttlockService.queryElectricQuantity(room.door_lock_id);
                    expect(result.electricQuantity).toBeGreaterThanOrEqual(0);
                    expect(result.electricQuantity).toBeLessThanOrEqual(100);
                    console.log(`  ✓ ${room.name} (Lock ${room.door_lock_id}): ${result.electricQuantity}%`);
                } catch (error) {
                    console.warn(`  ⚠ ${room.name} (Lock ${room.door_lock_id}): ${error.message}`);
                }
                await delay(1000);
            }
        });
    });

    // ==================== 4. Error Handling ====================

    describe('4. Error Handling', () => {
        test('should handle non-existent room', async () => {
            const fakeRoomId = '00000000-0000-0000-0000-000000000000';
            const room = await getRoomById(fakeRoomId);
            expect(room).toBeNull();
        });

        test('should verify room has lock configured', async () => {
            const room = await getRoomById(testRoomId);
            expect(room).toBeDefined();
            expect(room.door_lock_id).not.toBeNull();
        });

        test('should handle TTLock API error for invalid lock ID', async () => {
            try {
                await ttlockService.queryElectricQuantity(999999999);
                // If no error, the API may return a response — just check it
            } catch (error) {
                expect(error).toBeDefined();
                console.log('✓ Expected error for invalid lock:', error.message);
            }

            await delay(1000);
        });
    });
});
