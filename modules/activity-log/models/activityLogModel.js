/**
 * Activity Log Model
 * Database operations untuk activity logs
 */

import { userManagementDb } from '../../../config/databases.js';
import { logger } from '../../../core/utils/logger.js';

function limitString(value, maxLength) {
  if (value == null) return null;
  const text = String(value);
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

/**
 * Create activity log entry
 */
export async function createActivityLog(logData) {
  try {
    const {
      user_id,
      action,
      method,
      endpoint,
      ip_address,
      user_agent,
      request_body,
      response_status,
      response_body,
      error_message,
      error_stack,
      execution_time_ms,
      affected_table,
      affected_record_id,
      metadata,
    } = logData;

    const result = await userManagementDb.query(
      `INSERT INTO activity_logs (
        user_id, action, method, endpoint, ip_address, user_agent,
        request_body, response_status, response_body, error_message,
        error_stack, execution_time_ms, affected_table, affected_record_id,
        metadata, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
      RETURNING *`,
      [
        user_id || null,
        limitString(action, 100),
        method,
        limitString(endpoint, 500),
        ip_address || null,
        user_agent || null,
        request_body ? JSON.stringify(request_body) : null,
        response_status || null,
        response_body ? JSON.stringify(response_body) : null,
        error_message || null,
        error_stack || null,
        execution_time_ms || null,
        limitString(affected_table, 100),
        affected_record_id || null,
        metadata ? JSON.stringify(metadata) : null,
      ]
    );

    return result.rows[0];
  } catch (error) {
    logger.error('Error creating activity log:', error);
    // Don't throw error - activity logging should not break the application
    return null;
  }
}

/**
 * Get activity logs with filters
 */
export async function getActivityLogs(filters = {}) {
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
    } = filters;

    let query = 'SELECT * FROM activity_logs WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (user_id) {
      query += ` AND user_id = $${paramIndex++}`;
      params.push(user_id);
    }

    if (action) {
      query += ` AND action = $${paramIndex++}`;
      params.push(action);
    }

    if (method) {
      query += ` AND method = $${paramIndex++}`;
      params.push(method);
    }

    if (endpoint) {
      query += ` AND endpoint LIKE $${paramIndex++}`;
      params.push(`%${endpoint}%`);
    }

    if (response_status) {
      query += ` AND response_status = $${paramIndex++}`;
      params.push(response_status);
    }

    if (affected_table) {
      query += ` AND affected_table = $${paramIndex++}`;
      params.push(affected_table);
    }

    if (has_error === true) {
      query += ` AND error_message IS NOT NULL`;
    }

    if (start_date) {
      query += ` AND created_at >= $${paramIndex++}`;
      params.push(start_date);
    }

    if (end_date) {
      query += ` AND created_at <= $${paramIndex++}`;
      params.push(end_date);
    }

    // Validate order_by to prevent SQL injection
    const validOrderBy = ['created_at', 'execution_time_ms', 'response_status', 'method', 'endpoint'];
    const orderByColumn = validOrderBy.includes(order_by) ? order_by : 'created_at';
    const orderDir = order_direction.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    query += ` ORDER BY ${orderByColumn} ${orderDir}`;
    query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);

    const result = await userManagementDb.query(query, params);
    return result.rows;
  } catch (error) {
    logger.error('Error getting activity logs:', error);
    throw error;
  }
}

/**
 * Get activity log count with filters
 */
export async function getActivityLogCount(filters = {}) {
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
    } = filters;

    let query = 'SELECT COUNT(*) as count FROM activity_logs WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (user_id) {
      query += ` AND user_id = $${paramIndex++}`;
      params.push(user_id);
    }

    if (action) {
      query += ` AND action = $${paramIndex++}`;
      params.push(action);
    }

    if (method) {
      query += ` AND method = $${paramIndex++}`;
      params.push(method);
    }

    if (endpoint) {
      query += ` AND endpoint LIKE $${paramIndex++}`;
      params.push(`%${endpoint}%`);
    }

    if (response_status) {
      query += ` AND response_status = $${paramIndex++}`;
      params.push(response_status);
    }

    if (affected_table) {
      query += ` AND affected_table = $${paramIndex++}`;
      params.push(affected_table);
    }

    if (has_error === true) {
      query += ` AND error_message IS NOT NULL`;
    }

    if (start_date) {
      query += ` AND created_at >= $${paramIndex++}`;
      params.push(start_date);
    }

    if (end_date) {
      query += ` AND created_at <= $${paramIndex++}`;
      params.push(end_date);
    }

    const result = await userManagementDb.query(query, params);
    return parseInt(result.rows[0].count, 10);
  } catch (error) {
    logger.error('Error getting activity log count:', error);
    throw error;
  }
}

/**
 * Get activity log by ID
 */
export async function getActivityLogById(id) {
  try {
    const result = await userManagementDb.query(
      'SELECT * FROM activity_logs WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Error getting activity log by ID:', error);
    throw error;
  }
}

/**
 * Get activity statistics
 */
export async function getActivityStatistics(filters = {}) {
  try {
    const { start_date, end_date } = filters;

    let query = `
      SELECT 
        COUNT(*) as total_requests,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(CASE WHEN error_message IS NOT NULL THEN 1 END) as error_count,
        AVG(execution_time_ms) as avg_execution_time,
        MAX(execution_time_ms) as max_execution_time,
        COUNT(CASE WHEN response_status >= 400 THEN 1 END) as error_4xx_count,
        COUNT(CASE WHEN response_status >= 500 THEN 1 END) as error_5xx_count
      FROM activity_logs
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (start_date) {
      query += ` AND created_at >= $${paramIndex++}`;
      params.push(start_date);
    }

    if (end_date) {
      query += ` AND created_at <= $${paramIndex++}`;
      params.push(end_date);
    }

    const result = await userManagementDb.query(query, params);
    return result.rows[0];
  } catch (error) {
    logger.error('Error getting activity statistics:', error);
    throw error;
  }
}

/**
 * Get top endpoints by request count
 */
export async function getTopEndpoints(filters = {}, limit = 10) {
  try {
    const { start_date, end_date } = filters;

    let query = `
      SELECT 
        endpoint,
        method,
        COUNT(*) as request_count,
        AVG(execution_time_ms) as avg_execution_time,
        COUNT(CASE WHEN error_message IS NOT NULL THEN 1 END) as error_count
      FROM activity_logs
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (start_date) {
      query += ` AND created_at >= $${paramIndex++}`;
      params.push(start_date);
    }

    if (end_date) {
      query += ` AND created_at <= $${paramIndex++}`;
      params.push(end_date);
    }

    query += ` GROUP BY endpoint, method ORDER BY request_count DESC LIMIT $${paramIndex++}`;
    params.push(limit);

    const result = await userManagementDb.query(query, params);
    return result.rows;
  } catch (error) {
    logger.error('Error getting top endpoints:', error);
    throw error;
  }
}

