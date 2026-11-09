/**
 * File Storage Service
 * Handle file upload dan management untuk TTD
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../../../core/utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Base directory untuk uploads (relative dari project root)
const UPLOAD_BASE_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
const TTD_UPLOAD_DIR = path.join(UPLOAD_BASE_DIR, 'ttd');

/**
 * Initialize upload directory
 */
export async function initializeUploadDir() {
  try {
    // Create upload base directory
    if (!fs.existsSync(UPLOAD_BASE_DIR)) {
      await fs.promises.mkdir(UPLOAD_BASE_DIR, { recursive: true });
      logger.info('Created upload base directory:', UPLOAD_BASE_DIR);
    }

    // Create TTD upload directory
    if (!fs.existsSync(TTD_UPLOAD_DIR)) {
      await fs.promises.mkdir(TTD_UPLOAD_DIR, { recursive: true });
      logger.info('Created TTD upload directory:', TTD_UPLOAD_DIR);
    }
  } catch (error) {
    logger.error('Error initializing upload directory:', error);
    throw error;
  }
}

/**
 * Get allowed MIME types for TTD
 */
export function getAllowedMimeTypes() {
  return ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'];
}

/**
 * Get file extension from MIME type
 */
export function getFileExtension(mimeType) {
  const mimeMap = {
    'image/png': 'png',
    'image/jpeg': 'jpeg',
    'image/jpg': 'jpg',
    'application/pdf': 'pdf',
  };
  return mimeMap[mimeType] || 'png';
}

/**
 * Validate file MIME type
 */
export function validateMimeType(mimeType) {
  const allowedTypes = getAllowedMimeTypes();
  return allowedTypes.includes(mimeType);
}

/**
 * Save TTD file to local storage
 * @param {string} userId - User ID
 * @param {Buffer} fileBuffer - File buffer
 * @param {string} mimeType - MIME type
 * @returns {Promise<string>} Relative file path
 */
export async function saveTTDFile(userId, fileBuffer, mimeType) {
  try {
    // Validate MIME type
    if (!validateMimeType(mimeType)) {
      throw new Error(`File type tidak didukung. Format yang didukung: PNG, JPG, JPEG, PDF`);
    }

    // Ensure directory exists
    await initializeUploadDir();

    // Generate unique filename
    const timestamp = Date.now();
    const extension = getFileExtension(mimeType);
    const fileName = `${userId}-${timestamp}.${extension}`;
    const filePath = path.join(TTD_UPLOAD_DIR, fileName);

    // Write file
    await fs.promises.writeFile(filePath, fileBuffer);

    // Return relative path (from project root)
    const relativePath = path.relative(process.cwd(), filePath);
    logger.info('TTD file saved:', { userId, filePath: relativePath });

    return relativePath;
  } catch (error) {
    logger.error('Error saving TTD file:', error);
    throw error;
  }
}

/**
 * Delete TTD file from local storage
 * @param {string} filePath - Relative file path
 * @returns {Promise<boolean>} Success status
 */
export async function deleteTTDFile(filePath) {
  try {
    if (!filePath) {
      return false;
    }

    // Convert relative path to absolute path
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(process.cwd(), filePath);

    // Check if file exists
    if (!fs.existsSync(absolutePath)) {
      logger.warn('TTD file not found for deletion:', absolutePath);
      return false;
    }

    // Delete file
    await fs.promises.unlink(absolutePath);
    logger.info('TTD file deleted:', absolutePath);

    return true;
  } catch (error) {
    logger.error('Error deleting TTD file:', error);
    // Don't throw error, just log it
    return false;
  }
}

/**
 * Get absolute file path from relative path
 * @param {string} relativePath - Relative file path
 * @returns {string} Absolute file path
 */
export function getAbsoluteFilePath(relativePath) {
  if (!relativePath) {
    return null;
  }
  return path.isAbsolute(relativePath)
    ? relativePath
    : path.join(process.cwd(), relativePath);
}

/**
 * Check if file exists
 * @param {string} filePath - Relative or absolute file path
 * @returns {Promise<boolean>} File exists status
 */
export async function fileExists(filePath) {
  try {
    const absolutePath = getAbsoluteFilePath(filePath);
    if (!absolutePath) {
      return false;
    }
    return fs.existsSync(absolutePath);
  } catch (error) {
    logger.error('Error checking file existence:', error);
    return false;
  }
}

/**
 * Get file URL for serving (relative to API base)
 * @param {string} relativePath - Relative file path
 * @returns {string} File URL
 */
export function getFileUrl(relativePath) {
  if (!relativePath) {
    return null;
  }
  // Return path that can be served via static file serving
  // Format: /uploads/ttd/filename.ext
  return relativePath.replace(/\\/g, '/'); // Convert backslashes to forward slashes
}

