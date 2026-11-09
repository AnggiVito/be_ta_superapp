/**
 * Room Service
 * Business logic untuk room management
 */

import * as roomModel from '../models/roomModel.js';
import { isValidRoomCategory } from '../constants/roomCategories.js';
import * as ttlockAccountSyncService from './ttlockAccountSyncService.js';
import { logger } from '../../../core/utils/logger.js';

/**
 * Get all rooms
 * @returns {Promise<Array>} List of rooms
 */
export async function getAllRooms() {
  try {
    const rooms = await roomModel.getAllRooms();
    return rooms;
  } catch (error) {
    logger.error('Error in getAllRooms service:', error);
    throw error;
  }
}

/**
 * Get room by ID
 * @param {string} roomId - Room UUID
 * @returns {Promise<object>} Room data
 */
export async function getRoomById(roomId) {
  try {
    const room = await roomModel.getRoomById(roomId);
    
    if (!room) {
      throw new Error('Room not found');
    }
    
    return room;
  } catch (error) {
    logger.error('Error in getRoomById service:', error);
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
    // Validation
    if (!roomData.name || roomData.name.trim() === '') {
      throw new Error('Room name is required');
    }
    
    if (!roomData.capacity || roomData.capacity <= 0) {
      throw new Error('Room capacity must be greater than 0');
    }

    if (roomData.category !== undefined && !isValidRoomCategory(roomData.category)) {
      throw new Error('Invalid room category');
    }
    
    const room = await roomModel.createRoom(roomData);
    return room;
  } catch (error) {
    logger.error('Error in createRoom service:', error);
    throw error;
  }
}

/**
 * Sync TTLock account locks into rooms and passcodes into passcode logs.
 * @param {object} options - Sync options
 * @returns {Promise<object>} Sync summary
 */
export async function syncTtlockAccount(options = {}) {
  try {
    return await ttlockAccountSyncService.syncTtlockAccount(options);
  } catch (error) {
    logger.error('Error in syncTtlockAccount service:', error);
    throw error;
  }
}

/**
 * Update a room
 * @param {string} roomId - Room UUID
 * @param {object} roomData - Updated room data
 * @returns {Promise<object>} Updated room
 */
export async function updateRoom(roomId, roomData) {
  try {
    // Check if room exists
    const existingRoom = await roomModel.getRoomById(roomId);
    if (!existingRoom) {
      throw new Error('Room not found');
    }
    
    // Validation
    if (roomData.name !== undefined && roomData.name.trim() === '') {
      throw new Error('Room name cannot be empty');
    }
    
    if (roomData.capacity !== undefined && roomData.capacity <= 0) {
      throw new Error('Room capacity must be greater than 0');
    }

    if (roomData.category !== undefined && !isValidRoomCategory(roomData.category)) {
      throw new Error('Invalid room category');
    }
    
    const updatedRoom = await roomModel.updateRoom(roomId, roomData);
    return updatedRoom;
  } catch (error) {
    logger.error('Error in updateRoom service:', error);
    throw error;
  }
}

/**
 * Delete a room
 * @param {string} roomId - Room UUID
 * @returns {Promise<object>} Delete result
 */
export async function deleteRoom(roomId) {
  try {
    // Check if room exists
    const existingRoom = await roomModel.getRoomById(roomId);
    if (!existingRoom) {
      throw new Error('Room not found');
    }
    
    const deleted = await roomModel.deleteRoom(roomId);
    
    if (!deleted) {
      throw new Error('Failed to delete room');
    }
    
    return { deleted: true, message: 'Room deleted successfully' };
  } catch (error) {
    logger.error('Error in deleteRoom service:', error);
    throw error;
  }
}

/**
 * Update room occupancy status
 * @param {string} roomId - Room UUID
 * @param {boolean} isOccupied - Occupancy status
 * @returns {Promise<object>} Updated room
 */
export async function updateRoomOccupancy(roomId, isOccupied) {
  try {
    // Check if room exists
    const existingRoom = await roomModel.getRoomById(roomId);
    if (!existingRoom) {
      throw new Error('Room not found');
    }
    
    const updatedRoom = await roomModel.updateRoomOccupancy(roomId, isOccupied);
    return updatedRoom;
  } catch (error) {
    logger.error('Error in updateRoomOccupancy service:', error);
    throw error;
  }
}
