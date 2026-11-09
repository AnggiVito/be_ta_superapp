import express from 'express';
import { validateJWT } from '../../core/auth/jwt-validator.js';
import * as activityLogController from './controllers/activityLogController.js';
import { requireRole } from '../user-management/middleware/roleValidator.js';

const router = express.Router();

/**
 * Modul Activity Log Routes
 * API untuk melihat activity logs (audit trail)
 * Hanya bisa diakses oleh admin (kaur_lab, laboran)
 */

// Health check untuk modul
router.get('/health', (req, res) => {
  res.json({
    success: true,
    module: 'activity-log',
    message: 'Activity Log module is running',
  });
});

/**
 * Get activity logs
 * GET /api/activity-log/logs
 * Hanya bisa diakses oleh kaur_lab dan laboran
 */
router.get(
  '/logs',
  validateJWT,
  requireRole('kaur_lab', 'laboran'),
  activityLogController.getActivityLogs
);

/**
 * Get activity log by ID
 * GET /api/activity-log/logs/:id
 */
router.get(
  '/logs/:id',
  validateJWT,
  requireRole('kaur_lab', 'laboran'),
  activityLogController.getActivityLogById
);

/**
 * Get activity statistics
 * GET /api/activity-log/statistics
 */
router.get(
  '/statistics',
  validateJWT,
  requireRole('kaur_lab', 'laboran'),
  activityLogController.getActivityStatistics
);

/**
 * Get top endpoints
 * GET /api/activity-log/top-endpoints
 */
router.get(
  '/top-endpoints',
  validateJWT,
  requireRole('kaur_lab', 'laboran'),
  activityLogController.getTopEndpoints
);

/**
 * Get error logs
 * GET /api/activity-log/errors
 */
router.get(
  '/errors',
  validateJWT,
  requireRole('kaur_lab', 'laboran'),
  activityLogController.getErrorLogs
);

/**
 * Get user activity logs
 * GET /api/activity-log/users/:userId/logs
 */
router.get(
  '/users/:userId/logs',
  validateJWT,
  requireRole('kaur_lab', 'laboran'),
  activityLogController.getUserActivityLogs
);

export default router;

