/**
 * Room Booking Validation Middleware
 */

import Joi from 'joi';
import { logger } from '../../../core/utils/logger.js';

const createBookingSchema = Joi.object({
  start_time: Joi.date().iso().required().messages({
    'date.base': 'start_time must be a valid date',
    'date.format': 'start_time must be ISO 8601 format',
    'any.required': 'start_time is required',
  }),
  end_time: Joi.date().iso().required().messages({
    'date.base': 'end_time must be a valid date',
    'date.format': 'end_time must be ISO 8601 format',
    'any.required': 'end_time is required',
  }),
  description: Joi.string().trim().max(1000).allow('', null).optional().messages({
    'string.max': 'description must be at most 1000 characters',
  }),
});

const createPublicBookingSchema = createBookingSchema.keys({
  created_by: Joi.string().uuid().required().messages({
    'string.guid': 'created_by must be a valid user UUID',
    'any.required': 'created_by is required',
  }),
});

const conflictSchema = createBookingSchema;

const rejectBookingSchema = Joi.object({
  rejection_note: Joi.string().trim().min(1).max(1000).required().messages({
    'string.empty': 'rejection_note is required',
    'string.min': 'rejection_note is required',
    'string.max': 'rejection_note must be at most 1000 characters',
    'any.required': 'rejection_note is required',
  }),
});

const bookingParamsSchema = Joi.object({
  roomId: Joi.string().uuid().required().messages({
    'string.guid': 'Invalid room ID format',
    'any.required': 'Room ID is required',
  }),
  bookingId: Joi.string().uuid().required().messages({
    'string.guid': 'Invalid booking ID format',
    'any.required': 'Booking ID is required',
  }),
});

const roomParamsSchema = Joi.object({
  roomId: Joi.string().uuid().required().messages({
    'string.guid': 'Invalid room ID format',
    'any.required': 'Room ID is required',
  }),
});

function validateBody(schema, req, res, next) {
  const { error, value } = schema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    logger.warn('Room booking validation error:', { errors: error.details });
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: error.details.map((d) => d.message),
    });
  }

  const start = new Date(value.start_time);
  const end = new Date(value.end_time);
  if (end <= start) {
    return res.status(400).json({
      success: false,
      message: 'end_time must be after start_time',
    });
  }

  req.body = value;
  next();
}

function validateSimpleBody(schema, req, res, next) {
  const { error, value } = schema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    logger.warn('Room booking validation error:', { errors: error.details });
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: error.details.map((d) => d.message),
    });
  }

  req.body = value;
  next();
}

export function validateCreateBooking(req, res, next) {
  return validateBody(createBookingSchema, req, res, next);
}

export function validateCreatePublicBooking(req, res, next) {
  return validateBody(createPublicBookingSchema, req, res, next);
}

export function validateConflictCheck(req, res, next) {
  return validateBody(conflictSchema, req, res, next);
}

export function validateRejectBooking(req, res, next) {
  return validateSimpleBody(rejectBookingSchema, req, res, next);
}

export function validateBookingParams(req, res, next) {
  const { error } = bookingParamsSchema.validate(req.params, {
    abortEarly: false,
  });

  if (error) {
    logger.warn('Room booking params validation error:', { errors: error.details });
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: error.details.map((d) => d.message),
    });
  }

  next();
}

export function validateRoomParams(req, res, next) {
  const { error } = roomParamsSchema.validate(req.params, {
    abortEarly: false,
  });

  if (error) {
    logger.warn('Room params validation error:', { errors: error.details });
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: error.details.map((d) => d.message),
    });
  }

  next();
}
