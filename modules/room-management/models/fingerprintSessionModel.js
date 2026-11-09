/**
 * Fingerprint Session Model
 * Data access layer untuk fingerprint_sessions and fingerprint_session_rooms tables
 */

import { roomManagementDb } from '../../../config/databases.js';
import { logger } from '../../../core/utils/logger.js';

// ==================== Session CRUD ====================

/**
 * Create a new fingerprint registration session
 */
export async function createSession(data) {
    try {
        const result = await roomManagementDb.query(
            `INSERT INTO fingerprint_sessions (person_name, status, created_by, created_at, updated_at)
             VALUES ($1, 'ongoing', $2, NOW(), NOW())
             RETURNING *`,
            [data.personName, data.createdBy || null]
        );
        return result.rows[0];
    } catch (error) {
        logger.error('Error creating fingerprint session:', error);
        throw error;
    }
}

/**
 * Get session by ID
 */
export async function getSessionById(sessionId) {
    try {
        const result = await roomManagementDb.query(
            `SELECT * FROM fingerprint_sessions WHERE id = $1`,
            [sessionId]
        );
        return result.rows[0] || null;
    } catch (error) {
        logger.error('Error getting session by ID:', error);
        throw error;
    }
}

/**
 * Get all sessions with room count summary
 */
export async function getAllSessions() {
    try {
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
    } catch (error) {
        logger.error('Error getting all sessions:', error);
        throw error;
    }
}

/**
 * Update session status
 */
export async function updateSessionStatus(sessionId, status) {
    try {
        const completedAt = status === 'completed' || status === 'cancelled' ? 'NOW()' : 'NULL';
        const result = await roomManagementDb.query(
            `UPDATE fingerprint_sessions 
             SET status = $1, updated_at = NOW(), completed_at = ${completedAt}
             WHERE id = $2
             RETURNING *`,
            [status, sessionId]
        );
        return result.rows[0] || null;
    } catch (error) {
        logger.error('Error updating session status:', error);
        throw error;
    }
}

// ==================== Session Room CRUD ====================

/**
 * Create a session room record
 */
export async function createSessionRoom(data) {
    try {
        const result = await roomManagementDb.query(
            `INSERT INTO fingerprint_session_rooms 
             (session_id, room_id, lock_id, status, known_fingerprint_ids, created_at, updated_at)
             VALUES ($1, $2, $3, 'pending', $4, NOW(), NOW())
             RETURNING *`,
            [
                data.sessionId,
                data.roomId,
                data.lockId,
                JSON.stringify(data.knownFingerprintIds || []),
            ]
        );
        return result.rows[0];
    } catch (error) {
        logger.error('Error creating session room:', error);
        throw error;
    }
}

/**
 * Get all rooms for a session
 */
export async function getSessionRooms(sessionId) {
    try {
        const result = await roomManagementDb.query(
            `SELECT fsr.*, r.name as room_name
             FROM fingerprint_session_rooms fsr
             JOIN rooms r ON fsr.room_id = r.id
             WHERE fsr.session_id = $1
             ORDER BY r.name ASC`,
            [sessionId]
        );
        return result.rows;
    } catch (error) {
        logger.error('Error getting session rooms:', error);
        throw error;
    }
}

/**
 * Mark a session room as done (fingerprint detected)
 */
export async function markSessionRoomDone(sessionRoomId, fingerprintId, fingerprintNumber) {
    try {
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
    } catch (error) {
        logger.error('Error marking session room done:', error);
        throw error;
    }
}

/**
 * Mark a session room as failed
 */
export async function markSessionRoomFailed(sessionRoomId) {
    try {
        const result = await roomManagementDb.query(
            `UPDATE fingerprint_session_rooms 
             SET status = 'failed', updated_at = NOW()
             WHERE id = $1
             RETURNING *`,
            [sessionRoomId]
        );
        return result.rows[0] || null;
    } catch (error) {
        logger.error('Error marking session room failed:', error);
        throw error;
    }
}

/**
 * Count pending rooms in a session
 */
export async function countPendingRooms(sessionId) {
    try {
        const result = await roomManagementDb.query(
            `SELECT COUNT(*) as count FROM fingerprint_session_rooms 
             WHERE session_id = $1 AND status = 'pending'`,
            [sessionId]
        );
        return parseInt(result.rows[0].count);
    } catch (error) {
        logger.error('Error counting pending rooms:', error);
        throw error;
    }
}
