/**
 * Passcode Model
 * Data access layer untuk passcode_logs table
 * Note: Actual passcodes are managed by TTLock API, this is for logging/history
 */

import { roomManagementDb } from '../../../config/databases.js';
import { logger } from '../../../core/utils/logger.js';

/**
 * Log passcode creation
 * @param {object} passcodeData - Passcode information
 * @returns {Promise<object>} Created log entry
 */
export async function logPasscodeCreation(passcodeData) {
  try {
    const result = await roomManagementDb.query(
      `INSERT INTO passcode_logs 
       (room_id, lock_id, passcode_id, passcode_name, passcode_type, 
        start_date, end_date, created_by, action, metadata, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
       RETURNING *`,
      [
        passcodeData.roomId,
        passcodeData.lockId,
        passcodeData.passcodeId || null,
        passcodeData.name,
        passcodeData.type, // 'permanent', 'temporary', 'onetime'
        passcodeData.startDate || null,
        passcodeData.endDate || null,
        passcodeData.createdBy || null,
        'created',
        JSON.stringify(passcodeData.metadata || {}),
      ]
    );
    
    logger.info('Passcode creation logged:', { 
      logId: result.rows[0].id, 
      roomId: passcodeData.roomId,
      type: passcodeData.type 
    });
    
    return result.rows[0];
  } catch (error) {
    logger.error('Error logging passcode creation:', error);
    throw error;
  }
}

/**
 * Log passcode deletion
 * @param {object} deleteData - Deletion information
 * @returns {Promise<object>} Created log entry
 */
export async function logPasscodeDeletion(deleteData) {
  try {
    const result = await roomManagementDb.query(
      `INSERT INTO passcode_logs 
       (room_id, lock_id, passcode_id, passcode_name, deleted_by, action, metadata, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       RETURNING *`,
      [
        deleteData.roomId,
        deleteData.lockId,
        deleteData.passcodeId,
        deleteData.name,
        deleteData.deletedBy || null,
        'deleted',
        JSON.stringify(deleteData.metadata || {}),
      ]
    );
    
    logger.info('Passcode deletion logged:', { 
      logId: result.rows[0].id, 
      passcodeId: deleteData.passcodeId 
    });
    
    return result.rows[0];
  } catch (error) {
    logger.error('Error logging passcode deletion:', error);
    throw error;
  }
}

/**
 * Get passcode logs for a room
 * @param {string} roomId - Room UUID
 * @param {object} options - Query options
 * @returns {Promise<Array>} Passcode logs
 */
export async function getPasscodeLogsByRoom(roomId, options = {}) {
  try {
    const { limit, offset, action, type } = options;
    
    let query = `SELECT * FROM passcode_logs WHERE room_id = $1`;
    const values = [roomId];
    let paramCounter = 2;

    if (action) {
      query += ` AND action = $${paramCounter}`;
      values.push(action);
      paramCounter++;
    }

    if (type) {
      query += ` AND passcode_type = $${paramCounter}`;
      values.push(type);
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
    logger.error('Error getting passcode logs by room:', error);
    throw error;
  }
}

/**
 * Get passcode log by passcode ID
 * @param {number} passcodeId - TTLock passcode ID
 * @returns {Promise<object|null>} Passcode log or null
 */
export async function getPasscodeLogByPasscodeId(passcodeId) {
  try {
    const result = await roomManagementDb.query(
      `SELECT * FROM passcode_logs 
       WHERE passcode_id = $1 AND action = 'created'
       ORDER BY created_at DESC
       LIMIT 1`,
      [passcodeId]
    );
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Error getting passcode log by passcode ID:', error);
    throw error;
  }
}

/**
 * Count passcode logs for a room
 * @param {string} roomId - Room UUID
 * @param {object} filters - Filter options
 * @returns {Promise<number>} Count
 */
export async function countPasscodeLogsByRoom(roomId, filters = {}) {
  try {
    let query = `SELECT COUNT(*) as count FROM passcode_logs WHERE room_id = $1`;
    const values = [roomId];
    let paramCounter = 2;

    if (filters.action) {
      query += ` AND action = $${paramCounter}`;
      values.push(filters.action);
      paramCounter++;
    }

    if (filters.type) {
      query += ` AND passcode_type = $${paramCounter}`;
      values.push(filters.type);
    }

    const result = await roomManagementDb.query(query, values);
    return parseInt(result.rows[0].count);
  } catch (error) {
    logger.error('Error counting passcode logs:', error);
    throw error;
  }
}

/**
 * Get active passcodes for a room (not deleted, not expired)
 * @param {string} roomId - Room UUID
 * @returns {Promise<Array>} Active passcode logs
 */
export async function getActivePasscodesByRoom(roomId) {
  try {
    // Get all created passcodes
    const createdResult = await roomManagementDb.query(
      `SELECT * FROM passcode_logs 
       WHERE room_id = $1 AND action = 'created'`,
      [roomId]
    );

    // Get all deleted passcode IDs
    const deletedResult = await roomManagementDb.query(
      `SELECT passcode_id FROM passcode_logs 
       WHERE room_id = $1 AND action = 'deleted'`,
      [roomId]
    );

    const deletedPasscodeIds = deletedResult.rows.map(row => row.passcode_id);
    const now = new Date();

    // Filter out deleted and expired passcodes
    const activePasscodes = createdResult.rows.filter(pc => {
      // Skip if deleted
      if (deletedPasscodeIds.includes(pc.passcode_id)) {
        return false;
      }

      // Skip if expired (for temporary passcodes)
      if (pc.end_date && new Date(pc.end_date) < now) {
        return false;
      }

      return true;
    });

    return activePasscodes;
  } catch (error) {
    logger.error('Error getting active passcodes:', error);
    throw error;
  }
}

/**
 * Find active (not deleted) practicum-sync passcode logs for a schedule on a room.
 */
export async function findActivePracticumSyncPasscodeLogs(roomId, registrationScheduleId) {
  try {
    const result = await roomManagementDb.query(
      `SELECT pl.*
       FROM passcode_logs pl
       WHERE pl.room_id = $1
         AND pl.action = 'created'
         AND pl.passcode_id IS NOT NULL
         AND (
           pl.metadata->>'registrationScheduleId' = $2
           OR pl.metadata->>'registration_schedule_id' = $2
         )
         AND NOT EXISTS (
           SELECT 1 FROM passcode_logs del
           WHERE del.room_id = pl.room_id
             AND del.passcode_id = pl.passcode_id
             AND del.action = 'deleted'
         )
       ORDER BY pl.created_at ASC`,
      [roomId, registrationScheduleId]
    );
    return result.rows;
  } catch (error) {
    logger.error('Error finding practicum sync passcode logs:', error);
    throw error;
  }
}

/**
 * Find active practicum-sync passcode logs by display name (handles re-imported schedule IDs).
 */
export async function findActivePracticumSyncPasscodeLogsByName(roomId, passcodeName) {
  try {
    const result = await roomManagementDb.query(
      `SELECT pl.*
       FROM passcode_logs pl
       WHERE pl.room_id = $1
         AND pl.action = 'created'
         AND pl.passcode_id IS NOT NULL
         AND pl.passcode_name = $2
         AND COALESCE(pl.metadata->>'source', '') = 'practicum_schedule_sync'
         AND NOT EXISTS (
           SELECT 1 FROM passcode_logs del
           WHERE del.room_id = pl.room_id
             AND del.passcode_id = pl.passcode_id
             AND del.action = 'deleted'
         )
       ORDER BY pl.created_at ASC`,
      [roomId, passcodeName]
    );
    return result.rows;
  } catch (error) {
    logger.error('Error finding practicum sync passcode logs by name:', error);
    throw error;
  }
}

/**
 * Find all active practicum-sync passcodes on a room (for bulk cleanup on re-sync).
 */
export async function findActivePracticumSyncPasscodeLogsByRoom(roomId) {
  try {
    const result = await roomManagementDb.query(
      `SELECT pl.*
       FROM passcode_logs pl
       WHERE pl.room_id = $1
         AND pl.action = 'created'
         AND pl.passcode_id IS NOT NULL
         AND COALESCE(pl.metadata->>'source', '') = 'practicum_schedule_sync'
         AND NOT EXISTS (
           SELECT 1 FROM passcode_logs del
           WHERE del.room_id = pl.room_id
             AND del.passcode_id = pl.passcode_id
             AND del.action = 'deleted'
         )
       ORDER BY pl.created_at ASC`,
      [roomId]
    );
    return result.rows;
  } catch (error) {
    logger.error('Error finding practicum sync passcode logs by room:', error);
    throw error;
  }
}
