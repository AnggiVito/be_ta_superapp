/**
 * Fingerprint Session Service
 * Business logic untuk batch fingerprint registration sessions
 * Includes detection logic to identify newly enrolled fingerprints
 */

import * as roomModel from '../models/roomModel.js';
import * as sessionModel from '../models/fingerprintSessionModel.js';
import * as fingerprintModel from '../models/fingerprintModel.js';
import { ttlockService } from '../../../services/ttlock/ttlockService.js';
import { logger } from '../../../core/utils/logger.js';

/**
 * Create a new fingerprint registration session
 * @param {string} personName - Name of the person
 * @param {Array<string>} roomIds - Array of room UUIDs
 * @param {string} createdBy - User ID who created this session
 * @returns {Promise<object>} Created session with rooms
 */
export async function createSession(personName, roomIds, createdBy) {
    try {
        // Validate all rooms exist and have locks
        const rooms = [];
        for (const roomId of roomIds) {
            const room = await roomModel.getRoomById(roomId);
            if (!room) {
                throw new Error(`Room not found: ${roomId}`);
            }
            if (!room.door_lock_id) {
                throw new Error(`Room "${room.name}" does not have a smart lock configured`);
            }
            rooms.push(room);
        }

        // Create session
        const session = await sessionModel.createSession({
            personName,
            createdBy,
        });

        // For each room, snapshot current fingerprints and create session room
        const sessionRooms = [];
        for (const room of rooms) {
            // Get current fingerprint list from TTLock (baseline snapshot)
            let knownFingerprintIds = [];
            try {
                const fpList = await ttlockService.getFingerprintList(room.door_lock_id, 1, 100);
                if (fpList && fpList.list) {
                    knownFingerprintIds = fpList.list.map(fp => fp.fingerprintId);
                }
            } catch (error) {
                logger.warn(`Could not get fingerprint list for lock ${room.door_lock_id}:`, error.message);
                // Continue anyway — detection will still work, just with empty baseline
            }

            const sessionRoom = await sessionModel.createSessionRoom({
                sessionId: session.id,
                roomId: room.id,
                lockId: room.door_lock_id,
                knownFingerprintIds,
            });

            sessionRooms.push({
                ...sessionRoom,
                room_name: room.name,
            });
        }

        logger.info('Fingerprint session created:', {
            sessionId: session.id,
            personName,
            roomCount: rooms.length,
        });

        return {
            id: session.id,
            personName: session.person_name,
            status: session.status,
            createdBy: session.created_by,
            createdAt: session.created_at,
            rooms: sessionRooms.map(sr => ({
                id: sr.id,
                roomId: sr.room_id,
                roomName: sr.room_name,
                lockId: sr.lock_id,
                status: sr.status,
                knownFingerprintCount: (sr.known_fingerprint_ids || []).length,
            })),
            progress: {
                total: sessionRooms.length,
                completed: 0,
                pending: sessionRooms.length,
                percentage: 0,
            },
        };
    } catch (error) {
        logger.error('Error creating fingerprint session:', error);
        throw error;
    }
}

/**
 * Get session details with room statuses
 */
export async function getSession(sessionId) {
    try {
        const session = await sessionModel.getSessionById(sessionId);
        if (!session) {
            throw new Error('Session not found');
        }

        const rooms = await sessionModel.getSessionRooms(sessionId);

        const completed = rooms.filter(r => r.status === 'done').length;
        const pending = rooms.filter(r => r.status === 'pending').length;
        const failed = rooms.filter(r => r.status === 'failed').length;

        return {
            id: session.id,
            personName: session.person_name,
            status: session.status,
            createdBy: session.created_by,
            createdAt: session.created_at,
            completedAt: session.completed_at,
            rooms: rooms.map(r => ({
                id: r.id,
                roomId: r.room_id,
                roomName: r.room_name,
                lockId: r.lock_id,
                status: r.status,
                fingerprintId: r.fingerprint_id,
                detectedAt: r.detected_at,
            })),
            progress: {
                total: rooms.length,
                completed,
                pending,
                failed,
                percentage: rooms.length > 0 ? Math.round((completed / rooms.length) * 100) : 0,
            },
        };
    } catch (error) {
        logger.error('Error getting session:', error);
        throw error;
    }
}

/**
 * Get all sessions with summary
 */
export async function getAllSessions() {
    try {
        const sessions = await sessionModel.getAllSessions();
        return sessions.map(s => ({
            id: s.id,
            personName: s.person_name,
            status: s.status,
            createdBy: s.created_by,
            createdAt: s.created_at,
            completedAt: s.completed_at,
            progress: {
                total: parseInt(s.total_rooms) || 0,
                completed: parseInt(s.completed_rooms) || 0,
                pending: parseInt(s.pending_rooms) || 0,
                percentage: s.total_rooms > 0
                    ? Math.round((parseInt(s.completed_rooms) / parseInt(s.total_rooms)) * 100)
                    : 0,
            },
        }));
    } catch (error) {
        logger.error('Error getting all sessions:', error);
        throw error;
    }
}

/**
 * Check session for newly enrolled fingerprints (detection logic)
 * Compares current fingerprint list with baseline snapshot
 * 
 * @param {string} sessionId - Session UUID
 * @returns {Promise<object>} Updated session with detection results
 */
export async function checkSession(sessionId) {
    try {
        const session = await sessionModel.getSessionById(sessionId);
        if (!session) {
            throw new Error('Session not found');
        }

        if (session.status !== 'ongoing') {
            throw new Error(`Session is already ${session.status}`);
        }

        const rooms = await sessionModel.getSessionRooms(sessionId);
        const pendingRooms = rooms.filter(r => r.status === 'pending');
        const detectionResults = [];

        for (const room of pendingRooms) {
            try {
                // Get current fingerprint list from TTLock
                const fpList = await ttlockService.getFingerprintList(room.lock_id, 1, 100);
                const currentFingerprints = fpList?.list || [];

                // Get baseline snapshot
                const knownIds = room.known_fingerprint_ids || [];

                // Find new fingerprints (not in baseline)
                const newFingerprints = currentFingerprints.filter(
                    fp => !knownIds.includes(fp.fingerprintId)
                );

                if (newFingerprints.length > 0) {
                    // Take the most recent new fingerprint
                    const detected = newFingerprints[newFingerprints.length - 1];

                    // Mark room as done
                    await sessionModel.markSessionRoomDone(
                        room.id,
                        detected.fingerprintId,
                        detected.fingerprintNumber || null
                    );

                    // Log to fingerprint_logs for audit trail
                    await fingerprintModel.logFingerprintCreation({
                        roomId: room.room_id,
                        lockId: room.lock_id,
                        fingerprintId: detected.fingerprintId,
                        fingerprintNumber: detected.fingerprintNumber || null,
                        fingerprintName: session.person_name,
                        fingerprintType: detected.fingerprintType || 1,
                        createdBy: session.created_by,
                        metadata: {
                            sessionId: session.id,
                            detectedViaSession: true,
                        },
                    });

                    detectionResults.push({
                        roomId: room.room_id,
                        roomName: room.room_name,
                        status: 'done',
                        fingerprintId: detected.fingerprintId,
                        message: `New fingerprint detected for ${session.person_name}`,
                    });

                    logger.info('Fingerprint detected:', {
                        sessionId,
                        roomName: room.room_name,
                        fingerprintId: detected.fingerprintId,
                    });
                } else {
                    detectionResults.push({
                        roomId: room.room_id,
                        roomName: room.room_name,
                        status: 'pending',
                        message: 'No new fingerprint detected yet',
                    });
                }
            } catch (error) {
                logger.error(`Error checking fingerprints for room ${room.room_name}:`, error);
                detectionResults.push({
                    roomId: room.room_id,
                    roomName: room.room_name,
                    status: 'error',
                    message: error.message,
                });
            }
        }

        // Check if all rooms are done → auto-complete session
        const pendingCount = await sessionModel.countPendingRooms(sessionId);
        if (pendingCount === 0) {
            await sessionModel.updateSessionStatus(sessionId, 'completed');
        }

        // Return updated session
        const updatedSession = await getSession(sessionId);
        return {
            ...updatedSession,
            detectionResults,
        };
    } catch (error) {
        logger.error('Error checking session:', error);
        throw error;
    }
}

/**
 * Cancel a session
 */
export async function cancelSession(sessionId) {
    try {
        const session = await sessionModel.getSessionById(sessionId);
        if (!session) {
            throw new Error('Session not found');
        }

        if (session.status !== 'ongoing') {
            throw new Error(`Session is already ${session.status}`);
        }

        await sessionModel.updateSessionStatus(sessionId, 'cancelled');

        return {
            id: sessionId,
            status: 'cancelled',
            message: 'Session cancelled successfully',
        };
    } catch (error) {
        logger.error('Error cancelling session:', error);
        throw error;
    }
}
