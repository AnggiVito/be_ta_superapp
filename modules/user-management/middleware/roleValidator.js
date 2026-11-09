/**
 * Role Validator Middleware
 * RBAC (Role-Based Access Control) untuk user management
 */

import * as roleService from '../services/roleService.js';
import { logger } from '../../../core/utils/logger.js';

function normalizeRole(role) {
  const normalized = String(role ?? '').toLowerCase().trim().replace(/-/g, '_');
  switch (normalized) {
    case 'kaur':
    case 'kepala_urusan_laboratorium':
    case 'kepala_urusan_lab':
      return 'kaur_lab';
    default:
      return normalized;
  }
}

function jwtRoles(user) {
  const roles = new Set();
  const pushRole = (value) => {
    if (!value) return;
    if (typeof value === 'string') {
      roles.add(normalizeRole(value));
      return;
    }
    roles.add(normalizeRole(value.role || value.name || value.value));
  };

  pushRole(user?.role);
  pushRole(user?.user_role);
  pushRole(user?.userRole);
  if (Array.isArray(user?.roles)) {
    for (const role of user.roles) pushRole(role);
  }

  return roles;
}

function jwtHasAllowedRole(user, allowedRoles) {
  const roles = jwtRoles(user);
  const allowed = allowedRoles.map(normalizeRole);
  return allowed.some((role) => roles.has(role));
}

/** Roles that may assign procurement_supervised_lab_id on reviewer profiles. */
export const PROCUREMENT_SUPERVISED_LAB_MANAGER_ROLES = [
  'kaur_lab',
  'kaur',
  'laboran',
  'tpa',
];

function jwtHasAnyKaurRelatedRole(user) {
  for (const role of jwtRoles(user)) {
    if (role.includes('kaur')) return true;
  }
  return false;
}

export async function userCanManageProcurementSupervisedLabs(userIdString, jwtUser) {
  for (const role of PROCUREMENT_SUPERVISED_LAB_MANAGER_ROLES) {
    if (await roleService.userHasRole(userIdString, role)) return true;
  }
  if (jwtHasAllowedRole(jwtUser, PROCUREMENT_SUPERVISED_LAB_MANAGER_ROLES)) return true;
  if (jwtHasAnyKaurRelatedRole(jwtUser)) return true;
  return false;
}

/**
 * TPA, laboran, kaur / kaur_lab (and JWT slugs containing "kaur") may manage
 * procurement supervised laboratory assignments on user profiles.
 */
export function requireProcurementSupervisedLabManager() {
  return async (req, res, next) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'User tidak terautentikasi',
        });
      }
      const userIdString = String(userId);
      if (await userCanManageProcurementSupervisedLabs(userIdString, req.user)) {
        return next();
      }
      logger.warn('Procurement supervised lab manager access denied:', {
        userId: userIdString,
        jwtRoles: [...jwtRoles(req.user)],
        path: req.path,
      });
      return res.status(403).json({
        success: false,
        message:
          'Akses ditolak. Diperlukan role TPA, laboran, atau kaur (kaur_lab).',
      });
    } catch (error) {
      logger.error('Error in requireProcurementSupervisedLabManager:', error);
      return res.status(500).json({
        success: false,
        message: 'Error checking user access',
      });
    }
  };
}

/**
 * Middleware untuk require salah satu role dari allowedRoles
 * @param {...string} allowedRoles - Roles yang diizinkan
 */
export function requireRole(...allowedRoles) {
  return async (req, res, next) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        logger.warn('User tidak terautentikasi di requireRole', {
          hasUser: !!req.user,
          userKeys: req.user ? Object.keys(req.user) : [],
          path: req.path,
          method: req.method,
        });
        return res.status(401).json({
          success: false,
          message: 'User tidak terautentikasi',
        });
      }

      // Ensure userId is string (UUID)
      const userIdString = String(userId);

      // Check if user has at least one of the allowed roles
      let hasRole = false;
      for (const role of allowedRoles) {
        const userHasRole = await roleService.userHasRole(userIdString, role);
        if (userHasRole) {
          hasRole = true;
          break;
        }
      }

      if (!hasRole && jwtHasAllowedRole(req.user, allowedRoles)) {
        hasRole = true;
      }

      if (!hasRole) {
        logger.warn('Access denied:', { userId: userIdString, allowedRoles, jwtRoles: [...jwtRoles(req.user)], path: req.path });
        return res.status(403).json({
          success: false,
          message: `Akses ditolak. Diperlukan salah satu role: ${allowedRoles.join(', ')}`,
        });
      }

      next();
    } catch (error) {
      logger.error('Error in requireRole middleware:', error);
      return res.status(500).json({
        success: false,
        message: 'Error checking user role',
      });
    }
  };
}

/**
 * Middleware untuk require user adalah owner atau memiliki salah satu role
 * Digunakan untuk endpoint yang user bisa akses data sendiri atau dengan role tertentu
 * @param {...string} allowedRoles - Roles yang diizinkan untuk akses data user lain
 */
export function requireOwnerOrRole(...allowedRoles) {
  return async (req, res, next) => {
    try {
      const userId = req.user?.id;
      const targetUserId = req.params.userId || req.body.userId;

      if (!userId) {
        logger.warn('User tidak terautentikasi di requireOwnerOrRole', {
          hasUser: !!req.user,
          userKeys: req.user ? Object.keys(req.user) : [],
          path: req.path,
          method: req.method,
        });
        return res.status(401).json({
          success: false,
          message: 'User tidak terautentikasi',
        });
      }

      // Ensure userId is string (UUID)
      const userIdString = String(userId);
      const targetUserIdString = targetUserId ? String(targetUserId) : null;

      // If user is accessing their own data, allow
      // Convert to string for UUID comparison
      if (targetUserIdString && userIdString === targetUserIdString) {
        return next();
      }

      // Otherwise, check if user has required role
      if (allowedRoles.length > 0) {
        let hasRole = false;
        for (const role of allowedRoles) {
          const userHasRole = await roleService.userHasRole(userIdString, role);
          if (userHasRole) {
            hasRole = true;
            break;
          }
        }

        if (!hasRole && jwtHasAllowedRole(req.user, allowedRoles)) {
          hasRole = true;
        }

        if (!hasRole) {
          logger.warn('Access denied:', { userId: userIdString, targetUserId: targetUserIdString, allowedRoles, jwtRoles: [...jwtRoles(req.user)], path: req.path });
          return res.status(403).json({
            success: false,
            message: `Akses ditolak. Hanya bisa akses data sendiri atau dengan role: ${allowedRoles.join(', ')}`,
          });
        }
      }

      next();
    } catch (error) {
      logger.error('Error in requireOwnerOrRole middleware:', error);
      return res.status(500).json({
        success: false,
        message: 'Error checking user access',
      });
    }
  };
}

