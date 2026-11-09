/**
 * Middleware authorization untuk pengelolaan modul praktikum & konfigurasi terkait.
 * Menggabungkan cek role di user-management (DB) dan klaim role di JWT.
 */

import * as roleService from '../../user-management/services/roleService.js';
import { logger } from '../../../core/utils/logger.js';

function normalizeRoleSlug(raw) {
  return String(raw ?? '')
    .toLowerCase()
    .trim()
    .replace(/-/g, '_')
    .replace(/\s+/g, '_');
}

/**
 * Kumpulkan slug role dari payload JWT (`req.user`) — format bisa berbeda per gateway.
 */
function collectRolesFromJwtUser(user) {
  const slugs = new Set();
  if (!user) return slugs;

  const addRaw = (raw) => {
    if (raw == null || raw === '') return;
    if (typeof raw === 'string') {
      raw.split(/[,;|]+/).forEach((p) => {
        const n = normalizeRoleSlug(p.trim());
        if (n) slugs.add(n);
      });
      return;
    }
    if (typeof raw === 'number') {
      addRaw(String(raw));
      return;
    }
    if (Array.isArray(raw)) {
      raw.forEach(addRaw);
      return;
    }
    if (typeof raw === 'object') {
      if (raw.name != null) addRaw(raw.name);
      if (raw.role != null) addRaw(raw.role);
      if (raw.authority != null) addRaw(raw.authority);
    }
  };

  addRaw(user.roles);
  addRaw(user.role);
  addRaw(user.roleName);
  addRaw(user.role_name);
  if (Array.isArray(user.authorities)) {
    for (const a of user.authorities) {
      if (typeof a === 'string') addRaw(a.replace(/^ROLE_/i, ''));
      else addRaw(a);
    }
  }
  if (user.realm_access && typeof user.realm_access === 'object' && Array.isArray(user.realm_access.roles)) {
    addRaw(user.realm_access.roles);
  }
  return slugs;
}

/** Fallback jika `user_roles` belum sinkron: token ditandatangani gateway dan dianggap valid. */
function jwtAllowsPracticumModuleAccess(user) {
  const s = collectRolesFromJwtUser(user);
  if (
    s.has('kaur_lab') ||
    s.has('kaur') ||
    s.has('kepala_urusan_laboratorium') ||
    s.has('kepala_urusan_lab')
  ) {
    return true;
  }
  if (s.has('laboran')) return true;
  if (s.has('koordinator_praktikum')) return true;
  return false;
}

/** Hanya koordinator (slug token), tanpa kaur/laboran. */
function jwtHasKoordinatorPraktikum(user) {
  return collectRolesFromJwtUser(user).has('koordinator_praktikum');
}

/**
 * Middleware untuk require role dengan pembatasan khusus:
 * - kaur_lab: langsung bisa akses
 * - laboran: langsung bisa akses
 * - koordinator_praktikum: langsung bisa akses (role UM; tidak wajib asisten_praktikum_aktif)
 * - asisten_praktikum_aktif tanpa koordinator_praktikum: ditolak
 *
 * Urutan: cek DB (UM) dulu, lalu klaim role di JWT — menangani kasus role ada di token
 * tetapi baris `user_roles` belum ter-update / user id konsisten.
 */
export function requirePracticumModuleAccess() {
  return async (req, res, next) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        logger.warn('User tidak terautentikasi di requirePracticumModuleAccess', {
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

      // Check kaur_lab
      const hasKaurLab = await roleService.userHasRole(userIdString, 'kaur_lab');
      if (hasKaurLab) {
        return next();
      }

      // Check laboran
      const hasLaboran = await roleService.userHasRole(userIdString, 'laboran');
      if (hasLaboran) {
        return next();
      }

      // Koordinator praktikum (UM) — tidak wajib memiliki asisten_praktikum_aktif
      const hasKoordinator = await roleService.userHasRole(userIdString, 'koordinator_praktikum');
      if (hasKoordinator) {
        return next();
      }

      if (jwtAllowsPracticumModuleAccess(req.user)) {
        return next();
      }

      // Check asisten_praktikum_aktif - hanya yang juga koordinator_praktikum
      const hasAsistenAktif = await roleService.userHasRole(userIdString, 'asisten_praktikum_aktif');
      if (hasAsistenAktif) {
        // Koordinator sudah diizinkan di atas; sampai sini berarti bukan koordinator
        logger.warn('Access denied: asisten_praktikum_aktif tanpa koordinator_praktikum', {
          userId: userIdString,
          path: req.path,
        });
        return res.status(403).json({
          success: false,
          message: 'Akses ditolak. Hanya koordinator praktikum yang dapat mengakses fitur ini',
        });
      }

      // Jika tidak memiliki salah satu role yang diizinkan
      logger.warn('Access denied: tidak memiliki role yang diizinkan', {
        userId: userIdString,
        path: req.path,
      });
      return res.status(403).json({
        success: false,
        message:
          'Akses ditolak. Diperlukan role: kaur_lab, laboran, atau koordinator (praktikum / asisten) dengan asisten_praktikum_aktif jika sebagai asisten.',
      });
    } catch (error) {
      logger.error('Error in requirePracticumModuleAccess middleware:', error);
      return res.status(500).json({
        success: false,
        message: 'Error checking user access',
      });
    }
  };
}

/**
 * Hanya untuk endpoint komponen penilaian (module-assessment-config).
 * Sumber kebenaran: `user_roles` (UM); fallback JWT jika klaim memuat koordinator_praktikum
 * (parser sama seperti requirePracticumModuleAccess — menangani variasi gateway).
 * Tidak mengizinkan kaur_lab / laboran / asisten tanpa koordinator.
 */
export function requireKoordinatorPraktikum() {
  return async (req, res, next) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        logger.warn('User tidak terautentikasi di requireKoordinatorPraktikum', {
          hasUser: !!req.user,
          path: req.path,
          method: req.method,
        });
        return res.status(401).json({
          success: false,
          message: 'User tidak terautentikasi',
        });
      }

      const userIdString = String(userId);

      const hasKoordinator = await roleService.userHasRole(userIdString, 'koordinator_praktikum');
      if (hasKoordinator) {
        return next();
      }

      if (jwtHasKoordinatorPraktikum(req.user)) {
        return next();
      }

      logger.warn('Access denied: bukan koordinator praktikum (module-assessment-config)', {
        userId: userIdString,
        path: req.path,
      });
      return res.status(403).json({
        success: false,
        message: 'Akses ditolak. Hanya koordinator praktikum yang dapat mengakses konfigurasi komponen penilaian',
      });
    } catch (error) {
      logger.error('Error in requireKoordinatorPraktikum middleware:', error);
      return res.status(500).json({
        success: false,
        message: 'Error checking user access',
      });
    }
  };
}

