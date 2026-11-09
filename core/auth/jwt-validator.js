import jwt from 'jsonwebtoken';
import axios from 'axios';
import { authGatewayConfig } from '../../config/ttlock.js';
import { getJWTSecret } from '../../config/jwt.js';
import { getRedisClient } from '../../config/redis.js';
import { logger } from '../utils/logger.js';
import {
  displayNameFromJwtPayload,
  nipOrNimFromJwtPayload,
  mergeGatewayJwtUserPayload,
} from '../utils/jwtIdentityFromPayload.js';

// Lazy import untuk menghindari circular dependency
let profileModel = null;
async function getProfileModel() {
  if (!profileModel) {
    profileModel = await import('../../modules/user-management/models/profileModel.js');
  }
  return profileModel;
}

let roleService = null;
async function getRoleService() {
  if (!roleService) {
    roleService = await import('../../modules/user-management/services/roleService.js');
  }
  return roleService;
}

// Clock tolerance for jwt.verify (seconds). Can be overridden with env JWT_CLOCK_TOLERANCE.
const CLOCK_TOLERANCE = Number(process.env.JWT_CLOCK_TOLERANCE || '60');

// Cache configuration
const CACHE_TTL = 300; // 5 minutes cache untuk valid token
const BLACKLIST_TTL = 3600; // 1 hour cache untuk blacklist
const TOKEN_PREFIX_LENGTH = 20; // Panjang prefix untuk cache key

/**
 * Middleware untuk validasi JWT dengan Hybrid Approach:
 * 1. Check Redis cache (fastest)
 * 2. Verify signature lokal dengan JWT_SECRET (fast)
 * 3. Optional: Async check blacklist via gateway (non-blocking)
 * 
 * Semua endpoint protected harus menggunakan middleware ini
 */
export async function validateJWT(req, res, next) {
  try {
    const token = extractToken(req);
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided',
      });
    }

    const tokenPrefix = token.substring(0, TOKEN_PREFIX_LENGTH);
    const redis = getRedisClient();

    // Step 1: Check cache first (fastest path)
    if (redis) {
      try {
        const cachedValid = await redis.get(`jwt:valid:${tokenPrefix}`);
        if (cachedValid === 'true') {
          // Token sudah pernah divalidasi dan masih valid
          const decoded = jwt.decode(token);
          // Normalize user ID field - support multiple field names
          if (decoded) {
            // Support various field names: id, userId, user_id, sub
            const userId = decoded.id || decoded.userId || decoded.user_id || decoded.sub;
            if (userId) {
              decoded.id = String(userId);
            } else {
              logger.warn('JWT token missing user ID field', { decodedKeys: Object.keys(decoded || {}) });
            }
            Object.assign(decoded, mergeGatewayJwtUserPayload(decoded));
          }
          req.user = decoded;
          req.token = token;
          
          // Auto-create profile jika belum ada (non-blocking)
          // Profile dibuat otomatis saat user login dan mengakses API pertama kali
          logger.debug('validateJWT (cached): Calling autoCreateProfileIfNeeded', { 
            userId: decoded?.id,
            hasRole: !!decoded?.role,
            hasRoles: !!(decoded?.roles && Array.isArray(decoded?.roles))
          });
          autoCreateProfileIfNeeded(decoded).catch(err => {
            // Log error tapi jangan block request
            logger.error('Error auto-creating profile in validateJWT (cached path):', {
              error: err.message,
              stack: err.stack,
              userId: decoded?.id
            });
          });
          
          return next();
        }
        
        // Check blacklist cache
        const cachedBlacklist = await redis.get(`jwt:blacklist:${tokenPrefix}`);
        if (cachedBlacklist === 'true') {
          return res.status(401).json({
            success: false,
            message: 'Token has been revoked',
          });
        }
      } catch (cacheError) {
        // Ignore cache errors, continue to verify
        console.warn('Redis cache error (non-critical):', cacheError.message);
      }
    }

    // Step 2: Verify signature lokal dengan JWT_SECRET (fast)
    let decoded;
    try {
      // Check JWT_SECRET configuration first
      let secret;
      try {
        secret = getJWTSecret();
      } catch (configError) {
        logger.error('JWT_SECRET configuration error:', configError.message);
        return res.status(500).json({
          success: false,
          message: 'JWT configuration error. Please contact administrator.',
        });
      }

      decoded = jwt.verify(token, secret, {
        ignoreNotBefore: true, // Ignore nbf (Not Before) claim untuk handle clock skew
        clockTolerance: CLOCK_TOLERANCE
      });

      // Normalize user ID field - support multiple field names
      // Support various field names: id, userId, user_id, sub
      const userId = decoded.id || decoded.userId || decoded.user_id || decoded.sub;
      if (userId) {
        decoded.id = String(userId);
      } else {
        logger.warn('JWT token missing user ID field', { decodedKeys: Object.keys(decoded || {}) });
      }
      Object.assign(decoded, mergeGatewayJwtUserPayload(decoded));
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Token expired',
        });
      }
      if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          message: 'Invalid token signature',
        });
      }
      if (error.name === 'NotBeforeError') {
        // Token not yet active (nbf in the future)
        return res.status(401).json({
          success: false,
          message: 'Token not active yet',
        });
      }
      throw error;
    }

    // Step 3: Cache valid token dan async check blacklist (non-blocking)
    if (redis) {
      try {
        // Cache valid token
        await redis.setex(
          `jwt:valid:${tokenPrefix}`,
          CACHE_TTL,
          'true'
        );
        
        // Async check blacklist via gateway (non-blocking)
        checkBlacklistAsync(token, tokenPrefix).catch(err => {
          // Ignore errors untuk async operation
          console.warn('Async blacklist check failed:', err.message);
        });
      } catch (cacheError) {
        // Ignore cache errors, continue
        console.warn('Redis cache write error (non-critical):', cacheError.message);
      }
    }

    // Log decoded token structure for debugging (only in development)
    if (process.env.NODE_ENV !== 'production' && decoded) {
      logger.debug('JWT decoded successfully', { 
        userId: decoded.id, 
        tokenKeys: Object.keys(decoded) 
      });
    }

    req.user = decoded;
    req.token = token;
    
    // Auto-create profile jika belum ada (non-blocking)
    // Profile dibuat otomatis saat user login dan mengakses API pertama kali
    logger.debug('validateJWT: Calling autoCreateProfileIfNeeded', { 
      userId: decoded?.id,
      hasRole: !!decoded?.role,
      hasRoles: !!(decoded?.roles && Array.isArray(decoded?.roles))
    });
    autoCreateProfileIfNeeded(decoded).catch(err => {
      // Log error tapi jangan block request
      logger.error('Error auto-creating profile in validateJWT:', {
        error: err.message,
        stack: err.stack,
        userId: decoded?.id
      });
    });
    
    next();
  } catch (error) {
    logger.error('JWT validation error:', error);
    
    // Handle JWT_SECRET not configured error
    if (error.message && error.message.includes('JWT_SECRET not configured')) {
      return res.status(500).json({
        success: false,
        message: 'JWT configuration error. Please contact administrator.',
      });
    }
    
    return res.status(401).json({
      success: false,
      message: 'Token validation failed',
    });
  }
}

/**
 * Extract token dari request header
 */
function extractToken(req) {
  const authHeader = req.headers.authorization;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  
  return null;
}

/**
 * Async check blacklist via gateway (non-blocking)
 * Hanya untuk memastikan token tidak di-revoke
 * Tidak block request jika gateway tidak available
 */
async function checkBlacklistAsync(token, tokenPrefix) {
  try {
    const response = await axios.post(
      `${authGatewayConfig.baseUrl}/api/auth/validate`,
      { token },
      {
        timeout: 2000, // Shorter timeout untuk async check
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    const redis = getRedisClient();
    if (redis && response.data.valid === false) {
      // Token di-blacklist, cache untuk 1 hour
      await redis.setex(
        `jwt:blacklist:${tokenPrefix}`,
        BLACKLIST_TTL,
        'true'
      );
      
      // Remove dari valid cache jika ada
      await redis.del(`jwt:valid:${tokenPrefix}`);
    }
  } catch (error) {
    // Ignore error untuk async check, tidak block request
    // Error sudah di-handle di caller
    throw error;
  }
}

/**
 * Auto-create profile jika belum ada
 * Dipanggil setelah token berhasil divalidasi
 * Non-blocking - tidak akan mengganggu request jika terjadi error
 */
async function autoCreateProfileIfNeeded(decodedUser) {
  try {
    const userId = decodedUser?.id;
    
    // Skip jika user ID tidak ada
    if (!userId) {
      logger.warn('autoCreateProfileIfNeeded: userId tidak ada di decodedUser', { 
        decodedUserKeys: Object.keys(decodedUser || {}) 
      });
      return;
    }

    logger.debug('autoCreateProfileIfNeeded: Checking profile for user', { userId });

    // Lazy load profile model untuk menghindari circular dependency
    const profileModelModule = await getProfileModel();
    
    // Check jika profile sudah ada
    const existingProfile = await profileModelModule.getUserProfile(userId);
    
    // Extract identifier from JWT: NIP (pegawai) / NIM (mahasiswa), not username
    const identifierFromJWT = nipOrNimFromJwtPayload(decodedUser) || null;

    let profileData = {
      name: displayNameFromJwtPayload(decodedUser) || decodedUser?.name || null,
      nipnim: identifierFromJWT,
    };
    
    if (existingProfile) {
      logger.debug('autoCreateProfileIfNeeded: Profile sudah ada, check and sync missing fields', { userId });
      
      // Sync name dan nipnim dari JWT jika profile sudah ada tapi field masih kosong
      const needsUpdate = {};
      if (profileData.name && !existingProfile.name) {
        needsUpdate.name = profileData.name;
        logger.info('Auto-syncing name from JWT to existing profile:', { userId, name: profileData.name });
      }
      if (identifierFromJWT && !existingProfile.nipnim) {
        needsUpdate.nipnim = identifierFromJWT;
        logger.info('Auto-syncing nipnim from JWT to existing profile:', { userId, nipnim: identifierFromJWT });
      }

      if (Object.keys(needsUpdate).length > 0) {
        try {
          await profileModelModule.upsertUserProfile(userId, needsUpdate);
          logger.info('Profile updated with missing fields from JWT:', { userId, updatedFields: Object.keys(needsUpdate) });
        } catch (updateError) {
          logger.warn('Error updating profile with JWT data:', { userId, error: updateError.message });
        }
      }
    } else {
      // Jika profile belum ada, buat dengan data dari JWT
      logger.info('Auto-creating profile for new user:', { 
        userId, 
        name: profileData.name, 
        identifier: profileData.identifier,
        decodedUserKeys: Object.keys(decodedUser || {})
      });
      
      try {
        // Upsert profile (akan create karena belum ada)
        await profileModelModule.upsertUserProfile(userId, profileData);
        logger.info('Profile auto-created successfully:', { userId, profileData });
      } catch (upsertError) {
        // Handle duplicate key error (race condition)
        if (upsertError.code === '23505' && upsertError.constraint === 'user_profiles_user_id_key') {
          logger.warn('Profile already exists (race condition), continuing with role assignment', { userId });
        } else {
          throw upsertError;
        }
      }
    }
    
    // Auto-assign role dasar untuk user baru (dipanggil baik profile baru atau sudah ada)
    // Ini penting karena user mungkin sudah punya profile tapi belum punya role
    try {
      const roleServiceModule = await getRoleService();
      const nipHint =
        existingProfile?.nipnim || profileData.nipnim || identifierFromJWT || null;
      const assignedRole = await roleServiceModule.autoAssignBaseRole(
        userId,
        decodedUser,
        nipHint
      );
      if (assignedRole) {
        logger.info('Base role auto-assigned successfully:', { userId, role: assignedRole.role });
      } else {
        logger.debug('No base role assigned (user already has roles or role not detected):', { 
          userId,
          jwtRole: decodedUser?.role,
          jwtRoles: decodedUser?.roles
        });
      }
      await roleServiceModule.ensureProcurementRolesForKnownTestUsers(
        userId,
        decodedUser,
        nipHint
      );
    } catch (roleError) {
      // Log error tapi jangan throw - ini adalah non-critical operation
      logger.error('Error in auto-assign role:', { 
        userId, 
        error: roleError.message, 
        stack: roleError.stack 
      });
    }
  } catch (error) {
    // Log error tapi jangan throw - ini adalah non-critical operation
    // Profile creation tidak boleh mengganggu request flow
    logger.error('Error in autoCreateProfileIfNeeded:', { 
      error: error.message, 
      stack: error.stack,
      decodedUser: decodedUser ? { id: decodedUser.id, keys: Object.keys(decodedUser) } : null
    });
  }
}

/**
 * Optional: Middleware untuk extract token tanpa validation
 * Digunakan untuk endpoint yang tidak memerlukan auth tapi perlu user info jika ada
 * Akan verify token jika ada, tapi tidak error jika tidak ada atau invalid
 */
export function optionalJWT(req, res, next) {
  try {
    const token = extractToken(req);
    if (token) {
      try {
        // Cek apakah JWT_SECRET sudah configured
        const secret = getJWTSecret();
        const decoded = jwt.verify(token, secret, { clockTolerance: CLOCK_TOLERANCE });
        // Normalize user ID field - support multiple field names
        if (decoded) {
          const userId = decoded.id || decoded.userId || decoded.user_id || decoded.sub;
          if (userId) {
            decoded.id = String(userId);
          }
        }
        req.user = decoded;
        req.token = token;
      } catch (error) {
        // Ignore error untuk optional JWT - token invalid/expired tidak masalah
        // Juga ignore jika JWT_SECRET not configured
        // Hanya set user jika token valid
      }
    }
    next();
  } catch (error) {
    // Ignore semua error untuk optional JWT
    next();
  }
}
