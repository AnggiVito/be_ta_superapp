/**
 * Fingerprint Validation Middleware
 * Menggunakan Joi untuk validasi input fingerprint
 */

import Joi from 'joi';
import { logger } from '../../../core/utils/logger.js';

/**
 * Schema untuk cyclic config item
 */
const cyclicConfigItemSchema = Joi.object({
    startTime: Joi.number().integer().min(0).max(1439).required().messages({
        'number.base': 'startTime must be a number (minutes from midnight)',
        'number.integer': 'startTime must be an integer',
        'number.min': 'startTime must be at least 0',
        'number.max': 'startTime must not exceed 1439 (23:59)',
        'any.required': 'startTime is required in cyclicConfig',
    }),
    endTime: Joi.number().integer().min(0).max(1439).required().messages({
        'number.base': 'endTime must be a number (minutes from midnight)',
        'number.integer': 'endTime must be an integer',
        'number.min': 'endTime must be at least 0',
        'number.max': 'endTime must not exceed 1439 (23:59)',
        'any.required': 'endTime is required in cyclicConfig',
    }),
    weekDay: Joi.number().integer().min(1).max(7).required().messages({
        'number.base': 'weekDay must be a number (1-7)',
        'number.integer': 'weekDay must be an integer',
        'number.min': 'weekDay must be at least 1 (Monday)',
        'number.max': 'weekDay must not exceed 7 (Sunday)',
        'any.required': 'weekDay is required in cyclicConfig',
    }),
});

/**
 * Schema untuk add fingerprint
 */
const addFingerprintSchema = Joi.object({
    fingerprintNumber: Joi.string().min(1).max(100).required().messages({
        'string.empty': 'Fingerprint number (code) is required',
        'string.min': 'Fingerprint number must be at least 1 character',
        'string.max': 'Fingerprint number must not exceed 100 characters',
        'any.required': 'Fingerprint number (code) is required',
    }),
    fingerprintType: Joi.number().integer().valid(1, 4).required().messages({
        'number.base': 'Fingerprint type must be a number',
        'number.integer': 'Fingerprint type must be an integer',
        'any.only': 'Fingerprint type must be 1 (normal) or 4 (cyclic)',
        'any.required': 'Fingerprint type is required',
    }),
    fingerprintName: Joi.string().max(100).optional().allow('', null).messages({
        'string.max': 'Fingerprint name must not exceed 100 characters',
    }),
    startDate: Joi.number().integer().optional().allow(null).messages({
        'number.base': 'Start date must be a timestamp in milliseconds',
        'number.integer': 'Start date must be an integer timestamp',
    }),
    endDate: Joi.number().integer().optional().allow(null).messages({
        'number.base': 'End date must be a timestamp in milliseconds',
        'number.integer': 'End date must be an integer timestamp',
    }),
    cyclicConfig: Joi.array().items(cyclicConfigItemSchema).optional().allow(null).messages({
        'array.base': 'cyclicConfig must be an array of cyclic time configurations',
    }),
});

/**
 * Schema untuk query params list fingerprints
 */
const listFingerprintsQuerySchema = Joi.object({
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
});

/**
 * Middleware untuk validasi add fingerprint
 */
export function validateAddFingerprint(req, res, next) {
    const { error, value } = addFingerprintSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
    });

    if (error) {
        logger.warn('Fingerprint validation error:', { errors: error.details });
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
 * Middleware untuk validasi query params list fingerprints
 */
export function validateListFingerprintsQuery(req, res, next) {
    const { error, value } = listFingerprintsQuerySchema.validate(req.query, {
        abortEarly: false,
        stripUnknown: true,
    });

    if (error) {
        logger.warn('Fingerprint query validation error:', { errors: error.details });
        return res.status(400).json({
            success: false,
            message: 'Validation error',
            errors: error.details.map((d) => d.message),
        });
    }

    req.query = value;
    next();
}

// ==================== Session Validators ====================

/**
 * Schema untuk create fingerprint session
 */
const createSessionSchema = Joi.object({
    personName: Joi.string().min(1).max(100).required().messages({
        'string.empty': 'Person name is required',
        'string.min': 'Person name must be at least 1 character',
        'string.max': 'Person name must not exceed 100 characters',
        'any.required': 'Person name is required',
    }),
    roomIds: Joi.array()
        .items(
            Joi.string().uuid().messages({
                'string.guid': 'Each room ID must be a valid UUID',
            })
        )
        .min(1)
        .required()
        .messages({
            'array.base': 'roomIds must be an array',
            'array.min': 'At least one room must be selected',
            'any.required': 'roomIds is required',
        }),
});

/**
 * Schema untuk session ID param
 */
const sessionIdParamSchema = Joi.object({
    sessionId: Joi.string().uuid().required().messages({
        'string.guid': 'Session ID must be a valid UUID',
        'any.required': 'Session ID is required',
    }),
});

/**
 * Middleware untuk validasi create session
 */
export function validateCreateSession(req, res, next) {
    const { error, value } = createSessionSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
    });

    if (error) {
        logger.warn('Session validation error:', { errors: error.details });
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
 * Middleware untuk validasi session ID param
 */
export function validateSessionId(req, res, next) {
    const { error, value } = sessionIdParamSchema.validate(
        { sessionId: req.params.sessionId },
        { abortEarly: false }
    );

    if (error) {
        logger.warn('Session ID validation error:', { errors: error.details });
        return res.status(400).json({
            success: false,
            message: 'Validation error',
            errors: error.details.map((d) => d.message),
        });
    }

    next();
}
