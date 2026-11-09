/**
 * Practicum Schedule Sync Controller
 */

import * as syncService from '../services/practicumScheduleSyncService.js';
import { logger } from '../../../core/utils/logger.js';

/**
 * POST /api/room-management/practicum-schedules/sync
 */
export async function syncPracticumSchedules(req, res) {
  try {
    const { semesterCode, dryRun, forceResync } = req.body;
    const userId = req.user?.id;

    const result = await syncService.syncPracticumSchedules({
      semesterCode,
      userId,
      dryRun,
      forceResync,
      userData: req.user,
    });

    res.json({
      success: true,
      message: dryRun
        ? 'Practicum schedule sync preview completed'
        : 'Practicum schedules synced to booking rooms',
      data: result,
    });
  } catch (error) {
    logger.error('Error in syncPracticumSchedules controller:', error);
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      message: error.message || 'Error syncing practicum schedules',
    });
  }
}
