/**
 * Passcode Validation Middleware
 * Menggunakan Joi untuk validasi input passcode
 */

import Joi from 'joi';
import { logger } from '../../../core/utils/logger.js';

/**
 * Schema untuk create permanent passcode
 * Note: Passcode is auto-generated (8 digits), cannot be customized
 */
const createPermanentPasscodeSchema = Joi.object({
  name: Joi.string().min(1).max(100).required().messages({
    'string.empty': 'Passcode name is required',
    'string.min': 'Passcode name must be at least 1 character',
    'string.max': 'Passcode name must not exceed 100 characters',
    'any.required': 'Passcode name is required',
  }),
});

/**
 * Schema untuk create temporary passcode
 */
const createTemporaryPasscodeSchema = Joi.object({
  name: Joi.string().min(1).max(100).required().messages({
    'string.empty': 'Passcode name is required',
    'string.min': 'Passcode name must be at least 1 character',
    'string.max': 'Passcode name must not exceed 100 characters',
    'any.required': 'Passcode name is required',
  }),
  startDate: Joi.string().required().messages({
    'any.required': 'Start date is required',
  }),
  endDate: Joi.string().required().messages({
    'any.required': 'End date is required',
  }),
  passcode: Joi.string().pattern(/^\d{6,10}$/).optional().messages({
    'string.pattern.base': 'Passcode must be 6-10 digits',
  }),
});

/**
 * Schema untuk create one-time passcode
 */
const createOneTimePasscodeSchema = Joi.object({
  name: Joi.string().min(1).max(100).required().messages({
    'string.empty': 'Passcode name is required',
    'string.min': 'Passcode name must be at least 1 character',
    'string.max': 'Passcode name must not exceed 100 characters',
    'any.required': 'Passcode name is required',
  }),
  validityHours: Joi.number().integer().min(1).max(24).optional().default(4).messages({
    'number.base': 'Validity hours must be a number',
    'number.integer': 'Validity hours must be an integer',
    'number.min': 'Validity hours must be at least 1',
    'number.max': 'Validity hours must not exceed 24',
  }),
  passcode: Joi.string().pattern(/^\d{6,10}$/).optional().messages({
    'string.pattern.base': 'Passcode must be 6-10 digits',
  }),
});

/**
 * Schema untuk update passcode name
 */
const updatePasscodeNameSchema = Joi.object({
  name: Joi.string().min(1).max(100).required().messages({
    'string.empty': 'New passcode name is required',
    'string.min': 'Passcode name must be at least 1 character',
    'string.max': 'Passcode name must not exceed 100 characters',
    'any.required': 'New passcode name is required',
  }),
});

/**
 * Schema untuk query params list passcodes
 */
const listPasscodesQuerySchema = Joi.object({
  pageNo: Joi.number().integer().min(1).optional().default(1).messages({
    'number.base': 'Page number must be a number',
    'number.integer': 'Page number must be an integer',
    'number.min': 'Page number must be at least 1',
  }),
  pageSize: Joi.number().integer().min(1).max(100).optional().default(20).messages({
    'number.base': 'Page size must be a number',
    'number.integer': 'Page size must be an integer',
    'number.min': 'Page size must be at least 1',
    'number.max': 'Page size must not exceed 100',
  }),
  type: Joi.string()
    .valid('temporary', 'permanent', 'onetime', 'custom-temporary', 'custom-permanent')
    .optional()
    .messages({
      'string.base': 'Passcode type must be a string',
      'any.only': 'Passcode type must be one of: temporary, permanent, onetime, custom-temporary, custom-permanent',
    }),
  action: Joi.string()
    .valid('created', 'deleted', 'updated')
    .optional()
    .messages({
      'string.base': 'Action must be a string',
      'any.only': 'Action must be one of: created, deleted, updated',
    }),
  active: Joi.boolean().optional().messages({
    'boolean.base': 'Active must be a boolean (true or false)',
  }),
});

/**
 * Middleware untuk validasi create permanent passcode
 */
export function validateCreatePermanentPasscode(req, res, next) {
  const { error, value } = createPermanentPasscodeSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    logger.warn('Passcode validation error:', { errors: error.details });
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: error.details.map((d) => d.message),
    });
  }

  req.body = value;
  next();
}

/**
 * Middleware untuk validasi create temporary passcode
 */
export function validateCreateTemporaryPasscode(req, res, next) {
  const { error, value } = createTemporaryPasscodeSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    logger.warn('Passcode validation error:', { errors: error.details });
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: error.details.map((d) => d.message),
    });
  }

  req.body = value;
  next();
}

/**
 * Middleware untuk validasi create one-time passcode
 */
export function validateCreateOneTimePasscode(req, res, next) {
  const { error, value } = createOneTimePasscodeSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    logger.warn('Passcode validation error:', { errors: error.details });
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: error.details.map((d) => d.message),
    });
  }

  req.body = value;
  next();
}

/**
 * Middleware untuk validasi update passcode name
 */
export function validateUpdatePasscodeName(req, res, next) {
  const { error, value } = updatePasscodeNameSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    logger.warn('Passcode validation error:', { errors: error.details });
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: error.details.map((d) => d.message),
    });
  }

  req.body = value;
  next();
}

/**
 * Middleware untuk validasi query params
 */
export function validateListPasscodesQuery(req, res, next) {
  const { error, value } = listPasscodesQuerySchema.validate(req.query, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    logger.warn('Query validation error:', { errors: error.details });
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: error.details.map((d) => d.message),
    });
  }

  req.query = value;
  next();
}
