/**
 * Room Validation Middleware
 * Menggunakan Joi untuk validasi input room
 */

import Joi from 'joi';
import { logger } from '../../../core/utils/logger.js';
import { ROOM_CATEGORIES } from '../constants/roomCategories.js';

const roomCategorySchema = Joi.string()
  .valid(...ROOM_CATEGORIES)
  .allow(null, '');

/**
 * Schema untuk create room
 */
const createRoomSchema = Joi.object({
  name: Joi.string().min(1).max(120).required().messages({
    'string.empty': 'Room name is required',
    'string.min': 'Room name must be at least 1 character',
    'string.max': 'Room name must not exceed 120 characters',
    'any.required': 'Room name is required',
  }),
  capacity: Joi.number().integer().min(1).required().messages({
    'number.base': 'Capacity must be a number',
    'number.integer': 'Capacity must be an integer',
    'number.min': 'Capacity must be at least 1',
    'any.required': 'Capacity is required',
  }),
  is_occupied: Joi.boolean().optional().default(false),
  door_lock_id: Joi.string().allow(null, '').optional(),
  category: roomCategorySchema.optional(),
});

/**
 * Schema untuk update room
 */
const updateRoomSchema = Joi.object({
  name: Joi.string().min(1).max(120).optional(),
  capacity: Joi.number().integer().min(1).optional(),
  is_occupied: Joi.boolean().optional(),
  door_lock_id: Joi.string().allow(null, '').optional(),
  category: roomCategorySchema.optional(),
}).min(1).messages({
  'object.min': 'At least one field must be provided for update',
});

/**
 * Schema untuk UUID params
 */
const uuidParamsSchema = Joi.object({
  id: Joi.string().uuid().required().messages({
    'string.guid': 'Invalid room ID format',
    'any.required': 'Room ID is required',
  }),
  roomId: Joi.string().uuid().optional(),
});

/**
 * Middleware untuk validasi create room
 */
export function validateCreateRoom(req, res, next) {
  const { error, value } = createRoomSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    logger.warn('Room validation error:', { errors: error.details });
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: error.details.map((d) => d.message),
    });
  }

  if (value.category === '') {
    value.category = null;
  }
  req.body = value;
  next();
}

/**
 * Middleware untuk validasi update room
 */
export function validateUpdateRoom(req, res, next) {
  const { error, value } = updateRoomSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    logger.warn('Room validation error:', { errors: error.details });
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: error.details.map((d) => d.message),
    });
  }

  if (value.category === '') {
    value.category = null;
  }
  req.body = value;
  next();
}

/**
 * Middleware untuk validasi UUID params
 */
export function validateUuidParams(req, res, next) {
  const { error } = uuidParamsSchema.validate(req.params, {
    abortEarly: false,
  });

  if (error) {
    logger.warn('UUID validation error:', { errors: error.details });
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: error.details.map((d) => d.message),
    });
  }

  next();
}
