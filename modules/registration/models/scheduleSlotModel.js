import { registrationDb } from '../../../config/databases.js';
import { logger } from '../../../core/utils/logger.js';

/**
 * Schedule Slot Model
 * Mengelola operasi database untuk schedule_slots
 */

/**
 * Get all slots for a schedule
 */
export async function findBySchedule(scheduleId) {
  try {
    const res = await registrationDb.query(
      `SELECT 
         *,
         start_time AT TIME ZONE 'Asia/Jakarta' as start_time_wib,
         end_time AT TIME ZONE 'Asia/Jakarta' as end_time_wib
       FROM schedule_slots 
       WHERE schedule_id = $1 
       ORDER BY slot_number ASC`,
      [scheduleId]
    );
    return res.rows;
  } catch (error) {
    logger.error('Error finding schedule slots:', error);
    throw error;
  }
}

/**
 * Get slot by id
 */
export async function findById(id) {
  try {
    const res = await registrationDb.query(
      `SELECT 
         *,
         start_time AT TIME ZONE 'Asia/Jakarta' as start_time_wib,
         end_time AT TIME ZONE 'Asia/Jakarta' as end_time_wib
       FROM schedule_slots 
       WHERE id = $1`,
      [id]
    );
    return res.rows[0] || null;
  } catch (error) {
    logger.error('Error finding schedule slot:', error);
    throw error;
  }
}

/**
 * Get available slots for a schedule
 */
export async function findAvailableBySchedule(scheduleId) {
  try {
    const res = await registrationDb.query(
      `SELECT 
         *,
         start_time AT TIME ZONE 'Asia/Jakarta' as start_time_wib,
         end_time AT TIME ZONE 'Asia/Jakarta' as end_time_wib
       FROM schedule_slots 
       WHERE schedule_id = $1 AND status = 'available'
       ORDER BY slot_number ASC`,
      [scheduleId]
    );
    return res.rows;
  } catch (error) {
    logger.error('Error finding available schedule slots:', error);
    throw error;
  }
}

/**
 * Create multiple slots for a schedule
 */
export async function createMany(slots) {
  const client = await registrationDb.connect();
  
  try {
    await client.query('BEGIN');
    
    const createdSlots = [];
    for (const slot of slots) {
      const res = await client.query(
        `INSERT INTO schedule_slots (schedule_id, slot_number, start_time, end_time, status) 
         VALUES ($1, $2, $3, $4, $5) 
         RETURNING *`,
        [slot.schedule_id, slot.slot_number, slot.start_time, slot.end_time, slot.status || 'available']
      );
      createdSlots.push(res.rows[0]);
    }
    
    await client.query('COMMIT');
    return createdSlots;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error creating schedule slots:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Delete all slots for a schedule
 */
export async function deleteBySchedule(scheduleId) {
  try {
    await registrationDb.query(
      'DELETE FROM schedule_slots WHERE schedule_id = $1',
      [scheduleId]
    );
    return true;
  } catch (error) {
    logger.error('Error deleting schedule slots:', error);
    throw error;
  }
}

/**
 * Update slot status
 */
export async function updateStatus(id, status) {
  try {
    const res = await registrationDb.query(
      `UPDATE schedule_slots 
       SET status = $1, updated_at = NOW() 
       WHERE id = $2 
       RETURNING *`,
      [status, id]
    );
    return res.rows[0] || null;
  } catch (error) {
    logger.error('Error updating slot status:', error);
    throw error;
  }
}

/**
 * Get schedule date from slot (extract date from start_time)
 * Returns date in YYYY-MM-DD format based on the slot's timezone
 */
export async function getScheduleDate(slotId) {
  try {
    const res = await registrationDb.query(
      `SELECT DATE(start_time) as schedule_date 
       FROM schedule_slots 
       WHERE id = $1`,
      [slotId]
    );
    if (res.rows.length === 0) {
      return null;
    }
    // PostgreSQL DATE returns as string in YYYY-MM-DD format
    return res.rows[0].schedule_date;
  } catch (error) {
    logger.error('Error getting schedule date from slot:', error);
    throw error;
  }
}

