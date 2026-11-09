/**
 * Activity Log Middleware
 * Capture seluruh aktivitas request/response untuk logging
 */

import * as activityLogService from '../services/activityLogService.js';
import { logger } from '../../../core/utils/logger.js';

// List of endpoints to exclude from logging (health checks, static files, etc.)
const EXCLUDED_PATHS = [
  '/health',
  '/api-docs',
  '/api-docs.json',
  '/uploads',
];

// List of endpoints to log with minimal data (sensitive endpoints)
const MINIMAL_LOG_PATHS = [
  '/api/user-management/users/:userId/profile/ttd',
  '/api/user-management/users/:userId/profile',
];

/**
 * Main middleware untuk activity logging
 */
export function activityLogMiddleware(req, res, next) {
  // Skip logging untuk excluded paths
  if (shouldSkipLogging(req.path)) {
    return next();
  }

  const startTime = Date.now();
  const originalSend = res.send;
  const originalJson = res.json;

  // Capture request data
  const requestData = {
    user_id: req.user?.id || null,
    method: req.method,
    endpoint: req.path,
    ip_address: req.ip || req.connection.remoteAddress,
    user_agent: req.get('user-agent'),
    request_body: getRequestBody(req),
    metadata: {
      query: req.query,
      params: req.params,
      roles: req.user?.roles || [],
    },
  };

  // Detect affected table from endpoint
  const affectedTable = detectAffectedTable(req.path);
  const affectedRecordId = detectAffectedRecordId(req.params, req.body);

  // Override res.send to capture response
  res.send = function (body) {
    logActivity(
      req,
      res,
      startTime,
      requestData,
      sanitizeResponseBodyForLog(req, res, body),
      affectedTable,
      affectedRecordId,
      null,
    );
    return originalSend.call(this, body);
  };

  // Override res.json to capture response
  res.json = function (body) {
    logActivity(
      req,
      res,
      startTime,
      requestData,
      sanitizeResponseBodyForLog(req, res, body),
      affectedTable,
      affectedRecordId,
      null,
    );
    return originalJson.call(this, body);
  };

  // Handle errors
  res.on('finish', () => {
    // If response wasn't logged yet (error case)
    if (!res._activityLogged) {
      logActivity(req, res, startTime, requestData, null, affectedTable, affectedRecordId, null);
    }
  });

  next();
}

/**
 * Do not persist PDF/binary payloads — they break JSON logging and are huge.
 */
function sanitizeResponseBodyForLog(req, res, body) {
  if (shouldOmitResponseBodyFromLog(req, res, body)) {
    const byteLength = Buffer.isBuffer(body) ? body.length : null;
    return {
      _omitted: true,
      reason: 'binary_or_pdf_response',
      byteLength,
      path: req.path,
    };
  }
  return body;
}

function shouldOmitResponseBodyFromLog(req, res, body) {
  const path = req.path || '';
  if (req.method === 'GET' && /\/proposal(-file)?$/i.test(path)) {
    return true;
  }
  const ct = res.getHeader?.('Content-Type');
  const ctStr = Array.isArray(ct) ? ct[0] : ct;
  if (typeof ctStr === 'string' && ctStr.includes('application/pdf')) {
    return true;
  }
  if (Buffer.isBuffer(body)) {
    return true;
  }
  if (body instanceof Uint8Array) {
    return true;
  }
  return false;
}

/**
 * Log activity to database (async, non-blocking)
 */
async function logActivity(req, res, startTime, requestData, responseBody, affectedTable, affectedRecordId, error) {
  try {
    const executionTime = Date.now() - startTime;
    const responseStatus = res.statusCode;

    // Skip logging if response is already logged
    if (res._activityLogged) {
      return;
    }
    res._activityLogged = true;

    // Determine if we should log with minimal data
    const shouldLogMinimal = shouldLogMinimalData(req.path);

    const logData = {
      user_id: requestData.user_id,
      action: `${requestData.method} ${requestData.endpoint}`,
      method: requestData.method,
      endpoint: requestData.endpoint,
      ip_address: requestData.ip_address,
      user_agent: requestData.user_agent,
      request_body: shouldLogMinimal ? null : requestData.request_body,
      response_status: responseStatus,
      response_body: shouldLogMinimal ? null : (responseBody || null),
      error_message: error ? error.message : null,
      error_stack: error ? error.stack : null,
      execution_time_ms: executionTime,
      affected_table: affectedTable,
      affected_record_id: affectedRecordId,
      metadata: requestData.metadata,
    };

    // Log asynchronously (non-blocking)
    activityLogService.createActivityLog(logData).catch(err => {
      // Log error but don't break the application
      logger.error('Failed to create activity log:', err);
    });
  } catch (error) {
    // Don't break the application if logging fails
    logger.error('Error in activity log middleware:', error);
  }
}

/**
 * Error logging middleware
 * Should be placed after error handler
 */
export function activityLogErrorMiddleware(err, req, res, next) {
  // Log error activity
  const startTime = req._startTime || Date.now();
  const requestData = {
    user_id: req.user?.id || null,
    method: req.method,
    endpoint: req.path,
    ip_address: req.ip || req.connection.remoteAddress,
    user_agent: req.get('user-agent'),
    request_body: getRequestBody(req),
    metadata: {
      query: req.query,
      params: req.params,
      roles: req.user?.roles || [],
    },
  };

  const affectedTable = detectAffectedTable(req.path);
  const affectedRecordId = detectAffectedRecordId(req.params, req.body);

  // Log error activity asynchronously
  activityLogService.createActivityLog({
    ...requestData,
    action: `${requestData.method} ${requestData.endpoint}`,
    response_status: err.statusCode || 500,
    error_message: err.message,
    error_stack: err.stack,
    execution_time_ms: Date.now() - startTime,
    affected_table: affectedTable,
    affected_record_id: affectedRecordId,
    metadata: requestData.metadata,
  }).catch(logErr => {
    logger.error('Failed to create error activity log:', logErr);
  });

  next(err);
}

/**
 * Check if path should be excluded from logging
 */
function shouldSkipLogging(path) {
  return EXCLUDED_PATHS.some(excludedPath => path.startsWith(excludedPath));
}

/**
 * Check if path should log with minimal data
 */
function shouldLogMinimalData(path) {
  return MINIMAL_LOG_PATHS.some(minimalPath => {
    // Simple pattern matching (can be improved with regex)
    const pattern = minimalPath.replace(/:[^/]+/g, '[^/]+');
    const regex = new RegExp(`^${pattern}$`);
    return regex.test(path);
  });
}

/**
 * Get request body (sanitized)
 */
function getRequestBody(req) {
  if (!req.body || Object.keys(req.body).length === 0) {
    return null;
  }

  // Don't log file uploads
  if (req.file || req.files) {
    return { file_upload: true };
  }

  return req.body;
}

/**
 * Detect affected table from endpoint path
 */
function detectAffectedTable(path) {
  // Pattern matching untuk detect table dari endpoint
  const tablePatterns = {
    '/api/user-management': 'user_profiles',
    '/api/user-management/users': 'user_profiles',
    '/api/user-management/roles': 'user_roles',
    '/api/registration': 'registration_tables',
    '/api/execution': 'execution_tables',
    '/api/reporting': 'feedback_uploads',
    '/api/procurement': 'procurement_pengajuan',
  };

  for (const [pattern, table] of Object.entries(tablePatterns)) {
    if (path.startsWith(pattern)) {
      return table;
    }
  }

  return null;
}

/**
 * Detect affected record ID from params or body
 */
function detectAffectedRecordId(params, body) {
  // Try to get ID from params first
  if (params.id) {
    return params.id;
  }
  if (params.userId) {
    return params.userId;
  }
  if (params.roleId) {
    return params.roleId;
  }
  if (params.practicumId) {
    return params.practicumId;
  }
  if (params.scheduleId) {
    return params.scheduleId;
  }

  // Try to get ID from body
  if (body && body.id) {
    return body.id;
  }

  return null;
}

