/**
 * Role Service
 * Business logic untuk role management
 */

import * as roleModel from '../models/roleModel.js';
import { logger } from '../../../core/utils/logger.js';

/**
 * Determine role dasar dari JWT atau identifier
 * @param {object} jwtUserData - Data user dari JWT (req.user atau decodedUser)
 * @param {string} identifier - NIM atau NIP dari profile
 * @returns {string|null} - Role dasar yang terdeteksi atau null
 */
export function determineBaseRole(jwtUserData = null, identifier = null) {
  // Prioritas 1: Cek role dari JWT
  if (jwtUserData) {
    // Cek berbagai kemungkinan field untuk role di JWT
    let jwtRole = null;
    
    // Cek req.user.role (bisa string atau object)
    if (jwtUserData.role) {
      jwtRole = typeof jwtUserData.role === 'string' 
        ? jwtUserData.role 
        : (jwtUserData.role.name || jwtUserData.role.role || jwtUserData.role.value || null);
    } 
    // Cek req.user.roles (array)
    else if (jwtUserData.roles && Array.isArray(jwtUserData.roles) && jwtUserData.roles.length > 0) {
      // Coba ambil role pertama
      const firstRole = jwtUserData.roles[0];
      jwtRole = typeof firstRole === 'string' 
        ? firstRole 
        : (firstRole.role || firstRole.name || firstRole.value || null);
    }
    // Cek field lain yang mungkin ada (user_role, userRole, dll)
    else if (jwtUserData.user_role) {
      jwtRole = typeof jwtUserData.user_role === 'string' 
        ? jwtUserData.user_role 
        : (jwtUserData.user_role.name || jwtUserData.user_role.role || null);
    }
    else if (jwtUserData.userRole) {
      jwtRole = typeof jwtUserData.userRole === 'string' 
        ? jwtUserData.userRole 
        : (jwtUserData.userRole.name || jwtUserData.userRole.role || null);
    }
    
    if (jwtRole) {
      const roleLower = jwtRole.toLowerCase().trim();
      logger.info('Determining base role from JWT:', { jwtRole, roleLower, userId: jwtUserData?.id });
      
      // Mapping role dari JWT ke role sistem
      // Mahasiswa
      if (roleLower.includes('mahasiswa') || roleLower === 'student' || roleLower === 'mahasiswa') {
        logger.info('Role detected: mahasiswa', { jwtRole, roleLower });
        return 'mahasiswa';
      }
      // TPA
      if (roleLower.includes('tpa') || roleLower.includes('staff') || roleLower === 'tpa staff') {
        logger.info('Role detected: tpa', { jwtRole, roleLower });
        return 'tpa';
      }
      // Kaur Lab
      if (roleLower.includes('kaur') || roleLower.includes('kepala_urusan')) {
        logger.info('Role detected: kaur_lab', { jwtRole, roleLower });
        return 'kaur_lab';
      }
      // Laboran
      if (roleLower.includes('laboran') || roleLower.includes('lab assistant') || roleLower.includes('teknisi')) {
        logger.info('Role detected: laboran', { jwtRole, roleLower });
        return 'laboran';
      }
      // Dosen pembina — before generic `dosen` match
      if (roleLower.includes('dosen_pembina') || roleLower.includes('dosen pembina') || roleLower.includes('dosen-pembina')) {
        logger.info('Role detected: dosen_pembina', { jwtRole, roleLower });
        return 'dosen_pembina';
      }
      // Dosen
      if (roleLower.includes('dosen') || roleLower === 'lecturer' || roleLower === 'teacher') {
        logger.info('Role detected: dosen', { jwtRole, roleLower });
        return 'dosen';
      }
      
      logger.warn('JWT role tidak cocok dengan role dasar yang dikenal:', { jwtRole, roleLower, userId: jwtUserData?.id });
    } else {
      logger.warn('Tidak ada role ditemukan di JWT data:', { 
        userId: jwtUserData?.id,
        jwtKeys: Object.keys(jwtUserData || {}),
        hasRole: !!jwtUserData?.role,
        hasRoles: !!(jwtUserData?.roles && Array.isArray(jwtUserData?.roles))
      });
    }
  }
  
  // Prioritas 2: Cek dari identifier (NIM/NIP) - untuk fallback
  // Catatan: Deteksi dari identifier kurang reliable, lebih baik dari JWT
  if (identifier) {
    const identifierStr = String(identifier).trim();
    // Bisa ditambahkan logic deteksi dari identifier jika diperlukan
    // Misalnya: jika identifier panjangnya 10 digit dan dimulai dengan angka tertentu = mahasiswa
  }
  
  return null;
}

/**
 * Auto-assign role dasar untuk user baru
 * @param {string} userId - User ID
 * @param {object} jwtUserData - Data user dari JWT
 * @param {string} identifier - NIM atau NIP (optional)
 * @returns {object|null} - Role yang di-assign atau null jika tidak ada role yang terdeteksi
 */
export async function autoAssignBaseRole(userId, jwtUserData = null, identifier = null) {
  try {
    logger.info('autoAssignBaseRole called:', { 
      userId, 
      hasJwtData: !!jwtUserData, 
      identifier,
      jwtRole: jwtUserData?.role,
      jwtRoles: jwtUserData?.roles
    });
    
    // Determine role dasar
    logger.info('Determining base role for user:', { userId, jwtRole: jwtUserData?.role, jwtRoles: jwtUserData?.roles });
    const baseRole = determineBaseRole(jwtUserData, identifier);
    
    if (!baseRole) {
      logger.warn('No base role detected for user:', { 
        userId, 
        jwtRole: jwtUserData?.role,
        jwtRoles: jwtUserData?.roles,
        jwtKeys: jwtUserData ? Object.keys(jwtUserData) : null,
        identifier 
      });
      return null;
    }
    
    // Cek apakah user SUDAH punya role hasil deteksi ini
    const existingRoles = await roleModel.getActiveUserRoles(userId);
    const alreadyHasThisRole = existingRoles.some(r => r.role === baseRole);
    if (alreadyHasThisRole) {
      logger.info('User already has detected role, skipping auto-assign:', { 
        userId, 
        role: baseRole
      });
      return null;
    }
    
    // Assign role dasar (sebagai role tambahan jika user sudah punya role lain)
    logger.info('Auto-assigning base role to user:', { userId, role: baseRole });
    const assignedRole = await roleModel.assignRole(userId, baseRole, 'system');
    
    logger.info('Base role auto-assigned successfully:', { 
      userId, 
      role: baseRole, 
      roleId: assignedRole.id 
    });
    return assignedRole;
  } catch (error) {
    // Log error dengan detail lengkap
    logger.error('Error in autoAssignBaseRole:', {
      userId,
      error: error.message,
      stack: error.stack,
      jwtData: jwtUserData ? { role: jwtUserData.role, roles: jwtUserData.roles } : null
    });
    return null;
  }
}

/**
 * Non-production (or ENABLE_PROCUREMENT_TEST_USER_ROLES=true): assign procurement
 * roles for known gateway test accounts — idempotent mapping:
 * **M001 → asisten_praktikum**, **M002 → koordinator_asisten**, **DOSEN001 → dosen_pembina**.
 *
 * Gateway baru sering tidak mengirim string `M001` di JWT; pakai **`DEV_GATEWAY_M001_USER_IDS`**
 * (UUID, koma‑pisah). Bila env tidak diset, default ke UUID M001 dev gateway baru.
 * **`DEV_GATEWAY_M002_USER_IDS`** / **`DEV_GATEWAY_DOSEN001_USER_IDS`** sama; bila env tidak diset,
 * default ke UUID M002 / DOSEN001 dev gateway baru (login terakhir ke `dev-fri-gateway`).
 *
 * Untuk memaksa satu kali lewat skrip: `npm run dev:force-procurement-roles` (lihat `scripts/dev-force-procurement-test-roles.js`).
 */
export async function ensureProcurementRolesForKnownTestUsers(
  userId,
  jwtUserData = null,
  profileNipnim = null
) {
  const nodeEnv = (process.env.NODE_ENV || '').toLowerCase();
  const allow =
    process.env.ENABLE_PROCUREMENT_TEST_USER_ROLES === 'true' ||
    nodeEnv !== 'production';
  if (!allow || !userId) {
    return [];
  }

  const nip = String(profileNipnim || '').trim().toLowerCase();
  const fromJwt = String(
    jwtUserData?.nipnim ||
      jwtUserData?.identifier ||
      jwtUserData?.nim ||
      jwtUserData?.nip ||
      ''
  ).trim().toLowerCase();

  const hints = new Set();
  for (const v of [nip, fromJwt]) {
    if (v) hints.add(v);
  }
  for (const key of ['username', 'preferred_username', 'sub', 'email']) {
    const raw = String(jwtUserData?.[key] || '').trim().toLowerCase();
    if (!raw) continue;
    hints.add(raw);
    if (raw.includes('@')) {
      const local = raw.split('@')[0];
      if (local) hints.add(local);
    }
  }

  const isM001 = hints.has('m001');
  const isM002 = hints.has('m002');
  const isDosen001 = hints.has('dosen001');

  /** User id (UUID) dari gateway baru — kalau JWT tidak lagi mengirim username `M001`, tetap dapat role dev. */
  const parseGatewayUserIdSet = (raw) =>
    new Set(
      String(raw ?? '')
        .split(/[,;\s]+/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    );
  const gatewayM001Ids =
    process.env.DEV_GATEWAY_M001_USER_IDS !== undefined
      ? parseGatewayUserIdSet(process.env.DEV_GATEWAY_M001_USER_IDS)
      : new Set(['01d3c656-811c-4f7c-bc26-515f9a4fbc58']);
  const gatewayM002Ids =
    process.env.DEV_GATEWAY_M002_USER_IDS !== undefined
      ? parseGatewayUserIdSet(process.env.DEV_GATEWAY_M002_USER_IDS)
      : new Set(['9d1c7cbb-3742-4792-8eda-727a3605f529']);
  const gatewayDosen001Ids =
    process.env.DEV_GATEWAY_DOSEN001_USER_IDS !== undefined
      ? parseGatewayUserIdSet(process.env.DEV_GATEWAY_DOSEN001_USER_IDS)
      : new Set(['a35e5586-a9d3-4181-b33d-30596c3c8461']);

  const uid = String(userId).toLowerCase();
  const isM001GatewayId = gatewayM001Ids.has(uid);
  const isM002GatewayId = gatewayM002Ids.has(uid);
  const isDosen001GatewayId = gatewayDosen001Ids.has(uid);

  const added = [];
  try {
    if ((isM001 || isM001GatewayId) && !(await userHasRole(userId, 'asisten_praktikum'))) {
      await roleModel.assignRole(userId, 'asisten_praktikum', 'system');
      added.push('asisten_praktikum');
      logger.info('ensureProcurementRolesForKnownTestUsers: assigned asisten_praktikum', {
        userId,
        via: isM001GatewayId && !isM001 ? 'DEV_GATEWAY_M001_USER_IDS' : 'hints',
      });
    }
    if ((isM002 || isM002GatewayId) && !(await userHasRole(userId, 'koordinator_asisten'))) {
      await roleModel.assignRole(userId, 'koordinator_asisten', 'system');
      added.push('koordinator_asisten');
      logger.info('ensureProcurementRolesForKnownTestUsers: assigned koordinator_asisten', {
        userId,
        via: isM002GatewayId && !isM002 ? 'DEV_GATEWAY_M002_USER_IDS' : 'hints',
      });
    }
    if ((isDosen001 || isDosen001GatewayId) && !(await userHasRole(userId, 'dosen_pembina'))) {
      await roleModel.assignRole(userId, 'dosen_pembina', 'system');
      added.push('dosen_pembina');
      logger.info('ensureProcurementRolesForKnownTestUsers: assigned dosen_pembina', {
        userId,
        via: isDosen001GatewayId && !isDosen001 ? 'DEV_GATEWAY_DOSEN001_USER_IDS' : 'hints',
      });
    }
  } catch (e) {
    logger.error('ensureProcurementRolesForKnownTestUsers failed:', {
      userId,
      error: e?.message || e,
    });
  }
  return added;
}

/**
 * Get user roles
 */
export async function getUserRoles(userId) {
  try {
    const roles = await roleModel.getUserRoles(userId);
    return roles;
  } catch (error) {
    logger.error('Error in getUserRoles service:', error);
    throw error;
  }
}

/**
 * Get active user roles
 */
export async function getActiveUserRoles(userId) {
  try {
    const roles = await roleModel.getActiveUserRoles(userId);
    return roles;
  } catch (error) {
    logger.error('Error in getActiveUserRoles service:', error);
    throw error;
  }
}

/**
 * Check if user has role
 */
export async function userHasRole(userId, role) {
  try {
    return await roleModel.userHasRole(userId, role);
  } catch (error) {
    logger.error('Error in userHasRole service:', error);
    throw error;
  }
}

/**
 * Assign role to user
 * Validasi: 
 * - asisten_praktikum_aktif harus punya role asisten_praktikum dulu
 * - kaur_lab dan laboran tidak bisa diassign ke user yang memiliki role mahasiswa
 */
export async function assignRole(userId, role, assignedBy) {
  try {
    // Validasi role hierarchy
    if (role === 'asisten_praktikum_aktif') {
      const hasAsistenRole = await roleModel.userHasRole(userId, 'asisten_praktikum');
      if (!hasAsistenRole) {
        throw new Error('User harus memiliki role asisten_praktikum terlebih dahulu sebelum menjadi asisten_praktikum_aktif');
      }
    }

    // Validasi: kaur_lab dan laboran tidak bisa diassign ke user yang memiliki role mahasiswa
    if (role === 'kaur_lab' || role === 'laboran') {
      const hasMahasiswaRole = await roleModel.userHasRole(userId, 'mahasiswa');
      if (hasMahasiswaRole) {
        const roleName = role === 'kaur_lab' ? 'Kepala Urusan Laboratorium' : 'Laboran';
        throw new Error(`${roleName} tidak dapat di-assign ke user yang memiliki role mahasiswa`);
      }
    }

    // Validasi role value
    const validRoles = [
      // Role dasar
      'mahasiswa', 'tpa', 'dosen', 'dosen_pembina',
      // Role praktikum / administrative
      'asisten_praktikum', 'asisten_praktikum_aktif',
      'koordinator_praktikum', 'koordinator_asisten',
      'pic', 'kaur_lab', 'laboran', 'kaprodi'
    ];
    if (!validRoles.includes(role)) {
      throw new Error(`Role tidak valid. Role yang valid: ${validRoles.join(', ')}`);
    }

    const assignedRole = await roleModel.assignRole(userId, role, assignedBy);
    return assignedRole;
  } catch (error) {
    logger.error('Error in assignRole service:', error);
    throw error;
  }
}

/**
 * Update role status
 */
export async function updateRoleStatus(roleId, isActive, updatedBy) {
  try {
    const role = await roleModel.updateRoleStatus(roleId, isActive, updatedBy);
    return role;
  } catch (error) {
    logger.error('Error in updateRoleStatus service:', error);
    throw error;
  }
}

/**
 * Remove role from user
 * Validasi: kaur_lab dan laboran harus ada minimal 1 user aktif
 */
export async function removeRole(roleId, removedBy) {
  try {
    // Get role information first
    const roleData = await roleModel.getRoleById(roleId);
    
    if (!roleData) {
      throw new Error('Role tidak ditemukan');
    }

    const role = roleData.role;
    const userId = roleData.user_id;

    // Validasi khusus untuk kaur_lab dan laboran
    if (role === 'kaur_lab' || role === 'laboran') {
      // Hitung jumlah user aktif dengan role yang sama
      const activeUserCount = await roleModel.countActiveUsersByRole(role);
      
      // Jika hanya ada 1 user aktif (yang akan dihapus), tolak aksi
      if (activeUserCount <= 1) {
        const roleName = role === 'kaur_lab' ? 'Kepala Urusan Laboratorium' : 'Laboran';
        throw new Error(`${roleName} harus ada minimal 1 user aktif. Tidak dapat menghapus role karena ini adalah satu-satunya user dengan role tersebut.`);
      }
    }

    // Proceed with removal
    const removedRole = await roleModel.removeRole(roleId, removedBy);
    return removedRole;
  } catch (error) {
    logger.error('Error in removeRole service:', error);
    throw error;
  }
}

/**
 * Get all users with specific role
 */
export async function getUsersByRole(role, includeInactive = false) {
  try {
    const validRoles = [
      // Role dasar
      'mahasiswa', 'tpa', 'dosen', 'dosen_pembina',
      // Role praktikum / administrative
      'asisten_praktikum', 'asisten_praktikum_aktif',
      'koordinator_praktikum', 'koordinator_asisten',
      'pic', 'kaur_lab', 'laboran', 'kaprodi'
    ];
    if (!validRoles.includes(role)) {
      throw new Error(`Role tidak valid. Role yang valid: ${validRoles.join(', ')}`);
    }

    const users = await roleModel.getUsersByRole(role, includeInactive);
    return users;
  } catch (error) {
    logger.error('Error in getUsersByRole service:', error);
    throw error;
  }
}

/**
 * Assign asisten_praktikum (if missing) then asisten_praktikum_aktif.
 */
export async function ensureActiveAssistantRoles(userId, assignedBy = null) {
  const hasBase = await roleModel.userHasRole(userId, 'asisten_praktikum');
  if (!hasBase) {
    await roleModel.assignRole(userId, 'asisten_praktikum', assignedBy);
  }
  return roleModel.assignRole(userId, 'asisten_praktikum_aktif', assignedBy);
}

/**
 * Deactivate a specific role for a user (is_active = false). No-op if role absent or already inactive.
 */
export async function deactivateUserRole(userId, role, updatedBy = null) {
  const roles = await roleModel.getUserRoles(userId);
  const target = roles.find((row) => row.role === role && row.is_active);
  if (!target) {
    return null;
  }
  return roleModel.updateRoleStatus(target.id, false, updatedBy);
}

/**
 * Get all users
 * Returns all unique users with user_id, name, and identifier from user_profiles
 * @param {string[]} roles - Optional array of roles to filter by (user must have at least one of these roles)
 */
export async function getAllUsers(roles = null) {
  try {
    // Validate roles if provided
    if (roles && roles.length > 0) {
      const validRoles = [
        // Role dasar
        'mahasiswa', 'tpa', 'dosen', 'dosen_pembina',
        // Role praktikum
        'asisten_praktikum', 'asisten_praktikum_aktif',
        'koordinator_praktikum', 'koordinator_asisten',
        'pic', 'kaur_lab', 'laboran', 'kaprodi'
      ];
      const invalidRoles = roles.filter(role => !validRoles.includes(role));
      if (invalidRoles.length > 0) {
        throw new Error(`Role tidak valid: ${invalidRoles.join(', ')}. Role yang valid: ${validRoles.join(', ')}`);
      }
    }

    const users = await roleModel.getAllUsers(roles);
    return users;
  } catch (error) {
    logger.error('Error in getAllUsers service:', error);
    throw error;
  }
}

