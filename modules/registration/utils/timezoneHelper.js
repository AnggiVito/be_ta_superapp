/**
 * Timezone Helper untuk Registration Module
 * Format waktu ke WIB (+07:00) untuk konsistensi dengan FE
 * 
 * CATATAN: Query database sudah mengkonversi timezone menggunakan AT TIME ZONE 'Asia/Jakarta'
 * Helper ini hanya memformat ke ISO string dengan timezone +07:00
 */

import { registrationDb } from '../../../config/databases.js';

/**
 * Format timestamp ke ISO string dengan timezone +07:00 (WIB)
 * Jika timestamp sudah dalam format WIB (dari query dengan AT TIME ZONE), langsung format
 * Jika masih UTC, akan dikonversi (untuk backward compatibility)
 * 
 * @param {Date|string} timestamp - Timestamp (bisa UTC atau sudah WIB dari query)
 * @returns {string} ISO 8601 string dengan timezone +07:00 (WIB)
 */
export function convertToWIB(timestamp) {
  if (!timestamp) return null;
  
  // Jika sudah string dengan format yang benar, return langsung
  if (typeof timestamp === 'string' && timestamp.includes('+07:00')) {
    return timestamp;
  }

  if (typeof timestamp === 'string') {
    const naive = timestamp.trim().match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)/);
    if (naive) {
      const time = naive[2].length === 5 ? `${naive[2]}:00` : naive[2];
      return `${naive[1]}T${time}+07:00`;
    }
  }
  
  // Parse timestamp
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  
  // Format ke ISO string dengan timezone +07:00
  // Jika date sudah dalam WIB (dari AT TIME ZONE), langsung format
  // Jika masih UTC, akan otomatis dikonversi oleh JavaScript Date
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}+07:00`;
}

/**
 * Format waktu dari database ke WIB menggunakan query PostgreSQL
 * Lebih akurat karena menggunakan timezone conversion di database level
 * @param {string} timestamp - Timestamp string dari database
 * @returns {Promise<string>} ISO 8601 string dengan timezone +07:00 (WIB)
 */
export async function convertToWIBFromDB(timestamp) {
  if (!timestamp) return null;
  
  try {
    const result = await registrationDb.query(
      `SELECT TO_CHAR($1::TIMESTAMP WITH TIME ZONE AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS"+07:00"') as wib_time`,
      [timestamp]
    );
    
    return result.rows[0]?.wib_time || null;
  } catch (error) {
    // Fallback ke method JavaScript jika query gagal
    return convertToWIB(timestamp);
  }
}

/**
 * Format slot object dengan waktu dalam WIB
 * Menggunakan field *_wib dari query jika ada, jika tidak fallback ke convertToWIB
 * @param {Object} slot - Slot object dari database (dengan field start_time_wib dan end_time_wib dari query)
 * @returns {Object} Slot object dengan start_time dan end_time dalam format WIB
 */
export function formatSlotWithWIB(slot) {
  if (!slot) return slot;
  
  return {
    ...slot,
    // Gunakan field *_wib dari query jika ada (sudah dikonversi di database)
    // Jika tidak ada, fallback ke convertToWIB untuk backward compatibility
    start_time: slot.start_time_wib 
      ? convertToWIB(slot.start_time_wib) 
      : (slot.start_time ? convertToWIB(slot.start_time) : slot.start_time),
    end_time: slot.end_time_wib 
      ? convertToWIB(slot.end_time_wib) 
      : (slot.end_time ? convertToWIB(slot.end_time) : slot.end_time),
  };
}

/**
 * Format array of slots dengan waktu dalam WIB
 * @param {Array} slots - Array of slot objects dari database
 * @returns {Array} Array of slot objects dengan waktu dalam format WIB
 */
export function formatSlotsWithWIB(slots) {
  if (!Array.isArray(slots)) return slots;
  
  return slots.map(slot => {
    const formattedSlot = formatSlotWithWIB(slot);
    // Format booking di dalam slot juga jika ada
    if (formattedSlot.booking) {
      formattedSlot.booking = formatBookingWithWIB(formattedSlot.booking);
    }
    return formattedSlot;
  });
}

/**
 * Format array of schedules dengan waktu dalam WIB
 * @param {Array} schedules - Array of schedule objects dari database
 * @returns {Array} Array of schedule objects dengan waktu dalam format WIB
 */
export function formatSchedulesWithWIB(schedules) {
  if (!Array.isArray(schedules)) return schedules;
  
  return schedules.map(schedule => formatScheduleWithWIB(schedule));
}

/**
 * Format schedule object dengan waktu dalam WIB
 * Menggunakan field *_wib dari query jika ada, jika tidak fallback ke convertToWIB
 * @param {Object} schedule - Schedule object dari database (dengan field start_time_wib dan end_time_wib dari query)
 * @returns {Object} Schedule object dengan start_time dan end_time dalam format WIB
 */
export function formatScheduleWithWIB(schedule) {
  if (!schedule) return schedule;
  
  const formatted = {
    ...schedule,
    // Gunakan field *_wib dari query jika ada (sudah dikonversi di database)
    // Jika tidak ada, fallback ke convertToWIB untuk backward compatibility
    start_time: schedule.start_time_wib 
      ? convertToWIB(schedule.start_time_wib) 
      : (schedule.start_time ? convertToWIB(schedule.start_time) : schedule.start_time),
    end_time: schedule.end_time_wib 
      ? convertToWIB(schedule.end_time_wib) 
      : (schedule.end_time ? convertToWIB(schedule.end_time) : schedule.end_time),
  };
  
  // Jika schedule memiliki slots, format juga slots-nya
  if (formatted.slots && Array.isArray(formatted.slots)) {
    formatted.slots = formatted.slots.map(slot => {
      const formattedSlot = formatSlotWithWIB(slot);
      // Format booking di dalam slot juga jika ada
      if (formattedSlot.booking) {
        formattedSlot.booking = formatBookingWithWIB(formattedSlot.booking);
      }
      return formattedSlot;
    });
  }
  
  return formatted;
}

/**
 * Format booking object dengan waktu dalam WIB
 * Menggunakan field *_wib dari query jika ada, jika tidak fallback ke convertToWIB
 * @param {Object} booking - Booking object dari database (dengan field *_wib dari query)
 * @returns {Object} Booking object dengan waktu dalam format WIB
 */
export function formatBookingWithWIB(booking) {
  if (!booking) return booking;
  
  const formatted = { ...booking };
  
  // Format waktu slot - gunakan field *_wib dari query jika ada
  if (booking.slot_start_time_wib) {
    formatted.slot_start_time = convertToWIB(booking.slot_start_time_wib);
  } else if (booking.slot_start_time) {
    formatted.slot_start_time = convertToWIB(booking.slot_start_time);
  }
  
  if (booking.slot_end_time_wib) {
    formatted.slot_end_time = convertToWIB(booking.slot_end_time_wib);
  } else if (booking.slot_end_time) {
    formatted.slot_end_time = convertToWIB(booking.slot_end_time);
  }
  
  // Format waktu schedule - gunakan field *_wib dari query jika ada
  if (booking.schedule_start_time_wib) {
    formatted.schedule_start_time = convertToWIB(booking.schedule_start_time_wib);
  } else if (booking.schedule_start_time) {
    formatted.schedule_start_time = convertToWIB(booking.schedule_start_time);
  }
  
  if (booking.schedule_end_time_wib) {
    formatted.schedule_end_time = convertToWIB(booking.schedule_end_time_wib);
  } else if (booking.schedule_end_time) {
    formatted.schedule_end_time = convertToWIB(booking.schedule_end_time);
  }
  
  // Format cancelled_at jika ada
  if (booking.cancelled_at) {
    formatted.cancelled_at = convertToWIB(booking.cancelled_at);
  }
  
  // Format created_at dan updated_at jika ada
  if (booking.created_at) {
    formatted.created_at = convertToWIB(booking.created_at);
  }
  if (booking.updated_at) {
    formatted.updated_at = convertToWIB(booking.updated_at);
  }
  
  return formatted;
}

/**
 * Format array of bookings dengan waktu dalam WIB
 * @param {Array} bookings - Array of booking objects dari database
 * @returns {Array} Array of booking objects dengan waktu dalam format WIB
 */
export function formatBookingsWithWIB(bookings) {
  if (!Array.isArray(bookings)) return bookings;
  
  return bookings.map(booking => formatBookingWithWIB(booking));
}

