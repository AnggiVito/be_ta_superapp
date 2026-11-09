/**
 * IC Card Controller
 * HTTP handlers untuk IC card management
 */

import * as cardService from '../services/cardService.js';
import { logger } from '../../../core/utils/logger.js';

/**
 * Add IC card to a room's lock
 * POST /api/room-management/rooms/:roomId/cards
 */
export async function addCard(req, res) {
    try {
        const { roomId } = req.params;
        const cardData = {
            cardNumber: req.body.cardNumber,
            cardName: req.body.cardName || null,
            startDate: req.body.startDate || null,
            endDate: req.body.endDate || null,
            createdBy: req.user?.id || null,
        };

        const result = await cardService.addCard(roomId, cardData);

        res.status(201).json({
            success: true,
            message: 'IC card added successfully',
            data: result,
        });
    } catch (error) {
        logger.error('Error in addCard controller:', error);
        const statusCode = error.message.includes('not found') ? 404 : 400;
        res.status(statusCode).json({
            success: false,
            message: error.message || 'Error adding IC card',
        });
    }
}

/**
 * Add IC card to multiple room locks
 * POST /api/room-management/cards/bulk
 */
export async function addCardBulk(req, res) {
    try {
        const cardData = {
            roomIds: req.body.roomIds || [],
            allRooms: req.body.allRooms === true,
            cardNumber: req.body.cardNumber,
            cardName: req.body.cardName || null,
            startDate: req.body.startDate || null,
            endDate: req.body.endDate || null,
            createdBy: req.user?.id || null,
        };

        const result = await cardService.addCardBulk(cardData);
        const hasFailures = result.failureCount > 0;

        res.status(200).json({
            success: true,
            message: hasFailures
                ? 'IC card assignment completed with some failures'
                : 'IC card assigned successfully',
            data: result,
        });
    } catch (error) {
        logger.error('Error in addCardBulk controller:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Error assigning IC card to rooms',
        });
    }
}

/**
 * Get list of IC cards for a room
 * GET /api/room-management/rooms/:roomId/cards
 */
export async function getCardList(req, res) {
    try {
        const { roomId } = req.params;
        const options = {
            pageNo: parseInt(req.query.pageNo) || 1,
            pageSize: parseInt(req.query.pageSize) || 20,
        };

        const result = await cardService.getCardList(roomId, options);

        res.json({
            success: true,
            message: 'IC card list retrieved successfully',
            data: result,
        });
    } catch (error) {
        logger.error('Error in getCardList controller:', error);
        const statusCode = error.message.includes('not found') ? 404 : 500;
        res.status(statusCode).json({
            success: false,
            message: error.message || 'Error getting IC card list',
        });
    }
}

/**
 * Get card audit logs for a room
 * GET /api/room-management/rooms/:roomId/card-logs
 */
export async function getCardLogList(req, res) {
    try {
        const { roomId } = req.params;
        const options = {
            pageNo: parseInt(req.query.pageNo) || 1,
            pageSize: parseInt(req.query.pageSize) || 20,
        };

        if (req.query.action) {
            options.action = req.query.action;
        }
        if (req.query.active !== undefined) {
            options.active = req.query.active === 'true';
        }

        const result = await cardService.getCardLogList(roomId, options);

        res.json({
            success: true,
            message: 'Card logs retrieved successfully',
            data: result,
        });
    } catch (error) {
        logger.error('Error in getCardLogList controller:', error);
        const statusCode = error.message === 'Room not found' ? 404 : 500;
        res.status(statusCode).json({
            success: false,
            message: error.message || 'Error getting card logs',
        });
    }
}

/**
 * Delete an IC card
 * DELETE /api/room-management/rooms/:roomId/cards/:cardId
 */
export async function deleteCard(req, res) {
    try {
        const { roomId, cardId } = req.params;
        const deletedBy = req.user?.id || null;
        const deleteType = parseInt(req.query.deleteType) || 2;
        const cardNumber = req.query.cardNumber?.toString() || null;

        const result = await cardService.deleteCard(
            roomId,
            parseInt(cardId),
            deletedBy,
            deleteType,
            cardNumber
        );

        res.json({
            success: true,
            message: result.message,
            data: {
                cardId: result.cardId,
            },
        });
    } catch (error) {
        logger.error('Error in deleteCard controller:', error);
        let statusCode = 500;
        if (error.statusCode) {
            statusCode = error.statusCode;
        } else if (error.message.includes('not found')) {
            statusCode = 404;
        } else if (error.message.includes('already been deleted')) {
            statusCode = 409;
        }
        res.status(statusCode).json({
            success: false,
            message: error.message || 'Error deleting IC card',
        });
    }
}
