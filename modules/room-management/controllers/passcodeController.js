/**
 * Passcode Controller
 * HTTP handlers untuk passcode management
 */

import * as passcodeService from '../services/passcodeService.js';
import { logger } from '../../../core/utils/logger.js';

/**
 * Create a permanent passcode
 * POST /api/room-management/rooms/:roomId/passcodes/permanent
 */
export async function createPermanentPasscode(req, res) {
  try {
    const { roomId } = req.params;
    const passcodeData = {
      name: req.body.name,
      createdBy: req.user?.id || null, // From JWT if available
    };

    const result = await passcodeService.createPermanentPasscode(roomId, passcodeData);

    res.status(201).json({
      success: true,
      message: 'Permanent passcode created successfully',
      data: result,
      reminder: 'Passcode must be used within 24 hours to become permanent, otherwise it will be invalidated.',
    });
  } catch (error) {
    logger.error('Error in createPermanentPasscode controller:', error);
    const statusCode = error.message.includes('not found') ? 404 : 400;
    res.status(statusCode).json({
      success: false,
      message: error.message || 'Error creating permanent passcode',
    });
  }
}

/**
 * Create a temporary passcode
 * POST /api/room-management/rooms/:roomId/passcodes/temporary
 */
export async function createTemporaryPasscode(req, res) {
  try {
    const { roomId } = req.params;
    const passcodeData = {
      name: req.body.name,
      startDate: req.body.startDate,
      endDate: req.body.endDate,
      passcode: req.body.passcode, // Optional
      createdBy: req.user?.id || null,
    };

    const result = await passcodeService.createTemporaryPasscode(roomId, passcodeData);

    res.status(201).json({
      success: true,
      message: 'Temporary passcode created successfully',
      data: result,
    });
  } catch (error) {
    logger.error('Error in createTemporaryPasscode controller:', error);
    const statusCode = error.message.includes('not found') ? 404 : 400;
    res.status(statusCode).json({
      success: false,
      message: error.message || 'Error creating temporary passcode',
    });
  }
}

/**
 * Create a one-time passcode (keyboardPwdType: 1)
 * POST /api/room-management/rooms/:roomId/passcodes/onetime
 */
export async function createOneTimePasscode(req, res) {
  try {
    const { roomId } = req.params;
    const passcodeData = {
      name: req.body.name,
      validityHours: req.body.validityHours || 6, // Default 6 hours
      createdBy: req.user?.id || null,
    };

    const result = await passcodeService.createOneTimePasscode(roomId, passcodeData);

    res.status(201).json({
      success: true,
      message: 'One-time passcode created successfully',
      data: result,
      reminder: `This passcode can only be used once within ${passcodeData.validityHours} hours.`,
    });
  } catch (error) {
    logger.error('Error in createOneTimePasscode controller:', error);
    const statusCode = error.message.includes('not found') ? 404 : 400;
    res.status(statusCode).json({
      success: false,
      message: error.message || 'Error creating one-time passcode',
    });
  }
}

/**
 * Get list of passcodes for a room
 * GET /api/room-management/rooms/:roomId/passcodes
 */
export async function getPasscodeList(req, res) {
  try {
    const { roomId } = req.params;
    const options = {
      pageNo: parseInt(req.query.pageNo) || 1,
      pageSize: parseInt(req.query.pageSize) || 20,
    };

    // Add optional filters
    if (req.query.type) {
      options.type = req.query.type;
    }
    if (req.query.action) {
      options.action = req.query.action;
    }
    if (req.query.active !== undefined) {
      // active can be 'true', 'false', or undefined
      options.active = req.query.active === 'true';
    }

    const result = await passcodeService.getPasscodeList(roomId, options);

    res.json({
      success: true,
      message: 'Passcode list retrieved successfully',
      data: result,
    });
  } catch (error) {
    logger.error('Error in getPasscodeList controller:', error);
    const statusCode = error.message === 'Room not found' ? 404 : 500;
    res.status(statusCode).json({
      success: false,
      message: error.message || 'Error getting passcode list',
    });
  }
}

/**
 * Delete a passcode
 * DELETE /api/room-management/rooms/:roomId/passcodes/:passcodeId
 */
export async function deletePasscode(req, res) {
  try {
    const { roomId, passcodeId } = req.params;
    const deletedBy = req.user?.id || null;

    const result = await passcodeService.deletePasscode(roomId, parseInt(passcodeId), deletedBy);

    res.json({
      success: true,
      message: result.message,
      data: {
        passcodeId: result.passcodeId,
      },
    });
  } catch (error) {
    logger.error('Error in deletePasscode controller:', error);
    const statusCode = error.message.includes('not found') ? 404 : 500;
    res.status(statusCode).json({
      success: false,
      message: error.message || 'Error deleting passcode',
    });
  }
}

/**
 * Update passcode name
 * PATCH /api/room-management/rooms/:roomId/passcodes/:passcodeId/name
 */
export async function updatePasscodeName(req, res) {
  try {
    const { roomId, passcodeId } = req.params;
    const { name } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Passcode name is required',
      });
    }

    const result = await passcodeService.updatePasscodeName(roomId, parseInt(passcodeId), name);

    res.json({
      success: true,
      message: result.message,
      data: {
        passcodeId: result.passcodeId,
        newName: result.newName,
      },
    });
  } catch (error) {
    logger.error('Error in updatePasscodeName controller:', error);
    const statusCode = error.message.includes('not found') ? 404 : 500;
    res.status(statusCode).json({
      success: false,
      message: error.message || 'Error updating passcode name',
    });
  }
}

/**
 * Create custom temporary passcode (Type 3 with custom 4-9 digit passcode)
 * POST /api/room-management/rooms/:roomId/passcodes/custom/temporary
 */
export async function createCustomTemporaryPasscode(req, res) {
  try {
    const { roomId } = req.params;
    const { name, passcode, startDate, endDate } = req.body;

    // Validate required fields
    if (!name || !passcode || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Name, passcode, startDate, and endDate are required',
      });
    }

    const passcodeData = {
      name,
      passcode,
      startDate,
      endDate,
      createdBy: req.user?.id || null,
    };

    const result = await passcodeService.createCustomTemporaryPasscode(roomId, passcodeData);

    res.status(201).json({
      success: true,
      message: 'Custom temporary passcode created successfully',
      data: result,
    });
  } catch (error) {
    logger.error('Error in createCustomTemporaryPasscode controller:', error);
    const statusCode = error.message.includes('not found') ? 404 : 400;
    res.status(statusCode).json({
      success: false,
      message: error.message || 'Error creating custom temporary passcode',
    });
  }
}

/**
 * Create custom permanent passcode (Type 2 with custom 4-9 digit passcode)
 * POST /api/room-management/rooms/:roomId/passcodes/custom/permanent
 */
export async function createCustomPermanentPasscode(req, res) {
  try {
    const { roomId } = req.params;
    const { name, passcode } = req.body;

    // Validate required fields
    if (!name || !passcode) {
      return res.status(400).json({
        success: false,
        message: 'Name and passcode are required',
      });
    }

    const passcodeData = {
      name,
      passcode,
      createdBy: req.user?.id || null,
    };

    const result = await passcodeService.createCustomPermanentPasscode(roomId, passcodeData);

    res.status(201).json({
      success: true,
      message: 'Custom permanent passcode created successfully',
      data: result,
    });
  } catch (error) {
    logger.error('Error in createCustomPermanentPasscode controller:', error);
    const statusCode = error.message.includes('not found') ? 404 : 400;
    res.status(statusCode).json({
      success: false,
      message: error.message || 'Error creating custom permanent passcode',
    });
  }
}
