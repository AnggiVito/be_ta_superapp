/**
 * Role Model
 * Mengelola role user untuk praktikum
 * Role: asisten_praktikum, asisten_praktikum_aktif, koordinator_praktikum, koordinator_asisten, kaur_lab, laboran
 */

import { userManagementDb } from '../../../config/databases.js';
import { logger } from '../../../core/utils/logger.js';

/**
 * Get all roles for a user
 */
async function resolveRelatedUserIds(userId) {
  const raw = String(userId ?? '').trim();
  if (!raw) return [];

  const ids = new Set([raw]);
  const profile = await userManagementDb.query(
    `SELECT user_id, name, nipnim
     FROM user_profiles
     WHERE lower(user_id) = lower($1)
       AND deleted_at IS NULL`,
    [raw]
  );

  const names = profile.rows
    .map((row) => row.name)
    .filter((value) => String(value ?? '').trim().length > 0)
    .map((value) => String(value).toLowerCase().trim());
  if (names.length > 0) {
    const related = await userManagementDb.query(
      `SELECT user_id
       FROM user_profiles
       WHERE deleted_at IS NULL
         AND lower(name) = ANY($1::text[])`,
      [names]
    );
    for (const row of related.rows) {
      if (row.user_id) ids.add(String(row.user_id));
    }
  }

  // Bridge by nipnim — jika user login via JWT punya nipnim yang sama
  // dengan profile lain (misal profile hasil bootstrap), gabungkan user_id-nya
  const nipnims = profile.rows
    .map((row) => row.nipnim)
    .filter((value) => String(value ?? '').trim().length > 0)
    .map((value) => String(value).toLowerCase().trim());
  if (nipnims.length > 0) {
    const relatedByNipnim = await userManagementDb.query(
      `SELECT user_id
       FROM user_profiles
       WHERE deleted_at IS NULL
         AND lower(nipnim) = ANY($1::text[])`,
      [nipnims]
    );
    for (const row of relatedByNipnim.rows) {
      if (row.user_id) ids.add(String(row.user_id));
    }
  }

  return [...ids];
}

export async function getUserRoles(userId) {
  try {
    const userIds = await resolveRelatedUserIds(userId);
    const result = await userManagementDb.query(
      `SELECT DISTINCT ON (role, user_id) * FROM user_roles
       WHERE user_id = ANY($1::text[]) AND deleted_at IS NULL
       ORDER BY role, user_id, created_at DESC`,
      [userIds]
    );
    return result.rows;
  } catch (error) {
    logger.error('Error getting user roles:', error);
    throw error;
  }
}

/**
 * Get active roles for a user
 */
export async function getActiveUserRoles(userId) {
  try {
    const userIds = await resolveRelatedUserIds(userId);
    const result = await userManagementDb.query(
      `SELECT DISTINCT ON (role, user_id) * FROM user_roles
       WHERE user_id = ANY($1::text[]) AND is_active = true AND deleted_at IS NULL
       ORDER BY role, user_id, created_at DESC`,
      [userIds]
    );
    return result.rows;
  } catch (error) {
    logger.error('Error getting active user roles:', error);
    throw error;
  }
}

/**
 * Check if user has specific role
 */
function roleAliases(role) {
  const normalized = String(role ?? '').toLowerCase().trim().replace(/-/g, '_');
  switch (normalized) {
    case 'kaur_lab':
      return ['kaur_lab', 'kaur', 'kepala_urusan_laboratorium', 'kepala_urusan_lab'];
    case 'koordinator_praktikum':
      return ['koordinator_praktikum', 'koordinator praktikum'];
    default:
      return [normalized];
  }
}

export async function userHasRole(userId, role) {
  try {
    const userIds = await resolveRelatedUserIds(userId);
    const result = await userManagementDb.query(
      `SELECT id FROM user_roles
       WHERE user_id = ANY($1::text[])
         AND role = ANY($2)
         AND is_active = true
         AND deleted_at IS NULL
       LIMIT 1`,
      [userIds, roleAliases(role)]
    );
    return result.rows.length > 0;
  } catch (error) {
    logger.error('Error checking user role:', error);
    throw error;
  }
}

/**
 * Assign role to user
 */
export async function assignRole(userId, role, assignedBy) {
  const client = await userManagementDb.connect();
  
  try {
    await client.query('BEGIN');

    // Check if role already exists (for logging and reactivation logic)
    const existing = await client.query(
      `SELECT id, is_active FROM user_roles 
       WHERE user_id = $1 AND role = $2 AND deleted_at IS NULL
       FOR UPDATE`,
      [userId, role]
    );

    let result;
    if (existing.rows.length > 0) {
      // Reactivate existing role if inactive
      if (!existing.rows[0].is_active) {
        result = await client.query(
          `UPDATE user_roles 
           SET is_active = true, assigned_at = NOW(), assigned_by = $1, updated_at = NOW()
           WHERE id = $2
           RETURNING *`,
          [assignedBy, existing.rows[0].id]
        );
      } else {
        // Role already active
        await client.query('COMMIT');
        return existing.rows[0];
      }
    } else {
      // Insert new role
      // Handle race condition: if unique violation occurs, re-check and return existing
      try {
        result = await client.query(
          `INSERT INTO user_roles 
           (user_id, role, is_active, assigned_at, assigned_by, created_at, updated_at)
           VALUES ($1, $2, true, NOW(), $3, NOW(), NOW())
           RETURNING *`,
          [userId, role, assignedBy]
        );
      } catch (insertError) {
        // Handle unique violation (race condition)
        // Unique index unique_user_role_active will prevent duplicates
        if (insertError.code === '23505') {
          // Unique violation - role was inserted by another concurrent transaction
          // Re-check to get the existing role
          const retryCheck = await client.query(
            `SELECT id, is_active, user_id, role, assigned_at, assigned_by, created_at, updated_at 
             FROM user_roles 
             WHERE user_id = $1 AND role = $2 AND deleted_at IS NULL`,
            [userId, role]
          );
          if (retryCheck.rows.length > 0) {
            // Role already exists (inserted by concurrent transaction), return it
            logger.info('Role already exists (race condition handled):', { userId, role });
            result = retryCheck;
          } else {
            // Should not happen, but re-throw if it does
            logger.error('Unique violation but role not found on retry:', { userId, role, error: insertError.message });
            throw insertError;
          }
        } else {
          throw insertError;
        }
      }
    }

    await client.query('COMMIT');
    logger.info('Role assigned:', { userId, role, assignedBy });
    
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error assigning role:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Update role status (activate/deactivate)
 */
export async function updateRoleStatus(roleId, isActive, updatedBy) {
  try {
    const result = await userManagementDb.query(
      `UPDATE user_roles 
       SET is_active = $1, updated_at = NOW()
       WHERE id = $2 AND deleted_at IS NULL
       RETURNING *`,
      [isActive, roleId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    logger.info('Role status updated:', { roleId, isActive, updatedBy });
    return result.rows[0];
  } catch (error) {
    logger.error('Error updating role status:', error);
    throw error;
  }
}

/**
 * Get role by ID
 */
export async function getRoleById(roleId) {
  try {
    const result = await userManagementDb.query(
      `SELECT * FROM user_roles 
       WHERE id = $1 AND deleted_at IS NULL
       LIMIT 1`,
      [roleId]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    logger.error('Error getting role by ID:', error);
    throw error;
  }
}

/**
 * Count active users with specific role (distinct user_id)
 */
export async function countActiveUsersByRole(role) {
  try {
    const result = await userManagementDb.query(
      `SELECT COUNT(DISTINCT user_id) as count FROM user_roles 
       WHERE role = $1 AND is_active = true AND deleted_at IS NULL`,
      [role]
    );
    return parseInt(result.rows[0].count, 10);
  } catch (error) {
    logger.error('Error counting active users by role:', error);
    throw error;
  }
}

/**
 * Remove role from user (soft delete)
 */
export async function removeRole(roleId, removedBy) {
  try {
    const result = await userManagementDb.query(
      `UPDATE user_roles 
       SET is_active = false, deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING *`,
      [roleId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    logger.info('Role removed:', { roleId, removedBy });
    return result.rows[0];
  } catch (error) {
    logger.error('Error removing role:', error);
    throw error;
  }
}

/**
 * Get all users with specific role
 */
export async function getUsersByRole(role, includeInactive = false) {
  try {
    let query = `SELECT * FROM user_roles 
                 WHERE role = $1 AND deleted_at IS NULL`;
    
    if (!includeInactive) {
      query += ' AND is_active = true';
    }
    
    query += ' ORDER BY created_at DESC';
    
    const result = await userManagementDb.query(query, [role]);
    return result.rows;
  } catch (error) {
    logger.error('Error getting users by role:', error);
    throw error;
  }
}

/**
 * Get all unique users
 * Returns user_id, name, and identifier from user_profiles
 * @param {string[]} roles - Optional array of roles to filter by (user must have at least one of these roles)
 */
export async function getAllUsers(roles = null) {
  try {
    let query;
    let params = [];
    
    if (roles && roles.length > 0) {
      // Filter by roles - user must have at least one of the specified roles
      const placeholders = roles.map((_, index) => `$${index + 1}`).join(', ');
      query = `
        SELECT DISTINCT 
          ur.user_id,
          up.name,
          up.nipnim,
          (up.fingerprint IS NOT NULL AND TRIM(up.fingerprint) <> '') AS has_fingerprint,
          (up.kartu_akses_number IS NOT NULL AND TRIM(up.kartu_akses_number) <> '') AS has_kartu_akses,
          COALESCE(up.name, ur.user_id) as order_by_name
        FROM user_roles ur
        LEFT JOIN user_profiles up ON ur.user_id = up.user_id AND up.deleted_at IS NULL
        WHERE ur.deleted_at IS NULL
          AND ur.is_active = true
          AND ur.role IN (${placeholders})
        ORDER BY order_by_name
      `;
      params = roles;
    } else {
      // Get all unique user_ids from user_roles and user_profiles with name and identifier
      query = `
        SELECT DISTINCT 
          COALESCE(ur.user_id, up.user_id) as user_id,
          up.name,
          up.nipnim,
          (up.fingerprint IS NOT NULL AND TRIM(up.fingerprint) <> '') AS has_fingerprint,
          (up.kartu_akses_number IS NOT NULL AND TRIM(up.kartu_akses_number) <> '') AS has_kartu_akses,
          COALESCE(up.name, COALESCE(ur.user_id, up.user_id)) as order_by_name
        FROM (
          SELECT DISTINCT user_id
          FROM user_roles
          WHERE deleted_at IS NULL
        ) ur
        FULL OUTER JOIN (
          SELECT DISTINCT user_id, name, nipnim, fingerprint, kartu_akses_number
          FROM user_profiles
          WHERE deleted_at IS NULL
        ) up ON ur.user_id = up.user_id
        WHERE COALESCE(ur.user_id, up.user_id) IS NOT NULL
        ORDER BY order_by_name
      `;
    }
    
    const result = await userManagementDb.query(query, params);
    
    return result.rows.map(row => ({
      user_id: row.user_id,
      name: row.name || null,
      nipnim: row.nipnim || null,
      has_fingerprint: row.has_fingerprint === true,
      has_kartu_akses: row.has_kartu_akses === true,
    }));
  } catch (error) {
    logger.error('Error getting all users:', error);
    throw error;
  }
}

