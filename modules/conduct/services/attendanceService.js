/**
 * Kehadiran Service
 * Business logic untuk data kehadiran di modul pelaksanaan
 */

import { conductDb, registrationDb, userManagementDb } from '../../../config/databases.js';
import { logger } from '../../../core/utils/logger.js';
import { 
  validateJadwalForKehadiran,
  validateBookingForAttendance,
} from './registrationDataService.js';
import { validateQRToken } from './qrAttendanceService.js';
import { formatAttendanceWithWIB, formatAttendancesWithWIB } from '../utils/timezoneHelper.js';

/**
 * Record kehadiran via QR Code scan
 */
export async function recordAttendanceViaQR(qrToken, userId) {
  const client = await conductDb.connect();
  
  try {
    await client.query('BEGIN');

    // Validate QR token
    const validation = await validateQRToken(qrToken);
    if (!validation.valid) {
      throw new Error(validation.message);
    }

    const { session } = validation;
    const jadwalId = session.jadwalId;
    const schema = session.schema || 'default';
    const bookingId = session.bookingId;

    // Handle individual mentoring schema
    if (schema === 'individual_mentoring' && bookingId) {
      const bookingValidation = await validateBookingForAttendance(bookingId, userId);
      if (!bookingValidation.valid) {
        throw new Error(bookingValidation.message);
      }

      const booking = bookingValidation.booking;

      // Check if user already recorded attendance for this slot
      const existingAttendance = await client.query(
        `SELECT id FROM attendance 
         WHERE jadwal_id = $1 AND user_id = $2 AND deleted_at IS NULL`,
        [jadwalId, userId]
      );

      if (existingAttendance.rows.length > 0) {
        throw new Error('You have already attended this slot');
      }

      // Determine status: hadir atau terlambat
      // Gunakan late_tolerance_minutes dari jadwal
      const slotStartTimeValue = booking.slot_start_time instanceof Date
        ? booking.slot_start_time.toISOString()
        : booking.slot_start_time;

      const lateToleranceMinutes = booking.late_tolerance_minutes ?? 15;

      const timeCheckResult = await client.query(
        `SELECT 
          NOW() as current_time_utc,
          $1::TIMESTAMP WITH TIME ZONE as slot_start_time_utc,
          ($1::TIMESTAMP WITH TIME ZONE + ($2 || ' minutes')::INTERVAL) as late_deadline_utc,
          TO_CHAR(NOW() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS') as current_time_wib_str,
          TO_CHAR($1::TIMESTAMP WITH TIME ZONE AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS') as slot_start_time_wib_str,
          CASE 
            WHEN NOW() <= ($1::TIMESTAMP WITH TIME ZONE + ($2 || ' minutes')::INTERVAL) THEN true
            ELSE false
          END as is_on_time
        `,
        [slotStartTimeValue, lateToleranceMinutes]
      );

      const timeCheck = timeCheckResult.rows[0];
      const isOnTime = timeCheck.is_on_time;
      const status = isOnTime ? 'hadir' : 'terlambat';

      logger.info('Attendance status determined (individual mentoring)', {
        userId,
        jadwalId,
        bookingId,
        currentTimeUTC: timeCheck.current_time_utc,
        slotStartTimeUTC: timeCheck.slot_start_time_utc,
        lateDeadlineUTC: timeCheck.late_deadline_utc,
        currentTimeWIB: timeCheck.current_time_wib_str,
        slotStartTimeWIB: timeCheck.slot_start_time_wib_str,
        lateToleranceMinutes,
        status,
        isLate: status === 'terlambat',
      });

      // Insert attendance
      const result = await client.query(
        `INSERT INTO attendance 
         (jadwal_id, user_id, qr_session_id, status, waktu_hadir, created_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         RETURNING 
           id, 
           jadwal_id, 
           user_id, 
           status, 
           waktu_hadir AT TIME ZONE 'Asia/Jakarta' as waktu_hadir_wib,
           waktu_hadir,
           created_at AT TIME ZONE 'Asia/Jakarta' as created_at_wib,
           created_at`,
        [jadwalId, userId, session.id, status]
      );

      await client.query('COMMIT');

      const kehadiran = result.rows[0];

      logger.info('Attendance recorded via QR (individual mentoring)', {
        kehadiranId: kehadiran.id,
        userId,
        jadwalId,
        bookingId,
        qrSessionId: session.id,
        status: kehadiran.status,
        isLate: kehadiran.status === 'terlambat',
      });

      return formatAttendanceWithWIB(kehadiran);
    }

    // Handle individual mentoring schema
    if (schema === 'individual_mentoring' && bookingId) {
      // Validasi booking untuk individual mentoring
      const bookingValidation = await validateBookingForAttendance(bookingId, userId);
      if (!bookingValidation.valid) {
        throw new Error(bookingValidation.message);
      }

      const booking = bookingValidation.booking;
      
      // Check if user already recorded attendance for this booking/jadwal
      const existingAttendance = await client.query(
        `SELECT id FROM attendance 
         WHERE jadwal_id = $1 AND user_id = $2 AND deleted_at IS NULL`,
        [jadwalId, userId]
      );

      if (existingAttendance.rows.length > 0) {
        throw new Error('You have already attended this slot');
      }

      // Determine attendance status based on slot start time
      // Validasi waktu menggunakan UTC untuk konsistensi
      // PostgreSQL TIMESTAMP WITH TIME ZONE selalu menyimpan dalam UTC
      const slotStartTimeValue = booking.slot_start_time instanceof Date 
        ? booking.slot_start_time.toISOString() 
        : booking.slot_start_time;
      
      const timeCheckResult = await client.query(
        `SELECT 
          NOW() as current_time_utc,
          $1::TIMESTAMP WITH TIME ZONE as slot_start_time_utc,
          ($1::TIMESTAMP WITH TIME ZONE - INTERVAL '5 minutes') as five_minutes_before_utc,
          $2::TIMESTAMP WITH TIME ZONE as slot_end_time_utc,
          EXTRACT(EPOCH FROM (NOW() - $1::TIMESTAMP WITH TIME ZONE)) / 60 as minutes_diff,
          TO_CHAR(NOW() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS') as current_time_wib_str,
          TO_CHAR($1::TIMESTAMP WITH TIME ZONE AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS') as slot_start_time_wib_str,
          CASE 
            WHEN NOW() < ($1::TIMESTAMP WITH TIME ZONE - INTERVAL '5 minutes') THEN true
            ELSE false
          END as is_before_allowed_time,
          CASE 
            WHEN $2::TIMESTAMP WITH TIME ZONE IS NOT NULL AND NOW() > $2::TIMESTAMP WITH TIME ZONE THEN true
            ELSE false
          END as is_after_slot_end,
          CASE 
            WHEN NOW() <= $1::TIMESTAMP WITH TIME ZONE THEN true
            ELSE false
          END as is_on_time
        `,
        [slotStartTimeValue, booking.slot_end_time || null]
      );
      
      const timeCheck = timeCheckResult.rows[0];
      const isBeforeAllowedTime = timeCheck.is_before_allowed_time;
      const isAfterSlotEnd = timeCheck.is_after_slot_end;
      const isOnTime = timeCheck.is_on_time;
      
      logger.info('QR scan validation (individual mentoring):', {
        userId,
        jadwalId,
        bookingId,
        currentTimeUTC: timeCheck.current_time_utc,
        slotStartTimeUTC: timeCheck.slot_start_time_utc,
        currentTimeWIB: timeCheck.current_time_wib_str,
        slotStartTimeWIB: timeCheck.slot_start_time_wib_str,
        isBeforeAllowedTime,
        isAfterSlotEnd,
        isOnTime,
      });
      
      // Validasi: untuk individual mentoring, QR tidak bisa discan jika belum menunjukkan jam mulai kurang 5 menit
      if (isBeforeAllowedTime) {
        logger.warn('QR scan attempted before allowed time (individual mentoring)', {
          userId,
          jadwalId,
          bookingId,
        });
        throw new Error('QR Code cannot be scanned yet. QR Code can be scanned starting 5 minutes before the slot start time');
      }
      
      // Validasi: untuk individual mentoring, QR tidak bisa discan jika sudah melewati batas akhir slot
      if (isAfterSlotEnd) {
        logger.warn('QR scan attempted after slot end time (individual mentoring)', {
          userId,
          jadwalId,
          bookingId,
        });
        throw new Error('QR Code cannot be scanned because the slot time has ended');
      }
      
      const status = isOnTime ? 'hadir' : 'terlambat';

      logger.info('Attendance status determined (individual mentoring)', {
        userId,
        jadwalId,
        bookingId,
        currentTimeUTC: timeCheck.current_time_utc,
        slotStartTimeUTC: timeCheck.slot_start_time_utc,
        currentTimeWIB: timeCheck.current_time_wib_str,
        slotStartTimeWIB: timeCheck.slot_start_time_wib_str,
        status,
        isLate: status === 'terlambat',
      });

      // Insert attendance
      const result = await client.query(
        `INSERT INTO attendance 
         (jadwal_id, user_id, qr_session_id, status, waktu_hadir, created_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         RETURNING 
           id, 
           jadwal_id, 
           user_id, 
           status, 
           waktu_hadir AT TIME ZONE 'Asia/Jakarta' as waktu_hadir_wib,
           waktu_hadir,
           created_at AT TIME ZONE 'Asia/Jakarta' as created_at_wib,
           created_at`,
        [jadwalId, userId, session.id, status]
      );

      await client.query('COMMIT');

      const kehadiran = result.rows[0];

      logger.info('Attendance recorded via QR (individual mentoring)', {
        kehadiranId: kehadiran.id,
        userId,
        jadwalId,
        bookingId,
        qrSessionId: session.id,
        status: kehadiran.status,
        waktuHadir: kehadiran.waktu_hadir,
        isLate: kehadiran.status === 'terlambat',
      });

      return formatAttendanceWithWIB(kehadiran);
    }

    // Default schema: existing logic
    // Check if user already recorded attendance for this jadwal
    const existingAttendance = await client.query(
      `SELECT id FROM attendance 
       WHERE jadwal_id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [jadwalId, userId]
    );

    if (existingAttendance.rows.length > 0) {
      throw new Error('You have already attended this schedule');
    }

    // Validasi jadwal dan cek booking/enrollment user
    const jadwalValidation = await validateJadwalForKehadiran(jadwalId, userId);
    if (!jadwalValidation.valid) {
      throw new Error(jadwalValidation.message);
    }

    // Determine attendance status based on time (PRESENT or LATE)
    // Validasi waktu menggunakan UTC untuk konsistensi
    const jadwal = jadwalValidation.jadwal;
    
    // Use start_time if available, otherwise fallback to tanggal + waktu_mulai (for backward compatibility)
    let jadwalDateTimeValue;
    if (jadwal.start_time) {
      jadwalDateTimeValue = jadwal.start_time instanceof Date 
        ? jadwal.start_time.toISOString() 
        : jadwal.start_time;
    } else if (jadwal.tanggal && jadwal.waktu_mulai) {
      // Fallback for old schema - construct timestamp string
      jadwalDateTimeValue = `${jadwal.tanggal}T${jadwal.waktu_mulai}`;
    } else {
      // If no time info, use NOW() in query
      jadwalDateTimeValue = null;
    }
    
    // Query untuk validasi waktu menggunakan UTC
    const timeCheckResult = await client.query(
      `SELECT 
        NOW() as current_time_utc,
        COALESCE($1::TIMESTAMP WITH TIME ZONE, NOW()) as jadwal_start_time_utc,
        EXTRACT(EPOCH FROM (NOW() - COALESCE($1::TIMESTAMP WITH TIME ZONE, NOW()))) / 60 as minutes_diff,
        TO_CHAR(NOW() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS') as current_time_wib_str,
        TO_CHAR(COALESCE($1::TIMESTAMP WITH TIME ZONE, NOW()) AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS') as jadwal_start_time_wib_str,
        CASE 
          WHEN NOW() <= COALESCE($1::TIMESTAMP WITH TIME ZONE, NOW()) THEN true
          ELSE false
        END as is_on_time
      `,
      [jadwalDateTimeValue]
    );
    
    const timeCheck = timeCheckResult.rows[0];
    const isOnTime = timeCheck.is_on_time;
    const status = isOnTime ? 'hadir' : 'terlambat';
    
    logger.info('Attendance status determined', {
      userId,
      jadwalId,
      currentTimeUTC: timeCheck.current_time_utc,
      jadwalStartTimeUTC: timeCheck.jadwal_start_time_utc,
      lateDeadlineUTC: timeCheck.late_deadline_utc,
      currentTimeWIB: timeCheck.current_time_wib_str,
      jadwalStartTimeWIB: timeCheck.jadwal_start_time_wib_str,
      lateToleranceMinutes,
      currentTimeUTC: timeCheck.current_time_utc,
      jadwalStartTimeUTC: timeCheck.jadwal_start_time_utc,
      currentTimeWIB: timeCheck.current_time_wib_str,
      jadwalStartTimeWIB: timeCheck.jadwal_start_time_wib_str,
      status,
      isLate: status === 'terlambat',
    });

    // Insert attendance
    const result = await client.query(
      `INSERT INTO attendance 
       (jadwal_id, user_id, qr_session_id, status, waktu_hadir, created_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       RETURNING 
         id, 
         jadwal_id, 
         user_id, 
         status, 
         waktu_hadir AT TIME ZONE 'Asia/Jakarta' as waktu_hadir_wib,
         waktu_hadir,
         created_at AT TIME ZONE 'Asia/Jakarta' as created_at_wib,
         created_at`,
      [jadwalId, userId, session.id, status]
    );

    await client.query('COMMIT');

    const kehadiran = result.rows[0];

    logger.info('Attendance recorded via QR', {
      kehadiranId: kehadiran.id,
      userId,
      jadwalId,
      qrSessionId: session.id,
      status: kehadiran.status,
      isLate: kehadiran.status === 'terlambat',
    });

    return formatAttendanceWithWIB(kehadiran);
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error recording attendance via QR:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Create kehadiran record
 * Validasi jadwal dari modul registrasi sebelum write
 */
export async function createKehadiran(kehadiranData) {
  const client = await conductDb.connect();
  
  try {
    await client.query('BEGIN');

    // Validasi jadwal dari modul registrasi dan cek booking/enrollment user
    const validation = await validateJadwalForKehadiran(kehadiranData.jadwal_id, kehadiranData.user_id);
    if (!validation.valid) {
      throw new Error(validation.message);
    }

    // Check duplicate
    const existingAttendance = await client.query(
      `SELECT id FROM attendance 
       WHERE jadwal_id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [kehadiranData.jadwal_id, kehadiranData.user_id]
    );

    if (existingAttendance.rows.length > 0) {
      throw new Error('Attendance has already been recorded for this user');
    }

    // Insert attendance ke conduct_db
    const result = await client.query(
      `INSERT INTO attendance (jadwal_id, user_id, status, waktu_hadir, keterangan, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING 
         id, 
         jadwal_id, 
         user_id, 
         status, 
         waktu_hadir AT TIME ZONE 'Asia/Jakarta' as waktu_hadir_wib,
         waktu_hadir,
         keterangan, 
         created_at AT TIME ZONE 'Asia/Jakarta' as created_at_wib,
         created_at`,
      [
        kehadiranData.jadwal_id,
        kehadiranData.user_id,
        kehadiranData.status || 'hadir',
        kehadiranData.waktu_hadir || new Date(),
        kehadiranData.keterangan || null,
      ]
    );

    await client.query('COMMIT');

    const kehadiran = result.rows[0];
    logger.info('Kehadiran created manually:', { id: kehadiran.id, jadwal_id: kehadiranData.jadwal_id });

    return formatAttendanceWithWIB(kehadiran);
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error creating kehadiran:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get attendance by jadwal_id
 */
export async function getKehadiranByJadwal(jadwalId) {
  try {
    const result = await conductDb.query(
      `SELECT 
         a.*,
         a.waktu_hadir AT TIME ZONE 'Asia/Jakarta' as waktu_hadir_wib,
         a.waktu_keluar AT TIME ZONE 'Asia/Jakarta' as waktu_keluar_wib,
         a.created_at AT TIME ZONE 'Asia/Jakarta' as created_at_wib,
         a.updated_at AT TIME ZONE 'Asia/Jakarta' as updated_at_wib,
         q.qr_token, 
         q.assistant_user_id as recorded_by_assistant
       FROM attendance a
       LEFT JOIN qr_attendance_sessions q ON a.qr_session_id = q.id
       WHERE a.jadwal_id = $1 AND a.deleted_at IS NULL
       ORDER BY a.waktu_hadir DESC`,
      [jadwalId]
    );
    return formatAttendancesWithWIB(result.rows);
  } catch (error) {
    logger.error('Error getting attendance:', error);
    throw error;
  }
}

/**
 * Get all attendance records for a jadwal with user details (nama and NIM)
 * For assistant to view all student attendance in a jadwal
 * @param {string} jadwalId - Jadwal ID
 * @returns {Array} Array of attendance records with user details
 */
export async function getAllAttendanceByJadwal(jadwalId) {
  try {
    logger.info('Fetching all attendance for jadwal', { jadwalId });

    // Get all attendance records for this jadwal
    const attendanceResult = await conductDb.query(
      `SELECT 
        a.id,
        a.jadwal_id,
        a.user_id,
        a.qr_session_id,
        a.status,
        a.waktu_hadir AT TIME ZONE 'Asia/Jakarta' as waktu_hadir_wib,
        a.waktu_hadir,
        a.waktu_keluar AT TIME ZONE 'Asia/Jakarta' as waktu_keluar_wib,
        a.waktu_keluar,
        a.keterangan,
        a.created_at AT TIME ZONE 'Asia/Jakarta' as created_at_wib,
        a.created_at,
        a.updated_at AT TIME ZONE 'Asia/Jakarta' as updated_at_wib,
        a.updated_at
       FROM attendance a
       WHERE a.jadwal_id = $1 AND a.deleted_at IS NULL
       ORDER BY a.waktu_hadir DESC`,
      [jadwalId]
    );

    if (attendanceResult.rows.length === 0) {
      logger.info('No attendance records found for jadwal', { jadwalId });
      return [];
    }

    // Get unique user_ids from attendance records
    const userIds = [...new Set(attendanceResult.rows.map(row => row.user_id))];

    // Get user profiles (nama and nipnim/NIM/NIP) from user_management_db
    let userProfiles = {};
    if (userIds.length > 0) {
      // Use ANY array for better performance and safety
      const profileResult = await userManagementDb.query(
        `SELECT user_id, name, nipnim
         FROM user_profiles
         WHERE user_id = ANY($1::varchar[]) AND deleted_at IS NULL`,
        [userIds]
      );

      // Create a map of user_id -> {name, nipnim}
      userProfiles = profileResult.rows.reduce((acc, row) => {
        acc[row.user_id] = {
          name: row.name || null,
          nipnim: row.nipnim || null, // NIM/NIP
        };
        return acc;
      }, {});
    }

    // Combine attendance data with user profiles
    const attendanceWithUserDetails = attendanceResult.rows.map(attendance => {
      const userProfile = userProfiles[attendance.user_id] || { name: null, nipnim: null };
      
      // Format attendance dengan WIB
      const formattedAttendance = formatAttendanceWithWIB(attendance);
      
      // Calculate duration if both check-in and check-out exist
      // Gunakan waktu UTC untuk perhitungan yang akurat
      let durationMinutes = null;
      if (attendance.waktu_hadir && attendance.waktu_keluar) {
        const checkInTime = new Date(attendance.waktu_hadir);
        const checkOutTime = new Date(attendance.waktu_keluar);
        durationMinutes = Math.floor((checkOutTime - checkInTime) / 1000 / 60);
      }

      return {
        id: attendance.id,
        jadwalId: attendance.jadwal_id,
        userId: attendance.user_id,
        nama: userProfile.name,
        nim: userProfile.nipnim,
        qrSessionId: attendance.qr_session_id,
        status: attendance.status,
        waktu_hadir: formattedAttendance.waktu_hadir,
        waktu_keluar: formattedAttendance.waktu_keluar,
        durationMinutes,
        keterangan: attendance.keterangan,
        createdAt: formattedAttendance.created_at,
        updatedAt: formattedAttendance.updated_at,
      };
    });

    logger.info('Attendance records retrieved with user details', {
      jadwalId,
      count: attendanceWithUserDetails.length,
    });

    return attendanceWithUserDetails;
  } catch (error) {
    logger.error('Error getting all attendance by jadwal:', error);
    throw error;
  }
}

/**
 * Get attendance statistics for jadwal
 */
export async function getKehadiranStatistics(jadwalId) {
  try {
    const result = await conductDb.query(
      `SELECT 
        status,
        COUNT(*) as count
       FROM attendance
       WHERE jadwal_id = $1 AND deleted_at IS NULL
       GROUP BY status`,
      [jadwalId]
    );

    const stats = {
      total: 0,
      hadir: 0,
      terlambat: 0,
      izin: 0,
      sakit: 0,
      alpha: 0,
    };

    result.rows.forEach(row => {
      stats[row.status] = parseInt(row.count);
      stats.total += parseInt(row.count);
    });

    return stats;
  } catch (error) {
    logger.error('Error getting attendance statistics:', error);
    throw error;
  }
}

/**
 * Check-out attendance record
 * Praktikan melakukan check-out di akhir sesi praktikum
 * 
 * @param {string} attendanceId - Attendance record ID
 * @param {string} userId - User ID (for authorization)
 * @returns {Object} Updated attendance record with duration
 */
export async function checkOutAttendance(attendanceId, userId) {
  const client = await conductDb.connect();
  
  try {
    await client.query('BEGIN');

    // Get existing attendance record
    const checkAttendance = await client.query(
      `SELECT 
         *,
         waktu_hadir AT TIME ZONE 'Asia/Jakarta' as waktu_hadir_wib,
         waktu_keluar AT TIME ZONE 'Asia/Jakarta' as waktu_keluar_wib,
         created_at AT TIME ZONE 'Asia/Jakarta' as created_at_wib,
         updated_at AT TIME ZONE 'Asia/Jakarta' as updated_at_wib
       FROM attendance 
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [attendanceId, userId]
    );

    if (checkAttendance.rows.length === 0) {
      throw new Error('Attendance record not found or not authorized');
    }

    const attendance = checkAttendance.rows[0];

    // Validate: must have check-in first
    if (!attendance.waktu_hadir) {
      throw new Error('Cannot check-out without check-in first');
    }

    // Validate: cannot check-out twice
    if (attendance.waktu_keluar) {
      throw new Error('Already checked out');
    }

    const now = new Date();

    // Update waktu_keluar
    const result = await client.query(
      `UPDATE attendance 
       SET waktu_keluar = NOW(), updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING 
         *,
         waktu_hadir AT TIME ZONE 'Asia/Jakarta' as waktu_hadir_wib,
         waktu_keluar AT TIME ZONE 'Asia/Jakarta' as waktu_keluar_wib,
         created_at AT TIME ZONE 'Asia/Jakarta' as created_at_wib,
         updated_at AT TIME ZONE 'Asia/Jakarta' as updated_at_wib`,
      [attendanceId, userId]
    );

    await client.query('COMMIT');

    const updatedAttendance = result.rows[0];
    
    // Calculate session duration in minutes
    // Gunakan waktu UTC untuk perhitungan yang akurat
    const checkInTime = new Date(updatedAttendance.waktu_hadir);
    const checkOutTime = new Date(updatedAttendance.waktu_keluar);
    const durationMinutes = Math.floor((checkOutTime - checkInTime) / 1000 / 60);

    logger.info('Check-out recorded', {
      attendanceId,
      userId,
      jadwalId: updatedAttendance.jadwal_id,
      checkInTime: checkInTime.toISOString(),
      checkOutTime: checkOutTime.toISOString(),
      durationMinutes,
    });

    const formatted = formatAttendanceWithWIB(updatedAttendance);
    return {
      ...formatted,
      durationMinutes,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error recording check-out:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get attendance status for a user in a specific jadwal
 * @param {string} userId - User ID (praktikan)
 * @param {string} jadwalId - Jadwal ID
 * @returns {Object} Attendance status details
 */
export async function getAttendanceStatus(userId, jadwalId) {
  const client = await conductDb.connect();
  
  try {
    logger.info('Fetching attendance status', { userId, jadwalId });

    // Query attendance record for this user and jadwal
    const result = await client.query(
      `SELECT 
        id,
        jadwal_id,
        user_id,
        qr_session_id,
        status,
        waktu_hadir AT TIME ZONE 'Asia/Jakarta' as waktu_hadir_wib,
        waktu_hadir,
        waktu_keluar AT TIME ZONE 'Asia/Jakarta' as waktu_keluar_wib,
        waktu_keluar,
        keterangan,
        created_at AT TIME ZONE 'Asia/Jakarta' as created_at_wib,
        created_at,
        updated_at AT TIME ZONE 'Asia/Jakarta' as updated_at_wib,
        updated_at
       FROM attendance 
       WHERE user_id = $1 AND jadwal_id = $2 AND deleted_at IS NULL
       LIMIT 1`,
      [userId, jadwalId]
    );

    if (result.rows.length === 0) {
      // No attendance record found - status is ABSENT
      logger.info('No attendance record found - status ABSENT', { userId, jadwalId });
      
      return {
        jadwalId,
        userId,
        status: 'ABSENT',
        waktu_hadir: null,
        waktu_keluar: null,
        durationMinutes: null,
        keterangan: null,
      };
    }

    const attendance = result.rows[0];
    
    // Format attendance dengan WIB
    const formattedAttendance = formatAttendanceWithWIB(attendance);
    
    // Calculate duration if both check-in and check-out exist
    // Gunakan waktu UTC untuk perhitungan yang akurat
    let durationMinutes = null;
    if (attendance.waktu_hadir && attendance.waktu_keluar) {
      const checkInTime = new Date(attendance.waktu_hadir);
      const checkOutTime = new Date(attendance.waktu_keluar);
      durationMinutes = Math.floor((checkOutTime - checkInTime) / 1000 / 60);
    }

    logger.info('Attendance status retrieved', {
      userId,
      jadwalId,
      status: attendance.status,
      hasCheckIn: !!attendance.waktu_hadir,
      hasCheckOut: !!attendance.waktu_keluar,
      durationMinutes,
    });

    return {
      id: attendance.id,
      jadwalId: attendance.jadwal_id,
      userId: attendance.user_id,
      qrSessionId: attendance.qr_session_id,
      status: attendance.status, // PRESENT, LATE, EXCUSED
      waktu_hadir: formattedAttendance.waktu_hadir,
      waktu_keluar: formattedAttendance.waktu_keluar,
      durationMinutes,
      keterangan: attendance.keterangan,
      createdAt: formattedAttendance.created_at,
      updatedAt: formattedAttendance.updated_at,
    };
  } catch (error) {
    logger.error('Error fetching attendance status:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get attendance history for praktikan
 * Returns attendance records for a user, optionally filtered by praktikumId
 */
export async function getAttendanceHistory(userId, filters = {}) {
  const client = await conductDb.connect();

  try {
    logger.info('Fetching attendance history', {
      userId,
      praktikumId: filters.praktikumId,
      limit: filters.limit,
      offset: filters.offset,
    });

    const { praktikumId, limit = 10, offset = 0 } = filters;

    // If filtering by praktikumId, get jadwal IDs from registration_db first
    let jadwalIds = null;
    if (praktikumId) {
      const jadwalResult = await registrationDb.query(
        'SELECT id FROM jadwal WHERE praktikum_id = $1 AND deleted_at IS NULL',
        [praktikumId]
      );
      jadwalIds = jadwalResult.rows.map(row => row.id);
      
      // If no jadwal found for this praktikum, return empty result
      if (jadwalIds.length === 0) {
        return {
          history: [],
          pagination: {
            total: 0,
            limit,
            offset,
            hasMore: false,
          },
        };
      }
    }

    // Build query
    let query = `
      SELECT 
        a.id,
        a.jadwal_id,
        a.user_id,
        a.status,
        a.waktu_hadir AT TIME ZONE 'Asia/Jakarta' as waktu_hadir_wib,
        a.waktu_hadir,
        a.waktu_keluar AT TIME ZONE 'Asia/Jakarta' as waktu_keluar_wib,
        a.waktu_keluar,
        a.keterangan,
        a.created_at AT TIME ZONE 'Asia/Jakarta' as created_at_wib,
        a.created_at,
        a.updated_at AT TIME ZONE 'Asia/Jakarta' as updated_at_wib,
        a.updated_at
      FROM attendance a
      WHERE a.user_id = $1 
        AND a.deleted_at IS NULL
    `;

    const params = [userId];
    let paramIndex = 2;

    // Optional filter by praktikumId (using pre-fetched jadwal IDs)
    if (jadwalIds && jadwalIds.length > 0) {
      query += ` AND a.jadwal_id = ANY($${paramIndex}::uuid[])`;
      params.push(jadwalIds);
      paramIndex++;
    }

    query += `
      ORDER BY a.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    params.push(limit, offset);

    const result = await client.query(query, params);

    // Calculate duration for each record
    const history = result.rows.map((record) => {
      // Format attendance dengan WIB
      const formatted = formatAttendanceWithWIB(record);
      
      // Calculate duration menggunakan waktu UTC untuk akurasi
      let durationMinutes = null;
      if (record.waktu_hadir && record.waktu_keluar) {
        const checkIn = new Date(record.waktu_hadir);
        const checkOut = new Date(record.waktu_keluar);
        durationMinutes = Math.floor((checkOut - checkIn) / 1000 / 60);
      }

      return {
        id: record.id,
        jadwalId: record.jadwal_id,
        userId: record.user_id,
        status: record.status,
        waktu_hadir: formatted.waktu_hadir,
        waktu_keluar: formatted.waktu_keluar,
        durationMinutes,
        keterangan: record.keterangan,
        createdAt: formatted.created_at,
        updatedAt: formatted.updated_at,
      };
    });

    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(*) as total
      FROM attendance a
      WHERE a.user_id = $1 
        AND a.deleted_at IS NULL
    `;
    const countParams = [userId];

    if (jadwalIds && jadwalIds.length > 0) {
      countQuery += ` AND a.jadwal_id = ANY($2::uuid[])`;
      countParams.push(jadwalIds);
    }

    const countResult = await client.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    logger.info('Attendance history retrieved successfully', {
      userId,
      count: history.length,
      total,
    });

    return {
      history,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + history.length < total,
      },
    };
  } catch (error) {
    logger.error('Error fetching attendance history:', error);
    throw error;
  } finally {
    client.release();
  }
}



