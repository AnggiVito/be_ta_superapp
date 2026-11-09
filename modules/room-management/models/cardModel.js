/**
 * IC Card Model
 * Database operations for card_logs table
 */

import { roomManagementDb } from '../../../config/databases.js';
import { logger } from '../../../core/utils/logger.js';

/**
 * Log IC card creation
 * @param {object} data - Card information
 * @returns {Promise<object>} Created log entry
 */
export async function logCardCreation(data) {
    try {
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
                'created',
                JSON.stringify(data.metadata || {}),
            ]
        );

        logger.info('IC card creation logged:', {
            logId: result.rows[0].id,
            roomId: data.roomId,
            cardId: data.cardId,
        });

        return result.rows[0];
    } catch (error) {
        logger.error('Error logging IC card creation:', error);
        throw error;
    }
}

/**
 * Log IC card deletion
 * @param {object} data - Card deletion information
 * @returns {Promise<object>} Created log entry
 */
export async function logCardDeletion(data) {
    try {
        const result = await roomManagementDb.query(
            `INSERT INTO card_logs 
       (room_id, lock_id, card_id, card_number, card_name,
        start_date, end_date, deleted_by, action, metadata, created_at, updated_at)
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
                data.deletedBy || null,
                'deleted',
                JSON.stringify(data.metadata || {}),
            ]
        );

        logger.info('IC card deletion logged:', {
            logId: result.rows[0].id,
            roomId: data.roomId,
            cardId: data.cardId,
        });

        return result.rows[0];
    } catch (error) {
        logger.error('Error logging IC card deletion:', error);
        throw error;
    }
}

/**
 * Get card logs for a room
 * @param {string} roomId - Room UUID
 * @param {object} options - Query options
 * @returns {Promise<Array>} Card log entries
 */
export async function getCardLogsByRoom(roomId, options = {}) {
    try {
        const { limit, offset, action } = options;

        let query = `SELECT * FROM card_logs WHERE room_id = $1`;
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
        logger.error('Error getting card logs:', error);
        throw error;
    }
}

/**
 * Get card creation log by TTLock card ID
 * @param {number} cardId - TTLock card ID
 * @returns {Promise<object|null>} Card log or null
 */
export async function getCardLogByCardId(cardId) {
    try {
        const result = await roomManagementDb.query(
            `SELECT * FROM card_logs
       WHERE card_id = $1 AND action = 'created'
       ORDER BY created_at DESC
       LIMIT 1`,
            [cardId]
        );
        return result.rows[0] || null;
    } catch (error) {
        logger.error('Error getting card log by card ID:', error);
        throw error;
    }
}

/**
 * Find the latest created card log for a room + TTLock card ID.
 */
export async function getCardLogByRoomAndCardId(roomId, cardId) {
    try {
        const result = await roomManagementDb.query(
            `SELECT * FROM card_logs
       WHERE room_id = $1
         AND card_id = $2
         AND action = 'created'
       ORDER BY created_at DESC
       LIMIT 1`,
            [roomId, cardId]
        );
        return result.rows[0] || null;
    } catch (error) {
        logger.error('Error getting card log by room and card ID:', error);
        throw error;
    }
}

/**
 * Find the latest created card log for a room + card number (USB reader format).
 */
export async function getLatestCreatedCardLogByRoomAndNumber(roomId, cardNumber) {
    try {
        const result = await roomManagementDb.query(
            `SELECT * FROM card_logs
       WHERE room_id = $1
         AND card_number = $2
         AND action = 'created'
       ORDER BY created_at DESC
       LIMIT 1`,
            [roomId, cardNumber]
        );
        return result.rows[0] || null;
    } catch (error) {
        logger.error('Error getting card log by room and card number:', error);
        throw error;
    }
}

/**
 * Check if a card has already been deleted in a room
 * @param {string} roomId - Room UUID
 * @param {number} cardId - TTLock card ID
 * @returns {Promise<boolean>}
 */
export async function isCardDeletedInRoom(roomId, cardId) {
    try {
        const result = await roomManagementDb.query(
            `SELECT 1 FROM card_logs
       WHERE room_id = $1 AND card_id = $2 AND action = 'deleted'
       LIMIT 1`,
            [roomId, cardId]
        );
        return result.rows.length > 0;
    } catch (error) {
        logger.error('Error checking card deletion status:', error);
        throw error;
    }
}

/**
 * Get deleted card IDs for a room
 * @param {string} roomId - Room UUID
 * @returns {Promise<Set<number>>}
 */
export async function getDeletedCardIdsByRoom(roomId) {
    try {
        const result = await roomManagementDb.query(
            `SELECT DISTINCT card_id FROM card_logs
       WHERE room_id = $1 AND action = 'deleted' AND card_id IS NOT NULL`,
            [roomId]
        );
        return new Set(result.rows.map((row) => row.card_id));
    } catch (error) {
        logger.error('Error getting deleted card IDs:', error);
        throw error;
    }
}

/**
 * Count card logs for a room
 * @param {string} roomId - Room UUID
 * @param {object} filters - Filter options
 * @returns {Promise<number>} Count
 */
/**
 * Find active (not deleted) practicum-sync card logs for a schedule on a room.
 */
export async function findActivePracticumSyncCardLogs(roomId, registrationScheduleId) {
  try {
    const result = await roomManagementDb.query(
      `SELECT cl.*
       FROM card_logs cl
       WHERE cl.room_id = $1
         AND cl.action = 'created'
         AND cl.card_id IS NOT NULL
         AND (
           cl.metadata->>'registrationScheduleId' = $2
           OR cl.metadata->>'registration_schedule_id' = $2
         )
         AND NOT EXISTS (
           SELECT 1 FROM card_logs del
           WHERE del.room_id = cl.room_id
             AND del.card_id = cl.card_id
             AND del.action = 'deleted'
         )
       ORDER BY cl.created_at ASC`,
      [roomId, registrationScheduleId]
    );
    return result.rows;
  } catch (error) {
    logger.error('Error finding practicum sync card logs:', error);
    throw error;
  }
}

/**
 * Active practicum-sync card logs for a room + USB reader card number.
 */
export async function findActivePracticumSyncCardLogsByNumber(roomId, cardNumber) {
  try {
    const result = await roomManagementDb.query(
      `SELECT cl.*
       FROM card_logs cl
       WHERE cl.room_id = $1
         AND cl.action = 'created'
         AND cl.card_number = $2
         AND cl.card_id IS NOT NULL
         AND cl.metadata->>'source' = 'practicum_schedule_sync'
         AND NOT EXISTS (
           SELECT 1 FROM card_logs del
           WHERE del.room_id = cl.room_id
             AND del.card_id = cl.card_id
             AND del.action = 'deleted'
         )
       ORDER BY cl.created_at ASC`,
      [roomId, cardNumber]
    );
    return result.rows;
  } catch (error) {
    logger.error('Error finding practicum sync card logs by number:', error);
    throw error;
  }
}

/**
 * Active IC card registrations for a room (created, not deleted).
 */
export async function getActiveCreatedCardLogs(roomId) {
  try {
    const result = await roomManagementDb.query(
      `SELECT cl.*
       FROM card_logs cl
       WHERE cl.room_id = $1
         AND cl.action = 'created'
         AND cl.card_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM card_logs del
           WHERE del.room_id = cl.room_id
             AND del.card_id = cl.card_id
             AND del.action = 'deleted'
         )
       ORDER BY cl.start_date ASC NULLS LAST, cl.created_at ASC`,
      [roomId]
    );
    return result.rows;
  } catch (error) {
    logger.error('Error getting active created card logs:', error);
    throw error;
  }
}

/**
 * Find active created card logs for a room/card/time window (legacy cleanup).
 */
export async function findActiveCreatedCardLogsForWindow(roomId, cardNumber, startDate, endDate) {
  try {
    const result = await roomManagementDb.query(
      `SELECT cl.*
       FROM card_logs cl
       WHERE cl.room_id = $1
         AND cl.action = 'created'
         AND cl.card_number = $2
         AND cl.card_id IS NOT NULL
         AND cl.start_date = $3::timestamp
         AND cl.end_date = $4::timestamp
         AND NOT EXISTS (
           SELECT 1 FROM card_logs del
           WHERE del.room_id = cl.room_id
             AND del.card_id = cl.card_id
             AND del.action = 'deleted'
         )
       ORDER BY cl.created_at ASC`,
      [roomId, cardNumber, startDate, endDate]
    );
    return result.rows;
  } catch (error) {
    logger.error('Error finding card logs for window:', error);
    throw error;
  }
}

export async function countCardLogsByRoom(roomId, filters = {}) {
    try {
        let query = `SELECT COUNT(*) as count FROM card_logs WHERE room_id = $1`;
        const values = [roomId];
        let paramCounter = 2;

        if (filters.action) {
            query += ` AND action = $${paramCounter}`;
            values.push(filters.action);
        }

        const result = await roomManagementDb.query(query, values);
        return parseInt(result.rows[0].count, 10);
    } catch (error) {
        logger.error('Error counting card logs:', error);
        throw error;
    }
}
