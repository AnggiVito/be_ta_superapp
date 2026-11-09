/**
 * Auto Create Profile Middleware
 * Otomatis membuat profile di database user_management saat user pertama kali mengakses API
 * Profile dibuat dengan data dari JWT (name, identifier jika ada)
 */

import * as profileService from '../services/profileService.js';
import {
  autoAssignBaseRole,
  ensureProcurementRolesForKnownTestUsers,
} from '../services/roleService.js';
import { logger } from '../../../core/utils/logger.js';
import { displayNameFromJwtPayload, nipOrNimFromJwtPayload } from '../../../core/utils/jwtIdentityFromPayload.js';

/**
 * Middleware untuk auto-create profile jika belum ada
 * Harus dipanggil setelah validateJWT middleware
 */
export async function autoCreateProfile(req, res, next) {
  try {
    const userId = req.user?.id;

    // Skip jika user tidak terautentikasi
    if (!userId) {
      return next();
    }

    // getUserProfile sudah memiliki logika auto-sync name dari JWT jika profile belum ada atau name kosong
    // Tapi jika profile belum ada dan name juga tidak ada di JWT, profile tidak akan dibuat
    // Jadi kita perlu memastikan profile dibuat dengan data minimal jika belum ada
    let existingProfile = await profileService.getUserProfile(userId, req.user);
    
    const profileData = {
      name: displayNameFromJwtPayload(req.user || {}) || req.user?.name || null,
      nipnim: nipOrNimFromJwtPayload(req.user || {}) || null,
    };
    
    // Jika profile belum ada, buat dengan data dari JWT (bahkan jika name tidak ada)
    if (!existingProfile) {
      logger.info('Auto-creating profile for user:', { 
        userId, 
        name: profileData.name, 
        nipnim: profileData.nipnim,
        jwtKeys: req.user ? Object.keys(req.user) : null
      });
      
      try {
        // updateUserProfile akan membuat profile baru jika belum ada (upsert)
        await profileService.updateUserProfile(userId, profileData, req.user);
        logger.info('Profile auto-created successfully:', { userId });
      } catch (error) {
        // Handle error (misalnya duplicate key karena race condition)
        if (error.code === '23505' && error.constraint === 'user_profiles_user_id_key') {
          logger.warn('Profile already exists (race condition), continuing with role assignment', { userId });
        } else {
          throw error;
        }
      }
    } else {
      logger.debug('Profile already exists, checking role assignment', { userId });
    }
    
    // Auto-assign role dasar untuk user (dipanggil baik profile baru atau sudah ada)
    // Ini penting karena user mungkin sudah punya profile tapi belum punya role
    try {
      const nipHint =
          existingProfile?.nipnim || profileData.nipnim || null;
      const assignedRole = await autoAssignBaseRole(userId, req.user, nipHint);
      if (assignedRole) {
        logger.info('Base role auto-assigned in middleware:', { userId, role: assignedRole.role });
      } else {
        logger.debug('No base role assigned in middleware (user already has roles or role not detected):', { 
          userId,
          jwtRole: req.user?.role,
          jwtRoles: req.user?.roles
        });
      }
      await ensureProcurementRolesForKnownTestUsers(userId, req.user, nipHint);
    } catch (roleError) {
      logger.error('Error in auto-assign role in middleware:', {
        userId,
        error: roleError.message,
        stack: roleError.stack
      });
    }

    next();
  } catch (error) {
    // Log error tapi jangan block request
    // Profile creation adalah opsional, tidak critical untuk operasi API
    logger.error('Error in autoCreateProfile middleware:', error);
    // Continue to next middleware/route handler
    next();
  }
}

