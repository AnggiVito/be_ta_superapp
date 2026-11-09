/**
 * Fingerprint Session Controller
 * HTTP handlers untuk fingerprint registration sessions
 */

import * as sessionService from '../services/fingerprintSessionService.js';
import { logger } from '../../../core/utils/logger.js';

/**
 * Create a new fingerprint registration session
 * POST /api/room-management/fingerprint-sessions
 */
export async function createSession(req, res) {
    try {
        const { personName, roomIds } = req.body;
        const createdBy = req.user?.id || null;

        const result = await sessionService.createSession(personName, roomIds, createdBy);

        res.status(201).json({
            success: true,
            message: 'Fingerprint registration session created. Guide the person to tap their finger on each lock.',
            data: result,
        });
    } catch (error) {
        logger.error('Error in createSession controller:', error);
        const statusCode = error.message.includes('not found') ? 404 : 400;
        res.status(statusCode).json({
            success: false,
            message: error.message || 'Error creating session',
        });
    }
}

/**
 * Get all sessions
 * GET /api/room-management/fingerprint-sessions
 */
export async function getAllSessions(req, res) {
    try {
        const result = await sessionService.getAllSessions();

        res.json({
            success: true,
            message: 'Sessions retrieved successfully',
            data: result,
        });
    } catch (error) {
        logger.error('Error in getAllSessions controller:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error getting sessions',
        });
    }
}

/**
 * Get session by ID with room statuses
 * GET /api/room-management/fingerprint-sessions/:sessionId
 */
export async function getSession(req, res) {
    try {
        const { sessionId } = req.params;
        const result = await sessionService.getSession(sessionId);

        res.json({
            success: true,
            message: 'Session retrieved successfully',
            data: result,
        });
    } catch (error) {
        logger.error('Error in getSession controller:', error);
        const statusCode = error.message.includes('not found') ? 404 : 500;
        res.status(statusCode).json({
            success: false,
            message: error.message || 'Error getting session',
        });
    }
}

/**
 * Check session for newly enrolled fingerprints
 * POST /api/room-management/fingerprint-sessions/:sessionId/check
 */
export async function checkSession(req, res) {
    try {
        const { sessionId } = req.params;
        const result = await sessionService.checkSession(sessionId);

        res.json({
            success: true,
            message: 'Session check completed',
            data: result,
        });
    } catch (error) {
        logger.error('Error in checkSession controller:', error);
        const statusCode = error.message.includes('not found') ? 404
            : error.message.includes('already') ? 400
                : 500;
        res.status(statusCode).json({
            success: false,
            message: error.message || 'Error checking session',
        });
    }
}

/**
 * Cancel a session
 * PATCH /api/room-management/fingerprint-sessions/:sessionId/cancel
 */
export async function cancelSession(req, res) {
    try {
        const { sessionId } = req.params;
        const result = await sessionService.cancelSession(sessionId);

        res.json({
            success: true,
            message: result.message,
            data: result,
        });
    } catch (error) {
        logger.error('Error in cancelSession controller:', error);
        const statusCode = error.message.includes('not found') ? 404
            : error.message.includes('already') ? 400
                : 500;
        res.status(statusCode).json({
            success: false,
            message: error.message || 'Error cancelling session',
        });
    }
}
