import { registrationDb, userManagementDb } from '../../../config/databases.js';
import { logger } from '../../../core/utils/logger.js';

/**
 * Schedule Booking Model
 * Mengelola operasi database untuk schedule_bookings
 */

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

/**
 * Get booking by id
 */
export async function findById(id) {
  try {
    const res = await registrationDb.query(
      'SELECT * FROM schedule_bookings WHERE id = $1',
      [id]
    );
    return res.rows[0] || null;
  } catch (error) {
    logger.error('Error finding schedule booking:', error);
    throw error;
  }
}

/**
 * Get booking by slot id
 */
export async function findBySlot(slotId) {
  try {
    const res = await registrationDb.query(
      'SELECT * FROM schedule_bookings WHERE slot_id = $1 AND status = $2',
      [slotId, 'active']
    );
    return res.rows[0] || null;
  } catch (error) {
    logger.error('Error finding booking by slot:', error);
    throw error;
  }
}

/**
 * Get bookings by user id
 */
export async function findByUser(userId, options = {}) {
  try {
    let query = `SELECT
      sb.id,
      sb.slot_id,
      sb.user_id,
      sb.booking_date,
      sb.status,
      sb.cancelled_by,
      sb.cancelled_at,
      sb.created_at,
      sb.updated_at,
      ss.slot_number,
      ss.start_time as slot_start_time,
      ss.end_time as slot_end_time,
      ss.start_time AT TIME ZONE 'Asia/Jakarta' as slot_start_time_wib,
      ss.end_time AT TIME ZONE 'Asia/Jakarta' as slot_end_time_wib,
      s.id as schedule_id,
      s.module_id,
      s.start_time as schedule_start_time,
      s.end_time as schedule_end_time,
      s.start_time AT TIME ZONE 'Asia/Jakarta' as schedule_start_time_wib,
      s.end_time AT TIME ZONE 'Asia/Jakarta' as schedule_end_time_wib,
      s.venue
     FROM schedule_bookings sb
     INNER JOIN schedule_slots ss ON sb.slot_id = ss.id
     INNER JOIN schedules s ON ss.schedule_id = s.id
     INNER JOIN practicum_modules pm ON s.module_id = pm.id
     INNER JOIN practicums p ON pm.practicum_id = p.id
     WHERE sb.user_id = $1`;
    const params = [userId];
    let paramIndex = 2;
    
    if (options.status) {
      query += ` AND sb.status = $${paramIndex++}`;
      params.push(options.status);
    }
    
    if (options.bookingDate) {
      query += ` AND sb.booking_date = $${paramIndex++}`;
      params.push(options.bookingDate);
    }

    if (options.periode) {
      query += ` AND p.periode = $${paramIndex++}`;
      params.push(options.periode);
    }
    
    query += ' ORDER BY sb.created_at DESC';
    
    const res = await registrationDb.query(query, params);
    return res.rows;
  } catch (error) {
    logger.error('Error finding bookings by user:', error);
    throw error;
  }
}

/**
 * Check if user has booking on a specific date
 * @deprecated Use hasBookingOnScheduleDate instead
 */
export async function hasBookingOnDate(userId, bookingDate) {
  try {
    const res = await registrationDb.query(
      `SELECT COUNT(*) as count 
       FROM schedule_bookings 
       WHERE user_id = $1 AND booking_date = $2 AND status = 'active'`,
      [userId, bookingDate]
    );
    return parseInt(res.rows[0].count) > 0;
  } catch (error) {
    logger.error('Error checking booking on date:', error);
    throw error;
  }
}

/**
 * Check if user has booking on a specific schedule date
 * This checks based on the schedule date (from slot.start_time), not booking_date
 * @param {string} userId - User ID
 * @param {string} scheduleDate - Schedule date in YYYY-MM-DD format (from slot.start_time)
 */
export async function hasBookingOnScheduleDate(userId, scheduleDate) {
  try {
    const res = await registrationDb.query(
      `SELECT COUNT(*) as count 
       FROM schedule_bookings sb
       JOIN schedule_slots ss ON sb.slot_id = ss.id
       WHERE sb.user_id = $1 
         AND DATE(ss.start_time) = $2 
         AND sb.status = 'active'`,
      [userId, scheduleDate]
    );
    return parseInt(res.rows[0].count) > 0;
  } catch (error) {
    logger.error('Error checking booking on schedule date:', error);
    throw error;
  }
}

/**
 * Create booking
 */
export async function create({ slot_id, user_id, booking_date }) {
  const client = await registrationDb.connect();
  
  try {
    await client.query('BEGIN');
    
    const res = await client.query(
      `INSERT INTO schedule_bookings (slot_id, user_id, booking_date, status) 
       VALUES ($1, $2, $3, 'active') 
       RETURNING *`,
      [slot_id, user_id, booking_date]
    );
    
    await client.query('COMMIT');
    return res.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error creating schedule booking:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Cancel booking
 */
export async function cancel(id, cancelledBy) {
  try {
    const res = await registrationDb.query(
      `UPDATE schedule_bookings 
       SET status = 'cancelled', 
           cancelled_by = $1, 
           cancelled_at = NOW(), 
           updated_at = NOW() 
       WHERE id = $2 AND status = 'active'
       RETURNING *`,
      [cancelledBy, id]
    );
    return res.rows[0] || null;
  } catch (error) {
    logger.error('Error cancelling booking:', error);
    throw error;
  }
}

/**
 * Get booking with slot and schedule info
 */
export async function findByIdWithDetails(id) {
  try {
    const res = await registrationDb.query(
      `SELECT 
        sb.*,
        ss.slot_number,
        ss.start_time as slot_start_time,
        ss.end_time as slot_end_time,
        ss.start_time AT TIME ZONE 'Asia/Jakarta' as slot_start_time_wib,
        ss.end_time AT TIME ZONE 'Asia/Jakarta' as slot_end_time_wib,
        s.module_id,
        s.start_time as schedule_start_time,
        s.end_time as schedule_end_time,
        s.start_time AT TIME ZONE 'Asia/Jakarta' as schedule_start_time_wib,
        s.end_time AT TIME ZONE 'Asia/Jakarta' as schedule_end_time_wib,
        s.venue
       FROM schedule_bookings sb
       JOIN schedule_slots ss ON sb.slot_id = ss.id
       JOIN schedules s ON ss.schedule_id = s.id
       WHERE sb.id = $1`,
      [id]
    );
    return res.rows[0] || null;
  } catch (error) {
    logger.error('Error finding booking with details:', error);
    throw error;
  }
}

/**
 * Get bookings by assistant user_id
 * Returns all bookings in schedules where the user is assigned as assistant
 * @param {string} assistantUserId - Assistant user ID
 * @param {Object} options - Optional filters (status, bookingDate)
 */
export async function findByAssistant(assistantUserId, options = {}) {
  try {
    const identifiers = await getUserIdentifiers(assistantUserId);
    // Query untuk mendapatkan semua booking di schedule dimana user adalah asisten
    // PENTING: user_id yang dikembalikan HARUS dari tabel schedule_bookings (sb.user_id)
    // yang merupakan user_id mahasiswa yang melakukan booking, BUKAN user_id asisten (sa.user_id)
    // WHERE clause menggunakan sa.user_id untuk filter schedule dimana asisten bertugas
    let query = `SELECT 
      sb.id,
      sb.slot_id,
      sb.user_id,  -- CRITICAL: user_id mahasiswa yang booking (dari schedule_bookings), BUKAN sa.user_id (asisten)
      sb.booking_date,
      sb.status,
      sb.cancelled_by,
      sb.cancelled_at,
      sb.created_at,
      sb.updated_at,
      ss.slot_number,
      ss.start_time as slot_start_time,
      ss.end_time as slot_end_time,
      ss.start_time AT TIME ZONE 'Asia/Jakarta' as slot_start_time_wib,
      ss.end_time AT TIME ZONE 'Asia/Jakarta' as slot_end_time_wib,
      s.id as schedule_id,
      s.module_id,
      s.start_time as schedule_start_time,
      s.end_time as schedule_end_time,
      s.start_time AT TIME ZONE 'Asia/Jakarta' as schedule_start_time_wib,
      s.end_time AT TIME ZONE 'Asia/Jakarta' as schedule_end_time_wib,
      s.venue
     FROM schedule_bookings sb
     INNER JOIN schedule_slots ss ON sb.slot_id = ss.id
     INNER JOIN schedules s ON ss.schedule_id = s.id
     INNER JOIN schedule_assistants sa ON s.id = sa.schedule_id
     INNER JOIN practicum_modules pm ON s.module_id = pm.id
     INNER JOIN practicums p ON pm.practicum_id = p.id
     WHERE (
       lower(sa.user_id) = ANY($1::text[])
       OR lower(sa.nim) = ANY($1::text[])
     )`;
    
    const params = [identifiers];
    let paramIndex = 2;
    
    if (options.status) {
      query += ` AND sb.status = $${paramIndex++}`;
      params.push(options.status);
    }
    
    if (options.bookingDate) {
      query += ` AND sb.booking_date = $${paramIndex++}`;
      params.push(options.bookingDate);
    }

    if (options.periode) {
      query += ` AND p.periode = $${paramIndex++}`;
      params.push(options.periode);
    }
    
    query += ' ORDER BY ss.start_time ASC, sb.created_at DESC';
    
    const res = await registrationDb.query(query, params);
    
    // Safety check: verify that returned user_id is NOT the assistant's user_id
    if (res.rows.length > 0 && res.rows[0]?.user_id === assistantUserId) {
      logger.warn('findByAssistant - WARNING: Returned user_id matches assistant user_id! This should not happen.', {
        assistantUserId,
        returnedUserId: res.rows[0]?.user_id,
        bookingId: res.rows[0]?.id
      });
    }
    
    return res.rows;
  } catch (error) {
    logger.error('Error finding bookings by assistant:', error);
    throw error;
  }
}

