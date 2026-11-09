/**
 * Role Authorization Middleware untuk Reporting Module
 * Validasi akses untuk kaprodi, kaur, dan TPA
 */

import { logger } from '../../../core/utils/logger.js';
import { normalizeRoleSlug } from '../../../core/utils/normalizeRoleSlug.js';

/**
 * Middleware untuk require akses role tertentu untuk reporting
 * Role yang diizinkan: kaprodi, kaur, tpa, koordinator_praktikum, koordinator_asisten, admin
 * 
 * @param {...string} allowedRoles - Roles yang diizinkan
 */
export function requireReportingAccess(...allowedRoles) {
  return async (req, res, next) => {
    try {
      const userId = req.user?.id;
      const userRole = req.user?.role || req.user?.roles;

      if (!userId) {
        logger.warn('User tidak terautentikasi di requireReportingAccess', {
          path: req.path,
          method: req.method,
        });
        return res.status(401).json({
          success: false,
          message: 'User tidak terautentikasi',
        });
      }

      const allowedSet = new Set(
        allowedRoles.map((r) => String(r || '').toLowerCase().trim()).filter(Boolean),
      );

      // Check if user has any of the allowed roles
      // Support both single role (string) and multiple roles (array)
      let hasAccess = false;

      if (Array.isArray(userRole)) {
        hasAccess = userRole.some((role) => allowedSet.has(normalizeRoleSlug(role)));
      } else if (typeof userRole === 'string') {
        hasAccess = allowedSet.has(normalizeRoleSlug(userRole));
      } else if (userRole && typeof userRole === 'object') {
        hasAccess = allowedSet.has(normalizeRoleSlug(userRole));
      }

      // If still no access, check from user-management role service
      if (!hasAccess) {
        try {
          // Dynamic import to avoid circular dependency
          const roleService = await import('../../user-management/services/roleService.js');
          
          for (const role of allowedRoles) {
            const slug = String(role || '').toLowerCase().trim();
            const userHasRole = await roleService.userHasRole(String(userId), slug);
            if (userHasRole) {
              hasAccess = true;
              break;
            }
          }
        } catch (error) {
          logger.warn('Could not check user-management roles:', error.message);
          // Continue with hasAccess = false
        }
      }

      if (!hasAccess) {
        logger.warn('Access denied for reporting:', { 
          userId: String(userId), 
          userRole, 
          allowedRoles, 
          path: req.path 
        });
        return res.status(403).json({
          success: false,
          message: `Akses ditolak. Diperlukan salah satu role: ${allowedRoles.join(', ')}`,
        });
      }

      next();
    } catch (error) {
      logger.error('Error in requireReportingAccess middleware:', error);
      return res.status(500).json({
        success: false,
        message: 'Error checking user access',
      });
    }
  };
}

/**
 * Middleware khusus untuk akses view reporting
 * Mengizinkan: kaprodi, dosen, mahasiswa, kaur, tpa, koordinator_praktikum, koordinator_asisten, admin
 */
export function requireViewReportAccess(req, res, next) {
  return requireReportingAccess(
    'kaprodi',
    'dosen',
    'dosen_pembina',
    'kaur',
    'kaur_lab',
    'tpa',
    'koordinator_praktikum',
    'koordinator_asisten',
    'asisten_praktikum',
    'asisten_praktikum_aktif',
    'asisten',
    'mahasiswa',
    'admin'
  )(req, res, next);
}

/**
 * Laporan keuangan (KPA) — kaur, tpa (operasional lab), dan kaprodi.
 */
export function requireKeuanganReportAccess(req, res, next) {
  return requireReportingAccess(
    'kaprodi',
    'kaur',
    'kaur_lab',
    'tpa',
    'laboran',
    'admin'
  )(req, res, next);
}

/**
 * Laporan BAP kehadiran — termasuk asisten dan praktikan (ter-scope).
 */
export function requireKehadiranReportAccess(req, res, next) {
  return requireReportingAccess(
    'kaprodi',
    'dosen',
    'dosen_pembina',
    'kaur',
    'kaur_lab',
    'tpa',
    'koordinator_praktikum',
    'koordinator_asisten',
    'asisten_praktikum',
    'asisten_praktikum_aktif',
    'asisten',
    'mahasiswa',
    'admin'
  )(req, res, next);
}

/**
 * Laporan nilai praktikum — selaras kehadiran (staf agregat + member ter-scope).
 */
export function requireNilaiReportAccess(req, res, next) {
  return requireKehadiranReportAccess(req, res, next);
}

/**
 * Middleware khusus untuk akses upload/manage reporting
 * Mengizinkan: kaur, tpa, koordinator_praktikum, koordinator_asisten, admin
 */
export function requireManageReportAccess(req, res, next) {
  return requireReportingAccess(
    'kaur',
    'kaur_lab',
    'tpa',
    'laboran',
    'koordinator_praktikum',
    'koordinator_asisten',
    'admin'
  )(req, res, next);
}

/**
 * Hapus upload KPA / file keuangan — hanya KAUR dan TPA (sesuai kebijakan akses).
 */
export function requireKpaKaurTpaDeleteAccess(req, res, next) {
  return requireReportingAccess('kaur', 'tpa')(req, res, next);
}

/**
 * Middleware untuk filter data berdasarkan role
 * Kaprodi hanya bisa lihat data prodi-nya sendiri
 */
export function filterByRole(req, res, next) {
  try {
    const userRole = req.user?.role || req.user?.roles;
    const userProdiId = req.user?.prodi_id;

    // Determine the role to use
    let effectiveRole = null;
    if (Array.isArray(userRole)) {
      effectiveRole = userRole[0]; // Use first role
    } else if (typeof userRole === 'string') {
      effectiveRole = userRole;
    }

    // If user is kaprodi, filter by their prodi_id
    if (String(effectiveRole || '').toLowerCase().trim() === 'kaprodi' && userProdiId) {
      // Add prodi_id filter to query
      req.query.prodi_id = userProdiId;
      logger.info('Filtering by prodi_id for kaprodi:', { userId: req.user?.id, userProdiId });
    }

    next();
  } catch (error) {
    logger.error('Error in filterByRole middleware:', error);
    next(); // Continue without filtering on error
  }
}
