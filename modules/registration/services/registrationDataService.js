/**
 * Registration Data Service
 * Service untuk akses data dari registration_db
 * Digunakan oleh modul lain yang perlu membaca data master dari modul registrasi
 */

import { registrationDb } from '../../../config/databases.js';
import { logger } from '../../../core/utils/logger.js';

/**
 * Get all labs
 */
export async function getLabs() {
  try {
    const result = await registrationDb.query('SELECT * FROM labs WHERE deleted_at IS NULL');
    return result.rows;
  } catch (error) {
    logger.error('Error getting labs:', error);
    throw error;
  }
}

/**
 * Get all prodi
 */
export async function getProdi() {
  try {
    const result = await registrationDb.query('SELECT * FROM prodi WHERE deleted_at IS NULL');
    return result.rows;
  } catch (error) {
    logger.error('Error getting prodi:', error);
    throw error;
  }
}

/**
 * Get praktikum by ID
 */
export async function getPraktikumById(praktikumId) {
  try {
    const result = await registrationDb.query(
      'SELECT * FROM praktikum WHERE id = $1 AND deleted_at IS NULL',
      [praktikumId]
    );
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Error getting praktikum:', error);
    throw error;
  }
}

/**
 * Get jadwal by ID
 */
export async function getJadwalById(jadwalId) {
  try {
    const result = await registrationDb.query(
      'SELECT * FROM jadwal WHERE id = $1 AND deleted_at IS NULL',
      [jadwalId]
    );
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Error getting jadwal:', error);
    throw error;
  }
}

/**
 * Validate jadwal exists and is active
 */
export async function validateJadwal(jadwalId) {
  try {
    const jadwal = await getJadwalById(jadwalId);
    if (!jadwal) {
      return { valid: false, message: 'Jadwal not found' };
    }
    // Add additional validation logic here
    return { valid: true, jadwal };
  } catch (error) {
    logger.error('Error validating jadwal:', error);
    return { valid: false, message: 'Validation error' };
  }
}

