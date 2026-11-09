/**
 * Room Model
 * Data access layer untuk rooms table
 */

import { roomManagementDb } from '../../../config/databases.js';
import { logger } from '../../../core/utils/logger.js';

/**
 * Get all rooms
 * @returns {Promise<Array>} List of rooms
 */
export async function getAllRooms() {
  try {
    const result = await roomManagementDb.query(
      `SELECT * FROM rooms 
       ORDER BY created_at DESC`
    );
    return result.rows;
  } catch (error) {
    logger.error('Error getting all rooms:', error);
    throw error;
  }
}

/**
 * Get room by ID
 * @param {string} roomId - Room UUID
 * @returns {Promise<object|null>} Room data or null
 */
export async function getRoomById(roomId) {
  try {
    const result = await roomManagementDb.query(
      `SELECT * FROM rooms WHERE id = $1`,
      [roomId]
    );
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Error getting room by ID:', error);
    throw error;
  }
}

/**
 * Create a new room
 * @param {object} roomData - Room data
 * @returns {Promise<object>} Created room
 */
export async function createRoom(roomData) {
  try {
    const result = await roomManagementDb.query(
      `INSERT INTO rooms (name, capacity, is_occupied, door_lock_id, category, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       RETURNING *`,
      [
        roomData.name,
        roomData.capacity,
        roomData.is_occupied || false,
        roomData.door_lock_id || null,
        roomData.category ?? null,
      ]
    );
    
    logger.info('Room created:', { roomId: result.rows[0].id, name: roomData.name });
    return result.rows[0];
  } catch (error) {
    logger.error('Error creating room:', error);
    throw error;
  }
}

/**
 * Update a room
 * @param {string} roomId - Room UUID
 * @param {object} roomData - Updated room data
 * @returns {Promise<object|null>} Updated room or null
 */
export async function updateRoom(roomId, roomData) {
  try {
    // Build dynamic update query
    const updateFields = [];
    const values = [];
    let paramCounter = 1;

    if (roomData.name !== undefined) {
      updateFields.push(`name = $${paramCounter}`);
      values.push(roomData.name);
      paramCounter++;
    }
    
    if (roomData.capacity !== undefined) {
      updateFields.push(`capacity = $${paramCounter}`);
      values.push(roomData.capacity);
      paramCounter++;
    }
    
    if (roomData.is_occupied !== undefined) {
      updateFields.push(`is_occupied = $${paramCounter}`);
      values.push(roomData.is_occupied);
      paramCounter++;
    }
    
    if (roomData.door_lock_id !== undefined) {
      updateFields.push(`door_lock_id = $${paramCounter}`);
      values.push(roomData.door_lock_id);
      paramCounter++;
    }

    if (roomData.category !== undefined) {
      updateFields.push(`category = $${paramCounter}`);
      values.push(roomData.category);
      paramCounter++;
    }

    if (updateFields.length === 0) {
      // No fields to update, return current room
      return getRoomById(roomId);
    }

    updateFields.push(`updated_at = NOW()`);
    values.push(roomId);

    const query = `
      UPDATE rooms 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramCounter}
      RETURNING *
    `;

    const result = await roomManagementDb.query(query, values);
    
    if (result.rows.length > 0) {
      logger.info('Room updated:', { roomId, updates: Object.keys(roomData) });
    }
    
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Error updating room:', error);
    throw error;
  }
}

/**
 * Delete a room
 * @param {string} roomId - Room UUID
 * @returns {Promise<boolean>} True if deleted, false if not found
 */
export async function deleteRoom(roomId) {
  try {
    const result = await roomManagementDb.query(
      `DELETE FROM rooms WHERE id = $1 RETURNING id`,
      [roomId]
    );
    
    const deleted = result.rows.length > 0;
    if (deleted) {
      logger.info('Room deleted:', { roomId });
    }
    
    return deleted;
  } catch (error) {
    logger.error('Error deleting room:', error);
    throw error;
  }
}

/**
 * Update room occupancy status
 * @param {string} roomId - Room UUID
 * @param {boolean} isOccupied - Occupancy status
 * @returns {Promise<object|null>} Updated room or null
 */
export async function updateRoomOccupancy(roomId, isOccupied) {
  try {
    const result = await roomManagementDb.query(
      `UPDATE rooms 
       SET is_occupied = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [isOccupied, roomId]
    );
    
    if (result.rows.length > 0) {
      logger.info('Room occupancy updated:', { roomId, isOccupied });
    }
    
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Error updating room occupancy:', error);
    throw error;
  }
}
