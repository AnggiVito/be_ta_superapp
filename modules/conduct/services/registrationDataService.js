/**
 * Registration Data Service (for Conduct Module)
 * Service untuk akses data dari registration_db
 * Modul Conduct menggunakan service ini untuk membaca data master dari modul registrasi
 * 
 * NOTE: This is a MOCK version for testing QR Code attendance feature
 * TODO: Replace with real implementation when registration module is ready
 */

import { registrationDb } from '../../../config/databases.js';
import { logger } from '../../../core/utils/logger.js';
import { resolveUserIdentifiers } from './registrationUserIdentifierService.js';
import { resolveListPeriodeFilter } from '../../registration/services/practicumService.js';

export async function listPracticums({ studyProgramId, periode } = {}) {
  try {
    const { filter: periodeFilter } = await resolveListPeriodeFilter(periode);
    const params = [];
    let where = 'WHERE 1=1';
    if (studyProgramId) {
      params.push(studyProgramId);
      where += ` AND l.study_program_id = $${params.length}::uuid`;
    }
    if (periodeFilter) {
      params.push(periodeFilter);
      where += ` AND p.periode = $${params.length}`;
    }

    const result = await registrationDb.query(
      `
        SELECT
          p.id,
          p.code,
          p.name,
          p.description,
          p.periode,
          p.laboratory_id,
          l.study_program_id,
          l.code AS laboratory_code,
          l.name AS laboratory_name,
          sp.code AS study_program_code,
          sp.name AS study_program_name,
          p.created_at,
          p.updated_at
        FROM practicums p
        JOIN laboratories l ON l.id = p.laboratory_id
        JOIN study_programs sp ON sp.id = l.study_program_id
        ${where}
        ORDER BY p.name ASC
      `,
      params
    );

    return result.rows;
  } catch (error) {
    logger.error('Error listing practicums from registration:', error);
    throw error;
  }
}

export async function listPracticumModules({ practicumId, periode } = {}) {
  try {
    const { filter: periodeFilter } = await resolveListPeriodeFilter(periode);
    const params = [];
    let where = 'WHERE 1=1';
    if (practicumId) {
      params.push(practicumId);
      where += ` AND pm.practicum_id = $${params.length}::uuid`;
    }
    if (periodeFilter) {
      params.push(periodeFilter);
      where += ` AND p.periode = $${params.length}`;
    }

    const result = await registrationDb.query(
      `
        SELECT pm.id, pm.practicum_id, pm.code, pm.name, pm.description, pm.is_individual_mentoring,
               pm.mentoring_duration_minutes, pm.sequence, pm.created_at, pm.updated_at
        FROM practicum_modules pm
        INNER JOIN practicums p ON p.id = pm.practicum_id
        ${where}
        ORDER BY pm.sequence ASC, pm.name ASC
      `,
      params
    );
    return result.rows;
  } catch (error) {
    logger.error('Error listing practicum modules from registration:', error);
    throw error;
  }
}

export async function listSchedules({ moduleId, assistantUserId, periode } = {}) {
  try {
    const { filter: periodeFilter } = await resolveListPeriodeFilter(periode);
    const params = [];
    // NOTE: Registration `schedules` table may not have `deleted_at`.
    // Keep filters minimal and rely on registration's own business rules.
    let where = 'WHERE 1=1';

    if (moduleId) {
      params.push(moduleId);
      where += ` AND s.module_id = $${params.length}`;
    }

    if (periodeFilter) {
      params.push(periodeFilter);
      where += ` AND p.periode = $${params.length}`;
    }

    // Filter schedules where user is assigned as assistant.
    // Supports manual assignment by user_id and Excel import assignment by nim.
    if (assistantUserId) {
      const identifiers = await resolveUserIdentifiers(assistantUserId);
      params.push(identifiers);
      where += `
        AND EXISTS (
          SELECT 1 FROM schedule_assistants sa
          WHERE sa.schedule_id = s.id
            AND (
              lower(sa.user_id) = ANY($${params.length}::text[])
              OR lower(sa.nim) = ANY($${params.length}::text[])
            )
        )
      `;
    }

    const result = await registrationDb.query(
      `
        SELECT
          s.id,
          s.module_id,
          s.start_time,
          s.end_time,
          s.venue,
          s.ttlock_sync_status,
          s.created_at,
          s.updated_at,
          pm.practicum_id,
          pm.code AS module_code,
          pm.name AS module_name,
          p.periode AS practicum_periode,
          p.code AS practicum_code,
          p.name AS practicum_name
        FROM schedules s
        INNER JOIN practicum_modules pm ON s.module_id = pm.id
        INNER JOIN practicums p ON pm.practicum_id = p.id
        ${where}
        ORDER BY s.start_time DESC NULLS LAST, s.created_at DESC
        LIMIT 200
      `,
      params
    );

    return result.rows;
  } catch (error) {
    logger.error('Error listing schedules from registration:', error);
    throw error;
  }
}

/**
 * Get jadwal from registration module (MOCK VERSION)
 * Digunakan untuk display di FE dan validasi sebelum write kehadiran
 * 
 * @param {string} jadwalId - UUID jadwal
 * @returns {Object|null} Mock jadwal data
 */
export async function getJadwalFromRegistration(jadwalId) {
  try {
    logger.info('ðŸ”¶ MOCK: getJadwalFromRegistration called', { jadwalId });
    
    // MOCK: Return dummy jadwal data
    // TODO: Replace with real database query
    const mockJadwal = {
      id: jadwalId,
      praktikum_id: '550e8400-e29b-41d4-a716-446655440002',
      praktikum_nama: 'Praktikum Basis Data',
      lab_id: '550e8400-e29b-41d4-a716-446655440003',
      lab_nama: 'Lab Komputer 1',
      tanggal: new Date().toISOString().split('T')[0],
      waktu_mulai: '08:00:00',
      waktu_selesai: '10:00:00',
      venue: 'A201',
      kuota: 40,
      status: 'active',
      created_at: new Date(),
      updated_at: new Date(),
      deleted_at: null,
    };
    
    logger.info('ðŸ”¶ MOCK: Returning dummy jadwal data', { mockJadwal });
    
    return mockJadwal;
  } catch (error) {
    logger.error('Error getting jadwal from registration:', error);
    throw error;
  }
}

/**
 * Check if user has booking for a schedule (via schedule_bookings)
 * @param {string} scheduleId - Schedule ID
 * @param {string} userId - User ID
 * @returns {boolean} True if user has active booking for this schedule
 */
export async function checkUserBookingForSchedule(scheduleId, userId) {
  try {
    // Check if user has active booking for any slot in this schedule
    const result = await registrationDb.query(
      `SELECT COUNT(*) as count
       FROM schedule_bookings sb
       INNER JOIN schedule_slots ss ON sb.slot_id = ss.id
       WHERE ss.schedule_id = $1 
         AND sb.user_id = $2 
         AND sb.status = 'active'`,
      [scheduleId, userId]
    );

    const hasBooking = parseInt(result.rows[0].count) > 0;
    logger.info('User booking check for schedule', { 
      scheduleId, 
      userId, 
      hasBooking 
    });

    return hasBooking;
  } catch (error) {
    logger.error('Error checking user booking for schedule:', error);
    // Return false on error to be safe (fail closed)
    return false;
  }
}

const ENROLLED_PRAKTIKAN_FOR_SCHEDULE_SQL = `
  FROM schedules s
  INNER JOIN practicum_modules pm ON s.module_id = pm.id
  INNER JOIN practicum_enrollments pe ON pm.practicum_id = pe.practicum_id
  LEFT JOIN students st ON pe.student_id = st.id
  WHERE s.id = $1::uuid
    AND pe.status = 'enrolled'
    AND pe.role = 'mahasiswa'
    AND (
      lower(pe.student_id::text) = ANY($2::text[])
      OR lower(st.user_id::text) = ANY($2::text[])
      OR lower(st.student_number::text) = ANY($2::text[])
    )
`;

/**
 * Assert praktikan is enrolled in the practicum linked to this schedule (#215).
 * @throws {Error} when not enrolled
 */
export async function assertEnrolledPraktikanForSchedule(scheduleId, userId) {
  const identifiers = await resolveUserIdentifiers(userId);
  if (identifiers.length === 0) {
    throw new Error('You are not enrolled in this practicum');
  }

  const result = await registrationDb.query(
    `SELECT 1 ${ENROLLED_PRAKTIKAN_FOR_SCHEDULE_SQL} LIMIT 1`,
    [scheduleId, identifiers]
  );

  if (result.rowCount === 0) {
    throw new Error('You are not enrolled in this practicum');
  }
}

/**
 * List enrolled praktikan user ids for the practicum of a schedule (#215).
 */
export async function listEnrolledPraktikanUserIdsForSchedule(scheduleId) {
  const result = await registrationDb.query(
    `SELECT DISTINCT
       COALESCE(NULLIF(trim(st.user_id::text), ''), pe.student_id::text) AS user_id
     FROM schedules s
     INNER JOIN practicum_modules pm ON s.module_id = pm.id
     INNER JOIN practicum_enrollments pe ON pm.practicum_id = pe.practicum_id
     LEFT JOIN students st ON pe.student_id = st.id
     WHERE s.id = $1::uuid
       AND pe.status = 'enrolled'
       AND pe.role = 'mahasiswa'
     ORDER BY user_id ASC`,
    [scheduleId]
  );

  return result.rows.map((row) => String(row.user_id));
}

/**
 * Check if user is enrolled in practicum that has this schedule
 * @param {string} scheduleId - Schedule ID
 * @param {string} userId - User ID
 * @returns {boolean} True if user is enrolled in practicum
 */
export async function checkUserEnrollmentForSchedule(scheduleId, userId) {
  try {
    const identifiers = await resolveUserIdentifiers(userId);
    if (identifiers.length === 0) {
      return false;
    }

    const result = await registrationDb.query(
      `SELECT COUNT(*)::int AS count ${ENROLLED_PRAKTIKAN_FOR_SCHEDULE_SQL}`,
      [scheduleId, identifiers]
    );

    const isEnrolled = Number(result.rows[0]?.count || 0) > 0;
    logger.info('User enrollment check for schedule', {
      scheduleId,
      userId,
      isEnrolled,
    });

    return isEnrolled;
  } catch (error) {
    logger.error('Error checking user enrollment for schedule:', error);
    return false;
  }
}

/**
 * Validate jadwal exists and is valid before creating kehadiran
 * Also validates that user has booking or enrollment for this jadwal
 * 
 * @param {string} jadwalId - UUID jadwal (schedule ID)
 * @param {string} userId - User ID untuk validasi booking/enrollment
 * @returns {Object} Validation result with valid flag and jadwal data
 */
export async function validateJadwalForKehadiran(jadwalId, userId = null) {
  try {
    logger.info('validateJadwalForKehadiran called', { jadwalId, userId });
    
    // Try to get real schedule from database first
    let jadwal = null;
    try {
      const scheduleResult = await registrationDb.query(
        `SELECT s.*, pm.practicum_id
         FROM schedules s
         INNER JOIN practicum_modules pm ON s.module_id = pm.id
         WHERE s.id = $1`,
        [jadwalId]
      );

      if (scheduleResult.rows.length > 0) {
        const schedule = scheduleResult.rows[0];
        jadwal = {
          id: schedule.id,
          module_id: schedule.module_id,
          praktikum_id: schedule.practicum_id,
          start_time: schedule.start_time,
          venue: schedule.venue,
          ttlock_sync_status: schedule.ttlock_sync_status,
          status: 'active', // Assume active if exists
          tanggal: schedule.start_time ? new Date(schedule.start_time).toISOString().split('T')[0] : null,
        };
        logger.info('Real schedule found from database', { jadwalId, jadwal });
      }
    } catch (dbError) {
      logger.warn('Could not fetch schedule from database, using mock', { 
        jadwalId, 
        error: dbError.message 
      });
    }

    // Fallback to mock if real data not found
    if (!jadwal) {
      jadwal = await getJadwalFromRegistration(jadwalId);
    }
    
    if (!jadwal) {
      return { 
        valid: false, 
        message: 'Schedule not found' 
      };
    }

    // Business logic validation
    const today = new Date().toISOString().split('T')[0];
    const isActive = jadwal.status === 'active';
    const isNotPast = jadwal.tanggal ? jadwal.tanggal >= today : true;
    
    if (!isActive) {
      return { 
        valid: false, 
        message: 'Schedule is not active' 
      };
    }
    
    if (!isNotPast) {
      return { 
        valid: false, 
        message: 'Jadwal sudah lewat' 
      };
    }

    // Validate user booking/enrollment if userId provided
    if (userId) {
      // Check if user has booking for this schedule
      const hasBooking = await checkUserBookingForSchedule(jadwalId, userId);
      
      // Check if user is enrolled in practicum
      const isEnrolled = await checkUserEnrollmentForSchedule(jadwalId, userId);
      
      if (!hasBooking && !isEnrolled) {
        logger.warn('User attempted to scan QR without booking or enrollment', {
          jadwalId,
          userId,
          hasBooking,
          isEnrolled
        });
        return {
          valid: false,
          message: 'Anda tidak memiliki booking atau tidak terdaftar untuk jadwal ini'
        };
      }

      logger.info('User booking/enrollment validation passed', {
        jadwalId,
        userId,
        hasBooking,
        isEnrolled
      });
    }
    
    logger.info('Jadwal validation passed', { jadwalId, userId });
    
    return { 
      valid: true, 
      jadwal 
    };
  } catch (error) {
    logger.error('Error validating jadwal for kehadiran:', error);
    return { 
      valid: false, 
      message: 'Validation error: ' + error.message 
    };
  }
}

/**
 * Check if module uses individual mentoring schema
 * @param {string} scheduleId - Schedule ID
 * @returns {Object} { isIndividualMentoring: boolean, moduleId: string }
 */
export async function checkModuleIndividualMentoring(scheduleId) {
  try {
    const result = await registrationDb.query(
      `SELECT pm.id as module_id, pm.is_individual_mentoring
       FROM schedules s
       INNER JOIN practicum_modules pm ON s.module_id = pm.id
       WHERE s.id = $1`,
      [scheduleId]
    );

    if (result.rows.length === 0) {
      return { isIndividualMentoring: false, moduleId: null };
    }

    const module = result.rows[0];
    return {
      isIndividualMentoring: module.is_individual_mentoring === true,
      moduleId: module.module_id,
    };
  } catch (error) {
    logger.error('Error checking module individual mentoring:', error);
    return { isIndividualMentoring: false, moduleId: null };
  }
}

/**
 * Get booking information by booking ID
 * @param {string} bookingId - Booking ID
 * @returns {Object|null} Booking info with slot and schedule details
 */
export async function getBookingById(bookingId) {
  try {
    const result = await registrationDb.query(
      `SELECT 
        sb.id as booking_id,
        sb.slot_id,
        sb.user_id,
        sb.booking_date,
        sb.status as booking_status,
        ss.slot_number,
        ss.start_time as slot_start_time,
        ss.end_time as slot_end_time,
        s.id as schedule_id,
        s.module_id,
        s.start_time,
        s.venue,
        s.ttlock_sync_status
       FROM schedule_bookings sb
       INNER JOIN schedule_slots ss ON sb.slot_id = ss.id
       INNER JOIN schedules s ON ss.schedule_id = s.id
       WHERE sb.id = $1 AND sb.status = 'active'`,
      [bookingId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  } catch (error) {
    logger.error('Error getting booking by id:', error);
    throw error;
  }
}

/**
 * Get all active bookings for a schedule (for individual mentoring)
 * @param {string} scheduleId - Schedule ID
 * @param {string} assistantUserId - Assistant user ID (optional, untuk filter)
 * @returns {Array} Array of booking objects
 */
export async function getActiveBookingsForSchedule(scheduleId, assistantUserId = null) {
  try {
    let query = `
      SELECT 
        sb.id as booking_id,
        sb.slot_id,
        sb.user_id,
        sb.booking_date,
        ss.slot_number,
        ss.start_time as slot_start_time,
        ss.end_time as slot_end_time
      FROM schedule_bookings sb
      INNER JOIN schedule_slots ss ON sb.slot_id = ss.id
      WHERE ss.schedule_id = $1 
        AND sb.status = 'active'
    `;

    const params = [scheduleId];

    // Filter by assistant if provided (check if assistant is assigned to schedule)
    if (assistantUserId) {
      query += `
        AND EXISTS (
          SELECT 1 FROM schedule_assistants sa
          WHERE sa.schedule_id = $1 AND sa.user_id = $2
        )
      `;
      params.push(assistantUserId);
    }

    query += ' ORDER BY ss.start_time ASC';

    const result = await registrationDb.query(query, params);
    return result.rows;
  } catch (error) {
    logger.error('Error getting active bookings for schedule:', error);
    throw error;
  }
}

/**
 * Validate booking for individual mentoring attendance
 * @param {string} bookingId - Booking ID
 * @param {string} userId - User ID yang melakukan scan
 * @returns {Object} Validation result
 */
export async function validateBookingForAttendance(bookingId, userId) {
  try {
    const booking = await getBookingById(bookingId);
    
    if (!booking) {
      return {
        valid: false,
        message: 'Booking not found or inactive',
      };
    }

    // Check if user yang scan adalah user yang memiliki booking
    if (booking.user_id !== userId) {
      return {
        valid: false,
        message: 'You do not have a booking for this slot',
      };
    }

    return {
      valid: true,
      booking,
    };
  } catch (error) {
    logger.error('Error validating booking for attendance:', error);
    return {
      valid: false,
      message: 'Booking validation error: ' + error.message,
    };
  }
}


