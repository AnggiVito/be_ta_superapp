import { registrationDb, userManagementDb } from '../../../config/databases.js';
import { logger } from '../../../core/utils/logger.js';

/**
 * Schedule Model
 * Mengelola operasi database untuk schedules dan schedule_assistants
 */

/** Satu baris asisten: dari API (user_id) atau dari import Excel (nim saja). */
function shapeAssistantRow(row, profileByIdentifier = new Map()) {
  const userId = row.user_id || null;
  const nim = row.nim ?? null;
  const profile = profileByIdentifier.get(String(userId ?? '').toLowerCase()) ||
    profileByIdentifier.get(String(nim ?? '').toLowerCase());
  return {
    user_id: userId,
    nim,
    name: profile?.name || null,
    identifier: profile?.nipnim || nim || userId || null,
  };
}

async function getAssistantProfiles(rows) {
  const identifiers = rows
    .flatMap((row) => [row.user_id, row.nim])
    .map((value) => String(value ?? '').trim().toLowerCase())
    .filter(Boolean);
  if (identifiers.length === 0) return new Map();

  const result = await userManagementDb.query(
    `SELECT user_id, name, nipnim
     FROM user_profiles
     WHERE deleted_at IS NULL
       AND (
         lower(user_id) = ANY($1::text[])
         OR lower(nipnim) = ANY($1::text[])
       )`,
    [[...new Set(identifiers)]]
  );

  const map = new Map();
  for (const row of result.rows) {
    if (row.user_id) map.set(String(row.user_id).toLowerCase(), row);
    if (row.nipnim) map.set(String(row.nipnim).toLowerCase(), row);
  }
  return map;
}

async function getUserIdentifiers(userId) {
  const normalized = String(userId ?? '').trim().toLowerCase();
  if (!normalized) return [];

  const result = await userManagementDb.query(
    `SELECT user_id, nipnim
     FROM user_profiles
     WHERE deleted_at IS NULL
       AND lower(user_id) = $1
     LIMIT 1`,
    [normalized]
  );

  const identifiers = new Set([normalized]);
  const profile = result.rows[0];
  if (profile?.user_id) identifiers.add(String(profile.user_id).trim().toLowerCase());
  if (profile?.nipnim) identifiers.add(String(profile.nipnim).trim().toLowerCase());
  return [...identifiers].filter(Boolean);
}

async function getScheduleAssistants(scheduleId, client = registrationDb) {
  const assistantsRes = await client.query(
    'SELECT user_id, nim FROM schedule_assistants WHERE schedule_id = $1 ORDER BY created_at',
    [scheduleId]
  );
  const profileByIdentifier = await getAssistantProfiles(assistantsRes.rows);
  return assistantsRes.rows.map((row) => shapeAssistantRow(row, profileByIdentifier));
}

/**
 * Get all schedules
 * @param {string} moduleId - Optional filter by module_id
 * @param {string} userId - Optional filter by user_id (show schedules where user is assistant OR has booking)
 * @param {Object} filters - Optional filters
 * @param {string} filters.periode - Optional practicum periode filter
 */
export async function findAll(moduleId = null, userId = null, filters = {}) {
  try {
    let query;
    const params = [];
    let paramIndex = 1;
    const periode = String(filters?.periode ?? '').trim();
    
    // Filter by user_id if provided (show schedules where user is assistant OR has booking)
    if (userId) {
      const identifiers = await getUserIdentifiers(userId);
      // Use subquery approach to show schedules where:
      // 1. User is assigned as assistant, OR
      // 2. User has an active booking in that schedule
      // Convert timezone to WIB at database level
      query = `SELECT DISTINCT 
                 s.*,
                 s.start_time as start_time_wib,
                 s.end_time as end_time_wib,
                 pm.week_number,
                 pm.sequence AS module_sequence
               FROM schedules s
               LEFT JOIN practicum_modules pm ON pm.id = s.module_id
               LEFT JOIN practicums p ON p.id = pm.practicum_id
               WHERE (
                 EXISTS (
                   SELECT 1 
                   FROM schedule_assistants sa 
                   WHERE sa.schedule_id = s.id 
                   AND (
                     lower(sa.user_id) = ANY($${paramIndex}::text[])
                     OR lower(sa.nim) = ANY($${paramIndex}::text[])
                   )
                 )
                 OR EXISTS (
                   SELECT 1 
                   FROM schedule_bookings sb
                   INNER JOIN schedule_slots ss ON sb.slot_id = ss.id
                   WHERE ss.schedule_id = s.id 
                   AND lower(sb.user_id) = ANY($${paramIndex}::text[])
                   AND sb.status = 'active'
                 )
               )`;
      params.push(identifiers);
      paramIndex++;
      
      if (moduleId) {
        query += ` AND s.module_id = $${paramIndex++}`;
        params.push(moduleId);
      }

      if (periode) {
        query += ` AND p.periode = $${paramIndex++}`;
        params.push(periode);
      }
    } else {
      // No user filter, use regular query
      // Convert timezone to WIB at database level
      query = `SELECT 
                 s.*,
                 s.start_time as start_time_wib,
                 s.end_time as end_time_wib,
                 pm.week_number,
                 pm.sequence AS module_sequence
               FROM schedules s
               LEFT JOIN practicum_modules pm ON pm.id = s.module_id
               LEFT JOIN practicums p ON p.id = pm.practicum_id`;
      const conditions = [];
      
      if (moduleId) {
        conditions.push(`s.module_id = $${paramIndex++}`);
        params.push(moduleId);
      }

      if (periode) {
        conditions.push(`p.periode = $${paramIndex++}`);
        params.push(periode);
      }
      
      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }
    }
    
    if (userId) {
      query += ' ORDER BY s.start_time DESC, s.created_at DESC';
    } else {
      query += ' ORDER BY s.start_time DESC, s.created_at DESC';
    }
    
    const res = await registrationDb.query(query, params);
    const schedules = res.rows;
    
    // Get assistants for each schedule
    const schedulesWithAssistants = await Promise.all(
      schedules.map(async (schedule) => {
        schedule.assistants = await getScheduleAssistants(schedule.id);
        return schedule;
      })
    );
    
    return schedulesWithAssistants;
  } catch (error) {
    logger.error('Error finding schedules:', error);
    throw error;
  }
}

/**
 * Get schedule by id with assistants
 */
export async function findById(id) {
  try {
    const client = await registrationDb.connect();
    
    try {
      // Get schedule with timezone conversion to WIB
      const scheduleRes = await client.query(
        `SELECT 
           s.*,
           s.start_time as start_time_wib,
           s.end_time as end_time_wib,
           pm.week_number,
           pm.sequence AS module_sequence
         FROM schedules s
         LEFT JOIN practicum_modules pm ON pm.id = s.module_id
         WHERE s.id = $1`,
        [id]
      );
      
      if (scheduleRes.rows.length === 0) {
        return null;
      }
      
      const schedule = scheduleRes.rows[0];
      
      // Get assistants
      schedule.assistants = await getScheduleAssistants(id, client);
      
      return schedule;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Error finding schedule by id:', error);
    throw error;
  }
}

/**
 * Get schedules by module_id with assistants
 * @param {string} moduleId - Module ID
 * @param {string} userId - Optional filter by user_id (show schedules where user is assistant OR has booking)
 */
export async function findByModule(moduleId, userId = null, filters = {}) {
  try {
    return await findAll(moduleId, userId, filters);
  } catch (error) {
    logger.error('Error finding schedules by module:', error);
    throw error;
  }
}

/**
 * Create schedule with assistants
 * @param {Object} data - Schedule data
 * @param {string} data.module_id - Module ID
 * @param {string} data.start_time - Start datetime
 * @param {string} data.end_time - End datetime
 * @param {string} data.venue - Venue location
 * @param {string[]} data.assistants - Array of user_id (asisten)
 */
export async function create({ module_id, start_time, end_time, venue, assistants = [] }) {
  const client = await registrationDb.connect();
  
  try {
    await client.query('BEGIN');
    
    // Insert schedule
    const scheduleRes = await client.query(
      `INSERT INTO schedules (module_id, start_time, end_time, venue) 
       VALUES ($1, $2, $3, $4) 
       RETURNING *`,
      [module_id, start_time, end_time, venue]
    );
    
    const schedule = scheduleRes.rows[0];
    
    // Insert assistants if provided
    if (assistants && assistants.length > 0) {
      for (const userId of assistants) {
        await client.query(
          `INSERT INTO schedule_assistants (schedule_id, user_id, nim)
           SELECT $1::uuid, $2::text, NULL::text
           WHERE NOT EXISTS (
             SELECT 1 FROM schedule_assistants
             WHERE schedule_id = $1::uuid AND user_id = $2::text AND user_id IS NOT NULL
           )`,
          [schedule.id, userId]
        );
      }
    }
    
    await client.query('COMMIT');
    
    // Fetch schedule with assistants
    return await findById(schedule.id);
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error creating schedule:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Update schedule
 * @param {string} id - Schedule ID
 * @param {Object} data - Update data
 * @param {string} data.module_id - Module ID
 * @param {string} data.start_time - Start datetime
 * @param {string} data.end_time - End datetime
 * @param {string} data.venue - Venue location
 * @param {string[]} data.assistants - Array of user_id (asisten) - optional, if not provided, assistants won't be updated
 */
export async function update(id, { module_id, start_time, end_time, venue, assistants }) {
  const client = await registrationDb.connect();
  
  try {
    await client.query('BEGIN');
    
    // Update schedule
    const updateFields = [];
    const params = [];
    let paramIndex = 1;
    
    if (module_id !== undefined) {
      updateFields.push(`module_id = $${paramIndex++}`);
      params.push(module_id);
    }
    if (start_time !== undefined) {
      updateFields.push(`start_time = $${paramIndex++}`);
      params.push(start_time);
    }
    if (end_time !== undefined) {
      updateFields.push(`end_time = $${paramIndex++}`);
      params.push(end_time);
    }
    if (venue !== undefined) {
      updateFields.push(`venue = $${paramIndex++}`);
      params.push(venue);
    }
    
    if (updateFields.length > 0) {
      updateFields.push(`updated_at = NOW()`);
      params.push(id);
      
      await client.query(
        `UPDATE schedules 
         SET ${updateFields.join(', ')} 
         WHERE id = $${paramIndex}`,
        params
      );
    }
    
    // Update assistants if provided
    if (assistants !== undefined) {
      // Delete existing assistants
      await client.query(
        'DELETE FROM schedule_assistants WHERE schedule_id = $1',
        [id]
      );
      
      // Insert new assistants
      if (assistants.length > 0) {
        for (const userId of assistants) {
          await client.query(
            `INSERT INTO schedule_assistants (schedule_id, user_id, nim)
             SELECT $1::uuid, $2::text, NULL::text
             WHERE NOT EXISTS (
               SELECT 1 FROM schedule_assistants
               WHERE schedule_id = $1::uuid AND user_id = $2::text AND user_id IS NOT NULL
             )`,
            [id, userId]
          );
        }
      }
    }
    
    await client.query('COMMIT');
    
    // Fetch updated schedule with assistants
    return await findById(id);
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error updating schedule:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Delete schedule (will cascade delete assistants)
 */
export async function remove(id) {
  try {
    await registrationDb.query('DELETE FROM schedules WHERE id = $1', [id]);
    return true;
  } catch (error) {
    logger.error('Error removing schedule:', error);
    throw error;
  }
}

/**
 * Get assistants for a schedule
 */
export async function getAssistants(scheduleId) {
  try {
    const res = await registrationDb.query(
      'SELECT user_id, nim FROM schedule_assistants WHERE schedule_id = $1 ORDER BY created_at',
      [scheduleId]
    );
    return res.rows.map(shapeAssistantRow);
  } catch (error) {
    logger.error('Error getting schedule assistants:', error);
    throw error;
  }
}

/**
 * Check if schedule has active bookings
 */
export async function hasActiveBookings(scheduleId) {
  try {
    const res = await registrationDb.query(
      `SELECT COUNT(*) as count 
       FROM schedule_bookings sb
       JOIN schedule_slots ss ON sb.slot_id = ss.id
       WHERE ss.schedule_id = $1 AND sb.status = 'active'`,
      [scheduleId]
    );
    return parseInt(res.rows[0].count) > 0;
  } catch (error) {
    logger.error('Error checking active bookings:', error);
    throw error;
  }
}

