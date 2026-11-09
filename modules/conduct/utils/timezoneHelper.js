/**
 * Timezone Helper untuk Conduct Module
 * Format waktu ke WIB (+07:00) untuk konsistensi dengan FE
 * 
 * CATATAN: Query database sudah mengkonversi timezone menggunakan AT TIME ZONE 'Asia/Jakarta'
 * Helper ini hanya memformat ke ISO string dengan timezone +07:00
 */

import { conductDb } from '../../../config/databases.js';

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
    const result = await conductDb.query(
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
 * Format attendance object dengan waktu dalam WIB
 * Menggunakan field *_wib dari query jika ada, jika tidak fallback ke convertToWIB
 * @param {Object} attendance - Attendance object dari database
 * @returns {Object} Attendance object dengan waktu dalam format WIB
 */
export function formatAttendanceWithWIB(attendance) {
  if (!attendance) return attendance;
  
  const formatted = { ...attendance };
  
  // Format waktu_hadir
  if (attendance.waktu_hadir_wib) {
    formatted.waktu_hadir = convertToWIB(attendance.waktu_hadir_wib);
  } else if (attendance.waktu_hadir) {
    formatted.waktu_hadir = convertToWIB(attendance.waktu_hadir);
  }
  
  // Format waktu_keluar
  if (attendance.waktu_keluar_wib) {
    formatted.waktu_keluar = convertToWIB(attendance.waktu_keluar_wib);
  } else if (attendance.waktu_keluar) {
    formatted.waktu_keluar = convertToWIB(attendance.waktu_keluar);
  }
  
  // Format created_at dan updated_at
  if (attendance.created_at_wib) {
    formatted.created_at = convertToWIB(attendance.created_at_wib);
  } else if (attendance.created_at) {
    formatted.created_at = convertToWIB(attendance.created_at);
  }
  
  if (attendance.updated_at_wib) {
    formatted.updated_at = convertToWIB(attendance.updated_at_wib);
  } else if (attendance.updated_at) {
    formatted.updated_at = convertToWIB(attendance.updated_at);
  }
  
  return formatted;
}

/**
 * Format array of attendance records dengan waktu dalam WIB
 * @param {Array} attendances - Array of attendance objects dari database
 * @returns {Array} Array of attendance objects dengan waktu dalam format WIB
 */
export function formatAttendancesWithWIB(attendances) {
  if (!Array.isArray(attendances)) return attendances;
  
  return attendances.map(attendance => formatAttendanceWithWIB(attendance));
}

/**
 * Format QR session object dengan waktu dalam WIB
 * Menggunakan field *_wib dari query jika ada, jika tidak fallback ke convertToWIB
 * @param {Object} qrSession - QR session object dari database
 * @returns {Object} QR session object dengan waktu dalam format WIB
 */
export function formatQRSessionWithWIB(qrSession) {
  if (!qrSession) return qrSession;
  
  const formatted = { ...qrSession };
  
  // Format expired_at
  if (qrSession.expired_at_wib) {
    formatted.expired_at = convertToWIB(qrSession.expired_at_wib);
  } else if (qrSession.expired_at) {
    formatted.expired_at = convertToWIB(qrSession.expired_at);
  }
  
  // Format created_at dan updated_at
  if (qrSession.created_at_wib) {
    formatted.created_at = convertToWIB(qrSession.created_at_wib);
  } else if (qrSession.created_at) {
    formatted.created_at = convertToWIB(qrSession.created_at);
  }
  
  if (qrSession.updated_at_wib) {
    formatted.updated_at = convertToWIB(qrSession.updated_at_wib);
  } else if (qrSession.updated_at) {
    formatted.updated_at = convertToWIB(qrSession.updated_at);
  }
  
  return formatted;
}

/**
 * Format array of QR sessions dengan waktu dalam WIB
 * @param {Array} qrSessions - Array of QR session objects dari database
 * @returns {Array} Array of QR session objects dengan waktu dalam format WIB
 */
export function formatQRSessionsWithWIB(qrSessions) {
  if (!Array.isArray(qrSessions)) return qrSessions;
  
  return qrSessions.map(session => formatQRSessionWithWIB(session));
}

