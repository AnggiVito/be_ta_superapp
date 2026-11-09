import express from 'express';
import { validateJWT } from '../../core/auth/jwt-validator.js';
import * as profileController from './controllers/profileController.js';
import * as roleController from './controllers/roleController.js';
import {
  requireRole,
  requireOwnerOrRole,
  requireProcurementSupervisedLabManager,
  PROCUREMENT_SUPERVISED_LAB_MANAGER_ROLES,
} from './middleware/roleValidator.js';
import { uploadTTDMiddleware, handleUploadError } from './middleware/uploadMiddleware.js';

const router = express.Router();

/**
 * Modul User Management Routes
 * Mengelola data tambahan user (TTD, no rekening) dan role management untuk praktikum
 * User data utama tetap di AUTH GATEWAY (tidak replicate)
 * 
 * Note: Assignment asisten ke praktikum akan dikerjakan di modul registration
 */

// Health check untuk modul
router.get('/health', (req, res) => {
  res.json({
    success: true,
    module: 'user-management',
    message: 'User Management module is running',
  });
});

// ==================== Profile Routes ====================

/**
 * List users with kartu akses on profile (RFID assignment picker).
 * GET /api/user-management/users/with-access-cards
 * Must be registered before /users/:userId routes.
 */
router.get(
  '/users/with-access-cards',
  validateJWT,
  requireRole('kaur_lab', 'laboran', 'tpa'),
  profileController.listUsersWithAccessCards
);

/**
 * Get user profile
 * GET /api/user-management/users/:userId/profile
 * All users can access their own profile, kaur_lab, laboran, asisten_praktikum, and asisten_praktikum_aktif can access other users' profiles
 */
router.get(
  '/users/:userId/profile',
  validateJWT,
  requireOwnerOrRole(...PROCUREMENT_SUPERVISED_LAB_MANAGER_ROLES),
  profileController.getUserProfile
);

/**
 * Update user profile
 * PUT /api/user-management/users/:userId/profile
 * All users can update their own profile
 */
router.put(
  '/users/:userId/profile',
  validateJWT,
  requireOwnerOrRole(...PROCUREMENT_SUPERVISED_LAB_MANAGER_ROLES),
  profileController.updateUserProfile
);

/**
 * Fingerprint & kartu akses — edit: nilai TEXT (hanya laboran & kaur_lab)
 * GET  /users/:userId/profile/access-credentials → isi form edit
 * PUT  /users/:userId/profile/access-credentials → simpan
 */
router.get(
  '/users/:userId/profile/access-credentials',
  validateJWT,
  requireRole('kaur_lab', 'laboran'),
  profileController.getAccessCredentials
);

router.put(
  '/users/:userId/profile/access-credentials',
  validateJWT,
  requireRole('kaur_lab', 'laboran'),
  profileController.updateAccessCredentials
);

/**
 * Upload TTD
 * POST /api/user-management/users/:userId/profile/ttd
 * Accepts multipart/form-data with file field 'ttd'
 * All users can upload their own TTD, only kaur_lab and laboran can upload other users' TTD
 */
router.post(
  '/users/:userId/profile/ttd',
  validateJWT,
  requireOwnerOrRole('kaur_lab', 'laboran'),
  uploadTTDMiddleware,
  handleUploadError,
  profileController.uploadTTD
);

/**
 * Delete TTD
 * DELETE /api/user-management/users/:userId/profile/ttd
 * All users can delete their own TTD, only kaur_lab and laboran can delete other users' TTD
 */
router.delete(
  '/users/:userId/profile/ttd',
  validateJWT,
  requireOwnerOrRole('kaur_lab', 'laboran'),
  profileController.deleteTTD
);

/**
 * Update no rekening
 * PUT /api/user-management/users/:userId/profile/rekening
 */
router.put(
  '/users/:userId/profile/rekening',
  validateJWT,
  requireOwnerOrRole('kaur_lab', 'laboran'),
  profileController.updateNoRekening
);

// ==================== Role Routes ====================

/**
 * Get all users
 * GET /api/user-management/users
 * Returns all users with user_id, name, nipnim, has_fingerprint, has_kartu_akses
 * Accessible by koordinator_praktikum, kaur_lab, laboran
 */
router.get(
  '/users',
  validateJWT,
  requireRole('koordinator_praktikum', 'kaur_lab', 'laboran'),
  roleController.getAllUsers
);

/**
 * Get user roles
 * GET /api/user-management/users/:userId/roles
 */
router.get(
  '/users/:userId/roles',
  validateJWT,
  requireOwnerOrRole('kaur_lab', 'laboran'),
  roleController.getUserRoles
);

/**
 * Assign role to user
 * POST /api/user-management/users/:userId/roles
 */
router.post(
  '/users/:userId/roles',
  validateJWT,
  requireRole('kaur_lab'),
  roleController.assignRole
);

/**
 * Update role status
 * PUT /api/user-management/roles/:roleId
 */
router.put(
  '/roles/:roleId',
  validateJWT,
  requireRole('kaur_lab'),
  roleController.updateRoleStatus
);

/**
 * Remove role from user
 * DELETE /api/user-management/roles/:roleId
 */
router.delete(
  '/roles/:roleId',
  validateJWT,
  requireRole('kaur_lab'),
  roleController.removeRole
);

/**
 * Get all users with specific role
 * GET /api/user-management/roles/:role/users
 */
router.get(
  '/roles/:role/users',
  validateJWT,
  requireProcurementSupervisedLabManager(),
  roleController.getUsersByRole
);

export default router;