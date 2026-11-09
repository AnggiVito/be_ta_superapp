/**
 * IC Card Validator
 * Joi validation schemas for IC card operations
 */

import Joi from 'joi';

// Schema: Add IC card
const addCardSchema = Joi.object({
    cardNumber: Joi.string()
        .pattern(/^\d+$/)
        .required()
        .messages({
            'string.pattern.base': 'Card number must be a numeric string (from USB reader)',
            'any.required': 'Card number is required',
        }),
    cardName: Joi.string()
        .max(255)
        .optional()
        .allow(null, ''),
    startDate: Joi.string()
        .isoDate()
        .optional()
        .allow(null),
    endDate: Joi.string()
        .isoDate()
        .optional()
        .allow(null),
});

const bulkAddCardSchema = addCardSchema.keys({
    roomIds: Joi.array()
        .items(Joi.string().uuid())
        .default([]),
    allRooms: Joi.boolean().default(false),
}).custom((value, helpers) => {
    if (!value.allRooms && (!Array.isArray(value.roomIds) || value.roomIds.length === 0)) {
        return helpers.error('any.custom', {
            message: 'Select at least one room or use allRooms=true',
        });
    }
    return value;
});

// Schema: List cards query
const listCardsQuerySchema = Joi.object({
    pageNo: Joi.number().integer().min(1).default(1),
    pageSize: Joi.number().integer().min(1).max(100).default(20),
});

// Schema: List card logs query
const listCardLogsQuerySchema = Joi.object({
    pageNo: Joi.number().integer().min(1).default(1),
    pageSize: Joi.number().integer().min(1).max(100).default(20),
    action: Joi.string().valid('created', 'deleted').optional(),
    active: Joi.string().valid('true', 'false').optional(),
});

/**
 * Validate add card request body
 */
export function validateAddCard(req, res, next) {
    const { error } = addCardSchema.validate(req.body);
    if (error) {
        return res.status(400).json({
            success: false,
            message: error.details[0].message,
        });
    }
    next();
}

/**
 * Validate bulk add card request body
 */
export function validateBulkAddCard(req, res, next) {
    const { error } = bulkAddCardSchema.validate(req.body);
    if (error) {
        return res.status(400).json({
            success: false,
            message: error.details[0].context?.message || error.details[0].message,
        });
    }
    next();
}

/**
 * Validate list cards query parameters
 */
export function validateListCardsQuery(req, res, next) {
    const { error } = listCardsQuerySchema.validate(req.query);
    if (error) {
        return res.status(400).json({
            success: false,
            message: error.details[0].message,
        });
    }
    next();
}

/**
 * Validate list card logs query parameters
 */
export function validateListCardLogsQuery(req, res, next) {
    const { error } = listCardLogsQuerySchema.validate(req.query);
    if (error) {
        return res.status(400).json({
            success: false,
            message: error.details[0].message,
        });
    }
    next();
}
