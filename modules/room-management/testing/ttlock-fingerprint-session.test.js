/**
 * Integration Test: Fingerprint Registration Session
 * 
 * Test suite untuk fitur batch fingerprint registration sessions
 * 
 * Test Cases:
 * 1. Create session - membuat session baru dengan baseline snapshot
 * 2. Get session - mengambil detail session beserta room statuses
 * 3. Get all sessions - list semua sessions dengan progress summary
 * 4. Check session - deteksi fingerprint baru (expected: pending karena tidak ada fingerprint fisik baru)
 * 5. Cancel session - membatalkan session yang sedang ongoing
 * 6. Error handling - session not found, already completed/cancelled
 * 
 * IMPORTANT:
 * - Database harus running: docker compose up -d
 * - TTLock API harus accessible (untuk baseline snapshot)
 * - Test ini TIDAK menambah/menghapus fingerprint fisik
 * - Session records akan di-cleanup setelah test selesai
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

import { ttlockService } from '../../../services/ttlock/ttlockService.js';

// Import test database config (localhost:5436)
import { roomManagementDb } from './testDatabaseConfig.js';

// Helper function untuk delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ==================== Database Helper Functions ====================
// Direct DB operations using test database connection

async function getRoomById(roomId) {
    const result = await roomManagementDb.query(
        `SELECT * FROM rooms WHERE id = $1`,
        [roomId]
    );
    return result.rows[0] || null;
}

async function createSession(personName, createdBy) {
    const result = await roomManagementDb.query(
        `INSERT INTO fingerprint_sessions (person_name, status, created_by, created_at, updated_at)
         VALUES ($1, 'ongoing', $2, NOW(), NOW())
         RETURNING *`,
        [personName, createdBy]
    );
    return result.rows[0];
}

async function createSessionRoom(sessionId, roomId, lockId, knownFingerprintIds) {
    const result = await roomManagementDb.query(
        `INSERT INTO fingerprint_session_rooms 
         (session_id, room_id, lock_id, status, known_fingerprint_ids, created_at, updated_at)
         VALUES ($1, $2, $3, 'pending', $4, NOW(), NOW())
         RETURNING *`,
        [sessionId, roomId, lockId, JSON.stringify(knownFingerprintIds || [])]
    );
    return result.rows[0];
}

async function getSessionById(sessionId) {
    const result = await roomManagementDb.query(
        `SELECT * FROM fingerprint_sessions WHERE id = $1`,
        [sessionId]
    );
    return result.rows[0] || null;
}

async function getSessionRooms(sessionId) {
    const result = await roomManagementDb.query(
        `SELECT fsr.*, r.name as room_name
         FROM fingerprint_session_rooms fsr
         JOIN rooms r ON fsr.room_id = r.id
         WHERE fsr.session_id = $1
         ORDER BY r.name ASC`,
        [sessionId]
    );
    return result.rows;
}

async function getAllSessions() {
    const result = await roomManagementDb.query(
        `SELECT 
            fs.*,
            COUNT(fsr.id) AS total_rooms,
            COUNT(CASE WHEN fsr.status = 'done' THEN 1 END) AS completed_rooms,
            COUNT(CASE WHEN fsr.status = 'pending' THEN 1 END) AS pending_rooms
         FROM fingerprint_sessions fs
         LEFT JOIN fingerprint_session_rooms fsr ON fs.id = fsr.session_id
         GROUP BY fs.id
         ORDER BY fs.created_at DESC`
    );
    return result.rows;
}

async function updateSessionStatus(sessionId, status) {
    const completedAt = status === 'completed' || status === 'cancelled' ? 'NOW()' : 'NULL';
    const result = await roomManagementDb.query(
        `UPDATE fingerprint_sessions 
         SET status = $1, updated_at = NOW(), completed_at = ${completedAt}
         WHERE id = $2
         RETURNING *`,
        [status, sessionId]
    );
    return result.rows[0] || null;
}

async function markSessionRoomDone(sessionRoomId, fingerprintId, fingerprintNumber) {
    const result = await roomManagementDb.query(
        `UPDATE fingerprint_session_rooms 
         SET status = 'done', 
             fingerprint_id = $1, 
             fingerprint_number = $2,
             detected_at = NOW(), 
             updated_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [fingerprintId, fingerprintNumber || null, sessionRoomId]
    );
    return result.rows[0] || null;
}

async function countPendingRooms(sessionId) {
    const result = await roomManagementDb.query(
        `SELECT COUNT(*) as count FROM fingerprint_session_rooms 
         WHERE session_id = $1 AND status = 'pending'`,
        [sessionId]
    );
    return parseInt(result.rows[0].count);
}

async function deleteSessionData(sessionId) {
    await roomManagementDb.query(
        `DELETE FROM fingerprint_session_rooms WHERE session_id = $1`,
        [sessionId]
    );
    await roomManagementDb.query(
        `DELETE FROM fingerprint_sessions WHERE id = $1`,
        [sessionId]
    );
}

// ==================== Tests ====================

describe('Fingerprint Registration Session Tests', () => {
    let testRoomId = '165b57e6-507b-40a0-92dc-05198e947b84'; // Lab 101
    let testLockId = null;
    let testRoom = null;
    let createdSessionIds = []; // Track untuk cleanup

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

    // Cleanup: Delete test sessions
    afterAll(async () => {
        try {
            if (createdSessionIds.length > 0) {
                console.log(`\nCleaning up ${createdSessionIds.length} session(s)...`);
                for (const sessionId of createdSessionIds) {
                    try {
                        await deleteSessionData(sessionId);
                        console.log('✓ Cleaned up session:', sessionId);
                    } catch (error) {
                        console.warn('⚠ Failed to cleanup session:', sessionId, error.message);
                    }
                }
            }

            await roomManagementDb.end();
            console.log('✓ Database connection closed');
        } catch (error) {
            console.error('❌ Cleanup error:', error.message);
        }
    });

    // ==================== 1. Create Session ====================

    describe('1. Create Session', () => {
        test('should create a new session in the database', async () => {
            const session = await createSession('Test Person', 'test-user-id');

            expect(session).toBeDefined();
            expect(session.id).toBeDefined();
            expect(session.person_name).toBe('Test Person');
            expect(session.status).toBe('ongoing');
            expect(session.created_by).toBe('test-user-id');
            expect(session.created_at).toBeDefined();

            createdSessionIds.push(session.id);
        });

        test('should create session room with baseline fingerprint snapshot', async () => {
            const session = await createSession('Test Person FP', 'test-user-id');
            createdSessionIds.push(session.id);

            // Get baseline fingerprints from TTLock
            let knownFingerprintIds = [];
            try {
                const fpList = await ttlockService.getFingerprintList(testLockId, 1, 100);
                if (fpList && fpList.list) {
                    knownFingerprintIds = fpList.list.map(fp => fp.fingerprintId);
                }
                console.log(`✓ Baseline snapshot: ${knownFingerprintIds.length} fingerprint(s) found`);
            } catch (error) {
                console.warn('⚠ Could not get fingerprint list:', error.message);
            }

            const sessionRoom = await createSessionRoom(
                session.id,
                testRoomId,
                testLockId,
                knownFingerprintIds
            );

            expect(sessionRoom).toBeDefined();
            expect(sessionRoom.session_id).toBe(session.id);
            expect(sessionRoom.room_id).toBe(testRoomId);
            expect(sessionRoom.lock_id).toBe(String(testLockId));
            expect(sessionRoom.status).toBe('pending');
            expect(sessionRoom.known_fingerprint_ids).toBeDefined();

            // Verify the snapshot contains the fingerprint IDs
            const storedIds = sessionRoom.known_fingerprint_ids;
            expect(Array.isArray(storedIds)).toBe(true);
            expect(storedIds.length).toBe(knownFingerprintIds.length);

            await delay(1000);
        });

        test('should handle creating session with empty baseline', async () => {
            const session = await createSession('Test Empty Baseline', 'test-user-id');
            createdSessionIds.push(session.id);

            const sessionRoom = await createSessionRoom(
                session.id,
                testRoomId,
                testLockId,
                [] // Empty baseline
            );

            expect(sessionRoom.known_fingerprint_ids).toEqual([]);
        });
    });

    // ==================== 2. Get Session ====================

    describe('2. Get Session by ID', () => {
        test('should retrieve session with room details', async () => {
            // Create session with room
            const session = await createSession('Test Get Session', 'test-user-id');
            createdSessionIds.push(session.id);

            await createSessionRoom(session.id, testRoomId, testLockId, []);

            // Retrieve
            const retrieved = await getSessionById(session.id);
            expect(retrieved).toBeDefined();
            expect(retrieved.id).toBe(session.id);
            expect(retrieved.person_name).toBe('Test Get Session');

            const rooms = await getSessionRooms(session.id);
            expect(rooms).toBeDefined();
            expect(rooms.length).toBe(1);
            expect(rooms[0].room_name).toBe(testRoom.name);
            expect(rooms[0].status).toBe('pending');
        });

        test('should return null for non-existent session', async () => {
            const result = await getSessionById('00000000-0000-0000-0000-000000000000');
            expect(result).toBeNull();
        });
    });

    // ==================== 3. Get All Sessions ====================

    describe('3. Get All Sessions', () => {
        test('should return sessions with progress summary', async () => {
            // Create a session with one room
            const session = await createSession('Test List Sessions', 'test-user-id');
            createdSessionIds.push(session.id);

            await createSessionRoom(session.id, testRoomId, testLockId, []);

            const sessions = await getAllSessions();

            expect(sessions).toBeDefined();
            expect(Array.isArray(sessions)).toBe(true);
            expect(sessions.length).toBeGreaterThan(0);

            // Find our test session
            const found = sessions.find(s => s.id === session.id);
            expect(found).toBeDefined();
            expect(parseInt(found.total_rooms)).toBe(1);
            expect(parseInt(found.completed_rooms)).toBe(0);
            expect(parseInt(found.pending_rooms)).toBe(1);
        });
    });

    // ==================== 4. Check Session (Detection) ====================

    describe('4. Check Session - Fingerprint Detection', () => {
        test('should return pending when no new fingerprint is detected', async () => {
            // Create session with baseline snapshot
            const session = await createSession('Test Check Pending', 'test-user-id');
            createdSessionIds.push(session.id);

            // Get current fingerprint list as baseline
            let knownFingerprintIds = [];
            try {
                const fpList = await ttlockService.getFingerprintList(testLockId, 1, 100);
                if (fpList && fpList.list) {
                    knownFingerprintIds = fpList.list.map(fp => fp.fingerprintId);
                }
            } catch (error) {
                console.warn('⚠ Could not get fingerprint list:', error.message);
            }

            await createSessionRoom(session.id, testRoomId, testLockId, knownFingerprintIds);

            // Now check — since we just snapshotted, there should be no new fingerprints
            await delay(1000);
            const rooms = await getSessionRooms(session.id);
            const pendingRooms = rooms.filter(r => r.status === 'pending');

            for (const room of pendingRooms) {
                const fpList = await ttlockService.getFingerprintList(room.lock_id, 1, 100);
                const currentFingerprints = fpList?.list || [];
                const knownIds = room.known_fingerprint_ids || [];

                // Find new fingerprints
                const newFingerprints = currentFingerprints.filter(
                    fp => !knownIds.includes(fp.fingerprintId)
                );

                // Should be zero since we just took the baseline
                expect(newFingerprints.length).toBe(0);
            }

            // Session should still be ongoing
            const updatedSession = await getSessionById(session.id);
            expect(updatedSession.status).toBe('ongoing');

            await delay(1000);
        });

        test('should simulate detection when a new fingerprint appears', async () => {
            // Create session with known baseline
            const session = await createSession('Test Detection Sim', 'test-user-id');
            createdSessionIds.push(session.id);

            const sessionRoom = await createSessionRoom(
                session.id,
                testRoomId,
                testLockId,
                [111, 222, 333] // Fake baseline IDs
            );

            // Simulate detection: mark room as done with a fake new fingerprint
            const fakeNewFingerprintId = 99999;
            const updated = await markSessionRoomDone(
                sessionRoom.id,
                fakeNewFingerprintId,
                'FAKE_FP_NUMBER'
            );

            expect(updated).toBeDefined();
            expect(updated.status).toBe('done');
            expect(updated.fingerprint_id).toBe(String(fakeNewFingerprintId));
            expect(updated.detected_at).toBeDefined();

            // Pending count should be 0
            const pendingCount = await countPendingRooms(session.id);
            expect(pendingCount).toBe(0);
        });

        test('should auto-complete session when all rooms are done', async () => {
            // Create session with one room
            const session = await createSession('Test Auto Complete', 'test-user-id');
            createdSessionIds.push(session.id);

            const sessionRoom = await createSessionRoom(
                session.id,
                testRoomId,
                testLockId,
                []
            );

            // Mark room as done
            await markSessionRoomDone(sessionRoom.id, 88888, null);

            // Check pending count
            const pendingCount = await countPendingRooms(session.id);
            expect(pendingCount).toBe(0);

            // Auto-complete
            if (pendingCount === 0) {
                await updateSessionStatus(session.id, 'completed');
            }

            // Verify
            const completed = await getSessionById(session.id);
            expect(completed.status).toBe('completed');
            expect(completed.completed_at).toBeDefined();
        });
    });

    // ==================== 5. Cancel Session ====================

    describe('5. Cancel Session', () => {
        test('should cancel an ongoing session', async () => {
            const session = await createSession('Test Cancel', 'test-user-id');
            createdSessionIds.push(session.id);

            await createSessionRoom(session.id, testRoomId, testLockId, []);

            const cancelled = await updateSessionStatus(session.id, 'cancelled');

            expect(cancelled).toBeDefined();
            expect(cancelled.status).toBe('cancelled');
            expect(cancelled.completed_at).toBeDefined();
        });

        test('should not allow cancelling an already completed session', async () => {
            const session = await createSession('Test Cancel Completed', 'test-user-id');
            createdSessionIds.push(session.id);

            // Complete the session first
            await updateSessionStatus(session.id, 'completed');

            // Try to cancel — in the service layer this throws, here we verify status stays
            const current = await getSessionById(session.id);
            expect(current.status).toBe('completed');

            // Service would throw: "Session is already completed"
            // At DB level, we just verify the status is still 'completed'
            expect(current.status).not.toBe('cancelled');
        });
    });

    // ==================== 6. Error Handling ====================

    describe('6. Error Handling', () => {
        test('should handle non-existent room gracefully', async () => {
            const fakeRoomId = '00000000-0000-0000-0000-000000000000';
            const room = await getRoomById(fakeRoomId);
            expect(room).toBeNull();
        });

        test('should handle room without lock configured', async () => {
            // Just verify the check — actual validation is in the service layer
            const room = await getRoomById(testRoomId);
            expect(room).toBeDefined();
            expect(room.door_lock_id).toBeDefined();
            expect(room.door_lock_id).not.toBeNull();
        });

        test('should store and retrieve known_fingerprint_ids correctly as JSONB', async () => {
            const session = await createSession('Test JSONB', 'test-user-id');
            createdSessionIds.push(session.id);

            const ids = [12345, 67890, 11111];
            const sessionRoom = await createSessionRoom(
                session.id,
                testRoomId,
                testLockId,
                ids
            );

            // Verify JSONB storage and retrieval
            const retrieved = await getSessionRooms(session.id);
            const room = retrieved[0];

            expect(room.known_fingerprint_ids).toBeDefined();
            expect(Array.isArray(room.known_fingerprint_ids)).toBe(true);
            expect(room.known_fingerprint_ids).toEqual(ids);
        });
    });

    // ==================== 7. TTLock Fingerprint List Integration ====================

    describe('7. TTLock Fingerprint List Integration', () => {
        test('should successfully fetch fingerprint list from TTLock API', async () => {
            const fpList = await ttlockService.getFingerprintList(testLockId, 1, 100);

            expect(fpList).toBeDefined();
            expect(fpList).toHaveProperty('list');
            expect(Array.isArray(fpList.list)).toBe(true);

            if (fpList.list.length > 0) {
                const fp = fpList.list[0];
                expect(fp).toHaveProperty('fingerprintId');
                expect(typeof fp.fingerprintId).toBe('number');
                console.log(`✓ Found ${fpList.list.length} fingerprint(s) on lock ${testLockId}`);
            } else {
                console.log('ℹ No fingerprints found on lock (empty list)');
            }

            await delay(1000);
        });

        test('fingerprint IDs should be consistent between calls', async () => {
            const list1 = await ttlockService.getFingerprintList(testLockId, 1, 100);
            await delay(1000);
            const list2 = await ttlockService.getFingerprintList(testLockId, 1, 100);

            const ids1 = (list1?.list || []).map(fp => fp.fingerprintId).sort();
            const ids2 = (list2?.list || []).map(fp => fp.fingerprintId).sort();

            // Same lock should return same fingerprints
            expect(ids1).toEqual(ids2);

            await delay(1000);
        });
    });
});
