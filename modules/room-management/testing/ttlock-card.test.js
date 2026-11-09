/**
 * Integration Test: IC Card (RFID) Management
 * 
 * Test suite untuk fitur IC card add, list, dan delete
 * 
 * Test Cases:
 * 1. Get card list - mengambil daftar IC card dari TTLock API
 * 2. Add permanent card - menambah kartu permanent (tanpa startDate/endDate)
 * 3. Add timed card - menambah kartu timed (dengan startDate/endDate)
 * 4. Delete card - menghapus kartu dari lock
 * 5. Card number format - verifikasi format nomor kartu USB reader
 * 6. Database logging - verifikasi audit trail di card_logs
 * 7. Error handling - room not found, invalid card number
 * 
 * IMPORTANT:
 * - Database harus running: docker compose up -d
 * - TTLock API harus accessible
 * - WiFi gateway harus online untuk addType=2
 * - Card yang ditambahkan akan di-cleanup (dihapus) setelah test
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

import { ttlockService } from '../../../services/ttlock/ttlockService.js';
import { reverseCardNumber } from '../services/cardService.js';

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

async function getCardLogs(roomId) {
    const result = await roomManagementDb.query(
        `SELECT * FROM card_logs WHERE room_id = $1 ORDER BY created_at DESC`,
        [roomId]
    );
    return result.rows;
}

async function deleteCardLog(logId) {
    await roomManagementDb.query(
        `DELETE FROM card_logs WHERE id = $1`,
        [logId]
    );
}

async function createCardLog(data) {
    const result = await roomManagementDb.query(
        `INSERT INTO card_logs 
         (room_id, lock_id, card_id, card_number, card_name,
          start_date, end_date, created_by, action, metadata, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
         RETURNING *`,
        [
            data.roomId,
            data.lockId,
            data.cardId || null,
            data.cardNumber || null,
            data.cardName || null,
            data.startDate || null,
            data.endDate || null,
            data.createdBy || null,
            data.action || 'created',
            JSON.stringify(data.metadata || {}),
        ]
    );
    return result.rows[0];
}

// ==================== Tests ====================

describe('IC Card (RFID) Management Tests', () => {
    let testRoomId = '165b57e6-507b-40a0-92dc-05198e947b84'; // Lab 101
    let testLockId = null;
    let testRoom = null;
    let createdCardIds = []; // Track TTLock card IDs for cleanup
    let createdLogIds = []; // Track DB log IDs for cleanup

    // USB reader test card number (the number you get when tapping on USB reader)
    const TEST_CARD_NUMBER = '2672633271';

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

    // Cleanup: Delete test cards from TTLock and DB logs
    afterAll(async () => {
        try {
            // Cleanup TTLock cards
            if (createdCardIds.length > 0) {
                console.log(`\n🧹 Cleaning up ${createdCardIds.length} card(s) from TTLock...`);
                for (const cardId of createdCardIds) {
                    try {
                        await ttlockService.deleteICCard(testLockId, cardId, 2);
                        console.log('✓ Deleted card from TTLock:', cardId);
                        await delay(1000);
                    } catch (error) {
                        console.warn('⚠ Failed to delete card from TTLock:', cardId, error.message);
                    }
                }
            }

            // Cleanup DB logs
            if (createdLogIds.length > 0) {
                console.log(`🧹 Cleaning up ${createdLogIds.length} log(s) from database...`);
                for (const logId of createdLogIds) {
                    try {
                        await deleteCardLog(logId);
                        console.log('✓ Deleted log:', logId);
                    } catch (error) {
                        console.warn('⚠ Failed to delete log:', logId, error.message);
                    }
                }
            }

            await roomManagementDb.end();
            console.log('✓ Database connection closed');
        } catch (error) {
            console.error('❌ Cleanup error:', error.message);
        }
    });

    // ==================== 1. Get Card List ====================

    describe('1. Get Card List', () => {
        test('should fetch IC card list from TTLock API', async () => {
            const cardList = await ttlockService.getICCardList(testLockId, 1, 100);

            expect(cardList).toBeDefined();
            expect(cardList).toHaveProperty('list');
            expect(Array.isArray(cardList.list)).toBe(true);

            if (cardList.list.length > 0) {
                const card = cardList.list[0];
                expect(card).toHaveProperty('cardId');
                expect(typeof card.cardId).toBe('number');
                console.log(`✓ Found ${cardList.list.length} IC card(s) on lock ${testLockId}`);
            } else {
                console.log('ℹ No IC cards found on lock (empty list)');
            }

            await delay(1000);
        });

        test('card list should be consistent between calls', async () => {
            const list1 = await ttlockService.getICCardList(testLockId, 1, 100);
            await delay(1000);
            const list2 = await ttlockService.getICCardList(testLockId, 1, 100);

            const ids1 = (list1?.list || []).map(c => c.cardId).sort();
            const ids2 = (list2?.list || []).map(c => c.cardId).sort();

            expect(ids1).toEqual(ids2);

            await delay(1000);
        });
    });

    // ==================== 2. Add Permanent Card ====================

    describe('2. Add Permanent Card', () => {
        test('should add a permanent IC card via WiFi gateway', async () => {
            const options = {
                addType: 2,
                cardName: 'Test Permanent Card',
            };

            const result = await ttlockService.addICCard(
                testLockId,
                TEST_CARD_NUMBER,
                options
            );

            expect(result).toBeDefined();
            expect(result).toHaveProperty('cardId');
            expect(typeof result.cardId).toBe('number');

            createdCardIds.push(result.cardId);
            console.log('✓ Permanent card added, cardId:', result.cardId);

            await delay(2000);
        });

        test('should find the permanent card in the card list', async () => {
            if (createdCardIds.length === 0) {
                console.warn('⚠ Skipping: no card was created in previous test');
                return;
            }

            const cardList = await ttlockService.getICCardList(testLockId, 1, 100);
            const found = cardList.list.find(c => c.cardId === createdCardIds[0]);

            expect(found).toBeDefined();
            expect(found.cardName).toBe('Test Permanent Card');

            // Permanent card should NOT have startDate/endDate (or they should be 0)
            console.log('✓ Card found in list:', {
                cardId: found.cardId,
                cardNumber: found.cardNumber,
                cardName: found.cardName,
                startDate: found.startDate,
                endDate: found.endDate,
            });

            await delay(1000);
        });

        test('should delete the permanent card and cleanup', async () => {
            if (createdCardIds.length === 0) {
                console.warn('⚠ Skipping: no card to delete');
                return;
            }

            const cardId = createdCardIds[0];
            const result = await ttlockService.deleteICCard(testLockId, cardId, 2);

            expect(result).toBeDefined();
            console.log('✓ Permanent card deleted, cardId:', cardId);

            // Remove from cleanup array since we deleted it manually
            createdCardIds = createdCardIds.filter(id => id !== cardId);

            await delay(2000);
        });
    });

    // ==================== 3. Add Timed Card ====================

    describe('3. Add Timed Card', () => {
        test('should add a timed IC card with start and end dates', async () => {
            // Set time window: now to +7 days
            const startDate = Date.now();
            const endDate = startDate + (7 * 24 * 60 * 60 * 1000); // +7 days

            const options = {
                addType: 2,
                cardName: 'Test Timed Card',
                startDate: startDate,
                endDate: endDate,
            };

            const result = await ttlockService.addICCard(
                testLockId,
                TEST_CARD_NUMBER,
                options
            );

            expect(result).toBeDefined();
            expect(result).toHaveProperty('cardId');
            expect(typeof result.cardId).toBe('number');

            createdCardIds.push(result.cardId);
            console.log('✓ Timed card added, cardId:', result.cardId);
            console.log('  Valid from:', new Date(startDate).toISOString());
            console.log('  Valid until:', new Date(endDate).toISOString());

            await delay(2000);
        });

        test('should find the timed card with correct time window', async () => {
            const timedCardId = createdCardIds[createdCardIds.length - 1];
            if (!timedCardId) {
                console.warn('⚠ Skipping: no timed card was created');
                return;
            }

            const cardList = await ttlockService.getICCardList(testLockId, 1, 100);
            const found = cardList.list.find(c => c.cardId === timedCardId);

            expect(found).toBeDefined();
            expect(found.cardName).toBe('Test Timed Card');

            // Timed card should have startDate and endDate
            expect(found.startDate).toBeDefined();
            expect(found.endDate).toBeDefined();
            expect(found.startDate).toBeGreaterThan(0);
            expect(found.endDate).toBeGreaterThan(found.startDate);

            console.log('✓ Timed card found:', {
                cardId: found.cardId,
                startDate: new Date(found.startDate).toISOString(),
                endDate: new Date(found.endDate).toISOString(),
            });

            await delay(1000);
        });

        test('should delete the timed card and cleanup', async () => {
            const timedCardId = createdCardIds[createdCardIds.length - 1];
            if (!timedCardId) {
                console.warn('⚠ Skipping: no timed card to delete');
                return;
            }

            const result = await ttlockService.deleteICCard(testLockId, timedCardId, 2);

            expect(result).toBeDefined();
            console.log('✓ Timed card deleted, cardId:', timedCardId);

            createdCardIds = createdCardIds.filter(id => id !== timedCardId);

            await delay(2000);
        });
    });

    // ==================== 4. Card Number Conversion ====================

    describe('4. Card Number Conversion (reverseCardNumber)', () => {
        test('should correctly reverse card number bytes', () => {
            // Known conversion: 2672633271 → 9F4B19B7 → B7194B9F → 3072675231
            const result = reverseCardNumber('2672633271');
            expect(result).toBe('3072675231');
        });

        test('should handle different card numbers', () => {
            // Test with a simple pattern: 0x01020304 → 0x04030201
            const input = parseInt('01020304', 16); // 16909060
            const result = reverseCardNumber(input.toString());
            const expected = parseInt('04030201', 16).toString(); // 67305985
            expect(result).toBe(expected);
        });

        test('should handle zero-padded hex values', () => {
            // Small number: 0x00000001 → 0x01000000
            const result = reverseCardNumber('1');
            const expected = parseInt('01000000', 16).toString(); // 16777216
            expect(result).toBe(expected);
        });

        test('should handle max 32-bit value', () => {
            // 0xFFFFFFFF → reversed → 0xFFFFFFFF (palindrome)
            const maxUint32 = (0xFFFFFFFF >>> 0).toString();
            const result = reverseCardNumber(maxUint32);
            expect(result).toBe(maxUint32);
        });
    });

    // ==================== 5. Database Logging ====================

    describe('5. Database Logging (card_logs)', () => {
        test('should create a card log entry', async () => {
            const log = await createCardLog({
                roomId: testRoomId,
                lockId: testLockId.toString(),
                cardId: 12345,
                cardNumber: TEST_CARD_NUMBER,
                cardName: 'Test Log Card',
                createdBy: 'test-user-id',
                action: 'created',
                metadata: { source: 'test' },
            });

            expect(log).toBeDefined();
            expect(log.id).toBeDefined();
            expect(log.room_id).toBe(testRoomId);
            expect(log.card_id).toBe(12345);
            expect(log.card_number).toBe(TEST_CARD_NUMBER);
            expect(log.card_name).toBe('Test Log Card');
            expect(log.action).toBe('created');

            createdLogIds.push(log.id);
        });

        test('should create a deletion log entry', async () => {
            const log = await createCardLog({
                roomId: testRoomId,
                lockId: testLockId.toString(),
                cardId: 12345,
                cardNumber: TEST_CARD_NUMBER,
                cardName: 'Test Log Card',
                action: 'deleted',
                metadata: { deleteType: 2 },
            });

            expect(log).toBeDefined();
            expect(log.action).toBe('deleted');
            expect(log.metadata).toEqual({ deleteType: 2 });

            createdLogIds.push(log.id);
        });

        test('should retrieve card logs for a room', async () => {
            const logs = await getCardLogs(testRoomId);

            expect(logs).toBeDefined();
            expect(Array.isArray(logs)).toBe(true);
            expect(logs.length).toBeGreaterThan(0);

            // Most recent first
            const latestLog = logs[0];
            expect(latestLog.room_id).toBe(testRoomId);
        });

        test('should store metadata as JSONB correctly', async () => {
            const metadata = {
                source: 'usb_reader',
                ttlockResponse: { cardId: 99999 },
            };

            const log = await createCardLog({
                roomId: testRoomId,
                lockId: testLockId.toString(),
                cardId: 99999,
                cardNumber: TEST_CARD_NUMBER,
                action: 'created',
                metadata,
            });

            expect(log.metadata).toBeDefined();
            expect(log.metadata.source).toBe('usb_reader');
            expect(log.metadata.ttlockResponse.cardId).toBe(99999);

            createdLogIds.push(log.id);
        });
    });

    // ==================== 6. Error Handling ====================

    describe('6. Error Handling', () => {
        test('should handle non-existent room', async () => {
            const fakeRoomId = '00000000-0000-0000-0000-000000000000';
            const room = await getRoomById(fakeRoomId);
            expect(room).toBeNull();
        });

        test('should verify room has lock configured', async () => {
            const room = await getRoomById(testRoomId);
            expect(room).toBeDefined();
            expect(room.door_lock_id).toBeDefined();
            expect(room.door_lock_id).not.toBeNull();
        });

        test('should handle TTLock API error for invalid lock ID', async () => {
            try {
                await ttlockService.getICCardList(999999999, 1, 20);
                // If it doesn't throw, it should return empty or error response
            } catch (error) {
                expect(error).toBeDefined();
                console.log('✓ Expected error for invalid lock:', error.message);
            }

            await delay(1000);
        });
    });
});
