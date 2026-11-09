/**
 * Activity Log Controller
 * Handle HTTP requests untuk activity log API
 */

import * as activityLogService from '../services/activityLogService.js';
import { logger } from '../../../core/utils/logger.js';

/**
 * Get activity logs
 * GET /api/activity-log/logs
 */
export async function getActivityLogs(req, res) {
  try {
    const {
      user_id,
      action,
      method,
      endpoint,
      response_status,
      affected_table,
      has_error,
      start_date,
      end_date,
      limit = 100,
      offset = 0,
      order_by = 'created_at',
      order_direction = 'DESC',
    } = req.query;

    const filters = {
      user_id,
      action,
      method,
      endpoint,
      response_status: response_status ? parseInt(response_status, 10) : null,
      affected_table,
      has_error: has_error === 'true',
      start_date,
      end_date,
      limit: parseInt(limit, 10) || 100,
      offset: parseInt(offset, 10) || 0,
      order_by,
      order_direction,
    };

    const logs = await activityLogService.getActivityLogs(filters);
    const total = await activityLogService.getActivityLogCount(filters);

    res.json({
      success: true,
      data: logs,
      pagination: {
        total,
        limit: filters.limit,
        offset: filters.offset,
        has_more: filters.offset + filters.limit < total,
      },
    });
  } catch (error) {
    logger.error('Error in getActivityLogs controller:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get activity logs',
      error: process.env.NODE_ENV !== 'production' ? error.message : undefined,
    });
  }
}

/**
 * Get activity log by ID
 * GET /api/activity-log/logs/:id
 */
export async function getActivityLogById(req, res) {
  try {
    const { id } = req.params;

    const log = await activityLogService.getActivityLogById(id);

    if (!log) {
      return res.status(404).json({
        success: false,
        message: 'Activity log not found',
      });
    }

    res.json({
      success: true,
      data: log,
    });
  } catch (error) {
    logger.error('Error in getActivityLogById controller:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get activity log',
      error: process.env.NODE_ENV !== 'production' ? error.message : undefined,
    });
  }
}

/**
 * Get activity statistics
 * GET /api/activity-log/statistics
 */
export async function getActivityStatistics(req, res) {
  try {
    const { start_date, end_date } = req.query;

    const filters = {
      start_date,
      end_date,
    };

    const statistics = await activityLogService.getActivityStatistics(filters);

    res.json({
      success: true,
      data: {
        ...statistics,
        total_requests: parseInt(statistics.total_requests, 10) || 0,
        unique_users: parseInt(statistics.unique_users, 10) || 0,
        error_count: parseInt(statistics.error_count, 10) || 0,
        avg_execution_time: parseFloat(statistics.avg_execution_time) || 0,
        max_execution_time: parseInt(statistics.max_execution_time, 10) || 0,
        error_4xx_count: parseInt(statistics.error_4xx_count, 10) || 0,
        error_5xx_count: parseInt(statistics.error_5xx_count, 10) || 0,
      },
    });
  } catch (error) {
    logger.error('Error in getActivityStatistics controller:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get activity statistics',
      error: process.env.NODE_ENV !== 'production' ? error.message : undefined,
    });
  }
}

/**
 * Get top endpoints
 * GET /api/activity-log/top-endpoints
 */
export async function getTopEndpoints(req, res) {
  try {
    const { start_date, end_date, limit = 10 } = req.query;

    const filters = {
      start_date,
      end_date,
    };

    const topEndpoints = await activityLogService.getTopEndpoints(
      filters,
      parseInt(limit, 10) || 10
    );

    res.json({
      success: true,
      data: topEndpoints.map(endpoint => ({
        ...endpoint,
        request_count: parseInt(endpoint.request_count, 10) || 0,
        avg_execution_time: parseFloat(endpoint.avg_execution_time) || 0,
        error_count: parseInt(endpoint.error_count, 10) || 0,
      })),
    });
  } catch (error) {
    logger.error('Error in getTopEndpoints controller:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get top endpoints',
      error: process.env.NODE_ENV !== 'production' ? error.message : undefined,
    });
  }
}

/**
 * Get error logs
 * GET /api/activity-log/errors
 */
export async function getErrorLogs(req, res) {
  try {
    const {
      user_id,
      start_date,
      end_date,
      limit = 100,
      offset = 0,
    } = req.query;

    const filters = {
      user_id,
      has_error: true,
      start_date,
      end_date,
      limit: parseInt(limit, 10) || 100,
      offset: parseInt(offset, 10) || 0,
      order_by: 'created_at',
      order_direction: 'DESC',
    };

    const logs = await activityLogService.getActivityLogs(filters);
    const total = await activityLogService.getActivityLogCount(filters);

    res.json({
      success: true,
      data: logs,
      pagination: {
        total,
        limit: filters.limit,
        offset: filters.offset,
        has_more: filters.offset + filters.limit < total,
      },
    });
  } catch (error) {
    logger.error('Error in getErrorLogs controller:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get error logs',
      error: process.env.NODE_ENV !== 'production' ? error.message : undefined,
    });
  }
}

/**
 * Get user activity logs
 * GET /api/activity-log/users/:userId/logs
 */
export async function getUserActivityLogs(req, res) {
  try {
    const { userId } = req.params;
    const {
      start_date,
      end_date,
      limit = 100,
      offset = 0,
    } = req.query;

    const filters = {
      user_id: userId,
      start_date,
      end_date,
      limit: parseInt(limit, 10) || 100,
      offset: parseInt(offset, 10) || 0,
      order_by: 'created_at',
      order_direction: 'DESC',
    };

    const logs = await activityLogService.getActivityLogs(filters);
    const total = await activityLogService.getActivityLogCount(filters);

    res.json({
      success: true,
      data: logs,
      pagination: {
        total,
        limit: filters.limit,
        offset: filters.offset,
        has_more: filters.offset + filters.limit < total,
      },
    });
  } catch (error) {
    logger.error('Error in getUserActivityLogs controller:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user activity logs',
      error: process.env.NODE_ENV !== 'production' ? error.message : undefined,
    });
  }
}

