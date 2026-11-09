import { logger } from '../utils/logger.js';

/**
 * Global error handler middleware
 * Harus dipasang di akhir middleware chain
 */
export function errorHandler(err, req, res, next) {
  // Log error
  logger.error('Error occurred:', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
  });

  // Default error response
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  // Joi validation errors
  if (err.isJoi) {
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: err.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message,
      })),
    });
  }

  // PostgreSQL errors
  if (err.code === '23505') { // unique_violation
    return res.status(409).json({
      success: false,
      message: 'Duplicate entry',
    });
  }
  
  if (err.code === '23503') { // foreign_key_violation
    return res.status(400).json({
      success: false,
      message: 'Foreign key constraint violation',
    });
  }

  // Default error response
  res.status(statusCode).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
}

/**
 * 404 Not Found handler
 */
export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.path} not found`,
  });
}

