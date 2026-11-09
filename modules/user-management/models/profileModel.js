/**
 * Profile Model
 * Mengelola data tambahan user (TTD, no rekening)
 * user_id reference ke AUTH GATEWAY (tidak replicate data user)
 */

import { userManagementDb } from '../../../config/databases.js';
import { logger } from '../../../core/utils/logger.js';

/**
 * Get user profile by user_id
 */
export async function getUserProfile(userId) {
  try {
    const result = await userManagementDb.query(
      `SELECT * FROM user_profiles 
       WHERE user_id = $1 AND deleted_at IS NULL`,
      [userId]
    );
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Error getting user profile:', error);
    throw error;
  }
}

/**
 * Create or update user profile
 */
export async function upsertUserProfile(userId, profileData) {
  const client = await userManagementDb.connect();
  
  try {
    await client.query('BEGIN');

    // Check if profile exists
    const existing = await client.query(
      'SELECT id FROM user_profiles WHERE user_id = $1 AND deleted_at IS NULL',
      [userId]
    );

    let result;
    if (existing.rows.length > 0) {
      // Update existing profile
      // Only update fields that are provided (not null/undefined)
      // For name and identifier, only update if explicitly provided
      const updateFields = [];
      const updateValues = [];
      let paramIndex = 1;

      if (profileData.ttd !== undefined) {
        updateFields.push(`ttd = $${paramIndex++}`);
        updateValues.push(profileData.ttd || null);
      }
      if (profileData.ttd_file_path !== undefined) {
        updateFields.push(`ttd_file_path = $${paramIndex++}`);
        updateValues.push(profileData.ttd_file_path || null);
      }
      if (profileData.no_rekening !== undefined) {
        updateFields.push(`no_rekening = $${paramIndex++}`);
        updateValues.push(profileData.no_rekening || null);
      }
      if (profileData.bank_name !== undefined) {
        updateFields.push(`bank_name = $${paramIndex++}`);
        updateValues.push(profileData.bank_name || null);
      }
      if (profileData.account_name !== undefined) {
        updateFields.push(`account_name = $${paramIndex++}`);
        updateValues.push(profileData.account_name || null);
      }
      if (profileData.name !== undefined) {
        updateFields.push(`name = $${paramIndex++}`);
        updateValues.push(profileData.name || null);
      }
      if (profileData.nipnim !== undefined) {
        updateFields.push(`nipnim = $${paramIndex++}`);
        updateValues.push(profileData.nipnim || null);
      }
      if (profileData.procurement_supervised_lab_id !== undefined) {
        updateFields.push(`procurement_supervised_lab_id = $${paramIndex++}`);
        updateValues.push(profileData.procurement_supervised_lab_id || null);
      }
      if (profileData.kode_asisten_praktikum !== undefined) {
        updateFields.push(`kode_asisten_praktikum = $${paramIndex++}`);
        updateValues.push(profileData.kode_asisten_praktikum || null);
      }
      if (profileData.fingerprint !== undefined) {
        updateFields.push(`fingerprint = $${paramIndex++}`);
        updateValues.push(profileData.fingerprint || null);
      }
      if (profileData.kartu_akses_number !== undefined) {
        updateFields.push(`kartu_akses_number = $${paramIndex++}`);
        updateValues.push(profileData.kartu_akses_number || null);
      }
      if (profileData.access_credentials_updated_at !== undefined) {
        updateFields.push(`access_credentials_updated_at = $${paramIndex++}`);
        updateValues.push(profileData.access_credentials_updated_at);
      }
      if (profileData.access_credentials_updated_by !== undefined) {
        updateFields.push(`access_credentials_updated_by = $${paramIndex++}`);
        updateValues.push(profileData.access_credentials_updated_by || null);
      }

      updateFields.push(`updated_at = NOW()`);
      updateValues.push(userId);

      result = await client.query(
        `UPDATE user_profiles 
         SET ${updateFields.join(', ')}
         WHERE user_id = $${paramIndex} AND deleted_at IS NULL
         RETURNING *`,
        updateValues
      );
    } else {
      // Insert new profile
      result = await client.query(
        `INSERT INTO user_profiles 
         (user_id, ttd, ttd_file_path, no_rekening, bank_name, account_name, name, nipnim,
          procurement_supervised_lab_id, kode_asisten_praktikum,
          fingerprint, kartu_akses_number,
          access_credentials_updated_at, access_credentials_updated_by,
          created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
         RETURNING *`,
        [
          userId,
          profileData.ttd || null,
          profileData.ttd_file_path || null,
          profileData.no_rekening || null,
          profileData.bank_name || null,
          profileData.account_name || null,
          profileData.name || null,
          profileData.nipnim || null,
          profileData.procurement_supervised_lab_id ?? null,
          profileData.kode_asisten_praktikum || null,
          profileData.fingerprint || null,
          profileData.kartu_akses_number || null,
          profileData.access_credentials_updated_at || null,
          profileData.access_credentials_updated_by || null,
        ]
      );
    }

    await client.query('COMMIT');
    logger.info('User profile upserted:', { userId, profileId: result.rows[0].id });
    
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error upserting user profile:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Delete TTD from profile
 */
export async function deleteTTD(userId) {
  try {
    const result = await userManagementDb.query(
      `UPDATE user_profiles 
       SET ttd = NULL, ttd_file_path = NULL, updated_at = NOW()
       WHERE user_id = $1 AND deleted_at IS NULL
       RETURNING *`,
      [userId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    logger.info('TTD deleted:', { userId });
    return result.rows[0];
  } catch (error) {
    logger.error('Error deleting TTD:', error);
    throw error;
  }
}

/**
 * Update no rekening (khusus asisten praktikum)
 */
export async function updateNoRekening(userId, rekeningData) {
  try {
    const result = await userManagementDb.query(
      `UPDATE user_profiles 
       SET no_rekening = $1, bank_name = $2, account_name = $3, updated_at = NOW()
       WHERE user_id = $4 AND deleted_at IS NULL
       RETURNING *`,
      [
        rekeningData.no_rekening,
        rekeningData.bank_name || null,
        rekeningData.account_name || null,
        userId,
      ]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    logger.info('No rekening updated:', { userId });
    return result.rows[0];
  } catch (error) {
    logger.error('Error updating no rekening:', error);
    throw error;
  }
}

/**
 * List users who have kartu akses saved on their profile (for RFID assignment UI).
 * @param {object} options
 * @param {string} [options.search] - Filter by name or NIP/NIM (case-insensitive)
 */
export async function listUsersWithAccessCards({ search } = {}) {
  try {
    const values = [];
    let searchFilter = '';

    const normalizedSearch = String(search ?? '').trim();
    if (normalizedSearch) {
      values.push(`%${normalizedSearch.toLowerCase()}%`);
      searchFilter = `AND (
        lower(COALESCE(name, '')) LIKE $${values.length}
        OR lower(COALESCE(nipnim, '')) LIKE $${values.length}
        OR lower(COALESCE(user_id, '')) LIKE $${values.length}
      )`;
    }

    const result = await userManagementDb.query(
      `SELECT user_id, name, nipnim, kartu_akses_number
       FROM user_profiles
       WHERE deleted_at IS NULL
         AND kartu_akses_number IS NOT NULL
         AND TRIM(kartu_akses_number) <> ''
         ${searchFilter}
       ORDER BY COALESCE(NULLIF(TRIM(nipnim), ''), name, user_id)`,
      values
    );

    return result.rows;
  } catch (error) {
    logger.error('Error listing users with access cards:', error);
    throw error;
  }
}

/**
 * Lookup user profiles by user_id batch.
 * @param {string[]} userIds
 * @returns {Promise<Array<{ user_id: string, nipnim: string|null, name: string|null }>>}
 */
export async function findByUserIds(userIds = []) {
  if (!userIds.length) return [];
  try {
    const normalized = [...new Set(userIds.map((id) => String(id).trim()).filter(Boolean))];
    const result = await userManagementDb.query(
      `SELECT user_id, nipnim, name
       FROM user_profiles
       WHERE deleted_at IS NULL
         AND user_id::text = ANY($1::text[])`,
      [normalized]
    );
    return result.rows;
  } catch (error) {
    logger.error('Error finding user profiles by user_id:', error);
    throw error;
  }
}

/**
 * Lookup user profiles by NIM/NIP (case-insensitive exact match).
 * @param {string[]} nipnims - Normalized NIM strings
 * @returns {Promise<Array<{ user_id: string, nipnim: string, name: string|null }>>}
 */
export async function findByNipnims(nipnims = []) {
  if (!nipnims.length) return [];
  try {
    const normalized = [...new Set(nipnims.map((n) => String(n).trim().toLowerCase()).filter(Boolean))];
    const result = await userManagementDb.query(
      `SELECT user_id, nipnim, name
       FROM user_profiles
       WHERE deleted_at IS NULL
         AND lower(trim(nipnim)) = ANY($1::text[])`,
      [normalized]
    );
    return result.rows;
  } catch (error) {
    logger.error('Error finding user profiles by nipnim:', error);
    throw error;
  }
}

/**
 * Find another user (same reviewer role) already assigned to this supervised lab.
 */
export async function findProcurementSupervisedLabConflict(labId, roleSlug, excludeUserId) {
  try {
    const result = await userManagementDb.query(
      `SELECT up.user_id, up.name
       FROM user_profiles up
       INNER JOIN user_roles ur ON ur.user_id = up.user_id
         AND ur.deleted_at IS NULL
         AND ur.is_active = true
         AND ur.role = $2
       WHERE up.deleted_at IS NULL
         AND up.procurement_supervised_lab_id = $1::uuid
         AND up.user_id::text <> $3::text
       LIMIT 1`,
      [labId, roleSlug, String(excludeUserId)]
    );
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Error finding procurement supervised lab conflict:', error);
    throw error;
  }
}