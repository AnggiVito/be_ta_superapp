/**
 * Fingerprint Model
 * Data access layer untuk fingerprint_logs table
 * Note: Actual fingerprints are managed by TTLock API, this is for logging/history
 */

import { roomManagementDb } from '../../../config/databases.js';
import { logger } from '../../../core/utils/logger.js';

/**
 * Log fingerprint creation
 * @param {object} data - Fingerprint information
 * @returns {Promise<object>} Created log entry
 */
export async function logFingerprintCreation(data) {
    try {
        const result = await roomManagementDb.query(
            `INSERT INTO fingerprint_logs 
       (room_id, lock_id, fingerprint_id, fingerprint_number, fingerprint_name, 
        fingerprint_type, start_date, end_date, cyclic_config, 
        created_by, action, metadata, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
       RETURNING *`,
            [
                data.roomId,
                data.lockId,
                data.fingerprintId || null,
                data.fingerprintNumber || null,
                data.fingerprintName || null,
                data.fingerprintType || null,
                data.startDate || null,
                data.endDate || null,
                data.cyclicConfig ? JSON.stringify(data.cyclicConfig) : null,
                data.createdBy || null,
                'created',
                JSON.stringify(data.metadata || {}),
            ]
        );

        logger.info('Fingerprint creation logged:', {
            logId: result.rows[0].id,
            roomId: data.roomId,
            fingerprintId: data.fingerprintId,
        });

        return result.rows[0];
    } catch (error) {
        logger.error('Error logging fingerprint creation:', error);
        throw error;
    }
}

/**
 * Log fingerprint deletion
 * @param {object} data - Deletion information
 * @returns {Promise<object>} Created log entry
 */
export async function logFingerprintDeletion(data) {
    try {
        const result = await roomManagementDb.query(
            `INSERT INTO fingerprint_logs 
       (room_id, lock_id, fingerprint_id, fingerprint_name, 
        deleted_by, action, metadata, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       RETURNING *`,
            [
                data.roomId,
                data.lockId,
                data.fingerprintId,
                data.fingerprintName || null,
                data.deletedBy || null,
                'deleted',
                JSON.stringify(data.metadata || {}),
            ]
        );

        logger.info('Fingerprint deletion logged:', {
            logId: result.rows[0].id,
            fingerprintId: data.fingerprintId,
        });

        return result.rows[0];
    } catch (error) {
        logger.error('Error logging fingerprint deletion:', error);
        throw error;
    }
}

/**
 * Get fingerprint logs for a room
 * @param {string} roomId - Room UUID
 * @param {object} options - Query options (limit, offset, action)
 * @returns {Promise<Array>} Fingerprint logs
 */
export async function getFingerprintLogsByRoom(roomId, options = {}) {
    try {
        const { limit, offset, action } = options;

        let query = `SELECT * FROM fingerprint_logs WHERE room_id = $1`;
        const values = [roomId];
        let paramCounter = 2;

        if (action) {
            query += ` AND action = $${paramCounter}`;
            values.push(action);
            paramCounter++;
        }

        query += ` ORDER BY created_at DESC`;

        if (limit) {
            query += ` LIMIT $${paramCounter}`;
            values.push(limit);
            paramCounter++;
        }

        if (offset) {
            query += ` OFFSET $${paramCounter}`;
            values.push(offset);
        }

        const result = await roomManagementDb.query(query, values);
        return result.rows;
    } catch (error) {
        logger.error('Error getting fingerprint logs by room:', error);
        throw error;
    }
}

/**
 * Get fingerprint log by fingerprint ID
 * @param {number} fingerprintId - TTLock fingerprint ID
 * @returns {Promise<object|null>} Fingerprint log or null
 */
export async function getFingerprintLogByFingerprintId(fingerprintId) {
    try {
        const result = await roomManagementDb.query(
            `SELECT * FROM fingerprint_logs 
       WHERE fingerprint_id = $1 AND action = 'created'
       ORDER BY created_at DESC
       LIMIT 1`,
            [fingerprintId]
        );
        return result.rows[0] || null;
    } catch (error) {
        logger.error('Error getting fingerprint log by fingerprint ID:', error);
        throw error;
    }
}

/**
 * Count fingerprint logs for a room
 * @param {string} roomId - Room UUID
 * @param {object} filters - Filter options
 * @returns {Promise<number>} Count
 */
export async function countFingerprintLogsByRoom(roomId, filters = {}) {
    try {
        let query = `SELECT COUNT(*) as count FROM fingerprint_logs WHERE room_id = $1`;
        const values = [roomId];
        let paramCounter = 2;

        if (filters.action) {
            query += ` AND action = $${paramCounter}`;
            values.push(filters.action);
        }

        const result = await roomManagementDb.query(query, values);
        return parseInt(result.rows[0].count);
    } catch (error) {
        logger.error('Error counting fingerprint logs:', error);
        throw error;
    }
}
