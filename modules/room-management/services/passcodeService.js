/**
 * Passcode Service
 * Business logic untuk passcode management dengan TTLock integration
 */

import * as roomModel from '../models/roomModel.js';
import * as passcodeModel from '../models/passcodeModel.js';
import { ttlockService } from '../../../services/ttlock/ttlockService.js';
import { logger } from '../../../core/utils/logger.js';
import {
  coerceWibNaiveTimestamp,
  wibToUtcTimestamp,
  wibToWallClockTimestamp,
} from './timezoneUtil.js';

/**
 * Create a permanent passcode
 * @param {string} roomId - Room UUID
 * @param {object} data - Passcode data
 * @returns {Promise<object>} Created passcode
 */
export async function createPermanentPasscode(roomId, data) {
  try {
    // Get room with lock_id
    const room = await roomModel.getRoomById(roomId);
    if (!room) {
      throw new Error('Room not found');
    }

    if (!room.door_lock_id) {
      throw new Error('Room does not have a smart lock configured');
    }

    // Create passcode via TTLock API
    logger.info('Creating permanent passcode:', {
      roomId,
      lockId: room.door_lock_id,
      name: data.name,
    });

    // Permanent passcode always auto-generated (8 digits)
    const result = await ttlockService.createPermanentPasscode(
      room.door_lock_id,
      data.name
    );

    // Check if TTLock API returned error
    if (!result || !result.keyboardPwdId) {
      throw new Error('TTLock API did not return passcode data');
    }

    // Log to database
    const log = await passcodeModel.logPasscodeCreation({
      roomId: room.id,
      lockId: room.door_lock_id,
      passcodeId: result.keyboardPwdId,
      name: data.name,
      type: 'permanent',
      startDate: null,
      endDate: null,
      createdBy: data.createdBy || null,
      metadata: {
        ...(data.metadata || {}),
        passcode: result.keyboardPwd,
        ttlockResponse: result,
      },
    });

    return {
      id: log.id,
      passcodeId: result.keyboardPwdId,
      passcode: result.keyboardPwd,
      name: data.name,
      type: 'permanent',
      roomId: room.id,
      roomName: room.name,
      lockId: room.door_lock_id,
      createdAt: log.created_at,
    };
  } catch (error) {
    logger.error('Error creating permanent passcode:', error);
    throw error;
  }
}

/**
 * Create a temporary passcode
 * @param {string} roomId - Room UUID
 * @param {object} data - Passcode data
 * @returns {Promise<object>} Created passcode
 */
export async function createTemporaryPasscode(roomId, data) {
  try {
    // Get room with lock_id
    const room = await roomModel.getRoomById(roomId);
    if (!room) {
      throw new Error('Room not found');
    }

    if (!room.door_lock_id) {
      throw new Error('Room does not have a smart lock configured');
    }

    // Parse dates as WIB wall-clock for TTLock passcode API.
    // NOTE: TTLock passcode API interprets timestamps as wall-clock (not UTC),
    // unlike the IC card API which expects true UTC. Use wibToWallClockTimestamp
    // for TTLock, and wibToUtcTimestamp only for local validation against Date.now().
    const startTimestamp = wibToWallClockTimestamp(data.startDate);
    const endTimestamp = wibToWallClockTimestamp(data.endDate);
    const startTimestampUtc = wibToUtcTimestamp(data.startDate);
    const endTimestampUtc = wibToUtcTimestamp(data.endDate);
    const nowTimestamp = Date.now();
    const isPracticumSync = data.metadata?.source === 'practicum_schedule_sync';

    // Practicum schedules may start earlier the same day; only require the window to end in future.
    if (isPracticumSync) {
      if (endTimestampUtc <= nowTimestamp) {
        throw new Error('Schedule end date must be in the future');
      }
    } else if (startTimestampUtc < nowTimestamp - 12 * 60 * 60 * 1000) {
      throw new Error('Start date must be in the future or recent');
    }

    if (endTimestampUtc <= startTimestampUtc) {
      throw new Error('End date must be after start date');
    }

    logger.info('Creating temporary passcode:', {
      roomId,
      lockId: room.door_lock_id,
      name: data.name,
      startDate: data.startDate,
      endDate: data.endDate,
    });

    const result = await ttlockService.createTemporaryPasscode(
      room.door_lock_id,
      data.name,
      startTimestamp,
      endTimestamp,
      data.passcode
    );

    if (!result || !result.keyboardPwdId) {
      throw new Error('TTLock API did not return passcode data');
    }

    // Log to database
    const log = await passcodeModel.logPasscodeCreation({
      roomId: room.id,
      lockId: room.door_lock_id,
      passcodeId: result.keyboardPwdId,
      name: data.name,
      type: 'temporary',
      startDate: coerceWibNaiveTimestamp(data.startDate),
      endDate: coerceWibNaiveTimestamp(data.endDate),
      createdBy: data.createdBy || null,
      metadata: {
        ...(data.metadata || {}),
        passcode: result.keyboardPwd,
        originalStartDate: data.startDate,
        originalEndDate: data.endDate,
        ttlockResponse: result,
      },
    });

    return {
      id: log.id,
      passcodeId: result.keyboardPwdId,
      passcode: result.keyboardPwd,
      name: data.name,
      type: 'temporary',
      startDate: data.startDate,
      endDate: data.endDate,
      startTimestamp: startTimestamp,
      endTimestamp: endTimestamp,
      roomId: room.id,
      roomName: room.name,
      lockId: room.door_lock_id,
      createdAt: log.created_at,
    };
  } catch (error) {
    logger.error('Error creating temporary passcode:', error);
    throw error;
  }
}

/**
 * Create a one-time passcode (keyboardPwdType: 1)
 * Passcode yang hanya bisa digunakan 1 kali dalam periode validityHours
 * @param {string} roomId - Room UUID
 * @param {object} data - Passcode data
 * @returns {Promise<object>} Created passcode
 */
export async function createOneTimePasscode(roomId, data) {
  try {
    // Get room with lock_id
    const room = await roomModel.getRoomById(roomId);
    if (!room) {
      throw new Error('Room not found');
    }

    if (!room.door_lock_id) {
      throw new Error('Room does not have a smart lock configured');
    }

    // Validate required fields
    if (!data.name || data.name.trim().length === 0) {
      throw new Error('Passcode name is required');
    }

    if (data.name.length > 100) {
      throw new Error('Passcode name must be less than 100 characters');
    }

    // Default validity is 6 hours
    const validityHours = data.validityHours || 6;
    const now = new Date();
    const endDate = new Date(now.getTime() + validityHours * 60 * 60 * 1000);

    logger.info('Creating one-time passcode:', {
      roomId,
      lockId: room.door_lock_id,
      name: data.name,
      validityHours,
    });

    // Use createOnetimePasscode method (keyboardPwdType: 1)
    const result = await ttlockService.createOnetimePasscode(
      room.door_lock_id,
      data.name,
      validityHours
    );

    if (!result || !result.keyboardPwdId) {
      throw new Error('TTLock API did not return passcode data');
    }

    // Log to database
    const log = await passcodeModel.logPasscodeCreation({
      roomId: room.id,
      lockId: room.door_lock_id,
      passcodeId: result.keyboardPwdId,
      name: data.name,
      type: 'onetime',
      startDate: now,
      endDate: endDate,
      createdBy: data.createdBy || null,
      metadata: {
        ...(data.metadata || {}),
        passcode: result.keyboardPwd,
        validityHours: validityHours,
        ttlockResponse: result,
        note: `Passcode can only be used once within ${validityHours} hours`,
      },
    });

    return {
      id: log.id,
      passcodeId: result.keyboardPwdId,
      passcode: result.keyboardPwd,
      name: data.name,
      type: 'onetime',
      validityHours,
      startDate: now.toISOString(),
      endDate: endDate.toISOString(),
      roomId: room.id,
      roomName: room.name,
      lockId: room.door_lock_id,
      createdAt: log.created_at,
    };
  } catch (error) {
    logger.error('Error creating one-time passcode:', error);
    throw error;
  }
}

/**
 * Get list of passcodes for a room
 * @param {string} roomId - Room UUID
 * @param {object} options - Query options
 * @returns {Promise<object>} Passcode list with pagination
 */
export async function getPasscodeList(roomId, options = {}) {
  try {
    // Check if room exists
    const room = await roomModel.getRoomById(roomId);
    if (!room) {
      throw new Error('Room not found');
    }

    const pageNo = options.pageNo || 1;
    const pageSize = options.pageSize || 20;
    const offset = (pageNo - 1) * pageSize;

    // Handle active filter - if active is specified, we need special handling
    if (options.active !== undefined) {
      return await getPasscodeListWithActiveFilter(roomId, options);
    }

    // Build filter object
    const filters = {};
    if (options.action) {
      filters.action = options.action;
    }
    if (options.type) {
      filters.type = options.type;
    }

    // Get passcode logs
    const logs = await passcodeModel.getPasscodeLogsByRoom(roomId, {
      limit: pageSize,
      offset: offset,
      ...filters,
    });

    // Get total count
    const total = await passcodeModel.countPasscodeLogsByRoom(roomId, filters);

    return {
      pageNo,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      list: logs.map((log) => ({
        id: log.id,
        passcodeId: log.passcode_id,
        name: log.passcode_name,
        type: log.passcode_type,
        startDate: log.start_date,
        endDate: log.end_date,
        createdAt: log.created_at,
        createdBy: log.created_by,
        metadata: log.metadata,
      })),
    };
  } catch (error) {
    logger.error('Error getting passcode list:', error);
    throw error;
  }
}

/**
 * Get passcode list with active/inactive filter
 * @param {string} roomId - Room UUID
 * @param {object} options - Query options with active filter
 * @returns {Promise<object>} Passcode list with pagination
 */
async function getPasscodeListWithActiveFilter(roomId, options) {
  const { roomManagementDb } = await import('../../../config/databases.js');

  const pageNo = options.pageNo || 1;
  const pageSize = options.pageSize || 20;
  const wantActive = options.active === true;

  // Build query for created passcodes
  let query = `SELECT * FROM passcode_logs WHERE room_id = $1 AND action = 'created'`;
  const values = [roomId];
  let paramCounter = 2;

  // Apply type filter if specified
  if (options.type) {
    query += ` AND passcode_type = $${paramCounter}`;
    values.push(options.type);
    paramCounter++;
  }

  query += ` ORDER BY created_at DESC`;

  // Get all created logs
  const allLogsResult = await roomManagementDb.query(query, values);

  // Get all deleted passcode IDs
  const deletedResult = await roomManagementDb.query(
    `SELECT DISTINCT passcode_id FROM passcode_logs
     WHERE room_id = $1 AND action = 'deleted'`,
    [roomId]
  );
  const deletedPasscodeIds = new Set(deletedResult.rows.map(row => row.passcode_id));
  const now = new Date();

  // Filter by active/inactive status
  const filteredLogs = allLogsResult.rows.filter(log => {
    const isDeleted = deletedPasscodeIds.has(log.passcode_id);
    const isExpired = log.end_date && new Date(log.end_date) < now;
    const isActive = !isDeleted && !isExpired;

    return wantActive ? isActive : !isActive;
  });

  // Calculate pagination
  const total = filteredLogs.length;
  const totalPages = Math.ceil(total / pageSize);
  const startIndex = (pageNo - 1) * pageSize;
  const paginatedLogs = filteredLogs.slice(startIndex, startIndex + pageSize);

  return {
    pageNo,
    pageSize,
    total,
    totalPages,
    list: paginatedLogs.map((log) => ({
      id: log.id,
      passcodeId: log.passcode_id,
      name: log.passcode_name,
      type: log.passcode_type,
      startDate: log.start_date,
      endDate: log.end_date,
      createdAt: log.created_at,
      createdBy: log.created_by,
      metadata: log.metadata,
    })),
  };
}

/**
 * Delete a passcode
 * @param {string} roomId - Room UUID
 * @param {number} passcodeId - TTLock passcode ID
 * @param {string} deletedBy - User who deleted the passcode
 * @returns {Promise<object>} Delete result
 */
export async function deletePasscode(roomId, passcodeId, deletedBy = null) {
  try {
    // Get room
    const room = await roomModel.getRoomById(roomId);
    if (!room) {
      throw new Error('Room not found');
    }

    // Get passcode log
    const passcodeLog = await passcodeModel.getPasscodeLogByPasscodeId(passcodeId);
    if (!passcodeLog) {
      throw new Error('Passcode not found');
    }

    // Verify passcode belongs to this room
    if (passcodeLog.room_id !== roomId) {
      throw new Error('Passcode does not belong to this room');
    }

    logger.info('Deleting passcode:', {
      roomId,
      passcodeId,
      lockId: room.door_lock_id,
    });

    await ttlockService.deletePasscode(room.door_lock_id, passcodeId);

    // Log deletion
    await passcodeModel.logPasscodeDeletion({
      roomId: room.id,
      lockId: room.door_lock_id,
      passcodeId: passcodeId,
      name: passcodeLog.passcode_name,
      deletedBy: deletedBy,
      metadata: {},
    });

    return {
      success: true,
      message: 'Passcode deleted successfully',
      passcodeId: passcodeId,
    };
  } catch (error) {
    logger.error('Error deleting passcode:', error);
    throw error;
  }
}

/**
 * Update passcode name
 * @param {string} roomId - Room UUID
 * @param {number} passcodeId - TTLock passcode ID
 * @param {string} newName - New passcode name
 * @returns {Promise<object>} Update result
 */
export async function updatePasscodeName(roomId, passcodeId, newName) {
  try {
    // Get room
    const room = await roomModel.getRoomById(roomId);
    if (!room) {
      throw new Error('Room not found');
    }

    // Get passcode log
    const passcodeLog = await passcodeModel.getPasscodeLogByPasscodeId(passcodeId);
    if (!passcodeLog) {
      throw new Error('Passcode not found');
    }

    // Verify passcode belongs to this room
    if (passcodeLog.room_id !== roomId) {
      throw new Error('Passcode does not belong to this room');
    }

    logger.info('Updating passcode name:', {
      roomId,
      passcodeId,
      newName,
    });

    await ttlockService.modifyPasscodeName(room.door_lock_id, passcodeId, newName);

    return {
      success: true,
      message: 'Passcode name updated successfully',
      passcodeId: passcodeId,
      newName: newName,
    };
  } catch (error) {
    logger.error('Error updating passcode name:', error);
    throw error;
  }
}

/**
 * Generate random 6-digit passcode
 * @returns {string} 6-digit passcode
 */
function generateRandomPasscode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Create custom temporary passcode
 * @param {string} roomId - Room UUID
 * @param {object} data - Passcode data (name, passcode, startDate, endDate, createdBy)
 * @returns {Promise<object>} Created passcode data
 */
export async function createCustomTemporaryPasscode(roomId, data) {
  try {
    // Validate room
    const room = await roomModel.getRoomById(roomId);
    if (!room) {
      throw new Error('Room not found');
    }

    if (!room.door_lock_id) {
      throw new Error('Room does not have a door lock configured');
    }

    // Validate required fields
    if (!data.name || data.name.trim().length === 0) {
      throw new Error('Passcode name is required');
    }

    if (!data.passcode || !/^\d{4,9}$/.test(data.passcode)) {
      throw new Error('Passcode must be 4-9 digits');
    }

    if (!data.startDate || !data.endDate) {
      throw new Error('Start date and end date are required');
    }

    // Parse dates as WIB wall-clock for TTLock passcode API.
    // TTLock passcode API interprets timestamps as wall-clock (not UTC).
    const startTimestamp = wibToWallClockTimestamp(data.startDate);
    const endTimestamp = wibToWallClockTimestamp(data.endDate);
    const startTimestampUtc = wibToUtcTimestamp(data.startDate);
    const nowTimestamp = Date.now();

    // Validation - Allow 2 hours past tolerance (more flexible than temporary)
    if (startTimestampUtc < nowTimestamp - 2 * 60 * 60 * 1000) {
      throw new Error('Start date cannot be more than 2 hours in the past');
    }

    if (endTimestamp <= startTimestamp) {
      throw new Error('End date must be after start date');
    }

    logger.info('Creating custom temporary passcode:', {
      roomId,
      lockId: room.door_lock_id,
      name: data.name,
      passcode: data.passcode,
      startDate: data.startDate,
      endDate: data.endDate,
    });

    logger.info('Custom temporary time debug:', {
      startDateInput: data.startDate,
      endDateInput: data.endDate,
      startTimestamp,
      endTimestamp,
      startIso: new Date(startTimestamp).toISOString(),
      endIso: new Date(endTimestamp).toISOString(),
    });

    const result = await ttlockService.createCustomTemporaryPasscode(
      room.door_lock_id,
      data.name,
      data.passcode,
      startTimestamp,
      endTimestamp
    );

    if (!result || !result.keyboardPwdId) {
      throw new Error('TTLock API did not return passcode data');
    }

    // Log to database
    const log = await passcodeModel.logPasscodeCreation({
      roomId: room.id,
      lockId: room.door_lock_id,
      passcodeId: result.keyboardPwdId,
      name: data.name,
      type: 'custom-temporary',
      startDate: new Date(startTimestamp),
      endDate: new Date(endTimestamp),
      createdBy: data.createdBy || null,
      metadata: {
        ...(data.metadata || {}),
        passcode: data.passcode,
        originalStartDate: data.startDate,
        originalEndDate: data.endDate,
        ttlockResponse: result,
        note: 'Custom passcode valid during specified time period',
      },
    });

    return {
      id: log.id,
      passcodeId: result.keyboardPwdId,
      passcode: data.passcode,
      name: data.name,
      type: 'custom-temporary',
      startDate: data.startDate,
      endDate: data.endDate,
      startTimestamp: startTimestamp,
      endTimestamp: endTimestamp,
      roomId: room.id,
      roomName: room.name,
      lockId: room.door_lock_id,
      createdAt: log.created_at,
    };
  } catch (error) {
    logger.error('Error creating custom temporary passcode:', error);
    throw error;
  }
}

/**
 * Create custom permanent passcode
 * @param {string} roomId - Room UUID
 * @param {object} data - Passcode data (name, passcode, createdBy)
 * @returns {Promise<object>} Created passcode data
 */
export async function createCustomPermanentPasscode(roomId, data) {
  try {
    // Validate room
    const room = await roomModel.getRoomById(roomId);
    if (!room) {
      throw new Error('Room not found');
    }

    if (!room.door_lock_id) {
      throw new Error('Room does not have a door lock configured');
    }

    // Validate required fields
    if (!data.name || data.name.trim().length === 0) {
      throw new Error('Passcode name is required');
    }

    if (!data.passcode || !/^\d{4,9}$/.test(data.passcode)) {
      throw new Error('Passcode must be 4-9 digits');
    }

    logger.info('Creating custom permanent passcode:', {
      roomId,
      lockId: room.door_lock_id,
      name: data.name,
      passcode: data.passcode,
    });

    const result = await ttlockService.createCustomPermanentPasscode(
      room.door_lock_id,
      data.name,
      data.passcode
    );

    if (!result || !result.keyboardPwdId) {
      throw new Error('TTLock API did not return passcode data');
    }

    // Log to database
    const log = await passcodeModel.logPasscodeCreation({
      roomId: room.id,
      lockId: room.door_lock_id,
      passcodeId: result.keyboardPwdId,
      name: data.name,
      type: 'custom-permanent',
      startDate: null,
      endDate: null,
      createdBy: data.createdBy || null,
      metadata: {
        ...(data.metadata || {}),
        passcode: data.passcode,
        ttlockResponse: result,
        note: 'Custom permanent passcode. Must be used within 24 hours to activate, then permanent forever.',
      },
    });

    return {
      id: log.id,
      passcodeId: result.keyboardPwdId,
      passcode: data.passcode,
      name: data.name,
      type: 'custom-permanent',
      roomId: room.id,
      roomName: room.name,
      lockId: room.door_lock_id,
      createdAt: log.created_at,
      note: 'Must be used within 24 hours to activate, then permanent forever',
    };
  } catch (error) {
    logger.error('Error creating custom permanent passcode:', error);
    throw error;
  }
}
