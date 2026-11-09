/**
 * Profile Controller
 * Handle HTTP requests untuk user profile management
 */

import * as profileService from '../services/profileService.js';
import * as fileStorageService from '../services/fileStorageService.js';
import { logger } from '../../../core/utils/logger.js';
import { userCanManageProcurementSupervisedLabs } from '../middleware/roleValidator.js';

/**
 * Helper untuk menambahkan file URL ke profile
 */
function addFileUrlToProfile(profile) {
  if (!profile) {
    return profile;
  }
  
  return {
    ...profile,
    ttd_url: profile.ttd_file_path ? fileStorageService.getFileUrl(profile.ttd_file_path) : null,
  };
}

/**
 * Get user profile
 * GET /api/user-management/users/:userId/profile
 * Returns profile data for the requested userId, not the logged-in user
 */
export async function getUserProfile(req, res) {
  try {
    const { userId } = req.params;
    const requestingUserId = req.user?.id;

    // User hanya bisa akses profile sendiri, kecuali admin/koordinator
    // Convert to string for UUID comparison
    if (userId && requestingUserId && String(userId) !== String(requestingUserId)) {
      // TODO: Check if user is admin/koordinator (akan di-handle oleh middleware)
      // Untuk sekarang, allow access
    }

    // Pass JWT data untuk auto-sync name (only if it's the same user)
    // This is for auto-syncing name from JWT if profile doesn't have it yet
    const isOwnProfile = String(userId) === String(requestingUserId);
    const jwtDataForSync = isOwnProfile ? req.user : null;
    
    const profile = await profileService.getUserProfile(userId, jwtDataForSync);
    
    // Add file URL to profile if exists
    const profileWithUrl = addFileUrlToProfile(profile);
    
    // CRITICAL: Use combineUserDataFromProfile to ensure we return data for the requested userId
    // not the logged-in user. This function uses userId from parameter as primary source.
    const userData = profileService.combineUserDataFromProfile(userId, profileWithUrl, req.user);

    res.json({
      success: true,
      data: userData,
    });
  } catch (error) {
    logger.error('Error in getUserProfile controller:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error getting user profile',
    });
  }
}

/**
 * Update user profile
 * PUT /api/user-management/users/:userId/profile
 */
export async function updateUserProfile(req, res) {
  try {
    const { userId } = req.params;
    const requestingUserId = req.user?.id;
    const profileData = req.body;

    if (userId && requestingUserId && String(userId) !== String(requestingUserId)) {
      const canManageLabs = await userCanManageProcurementSupervisedLabs(
        String(requestingUserId),
        req.user
      );
      const keys = Object.keys(profileData).filter(
        (k) => profileData[k] !== undefined
      );
      const onlySupervisedLab =
        keys.length > 0 &&
        keys.every((k) => k === 'procurement_supervised_lab_id');
      if (!canManageLabs || !onlySupervisedLab) {
        return res.status(403).json({
          success: false,
          message: 'Anda tidak memiliki akses untuk mengupdate profile user ini',
        });
      }
    }

    // Pass JWT data untuk auto-sync name jika tidak diisi
    const profile = await profileService.updateUserProfile(userId, profileData, req.user);

    res.json({
      success: true,
      data: profile,
      message: 'Profile berhasil diupdate',
    });
  } catch (error) {
    logger.error('Error in updateUserProfile controller:', error);
    const statusCode =
      error.message.includes('tidak valid') ||
      error.message.includes('hanya dapat') ||
      error.message.includes('sudah diassign') ||
      error.message.includes('Laboratorium')
        ? 400
        : 500;
    res.status(statusCode).json({
      success: false,
      message: error.message || 'Error updating user profile',
    });
  }
}

/**
 * Upload TTD
 * POST /api/user-management/users/:userId/profile/ttd
 * Accepts multipart/form-data with file field 'ttd'
 */
export async function uploadTTD(req, res) {
  try {
    const { userId } = req.params;
    const requestingUserId = req.user?.id;

    // User hanya bisa upload TTD sendiri, kecuali admin/koordinator
    // Convert to string for UUID comparison
    if (userId && requestingUserId && String(userId) !== String(requestingUserId)) {
      // TODO: Check if user is admin/koordinator
      return res.status(403).json({
        success: false,
        message: 'Anda tidak memiliki akses untuk mengupload TTD user ini',
      });
    }

    // Check if file is uploaded
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'File TTD tidak ditemukan. Pastikan mengirim file dengan field name "ttd"',
      });
    }

    // Save file to local storage
    const filePath = await fileStorageService.saveTTDFile(
      userId,
      req.file.buffer,
      req.file.mimetype
    );

    // Get existing profile to delete old file if exists
    const existingProfile = await profileService.getUserProfile(userId, req.user);
    if (existingProfile && existingProfile.ttd_file_path) {
      // Delete old file
      await fileStorageService.deleteTTDFile(existingProfile.ttd_file_path);
    }

    // Save file path to database
    const profile = await profileService.uploadTTD(userId, {
      ttd_file_path: filePath,
    });

    // Add file URL to response
    const profileWithUrl = {
      ...profile,
      ttd_url: fileStorageService.getFileUrl(filePath),
    };

    res.json({
      success: true,
      data: profileWithUrl,
      message: 'TTD berhasil diupload',
    });
  } catch (error) {
    logger.error('Error in uploadTTD controller:', error);
    const statusCode = error.message.includes('tidak valid') || error.message.includes('tidak didukung') ? 400 : 500;
    res.status(statusCode).json({
      success: false,
      message: error.message || 'Error uploading TTD',
    });
  }
}

/**
 * Delete TTD
 * DELETE /api/user-management/users/:userId/profile/ttd
 */
export async function deleteTTD(req, res) {
  try {
    const { userId } = req.params;
    const requestingUserId = req.user?.id;

    // User hanya bisa delete TTD sendiri, kecuali admin/koordinator
    // Convert to string for UUID comparison
    if (userId && requestingUserId && String(userId) !== String(requestingUserId)) {
      // TODO: Check if user is admin/koordinator
      return res.status(403).json({
        success: false,
        message: 'Anda tidak memiliki akses untuk menghapus TTD user ini',
      });
    }

    // Get existing profile to get file path before deletion
    const existingProfile = await profileService.getUserProfile(userId, req.user);
    
    if (!existingProfile) {
      return res.status(404).json({
        success: false,
        message: 'Profile tidak ditemukan',
      });
    }

    // Delete file from storage if exists
    if (existingProfile.ttd_file_path) {
      await fileStorageService.deleteTTDFile(existingProfile.ttd_file_path);
    }

    // Delete TTD from database
    const profile = await profileService.deleteTTD(userId);

    res.json({
      success: true,
      data: profile,
      message: 'TTD berhasil dihapus',
    });
  } catch (error) {
    logger.error('Error in deleteTTD controller:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error deleting TTD',
    });
  }
}

/**
 * List users with kartu akses on profile (RFID assignment picker).
 * GET /api/user-management/users/with-access-cards
 */
export async function listUsersWithAccessCards(req, res) {
  try {
    const requestingUserId = req.user?.id;
    const search = req.query.search;

    const data = await profileService.listUsersWithAccessCards(requestingUserId, { search });

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    logger.error('Error in listUsersWithAccessCards controller:', error);
    const isForbidden =
      error.message.includes('Hanya Kaur Lab') ||
      error.message.includes('Kaur Lab, Laboran');
    const statusCode = isForbidden ? 403 : 500;
    res.status(statusCode).json({
      success: false,
      message: error.message || 'Error listing users with access cards',
    });
  }
}

/**
 * Get fingerprint & kartu akses untuk form edit (nilai TEXT)
 * GET /api/user-management/users/:userId/profile/access-credentials
 * Hanya laboran dan kaur_lab
 */
export async function getAccessCredentials(req, res) {
  try {
    const { userId } = req.params;
    const requestingUserId = req.user?.id;

    const data = await profileService.getAccessCredentialsForEdit(userId, requestingUserId);

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    logger.error('Error in getAccessCredentials controller:', error);
    const isForbidden = error.message.includes('Hanya Kaur Lab');
    const statusCode = isForbidden ? 403 : 500;
    res.status(statusCode).json({
      success: false,
      message: error.message || 'Error getting access credentials',
    });
  }
}

/**
 * Simpan fingerprint & kartu akses (nilai TEXT)
 * PUT /api/user-management/users/:userId/profile/access-credentials
 * Hanya laboran dan kaur_lab — response berisi nilai TEXT untuk form edit
 */
export async function updateAccessCredentials(req, res) {
  try {
    const { userId } = req.params;
    const requestingUserId = req.user?.id;
    const credentialsData = req.body;

    const data = await profileService.updateAccessCredentials(
      userId,
      credentialsData,
      requestingUserId
    );

    res.json({
      success: true,
      data,
      message: 'Data fingerprint dan kartu akses berhasil diperbarui',
    });
  } catch (error) {
    logger.error('Error in updateAccessCredentials controller:', error);
    const isForbidden = error.message.includes('Hanya Kaur Lab');
    const isValidation = error.message.includes('Minimal satu field');
    const statusCode = isForbidden ? 403 : isValidation ? 400 : 500;
    res.status(statusCode).json({
      success: false,
      message: error.message || 'Error updating access credentials',
    });
  }
}

/**
 * Update no rekening
 * PUT /api/user-management/users/:userId/profile/rekening
 */
export async function updateNoRekening(req, res) {
  try {
    const { userId } = req.params;
    const requestingUserId = req.user?.id;
    const rekeningData = req.body;

    // User hanya bisa update no rekening sendiri, kecuali admin/koordinator
    // Convert to string for UUID comparison
    if (userId && requestingUserId && String(userId) !== String(requestingUserId)) {
      // TODO: Check if user is admin/koordinator
      return res.status(403).json({
        success: false,
        message: 'Anda tidak memiliki akses untuk mengupdate no rekening user ini',
      });
    }

    const profile = await profileService.updateNoRekening(userId, rekeningData);

    res.json({
      success: true,
      data: profile,
      message: 'No rekening berhasil diupdate',
    });
  } catch (error) {
    logger.error('Error in updateNoRekening controller:', error);
    const statusCode =
      error.message.includes('tidak valid') ||
      error.message.includes('hanya dapat') ||
      error.message.includes('sudah diassign') ||
      error.message.includes('Laboratorium')
        ? 400
        : 500;
    res.status(statusCode).json({
      success: false,
      message: error.message || 'Error updating no rekening',
    });
  }
}

