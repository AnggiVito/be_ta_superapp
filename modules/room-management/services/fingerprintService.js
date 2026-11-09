/**
 * Fingerprint Service
 * Business logic untuk fingerprint management dengan TTLock integration
 */

import * as roomModel from '../models/roomModel.js';
import * as fingerprintModel from '../models/fingerprintModel.js';
import { ttlockService } from '../../../services/ttlock/ttlockService.js';
import { logger } from '../../../core/utils/logger.js';

/**
 * Add fingerprint to a room's lock
 * @param {string} roomId - Room UUID
 * @param {object} data - Fingerprint data
 * @returns {Promise<object>} Created fingerprint
 */
export async function addFingerprint(roomId, data) {
    try {
        // Get room with lock_id
        const room = await roomModel.getRoomById(roomId);
        if (!room) {
            throw new Error('Room not found');
        }

        if (!room.door_lock_id) {
            throw new Error('Room does not have a smart lock configured');
        }

        // Build optional params
        const options = {};
        if (data.fingerprintName) {
            options.fingerprintName = data.fingerprintName;
        }
        if (data.startDate) {
            options.startDate = data.startDate;
        }
        if (data.endDate) {
            options.endDate = data.endDate;
        }
        if (data.cyclicConfig) {
            options.cyclicConfig = data.cyclicConfig;
        }

        logger.info('Adding fingerprint:', {
            roomId,
            lockId: room.door_lock_id,
            fingerprintNumber: data.fingerprintNumber,
            fingerprintType: data.fingerprintType,
        });

        // Call TTLock API
        const result = await ttlockService.addFingerprint(
            room.door_lock_id,
            data.fingerprintNumber,
            data.fingerprintType,
            options
        );

        // Check if TTLock API returned fingerprint ID
        if (!result || !result.fingerprintId) {
            throw new Error('TTLock API did not return fingerprint data');
        }

        // Log to database
        const log = await fingerprintModel.logFingerprintCreation({
            roomId: room.id,
            lockId: room.door_lock_id,
            fingerprintId: result.fingerprintId,
            fingerprintNumber: data.fingerprintNumber,
            fingerprintName: data.fingerprintName || null,
            fingerprintType: data.fingerprintType,
            startDate: data.startDate ? new Date(data.startDate) : null,
            endDate: data.endDate ? new Date(data.endDate) : null,
            cyclicConfig: data.cyclicConfig || null,
            createdBy: data.createdBy || null,
            metadata: {
                ttlockResponse: result,
            },
        });

        return {
            id: log.id,
            fingerprintId: result.fingerprintId,
            fingerprintNumber: data.fingerprintNumber,
            fingerprintName: data.fingerprintName || null,
            fingerprintType: data.fingerprintType,
            roomId: room.id,
            roomName: room.name,
            lockId: room.door_lock_id,
            createdAt: log.created_at,
        };
    } catch (error) {
        logger.error('Error adding fingerprint:', error);
        throw error;
    }
}

/**
 * Get list of fingerprints for a room (from TTLock API)
 * @param {string} roomId - Room UUID
 * @param {object} options - Query options (pageNo, pageSize)
 * @returns {Promise<object>} Fingerprint list with pagination
 */
export async function getFingerprintList(roomId, options = {}) {
    try {
        // Check if room exists
        const room = await roomModel.getRoomById(roomId);
        if (!room) {
            throw new Error('Room not found');
        }

        if (!room.door_lock_id) {
            throw new Error('Room does not have a smart lock configured');
        }

        const pageNo = options.pageNo || 1;
        const pageSize = options.pageSize || 20;

        logger.info('Getting fingerprint list:', {
            roomId,
            lockId: room.door_lock_id,
            pageNo,
            pageSize,
        });

        // Get fingerprint list from TTLock API
        const result = await ttlockService.getFingerprintList(
            room.door_lock_id,
            pageNo,
            pageSize
        );

        return {
            pageNo,
            pageSize,
            roomId: room.id,
            roomName: room.name,
            lockId: room.door_lock_id,
            list: result.list || [],
        };
    } catch (error) {
        logger.error('Error getting fingerprint list:', error);
        throw error;
    }
}

/**
 * Delete a fingerprint
 * @param {string} roomId - Room UUID
 * @param {number} fingerprintId - TTLock fingerprint ID
 * @param {string} deletedBy - User who deleted the fingerprint
 * @param {number} deleteType - 1=Bluetooth, 2=WiFi gateway (default), 3=NB-IoT
 * @returns {Promise<object>} Delete result
 */
export async function deleteFingerprint(roomId, fingerprintId, deletedBy = null, deleteType = 2) {
    try {
        // Get room
        const room = await roomModel.getRoomById(roomId);
        if (!room) {
            throw new Error('Room not found');
        }

        if (!room.door_lock_id) {
            throw new Error('Room does not have a smart lock configured');
        }

        // Check fingerprint log exists (optional - fingerprint may exist only on lock)
        const fingerprintLog = await fingerprintModel.getFingerprintLogByFingerprintId(fingerprintId);

        // If log exists, verify it belongs to this room
        if (fingerprintLog && fingerprintLog.room_id !== roomId) {
            throw new Error('Fingerprint does not belong to this room');
        }

        logger.info('Deleting fingerprint:', {
            roomId,
            fingerprintId,
            lockId: room.door_lock_id,
            deleteType,
        });

        // Call TTLock API
        await ttlockService.deleteFingerprint(room.door_lock_id, fingerprintId, deleteType);

        // Log deletion
        await fingerprintModel.logFingerprintDeletion({
            roomId: room.id,
            lockId: room.door_lock_id,
            fingerprintId: fingerprintId,
            fingerprintName: fingerprintLog?.fingerprint_name || null,
            deletedBy: deletedBy,
            metadata: {
                deleteType,
            },
        });

        return {
            success: true,
            message: 'Fingerprint deleted successfully',
            fingerprintId: fingerprintId,
        };
    } catch (error) {
        logger.error('Error deleting fingerprint:', error);
        throw error;
    }
}
