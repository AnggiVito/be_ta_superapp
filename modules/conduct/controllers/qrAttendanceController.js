/**
 * QR Attendance Controller
 * Handle HTTP requests untuk QR code attendance
 */

import * as qrAttendanceService from '../services/qrAttendanceService.js';
import * as attendanceService from '../services/attendanceService.js';
import { logger } from '../../../core/utils/logger.js';

/**
 * Generate QR Code untuk presensi
 * POST /api/conduct/qr-attendance/generate
 */
export async function generateQRCode(req, res, next) {
  try {
    const { jadwalId } = req.body;
    const assistantUserId = req.user.id; // dari JWT

    if (!jadwalId) {
      return res.status(400).json({
        success: false,
        message: 'jadwalId is required',
      });
    }

    const qrSession = await qrAttendanceService.generateQRCodeForAttendance(
      jadwalId,
      assistantUserId
    );

    res.status(200).json({
      success: true,
      message: 'QR Code generated successfully',
      data: qrSession,
    });
  } catch (error) {
    logger.error('Error in generateQRCode controller:', error);
    next(error);
  }
}

/**
 * Get active QR session untuk jadwal
 * GET /api/conduct/qr-attendance/session/:jadwalId
 * Supports both default schema (single QR) and individual mentoring (multiple QRs)
 */
export async function getActiveSession(req, res, next) {
  try {
    const { jadwalId } = req.params;

    // Try to get default schema session first
    const defaultSession = await qrAttendanceService.getActiveQRSession(jadwalId);
    
    if (defaultSession) {
      return res.status(200).json({
        success: true,
        message: 'Active QR session found',
        data: defaultSession,
        schema: 'default',
      });
    }

    // If no default session, try individual mentoring
    const individualSessions = await qrAttendanceService.getActiveQRSessionsForIndividualMentoring(jadwalId);
    
    if (individualSessions.length > 0) {
      return res.status(200).json({
        success: true,
        message: 'Active QR sessions found for individual mentoring',
        data: {
          schema: 'individual_mentoring',
          qrSessions: individualSessions,
          count: individualSessions.length,
        },
      });
    }

    return res.status(404).json({
      success: false,
      message: 'No active QR session found for this jadwal',
    });
  } catch (error) {
    logger.error('Error in getActiveSession controller:', error);
    next(error);
  }
}

/**
 * Scan QR Code dan record attendance
 * POST /api/conduct/qr-attendance/scan
 */
export async function scanQRCode(req, res, next) {
  try {
    const { qrToken } = req.body;
    const userId = req.user.id; // dari JWT

    if (!qrToken) {
      return res.status(400).json({
        success: false,
        message: 'qrToken is required',
      });
    }

    const attendance = await attendanceService.recordAttendanceViaQR(qrToken, userId);

    res.status(200).json({
      success: true,
      message: 'Attendance recorded successfully',
      data: attendance,
    });
  } catch (error) {
    logger.error('Error in scanQRCode controller:', error);
    
    // Handle specific errors
    if (error.message.includes('sudah melakukan presensi')) {
      return res.status(409).json({
        success: false,
        message: error.message,
      });
    }
    
    // QR validation errors (invalid, expired, not active)
    if (
      error.message.includes('is invalid') || 
      error.message.includes('expired') ||
      error.message.includes('not active')
    ) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    next(error);
  }
}

/**
 * Deactivate QR session (stop presensi)
 * POST /api/conduct/qr-attendance/deactivate/:sessionId
 */
export async function deactivateSession(req, res, next) {
  try {
    const { sessionId } = req.params;
    const assistantUserId = req.user.id;

    const result = await qrAttendanceService.deactivateQRSession(sessionId, assistantUserId);

    res.status(200).json({
      success: true,
      message: 'QR session deactivated successfully',
      data: result,
    });
  } catch (error) {
    logger.error('Error in deactivateSession controller:', error);
    next(error);
  }
}

/**
 * Get QR history untuk jadwal tertentu
 * GET /api/conduct/qr-attendance/history/:jadwalId
 */
export async function getQRHistory(req, res, next) {
  try {
    const { jadwalId } = req.params;
    const assistantUserId = req.user.id; // dari JWT

    // Optional query parameters untuk filtering
    const { limit = 10, offset = 0, status } = req.query;

    const history = await qrAttendanceService.getQRHistory(jadwalId, {
      assistantUserId,
      limit: parseInt(limit),
      offset: parseInt(offset),
      status, // active, expired, deactivated
    });

    res.status(200).json({
      success: true,
      message: 'QR history retrieved successfully',
      data: history,
    });
  } catch (error) {
    logger.error('Error in getQRHistory controller:', error);
    next(error);
  }
}

/**
 * Check-out dari sesi praktikum
 * POST /api/conduct/qr-attendance/:attendanceId/checkout
 */
export async function checkOut(req, res, next) {
  try {
    const { attendanceId } = req.params;
    const userId = req.user.id; // dari JWT

    if (!attendanceId) {
      return res.status(400).json({
        success: false,
        message: 'attendanceId is required',
      });
    }

    const result = await attendanceService.checkOutAttendance(
      parseInt(attendanceId),
      userId
    );

    res.status(200).json({
      success: true,
      message: 'Check-out recorded successfully',
      data: result,
    });
  } catch (error) {
    logger.error('Error in checkOut controller:', error);

    // Handle specific error messages
    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    if (
      error.message.includes('tidak memiliki akses') ||
      error.message.includes('belum melakukan check-in') ||
      error.message.includes('sudah melakukan check-out')
    ) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    next(error);
  }
}

/**
 * Get all attendance records for a jadwal (for assistant)
 * GET /api/conduct/attendance/status/:jadwalId
 * Returns all student attendance in the jadwal with nama and NIM
 */
export async function getAttendanceStatus(req, res, next) {
  try {
    const { jadwalId } = req.params;

    if (!jadwalId) {
      return res.status(400).json({
        success: false,
        message: 'jadwalId is required',
      });
    }

    // Get all attendance records for this jadwal with user details
    const attendanceList = await attendanceService.getAllAttendanceByJadwal(jadwalId);

    res.status(200).json({
      success: true,
      message: 'Attendance list retrieved successfully',
      data: attendanceList,
      count: attendanceList.length,
    });
  } catch (error) {
    logger.error('Error in getAttendanceStatus controller:', error);
    next(error);
  }
}

/**
 * Get attendance history for praktikan
 * GET /api/conduct/attendance/history
 */
export async function getAttendanceHistory(req, res, next) {
  try {
    const userId = req.user.id; // dari JWT
    const { praktikumId, limit, offset } = req.query;

    const filters = {
      praktikumId: praktikumId || null,
      limit: limit ? parseInt(limit) : 10,
      offset: offset ? parseInt(offset) : 0,
    };

    const result = await attendanceService.getAttendanceHistory(userId, filters);

    res.status(200).json({
      success: true,
      message: 'Attendance history retrieved successfully',
      data: result.history,
      pagination: result.pagination,
    });
  } catch (error) {
    logger.error('Error in getAttendanceHistory controller:', error);
    next(error);
  }
}





