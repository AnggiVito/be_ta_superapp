import * as scheduleBookingModel from '../models/scheduleBookingModel.js';
import * as scheduleSlotModel from '../models/scheduleSlotModel.js';
import * as scheduleModel from '../models/scheduleModel.js';
import * as roleModel from '../../user-management/models/roleModel.js';
import { logger } from '../../../core/utils/logger.js';
import { registrationDb } from '../../../config/databases.js';
import { formatScheduleWithWIB, formatSlotWithWIB, formatSlotsWithWIB, formatBookingWithWIB, formatBookingsWithWIB } from '../utils/timezoneHelper.js';
import { resolveListPeriodeFilter } from './practicumService.js';

/**
 * Book a slot for a student
 * @param {string} slotId - Slot ID
 * @param {string} userId - User ID (mahasiswa)
 */
export async function bookSlot(slotId, userId) {
  try {
    // Check if user is assistant praktikum (asisten_praktikum or asisten_praktikum_aktif)
    // Asisten praktikum tidak boleh booking slot
    // Menggunakan getActiveUserRoles untuk mendapatkan semua active roles sekaligus
    const activeRoles = await roleModel.getActiveUserRoles(userId);
    const userRoles = activeRoles.map(role => role.role);
    
    logger.info('Checking user roles for booking:', { userId, userRoles, slotId, activeRolesCount: activeRoles.length });
    
    // Cek apakah user memiliki role asisten praktikum (baik asisten_praktikum maupun asisten_praktikum_aktif)
    const hasAsistenPraktikum = userRoles.includes('asisten_praktikum');
    const hasAsistenPraktikumAktif = userRoles.includes('asisten_praktikum_aktif');
    const hasAsistenRole = hasAsistenPraktikum || hasAsistenPraktikumAktif;
    
    logger.info('Role check result:', { 
      userId, 
      hasAsistenPraktikum, 
      hasAsistenPraktikumAktif, 
      hasAsistenRole,
      allRoles: userRoles 
    });
    
    if (hasAsistenRole) {
      logger.warn('Asisten praktikum attempted to book slot - BLOCKED:', { 
        userId, 
        userRoles, 
        slotId,
        hasAsistenPraktikum,
        hasAsistenPraktikumAktif
      });
      throw new Error('Asisten praktikum tidak dapat melakukan booking. Hanya mahasiswa yang dapat melakukan booking');
    }
    
    // Check if slot exists and is available
    const slot = await scheduleSlotModel.findById(slotId);
    if (!slot) {
      throw new Error('Slot tidak ditemukan');
    }
    
    if (slot.status !== 'available') {
      throw new Error('Slot tidak tersedia');
    }
    
    // Get schedule date from slot.start_time (date of the schedule)
    // Use database DATE() function to ensure we get the date in the correct timezone
    const scheduleDate = await scheduleSlotModel.getScheduleDate(slotId);
    if (!scheduleDate) {
      throw new Error('Tidak dapat mengambil tanggal schedule');
    }
    
    // Check if user already has booking on the same schedule date (based on schedule date, not booking date)
    const hasBookingOnScheduleDate = await scheduleBookingModel.hasBookingOnScheduleDate(userId, scheduleDate);
    
    if (hasBookingOnScheduleDate) {
      throw new Error('Anda sudah memiliki booking untuk tanggal jadwal ini. Satu mahasiswa hanya bisa booking 1 slot per hari jadwal');
    }
    
    // Check if slot already has active booking
    const existingBooking = await scheduleBookingModel.findBySlot(slotId);
    if (existingBooking) {
      throw new Error('Slot sudah dibooking oleh mahasiswa lain');
    }
    
    // Validasi: Booking hanya bisa dilakukan maksimal 1 jam sebelum waktu pelaksanaan
    // Gunakan query database untuk memastikan timezone konsisten
    // Pastikan slot.start_time dalam format yang benar untuk PostgreSQL
    let slotStartTimeValue = slot.start_time;
    
    // Jika slot.start_time adalah Date object, konversi ke ISO string
    if (slot.start_time instanceof Date) {
      slotStartTimeValue = slot.start_time.toISOString();
    } else if (typeof slot.start_time === 'string') {
      // Jika sudah string, pastikan formatnya benar
      slotStartTimeValue = slot.start_time;
    }
    
    logger.info('Booking validation - slot data:', {
      slotId,
      slotStartTime: slot.start_time,
      slotStartTimeType: typeof slot.start_time,
      slotStartTimeValue,
      slotStartTimeIsDate: slot.start_time instanceof Date
    });
    
    // Validasi waktu menggunakan UTC untuk konsistensi
    // PostgreSQL TIMESTAMP WITH TIME ZONE selalu menyimpan dalam UTC
    const timeCheckResult = await registrationDb.query(
      `SELECT 
        NOW() as current_time_utc,
        $1::TIMESTAMP WITH TIME ZONE as slot_start_time_utc,
        ($1::TIMESTAMP WITH TIME ZONE - INTERVAL '1 hour') as one_hour_before_utc,
        EXTRACT(EPOCH FROM (NOW() - $1::TIMESTAMP WITH TIME ZONE)) / 3600 as hours_diff,
        TO_CHAR(NOW() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS') as current_time_wib_str,
        TO_CHAR($1::TIMESTAMP WITH TIME ZONE AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS') as slot_start_time_wib_str,
        TO_CHAR(($1::TIMESTAMP WITH TIME ZONE - INTERVAL '1 hour') AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS') as one_hour_before_wib_str,
        CASE 
          WHEN NOW() >= $1::TIMESTAMP WITH TIME ZONE THEN true
          ELSE false
        END as is_past,
        CASE 
          WHEN NOW() >= ($1::TIMESTAMP WITH TIME ZONE - INTERVAL '1 hour') THEN true
          ELSE false
        END as is_within_one_hour
      `,
      [slotStartTimeValue]
    );
    
    const timeCheck = timeCheckResult.rows[0];
    const isPast = timeCheck.is_past;
    const isWithinOneHour = timeCheck.is_within_one_hour;
    const hoursDiff = parseFloat(timeCheck.hours_diff);
    
    logger.info('Booking validation - time check result:', {
      slotId,
      userId,
      currentTimeUTC: timeCheck.current_time_utc,
      slotStartTimeUTC: timeCheck.slot_start_time_utc,
      oneHourBeforeUTC: timeCheck.one_hour_before_utc,
      currentTimeWIB: timeCheck.current_time_wib_str,
      slotStartTimeWIB: timeCheck.slot_start_time_wib_str,
      oneHourBeforeWIB: timeCheck.one_hour_before_wib_str,
      hoursDiff,
      isPast,
      isWithinOneHour,
      slotStartTimeFromDb: slot.start_time
    });
    
    // Cek apakah slot sudah lewat
    if (isPast) {
      logger.warn('Booking rejected - slot already past:', {
        slotId,
        userId,
        currentTimeUTC: timeCheck.current_time_utc,
        slotStartTimeUTC: timeCheck.slot_start_time_utc,
        currentTimeWIB: timeCheck.current_time_wib_str,
        slotStartTimeWIB: timeCheck.slot_start_time_wib_str,
        hoursDiff
      });
      throw new Error('Tidak bisa melakukan booking pada slot yang sudah lewat');
    }
    
    // Cek apakah sudah kurang dari 1 jam sebelum pelaksanaan
    if (isWithinOneHour) {
      logger.warn('Booking rejected - within 1 hour:', {
        slotId,
        userId,
        currentTimeUTC: timeCheck.current_time_utc,
        slotStartTimeUTC: timeCheck.slot_start_time_utc,
        oneHourBeforeUTC: timeCheck.one_hour_before_utc,
        currentTimeWIB: timeCheck.current_time_wib_str,
        slotStartTimeWIB: timeCheck.slot_start_time_wib_str,
        oneHourBeforeWIB: timeCheck.one_hour_before_wib_str,
        hoursDiff
      });
      throw new Error('Booking hanya bisa dilakukan maksimal 1 jam sebelum waktu pelaksanaan');
    }
    
    // Create booking with schedule date (not today's date)
    const booking = await scheduleBookingModel.create({
      slot_id: slotId,
      user_id: userId,
      booking_date: scheduleDate, // Use schedule date instead of today
    });
    
    logger.info('Slot booked:', { slotId, userId, bookingId: booking.id });
    
    // Get booking dengan details untuk format waktu
    const bookingWithDetails = await scheduleBookingModel.findByIdWithDetails(booking.id);
    // Format waktu ke WIB sebelum dikirim ke FE
    return formatBookingWithWIB(bookingWithDetails || booking);
  } catch (error) {
    logger.error('Error booking slot:', error);
    throw error;
  }
}

/**
 * Cancel booking
 * @param {string} bookingId - Booking ID
 * @param {string} userId - User ID (mahasiswa atau asisten)
 * @param {boolean} isAssistant - Whether user is assistant
 */
export async function cancelBooking(bookingId, userId, isAssistant = false) {
  try {
    const booking = await scheduleBookingModel.findById(bookingId);
    if (!booking) {
      throw new Error('Booking tidak ditemukan');
    }
    
    if (booking.status !== 'active') {
      throw new Error('Booking sudah dibatalkan');
    }
    
    // Get slot information for time validation
    const slot = await scheduleSlotModel.findById(booking.slot_id);
    if (!slot) {
      throw new Error('Slot tidak ditemukan');
    }
    
    // Validasi: Tidak bisa membatalkan booking 1 jam sebelum pelaksanaan atau setelah waktu pelaksanaan
    // Gunakan query database untuk memastikan timezone konsisten
    // Pastikan slot.start_time dalam format yang benar untuk PostgreSQL
    let slotStartTimeValue = slot.start_time;
    
    // Jika slot.start_time adalah Date object, konversi ke ISO string
    if (slot.start_time instanceof Date) {
      slotStartTimeValue = slot.start_time.toISOString();
    } else if (typeof slot.start_time === 'string') {
      // Jika sudah string, pastikan formatnya benar
      slotStartTimeValue = slot.start_time;
    }
    
    // Validasi waktu menggunakan UTC untuk konsistensi
    // PostgreSQL TIMESTAMP WITH TIME ZONE selalu menyimpan dalam UTC
    const timeCheckResult = await registrationDb.query(
      `SELECT 
        NOW() as current_time_utc,
        $1::TIMESTAMP WITH TIME ZONE as slot_start_time_utc,
        ($1::TIMESTAMP WITH TIME ZONE - INTERVAL '1 hour') as one_hour_before_utc,
        EXTRACT(EPOCH FROM (NOW() - $1::TIMESTAMP WITH TIME ZONE)) / 3600 as hours_diff,
        TO_CHAR(NOW() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS') as current_time_wib_str,
        TO_CHAR($1::TIMESTAMP WITH TIME ZONE AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS') as slot_start_time_wib_str,
        TO_CHAR(($1::TIMESTAMP WITH TIME ZONE - INTERVAL '1 hour') AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS') as one_hour_before_wib_str,
        CASE 
          WHEN NOW() >= $1::TIMESTAMP WITH TIME ZONE THEN true
          ELSE false
        END as is_past,
        CASE 
          WHEN NOW() >= ($1::TIMESTAMP WITH TIME ZONE - INTERVAL '1 hour') THEN true
          ELSE false
        END as is_within_one_hour
      `,
      [slotStartTimeValue]
    );
    
    const timeCheck = timeCheckResult.rows[0];
    const isPast = timeCheck.is_past;
    const isWithinOneHour = timeCheck.is_within_one_hour;
    
    const hoursDiff = parseFloat(timeCheck.hours_diff);
    
    logger.info('Cancel booking time validation:', {
      bookingId,
      currentTimeUTC: timeCheck.current_time_utc,
      slotStartTimeUTC: timeCheck.slot_start_time_utc,
      oneHourBeforeUTC: timeCheck.one_hour_before_utc,
      currentTimeWIB: timeCheck.current_time_wib_str,
      slotStartTimeWIB: timeCheck.slot_start_time_wib_str,
      oneHourBeforeWIB: timeCheck.one_hour_before_wib_str,
      hoursDiff,
      isPast,
      isWithinOneHour,
      slotStartTimeFromDb: slot.start_time,
      slotStartTimeValue
    });
    
    // Cek apakah slot sudah lewat
    if (isPast) {
      throw new Error('Tidak bisa membatalkan booking yang sudah lewat');
    }
    
    // Cek apakah sudah kurang dari 1 jam sebelum pelaksanaan
    if (isWithinOneHour) {
      throw new Error('Tidak bisa membatalkan booking 1 jam sebelum waktu pelaksanaan');
    }
    
    // If not assistant, check if user owns the booking
    if (!isAssistant) {
      if (booking.user_id !== userId) {
        throw new Error('Anda tidak memiliki izin untuk membatalkan booking ini');
      }
    } else {
      // If assistant, check if user is assistant for the schedule
      const schedule = await scheduleModel.findById(slot.schedule_id);
      if (!schedule) {
        throw new Error('Schedule tidak ditemukan');
      }
      
      const assistants = await scheduleModel.getAssistants(schedule.id);
      const isScheduleAssistant = assistants.some(
        (a) => a.user_id != null && String(a.user_id) === String(userId)
      );
      if (!isScheduleAssistant) {
        throw new Error('Anda bukan asisten untuk schedule ini');
      }
    }
    
    // Cancel booking
    await scheduleBookingModel.cancel(bookingId, userId);
    
    logger.info('Booking cancelled:', { bookingId, cancelledBy: userId });
    
    return true;
  } catch (error) {
    logger.error('Error cancelling booking:', error);
    throw error;
  }
}

/**
 * Get booking by id with details
 */
export async function getBookingById(bookingId) {
  try {
    const booking = await scheduleBookingModel.findByIdWithDetails(bookingId);
    if (!booking) {
      throw new Error('Booking tidak ditemukan');
    }
    // Format waktu ke WIB sebelum dikirim ke FE
    return formatBookingWithWIB(booking);
  } catch (error) {
    logger.error('Error getting booking:', error);
    throw error;
  }
}

/**
 * Get bookings by user
 */
export async function getUserBookings(userId, options = {}) {
  try {
    const { filter: periodeFilter } = await resolveListPeriodeFilter(options.periode);
    const bookings = await scheduleBookingModel.findByUser(userId, {
      ...options,
      periode: periodeFilter,
    });
    // Format waktu ke WIB sebelum dikirim ke FE
    return formatBookingsWithWIB(bookings);
  } catch (error) {
    logger.error('Error getting user bookings:', error);
    throw error;
  }
}

/**
 * Get schedule with slots and bookings
 */
export async function getScheduleWithSlotsAndBookings(scheduleId) {
  try {
    const schedule = await scheduleModel.findById(scheduleId);
    if (!schedule) {
      throw new Error('Schedule tidak ditemukan');
    }
    
    const slots = await scheduleSlotModel.findBySchedule(scheduleId);
    
    // Get bookings for each slot
    const slotsWithBookings = await Promise.all(
      slots.map(async (slot) => {
        const booking = await scheduleBookingModel.findBySlot(slot.id);
        return {
          ...slot,
          booking: booking || null,
        };
      })
    );
    
    schedule.slots = slotsWithBookings;
    schedule.available_slots = slots.filter(s => s.status === 'available').length;
    schedule.booked_slots = slots.filter(s => s.status === 'not_available').length;
    
    // Format waktu ke WIB sebelum dikirim ke FE
    return formatScheduleWithWIB(schedule);
  } catch (error) {
    logger.error('Error getting schedule with slots:', error);
    throw error;
  }
}

/**
 * Get bookings for assistant
 * Returns all bookings in schedules where the assistant is assigned
 * @param {string} assistantUserId - Assistant user ID
 * @param {Object} options - Optional filters (status, bookingDate)
 */
export async function getAssistantBookings(assistantUserId, options = {}) {
  try {
    const { filter: periodeFilter } = await resolveListPeriodeFilter(options.periode);
    const bookings = await scheduleBookingModel.findByAssistant(assistantUserId, {
      ...options,
      periode: periodeFilter,
    });
    // Format waktu ke WIB sebelum dikirim ke FE
    return formatBookingsWithWIB(bookings);
  } catch (error) {
    logger.error('Error getting assistant bookings:', error);
    throw error;
  }
}

