/**
 * Activity Log Service
 * Business logic untuk activity logging
 */

import * as activityLogModel from '../models/activityLogModel.js';
import { logger } from '../../../core/utils/logger.js';

/**
 * Create activity log entry
 */
export async function createActivityLog(logData) {
  try {
    // Sanitize sensitive data from request body
    const sanitizedRequestBody = sanitizeRequestBody(logData.request_body);
    
    // Limit response body size to prevent huge logs
    const limitedResponseBody = limitResponseBody(logData.response_body);

    const logEntry = await activityLogModel.createActivityLog({
      ...logData,
      request_body: sanitizedRequestBody,
      response_body: limitedResponseBody,
    });

    return logEntry;
  } catch (error) {
    logger.error('Error in createActivityLog service:', error);
    // Don't throw - activity logging should not break the application
    return null;
  }
}

/**
 * Get activity logs with filters
 */
export async function getActivityLogs(filters = {}) {
  try {
    // Validate and sanitize filters
    const sanitizedFilters = sanitizeFilters(filters);
    
    const logs = await activityLogModel.getActivityLogs(sanitizedFilters);
    
    // Parse JSONB fields
    return logs.map(log => ({
      ...log,
      request_body: log.request_body ? (typeof log.request_body === 'string' ? JSON.parse(log.request_body) : log.request_body) : null,
      response_body: log.response_body ? (typeof log.response_body === 'string' ? JSON.parse(log.response_body) : log.response_body) : null,
      metadata: log.metadata ? (typeof log.metadata === 'string' ? JSON.parse(log.metadata) : log.metadata) : null,
    }));
  } catch (error) {
    logger.error('Error in getActivityLogs service:', error);
    throw error;
  }
}

/**
 * Get activity log count with filters
 */
export async function getActivityLogCount(filters = {}) {
  try {
    const sanitizedFilters = sanitizeFilters(filters);
    return await activityLogModel.getActivityLogCount(sanitizedFilters);
  } catch (error) {
    logger.error('Error in getActivityLogCount service:', error);
    throw error;
  }
}

/**
 * Get activity log by ID
 */
export async function getActivityLogById(id) {
  try {
    const log = await activityLogModel.getActivityLogById(id);
    if (!log) {
      return null;
    }
    
    // Parse JSONB fields
    return {
      ...log,
      request_body: log.request_body ? (typeof log.request_body === 'string' ? JSON.parse(log.request_body) : log.request_body) : null,
      response_body: log.response_body ? (typeof log.response_body === 'string' ? JSON.parse(log.response_body) : log.response_body) : null,
      metadata: log.metadata ? (typeof log.metadata === 'string' ? JSON.parse(log.metadata) : log.metadata) : null,
    };
  } catch (error) {
    logger.error('Error in getActivityLogById service:', error);
    throw error;
  }
}

/**
 * Get activity statistics
 */
export async function getActivityStatistics(filters = {}) {
  try {
    const sanitizedFilters = sanitizeFilters(filters);
    return await activityLogModel.getActivityStatistics(sanitizedFilters);
  } catch (error) {
    logger.error('Error in getActivityStatistics service:', error);
    throw error;
  }
}

/**
 * Get top endpoints
 */
export async function getTopEndpoints(filters = {}, limit = 10) {
  try {
    const sanitizedFilters = sanitizeFilters(filters);
    return await activityLogModel.getTopEndpoints(sanitizedFilters, limit);
  } catch (error) {
    logger.error('Error in getTopEndpoints service:', error);
    throw error;
  }
}

/**
 * Sanitize request body - remove sensitive data
 */
function sanitizeRequestBody(requestBody) {
  if (!requestBody || typeof requestBody !== 'object') {
    return requestBody;
  }

  const sensitiveFields = [
    'password',
    'token',
    'secret',
    'api_key',
    'apikey',
    'authorization',
    'auth',
    'credential',
    'credentials',
    'access_token',
    'refresh_token',
    'jwt',
  ];

  const sanitized = { ...requestBody };

  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  }

  // Recursively sanitize nested objects
  for (const key in sanitized) {
    if (sanitized[key] && typeof sanitized[key] === 'object' && !Array.isArray(sanitized[key])) {
      sanitized[key] = sanitizeRequestBody(sanitized[key]);
    }
  }

  return sanitized;
}

/**
 * Limit response body size to prevent huge logs
 */
function limitResponseBody(responseBody, maxSize = 10000) {
  if (!responseBody) {
    return responseBody;
  }

  if (Buffer.isBuffer(responseBody)) {
    return {
      _type: 'binary',
      byteLength: responseBody.length,
      note: '[binary response omitted from activity log]',
    };
  }

  try {
    const bodyString = typeof responseBody === 'string'
      ? responseBody
      : JSON.stringify(responseBody);

    if (bodyString.length <= maxSize) {
      // If original body was an object, return the parsed object; otherwise return the string
      if (typeof responseBody === 'string') return responseBody;
      try {
        return JSON.parse(bodyString);
      } catch (e) {
        // Fallback: return the raw string if parse fails
        return bodyString;
      }
    }

    // Truncate and add indicator. Store as string to avoid producing invalid JSON
    const truncated = bodyString.substring(0, maxSize) + '...[TRUNCATED]';
    return truncated;
  } catch (err) {
    // If anything goes wrong, don't throw — activity logging must be non-fatal.
    logger.warn('Failed to limit/parse response body for activity log:', err);
    try {
      return typeof responseBody === 'string' ? responseBody : String(responseBody).substring(0, maxSize) + '...[TRUNCATED]';
    } catch (e) {
      return '[UNPARSEABLE_RESPONSE]';
    }
  }
}

/**
 * Sanitize and validate filters
 */
function sanitizeFilters(filters) {
  const sanitized = { ...filters };

  // Validate limit
  if (sanitized.limit) {
    sanitized.limit = Math.min(Math.max(parseInt(sanitized.limit, 10) || 100, 1), 1000);
  }

  // Validate offset
  if (sanitized.offset) {
    sanitized.offset = Math.max(parseInt(sanitized.offset, 10) || 0, 0);
  }

  // Validate order_direction
  if (sanitized.order_direction) {
    sanitized.order_direction = sanitized.order_direction.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  }

  return sanitized;
}

