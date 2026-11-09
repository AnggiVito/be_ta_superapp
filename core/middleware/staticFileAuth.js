/**
 * Static File Authentication Controller
 * Serve static files dengan JWT authentication
 * File uploads (TTD, receipts, feedback) harus diakses dengan authentication
 */

import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';

/**
 * Serve protected file dengan authentication
 * Route handler untuk /uploads/* yang memerlukan JWT
 */
export async function serveProtectedFile(req, res, next) {
  try {
    // Extract file path dari URL
    // Path format: /uploads/ttd/filename.ext atau /uploads/receipts/filename.ext
    const filePath = req.path.replace(/^\/uploads\//, '');
    
    if (!filePath) {
      return res.status(400).json({
        success: false,
        message: 'File path is required',
      });
    }

    // Get absolute file path
    const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
    const absolutePath = path.join(uploadDir, filePath);

    // Security: Prevent directory traversal
    const normalizedPath = path.normalize(absolutePath);
    const normalizedUploadDir = path.normalize(uploadDir);
    
    if (!normalizedPath.startsWith(normalizedUploadDir)) {
      logger.warn('Directory traversal attempt detected:', { 
        requestedPath: absolutePath, 
        uploadDir,
        ip: req.ip 
      });
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }

    // Check if file exists
    if (!fs.existsSync(normalizedPath)) {
      return res.status(404).json({
        success: false,
        message: 'File not found',
      });
    }

    // Check if it's a file (not directory)
    const stats = fs.statSync(normalizedPath);
    if (!stats.isFile()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }

    // Set appropriate content type
    const ext = path.extname(normalizedPath).toLowerCase();
    const contentTypes = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.pdf': 'application/pdf',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.xls': 'application/vnd.ms-excel',
    };
    
    const contentType = contentTypes[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${path.basename(normalizedPath)}"`);

    // Stream file
    const fileStream = fs.createReadStream(normalizedPath);
    fileStream.pipe(res);

    fileStream.on('error', (error) => {
      logger.error('Error streaming file:', error);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: 'Error reading file',
        });
      }
    });
  } catch (error) {
    logger.error('Error in serveProtectedFile:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Error serving file',
      });
    }
  }
}

