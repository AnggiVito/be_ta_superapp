/**
 * Room Controller
 * HTTP handlers untuk room management
 */

import * as roomService from '../services/roomService.js';
import { logger } from '../../../core/utils/logger.js';

/**
 * Get all rooms
 * GET /api/room-management/rooms
 */
export async function getAllRooms(req, res) {
  try {
    const rooms = await roomService.getAllRooms();

    res.json({
      success: true,
      data: rooms,
    });
  } catch (error) {
    logger.error('Error in getAllRooms controller:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error getting rooms',
    });
  }
}

/**
 * Get room by ID
 * GET /api/room-management/rooms/:id
 */
export async function getRoomById(req, res) {
  try {
    const { id } = req.params;
    const room = await roomService.getRoomById(id);

    res.json({
      success: true,
      data: room,
    });
  } catch (error) {
    logger.error('Error in getRoomById controller:', error);
    const statusCode = error.message === 'Room not found' ? 404 : 500;
    res.status(statusCode).json({
      success: false,
      message: error.message || 'Error getting room',
    });
  }
}

/**
 * Create a new room
 * POST /api/room-management/rooms
 */
export async function createRoom(req, res) {
  try {
    const roomData = req.body;
    const room = await roomService.createRoom(roomData);

    res.status(201).json({
      success: true,
      message: 'Room created successfully',
      data: room,
    });
  } catch (error) {
    logger.error('Error in createRoom controller:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Error creating room',
    });
  }
}

/**
 * Sync TTLock account locks and passcodes
 * POST /api/room-management/rooms/sync-ttlock-account
 */
export async function syncTtlockAccount(req, res) {
  try {
    const defaultCapacity = req.body?.defaultCapacity;
    const result = await roomService.syncTtlockAccount({
      defaultCapacity,
      createdBy: req.user?.id || null,
    });

    res.json({
      success: true,
      message: 'TTLock account synced successfully',
      data: result,
    });
  } catch (error) {
    logger.error('Error in syncTtlockAccount controller:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error syncing TTLock account',
    });
  }
}

/**
 * Update a room
 * PUT /api/room-management/rooms/:id
 */
export async function updateRoom(req, res) {
  try {
    const { id } = req.params;
    const roomData = req.body;
    const room = await roomService.updateRoom(id, roomData);

    res.json({
      success: true,
      message: 'Room updated successfully',
      data: room,
    });
  } catch (error) {
    logger.error('Error in updateRoom controller:', error);
    const statusCode = error.message === 'Room not found' ? 404 : 400;
    res.status(statusCode).json({
      success: false,
      message: error.message || 'Error updating room',
    });
  }
}

/**
 * Delete a room
 * DELETE /api/room-management/rooms/:id
 */
export async function deleteRoom(req, res) {
  try {
    const { id } = req.params;
    const result = await roomService.deleteRoom(id);

    res.json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    logger.error('Error in deleteRoom controller:', error);
    const statusCode = error.message === 'Room not found' ? 404 : 500;
    res.status(statusCode).json({
      success: false,
      message: error.message || 'Error deleting room',
    });
  }
}

/**
 * Update room occupancy (occupy)
 * PATCH /api/room-management/rooms/:id/occupy
 */
export async function occupyRoom(req, res) {
  try {
    const { id } = req.params;
    const room = await roomService.updateRoomOccupancy(id, true);

    res.json({
      success: true,
      message: 'Room marked as occupied',
      data: room,
    });
  } catch (error) {
    logger.error('Error in occupyRoom controller:', error);
    const statusCode = error.message === 'Room not found' ? 404 : 500;
    res.status(statusCode).json({
      success: false,
      message: error.message || 'Error updating room occupancy',
    });
  }
}

/**
 * Update room occupancy (vacate)
 * PATCH /api/room-management/rooms/:id/vacate
 */
export async function vacateRoom(req, res) {
  try {
    const { id } = req.params;
    const room = await roomService.updateRoomOccupancy(id, false);

    res.json({
      success: true,
      message: 'Room marked as vacant',
      data: room,
    });
  } catch (error) {
    logger.error('Error in vacateRoom controller:', error);
    const statusCode = error.message === 'Room not found' ? 404 : 500;
    res.status(statusCode).json({
      success: false,
      message: error.message || 'Error updating room occupancy',
    });
  }
}

/**
 * Get battery level of the room's smart lock
 * GET /api/room-management/rooms/:roomId/battery
 */
export async function getBatteryLevel(req, res) {
  try {
    const { roomId } = req.params;
    const room = await roomService.getRoomById(roomId);

    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Room not found',
      });
    }

    if (!room.door_lock_id) {
      return res.status(400).json({
        success: false,
        message: 'Room does not have a smart lock configured',
      });
    }

    const { ttlockService } = await import('../../../services/ttlock/ttlockService.js');
    const result = await ttlockService.queryElectricQuantity(room.door_lock_id);

    res.json({
      success: true,
      message: 'Battery level retrieved successfully',
      data: {
        roomId: room.id,
        roomName: room.name,
        lockId: room.door_lock_id,
        electricQuantity: result.electricQuantity,
        batteryLevel: result.electricQuantity,
      },
    });
  } catch (error) {
    logger.error('Error in getBatteryLevel controller:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error getting battery level',
    });
  }
}
