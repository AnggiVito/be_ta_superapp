/**
 * Room Booking Model
 * Data access layer for room_bookings table
 */

import { roomManagementDb } from '../../../config/databases.js';
import { logger } from '../../../core/utils/logger.js';

const BOOKING_SELECT = `
  SELECT rb.*,
         pl.passcode_id AS linked_passcode_id,
         pl.passcode_name AS linked_passcode_name,
         pl.passcode_type AS linked_passcode_type,
         pl.start_date AS linked_passcode_start_date,
         pl.end_date AS linked_passcode_end_date,
         pl.metadata AS linked_passcode_metadata
  FROM room_bookings rb
  LEFT JOIN passcode_logs pl ON pl.id = rb.passcode_log_id
`;

export async function listBookingsByRoom(roomId, status) {
  try {
    const values = [roomId];
    let where = 'WHERE rb.room_id = $1';

    if (status) {
      values.push(status);
      where += ' AND rb.status = $2';
    }

    const result = await roomManagementDb.query(
      `${BOOKING_SELECT}
       ${where}
       ORDER BY rb.start_time ASC`,
      values
    );
    return result.rows;
  } catch (error) {
    logger.error('Error listing room bookings:', error);
    throw error;
  }
}

export async function listBookingsForAdmin(status) {
  try {
    const values = [];
    let where = '';

    if (status) {
      values.push(status);
      where = 'WHERE rb.status = $1';
    }

    const result = await roomManagementDb.query(
      `SELECT rb.*,
              r.name AS room_name,
              r.door_lock_id,
              r.capacity,
              pl.passcode_id AS linked_passcode_id,
              pl.passcode_name AS linked_passcode_name,
              pl.passcode_type AS linked_passcode_type,
              pl.start_date AS linked_passcode_start_date,
              pl.end_date AS linked_passcode_end_date,
              pl.metadata AS linked_passcode_metadata
       FROM room_bookings rb
       JOIN rooms r ON r.id = rb.room_id
       LEFT JOIN passcode_logs pl ON pl.id = rb.passcode_log_id
       ${where}
       ORDER BY
         CASE rb.status
           WHEN 'pending' THEN 1
           WHEN 'active' THEN 2
           WHEN 'rejected' THEN 3
           WHEN 'canceled' THEN 4
           ELSE 5
         END,
         rb.created_at ASC`,
      values
    );

    return result.rows;
  } catch (error) {
    logger.error('Error listing admin room bookings:', error);
    throw error;
  }
}

export async function listBookingsForUser(userId, status) {
  try {
    const values = [userId];
    let where = 'WHERE rb.created_by = $1';

    if (status) {
      values.push(status);
      where += ' AND rb.status = $2';
    }

    const result = await roomManagementDb.query(
      `SELECT rb.*,
              r.name AS room_name,
              r.door_lock_id,
              r.capacity,
              pl.passcode_id AS linked_passcode_id,
              pl.passcode_name AS linked_passcode_name,
              pl.passcode_type AS linked_passcode_type,
              pl.start_date AS linked_passcode_start_date,
              pl.end_date AS linked_passcode_end_date,
              pl.metadata AS linked_passcode_metadata
       FROM room_bookings rb
       JOIN rooms r ON r.id = rb.room_id
       LEFT JOIN passcode_logs pl ON pl.id = rb.passcode_log_id
       ${where}
       ORDER BY rb.start_time DESC`,
      values
    );

    return result.rows;
  } catch (error) {
    logger.error('Error listing user room bookings:', error);
    throw error;
  }
}

export async function listActiveBookingsForSchedule(startDate, endDate, roomId = null) {
  try {
    const values = [startDate, endDate];
    let roomFilter = '';

    if (roomId) {
      values.push(roomId);
      roomFilter = `AND rb.room_id = $${values.length}`;
    }

    const result = await roomManagementDb.query(
      `SELECT rb.id,
              rb.room_id,
              rb.start_time,
              rb.end_time,
              rb.description,
              rb.status,
              rb.created_by,
              r.name AS room_name,
              r.door_lock_id,
              r.capacity
       FROM room_bookings rb
       JOIN rooms r ON r.id = rb.room_id
       WHERE rb.status IN ('active', 'pending')
         AND rb.start_time < $2
         AND rb.end_time > $1
         ${roomFilter}
       ORDER BY
         CASE rb.status
           WHEN 'active' THEN 1
           WHEN 'pending' THEN 2
           ELSE 3
         END,
         rb.start_time ASC,
         r.name ASC`,
      values
    );

    return result.rows;
  } catch (error) {
    logger.error('Error listing schedule room bookings:', error);
    throw error;
  }
}

export async function getBookingById(bookingId) {
  try {
    const result = await roomManagementDb.query(
      `${BOOKING_SELECT} WHERE rb.id = $1`,
      [bookingId]
    );
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Error getting booking by ID:', error);
    throw error;
  }
}

export async function getBookingByRoomAndId(roomId, bookingId) {
  try {
    const result = await roomManagementDb.query(
      `${BOOKING_SELECT} WHERE rb.room_id = $1 AND rb.id = $2`,
      [roomId, bookingId]
    );
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Error getting booking by room and ID:', error);
    throw error;
  }
}

export async function findActiveConflict(roomId, startTime, endTime) {
  try {
    const result = await roomManagementDb.query(
      `SELECT * FROM room_bookings
       WHERE room_id = $1
         AND status = 'active'
         AND start_time < $3
         AND end_time > $2
       LIMIT 1`,
      [roomId, startTime, endTime]
    );
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Error checking booking conflict:', error);
    throw error;
  }
}

export async function createBooking(roomId, startTime, endTime, createdBy, status = 'pending', description = null) {
  try {
    const result = await roomManagementDb.query(
      `INSERT INTO room_bookings
       (room_id, start_time, end_time, status, created_by, approved_by, approved_at, description, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
       RETURNING *`,
      [
        roomId,
        startTime,
        endTime,
        status,
        createdBy,
        status === 'active' ? createdBy : null,
        status === 'active' ? new Date() : null,
        description,
      ]
    );
    return result.rows[0];
  } catch (error) {
    logger.error('Error creating booking:', error);
    throw error;
  }
}

export async function findBookingByRegistrationScheduleId(scheduleId, status = 'active') {
  try {
    const result = await roomManagementDb.query(
      `SELECT * FROM room_bookings
       WHERE registration_schedule_id = $1
         AND ($2::text IS NULL OR status = $2)
       ORDER BY created_at DESC
       LIMIT 1`,
      [scheduleId, status || null]
    );
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Error finding booking by registration schedule:', error);
    throw error;
  }
}

export async function createSyncedBooking({
  roomId,
  startTime,
  endTime,
  createdBy,
  description,
  registrationScheduleId,
  accessMode,
  syncMetadata = {},
}) {
  try {
    const result = await roomManagementDb.query(
      `INSERT INTO room_bookings
       (room_id, start_time, end_time, status, created_by, approved_by, approved_at,
        description, registration_schedule_id, access_mode, sync_metadata,
        created_at, updated_at)
       VALUES ($1, $2, $3, 'active', $4, $4, NOW(), $5, $6, $7, $8, NOW(), NOW())
       RETURNING *`,
      [
        roomId,
        startTime,
        endTime,
        createdBy,
        description,
        registrationScheduleId,
        accessMode,
        JSON.stringify(syncMetadata || {}),
      ]
    );
    return result.rows[0];
  } catch (error) {
    logger.error('Error creating synced booking:', error);
    throw error;
  }
}

export async function updateSyncedBookingTimes(bookingId, startTime, endTime) {
  try {
    const result = await roomManagementDb.query(
      `UPDATE room_bookings
       SET start_time = $2,
           end_time = $3,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [bookingId, startTime, endTime]
    );
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Error updating synced booking times:', error);
    throw error;
  }
}

export async function appendBookingSyncMetadata(bookingId, patch = {}) {
  try {
    const result = await roomManagementDb.query(
      `UPDATE room_bookings
       SET sync_metadata = COALESCE(sync_metadata, '{}'::jsonb) || $2::jsonb,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [bookingId, JSON.stringify(patch || {})]
    );
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Error appending booking sync metadata:', error);
    throw error;
  }
}

export async function updateBookingSyncMetadata(bookingId, accessMode, syncMetadata) {
  try {
    const result = await roomManagementDb.query(
      `UPDATE room_bookings
       SET access_mode = $2,
           sync_metadata = $3,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [bookingId, accessMode, JSON.stringify(syncMetadata || {})]
    );
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Error updating booking sync metadata:', error);
    throw error;
  }
}

export async function approveBooking(roomId, bookingId, approvedBy) {
  try {
    const result = await roomManagementDb.query(
      `UPDATE room_bookings
       SET status = 'active', approved_by = $1, approved_at = NOW(), updated_at = NOW()
       WHERE room_id = $2 AND id = $3 AND status = 'pending'
       RETURNING *`,
      [approvedBy, roomId, bookingId]
    );
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Error approving booking:', error);
    throw error;
  }
}

export async function rejectBooking(roomId, bookingId, rejectedBy, rejectionNote) {
  try {
    const result = await roomManagementDb.query(
      `UPDATE room_bookings
       SET status = 'rejected',
           rejected_by = $1,
           rejected_at = NOW(),
           rejection_note = $2,
           updated_at = NOW()
       WHERE room_id = $3 AND id = $4 AND status = 'pending'
       RETURNING *`,
      [rejectedBy, rejectionNote, roomId, bookingId]
    );
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Error rejecting booking:', error);
    throw error;
  }
}

export async function linkBookingPasscode(roomId, bookingId, passcodeLogId, generatedBy) {
  try {
    const result = await roomManagementDb.query(
      `UPDATE room_bookings
       SET passcode_log_id = $1,
           passcode_generated_by = $2,
           passcode_generated_at = NOW(),
           updated_at = NOW()
       WHERE room_id = $3 AND id = $4 AND passcode_log_id IS NULL
       RETURNING *`,
      [passcodeLogId, generatedBy, roomId, bookingId]
    );
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Error linking booking passcode:', error);
    throw error;
  }
}

export async function relinkBookingPasscode(roomId, bookingId, passcodeLogId, generatedBy) {
  try {
    const result = await roomManagementDb.query(
      `UPDATE room_bookings
       SET passcode_log_id = $1,
           passcode_generated_by = $2,
           passcode_generated_at = NOW(),
           updated_at = NOW()
       WHERE room_id = $3 AND id = $4
       RETURNING *`,
      [passcodeLogId, generatedBy, roomId, bookingId]
    );
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Error relinking booking passcode:', error);
    throw error;
  }
}

export async function cancelBooking(roomId, bookingId, canceledBy) {
  try {
    const result = await roomManagementDb.query(
      `UPDATE room_bookings
       SET status = 'canceled', canceled_by = $1, canceled_at = NOW(), updated_at = NOW()
       WHERE room_id = $2 AND id = $3 AND status IN ('pending', 'active')
       RETURNING *`,
      [canceledBy, roomId, bookingId]
    );
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Error canceling booking:', error);
    throw error;
  }
}
