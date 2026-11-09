/**
 * Fingerprint Controller
 * HTTP handlers untuk fingerprint management
 */

import * as fingerprintService from '../services/fingerprintService.js';
import { logger } from '../../../core/utils/logger.js';

/**
 * Add fingerprint to a room's lock
 * POST /api/room-management/rooms/:roomId/fingerprints
 */
export async function addFingerprint(req, res) {
    try {
        const { roomId } = req.params;
        const fingerprintData = {
            fingerprintNumber: req.body.fingerprintNumber,
            fingerprintType: req.body.fingerprintType,
            fingerprintName: req.body.fingerprintName || null,
            startDate: req.body.startDate || null,
            endDate: req.body.endDate || null,
            cyclicConfig: req.body.cyclicConfig || null,
            createdBy: req.user?.id || null,
        };

        const result = await fingerprintService.addFingerprint(roomId, fingerprintData);

        res.status(201).json({
            success: true,
            message: 'Fingerprint added successfully',
            data: result,
        });
    } catch (error) {
        logger.error('Error in addFingerprint controller:', error);
        const statusCode = error.message.includes('not found') ? 404 : 400;
        res.status(statusCode).json({
            success: false,
            message: error.message || 'Error adding fingerprint',
        });
    }
}

/**
 * Get list of fingerprints for a room
 * GET /api/room-management/rooms/:roomId/fingerprints
 */
export async function getFingerprintList(req, res) {
    try {
        const { roomId } = req.params;
        const options = {
            pageNo: parseInt(req.query.pageNo) || 1,
            pageSize: parseInt(req.query.pageSize) || 20,
        };

        const result = await fingerprintService.getFingerprintList(roomId, options);

        res.json({
            success: true,
            message: 'Fingerprint list retrieved successfully',
            data: result,
        });
    } catch (error) {
        logger.error('Error in getFingerprintList controller:', error);
        const statusCode = error.message.includes('not found') ? 404 : 500;
        res.status(statusCode).json({
            success: false,
            message: error.message || 'Error getting fingerprint list',
        });
    }
}

/**
 * Delete a fingerprint
 * DELETE /api/room-management/rooms/:roomId/fingerprints/:fingerprintId
 */
export async function deleteFingerprint(req, res) {
    try {
        const { roomId, fingerprintId } = req.params;
        const deletedBy = req.user?.id || null;
        const deleteType = parseInt(req.query.deleteType) || 2;

        const result = await fingerprintService.deleteFingerprint(
            roomId,
            parseInt(fingerprintId),
            deletedBy,
            deleteType
        );

        res.json({
            success: true,
            message: result.message,
            data: {
                fingerprintId: result.fingerprintId,
            },
        });
    } catch (error) {
        logger.error('Error in deleteFingerprint controller:', error);
        const statusCode = error.message.includes('not found') ? 404 : 500;
        res.status(statusCode).json({
            success: false,
            message: error.message || 'Error deleting fingerprint',
        });
    }
}
