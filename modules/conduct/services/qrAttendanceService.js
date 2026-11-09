/**
 * QR Attendance Service
 * Business logic untuk generate dan validate QR code presensi
 */

import QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import { conductDb } from '../../../config/databases.js';
import { logger } from '../../../core/utils/logger.js';
import { 
  getJadwalFromRegistration,
  checkModuleIndividualMentoring,
  getActiveBookingsForSchedule,
  getBookingById,
} from './registrationDataService.js';
import { formatQRSessionWithWIB, formatQRSessionsWithWIB } from '../utils/timezoneHelper.js';

// QR Code expires after 30 seconds
const QR_EXPIRY_SECONDS = 30;

/**
 * Generate QR Code untuk presensi
 * Auto-detect skema: default (per jadwal) atau individual mentoring (per booking)
 * Auto-expire setelah 30 detik
 */
export async function generateQRCodeForAttendance(jadwalId, assistantUserId) {
  try {
    // Check if module uses individual mentoring
    const moduleInfo = await checkModuleIndividualMentoring(jadwalId);
    
    if (moduleInfo.isIndividualMentoring) {
      // Individual mentoring: generate QR per booking
      return await generateQRForIndividualMentoring(jadwalId, assistantUserId);
    } else {
      // Default schema: generate QR per jadwal
      return await generateQRForDefaultSchema(jadwalId, assistantUserId);
    }
  } catch (error) {
    logger.error('Error generating QR code:', error);
    throw error;
  }
}

/**
 * Generate QR Code untuk skema default (per jadwal)
 */
async function generateQRForDefaultSchema(jadwalId, assistantUserId) {
  const client = await conductDb.connect();
  
  try {
    await client.query('BEGIN');

    // Validasi jadwal exists
    const jadwal = await getJadwalFromRegistration(jadwalId);
    if (!jadwal) {
      throw new Error('Schedule not found');
    }

    // Expire semua QR session lama untuk jadwal ini
    await client.query(
      `UPDATE qr_attendance_sessions 
       SET is_active = false 
       WHERE jadwal_id = $1 AND is_active = true AND booking_id IS NULL`,
      [jadwalId]
    );

    // Generate token unik
    const qrToken = uuidv4();
    const expiredAt = new Date(Date.now() + QR_EXPIRY_SECONDS * 1000);

    // Data yang akan di-encode ke QR
    const qrData = {
      token: qrToken,
      jadwalId: jadwalId,
      type: 'attendance',
      schema: 'default',
      generatedBy: assistantUserId,
      expiredAt: expiredAt.toISOString(),
    };

    // Insert QR session baru (booking_id = NULL untuk default schema)
    const result = await client.query(
      `INSERT INTO qr_attendance_sessions 
       (jadwal_id, assistant_user_id, qr_token, qr_data, expired_at, booking_id)
       VALUES ($1, $2, $3, $4, $5, NULL)
       RETURNING 
         id, 
         qr_token, 
         expired_at AT TIME ZONE 'Asia/Jakarta' as expired_at_wib,
         expired_at,
         created_at AT TIME ZONE 'Asia/Jakarta' as created_at_wib,
         created_at`,
      [jadwalId, assistantUserId, qrToken, JSON.stringify(qrData), expiredAt]
    );

    await client.query('COMMIT');

    const session = result.rows[0];

    // Generate QR code image (base64)
    const qrCodeDataURL = await QRCode.toDataURL(JSON.stringify(qrData), {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      width: 300,
      margin: 2,
    });

    logger.info('QR Code generated for attendance (default schema)', {
      sessionId: session.id,
      jadwalId,
      assistantUserId,
      expiredAt: session.expired_at,
    });

    const formatted = formatQRSessionWithWIB(session);
    return {
      sessionId: session.id,
      qrToken: session.qr_token,
      qrCodeImage: qrCodeDataURL, // base64 data URL
      qrData: qrData,
      expiredAt: formatted.expired_at,
      expirySeconds: QR_EXPIRY_SECONDS,
      createdAt: formatted.created_at,
      schema: 'default',
    };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error generating QR code (default schema):', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Generate QR Code untuk individual mentoring (per booking slot)
 * Returns array of QR codes, satu per booking aktif
 */
async function generateQRForIndividualMentoring(jadwalId, assistantUserId) {
  const client = await conductDb.connect();
  
  try {
    await client.query('BEGIN');

    // Get all active bookings for this schedule
    const bookings = await getActiveBookingsForSchedule(jadwalId, assistantUserId);
    
    if (bookings.length === 0) {
      throw new Error('There are no active bookings for this schedule');
    }

    const qrSessions = [];

    // Generate QR untuk setiap booking
    for (const booking of bookings) {
      // Expire QR session lama untuk booking ini
      await client.query(
        `UPDATE qr_attendance_sessions 
         SET is_active = false 
         WHERE booking_id = $1 AND is_active = true`,
        [booking.booking_id]
      );

      // Generate token unik
      const qrToken = uuidv4();
      const expiredAt = new Date(Date.now() + QR_EXPIRY_SECONDS * 1000);

      // Data yang akan di-encode ke QR
      const qrData = {
        token: qrToken,
        jadwalId: jadwalId,
        bookingId: booking.booking_id,
        slotId: booking.slot_id,
        userId: booking.user_id, // User yang memiliki booking
        type: 'attendance',
        schema: 'individual_mentoring',
        generatedBy: assistantUserId,
        expiredAt: expiredAt.toISOString(),
      };

      // Insert QR session baru dengan booking_id
      const result = await client.query(
        `INSERT INTO qr_attendance_sessions 
         (jadwal_id, assistant_user_id, qr_token, qr_data, expired_at, booking_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING 
           id, 
           qr_token, 
           expired_at AT TIME ZONE 'Asia/Jakarta' as expired_at_wib,
           expired_at,
           created_at AT TIME ZONE 'Asia/Jakarta' as created_at_wib,
           created_at`,
        [jadwalId, assistantUserId, qrToken, JSON.stringify(qrData), expiredAt, booking.booking_id]
      );

      const session = result.rows[0];
      const formatted = formatQRSessionWithWIB(session);

      // Generate QR code image (base64)
      const qrCodeDataURL = await QRCode.toDataURL(JSON.stringify(qrData), {
        errorCorrectionLevel: 'H',
        type: 'image/png',
        width: 300,
        margin: 2,
      });

      qrSessions.push({
        sessionId: session.id,
        qrToken: session.qr_token,
        qrCodeImage: qrCodeDataURL,
        qrData: qrData,
        bookingId: booking.booking_id,
        slotId: booking.slot_id,
        userId: booking.user_id,
        slotNumber: booking.slot_number,
        slotStartTime: booking.slot_start_time,
        slotEndTime: booking.slot_end_time,
        expiredAt: formatted.expired_at,
        expirySeconds: QR_EXPIRY_SECONDS,
        createdAt: formatted.created_at,
        schema: 'individual_mentoring',
      });
    }

    await client.query('COMMIT');

    logger.info('QR Codes generated for individual mentoring', {
      jadwalId,
      assistantUserId,
      count: qrSessions.length,
    });

    return {
      schema: 'individual_mentoring',
      qrSessions, // Array of QR sessions
      count: qrSessions.length,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error generating QR code (individual mentoring):', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Validate QR Code token
 * Return session info jika valid, throw error jika is invalid
 */
export async function validateQRToken(qrToken) {
  try {
    // Expire old sessions first
    await expireOldSessions();

    const result = await conductDb.query(
      `SELECT 
         id, 
         jadwal_id, 
         assistant_user_id, 
         qr_data, 
         expired_at AT TIME ZONE 'Asia/Jakarta' as expired_at_wib,
         expired_at,
         is_active, 
         created_at AT TIME ZONE 'Asia/Jakarta' as created_at_wib,
         created_at,
         booking_id
       FROM qr_attendance_sessions
       WHERE qr_token = $1`,
      [qrToken]
    );

    const session = result.rows[0];

    if (!session) {
      return { valid: false, message: 'QR Code is invalid' };
    }

    if (!session.is_active) {
      return { valid: false, message: 'QR Code sudah not active' };
    }

    if (new Date(session.expired_at) < new Date()) {
      // Mark as inactive
      await conductDb.query(
        `UPDATE qr_attendance_sessions SET is_active = false WHERE id = $1`,
        [session.id]
      );
      return { valid: false, message: 'QR Code has expired' };
    }

    const qrData = JSON.parse(session.qr_data);
    const formatted = formatQRSessionWithWIB(session);

    return {
      valid: true,
      session: {
        id: session.id,
        jadwalId: session.jadwal_id,
        bookingId: session.booking_id,
        assistantUserId: session.assistant_user_id,
        qrData: qrData,
        schema: qrData.schema || 'default', // 'default' or 'individual_mentoring'
        expiredAt: formatted.expired_at,
        createdAt: formatted.created_at,
      },
    };
  } catch (error) {
    logger.error('Error validating QR token:', error);
    throw error;
  }
}

/**
 * Get active QR sessions untuk individual mentoring (per booking)
 * @param {string} jadwalId - Schedule ID
 * @returns {Array} Array of active QR sessions per booking
 */
export async function getActiveQRSessionsForIndividualMentoring(jadwalId) {
  try {
    await expireOldSessions();

    const result = await conductDb.query(
      `SELECT 
         id, 
         jadwal_id, 
         assistant_user_id, 
         qr_token, 
         qr_data, 
         expired_at AT TIME ZONE 'Asia/Jakarta' as expired_at_wib,
         expired_at,
         created_at AT TIME ZONE 'Asia/Jakarta' as created_at_wib,
         created_at,
         booking_id
       FROM qr_attendance_sessions
       WHERE jadwal_id = $1 AND is_active = true AND booking_id IS NOT NULL
       ORDER BY created_at DESC`,
      [jadwalId]
    );

    if (result.rows.length === 0) {
      return [];
    }

    const sessions = result.rows.map(session => {
      const qrData = JSON.parse(session.qr_data);
      const formatted = formatQRSessionWithWIB(session);
      return {
        sessionId: session.id,
        qrToken: session.qr_token,
        qrData: qrData,
        bookingId: session.booking_id,
        slotId: qrData.slotId,
        userId: qrData.userId,
        expiredAt: formatted.expired_at,
        expirySeconds: QR_EXPIRY_SECONDS,
        createdAt: formatted.created_at,
        assistantUserId: session.assistant_user_id,
        schema: 'individual_mentoring',
      };
    });

    // Generate QR code images
    const sessionsWithImages = await Promise.all(
      sessions.map(async (session) => {
        const qrCodeDataURL = await QRCode.toDataURL(JSON.stringify(session.qrData), {
          errorCorrectionLevel: 'H',
          type: 'image/png',
          width: 300,
          margin: 2,
        });
        return {
          ...session,
          qrCodeImage: qrCodeDataURL,
        };
      })
    );

    return sessionsWithImages;
  } catch (error) {
    logger.error('Error getting active QR sessions for individual mentoring:', error);
    throw error;
  }
}

/**
 * Get active QR session untuk jadwal (default schema)
 * Return null jika tidak ada session aktif
 */
export async function getActiveQRSession(jadwalId) {
  try {
    await expireOldSessions();

    const result = await conductDb.query(
      `SELECT 
         id, 
         jadwal_id, 
         assistant_user_id, 
         qr_token, 
         qr_data, 
         expired_at AT TIME ZONE 'Asia/Jakarta' as expired_at_wib,
         expired_at,
         created_at AT TIME ZONE 'Asia/Jakarta' as created_at_wib,
         created_at,
         booking_id
       FROM qr_attendance_sessions
       WHERE jadwal_id = $1 AND is_active = true AND booking_id IS NULL
       ORDER BY created_at DESC
       LIMIT 1`,
      [jadwalId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const session = result.rows[0];

    // Generate QR code image dari data yang tersimpan
    const qrData = JSON.parse(session.qr_data);
    const qrCodeDataURL = await QRCode.toDataURL(JSON.stringify(qrData), {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      width: 300,
      margin: 2,
    });

    const formatted = formatQRSessionWithWIB(session);
    return {
      sessionId: session.id,
      qrToken: session.qr_token,
      qrCodeImage: qrCodeDataURL,
      qrData: qrData,
      bookingId: session.booking_id,
      schema: qrData.schema || 'default',
      expiredAt: formatted.expired_at,
      expirySeconds: QR_EXPIRY_SECONDS,
      createdAt: formatted.created_at,
      assistantUserId: session.assistant_user_id,
    };
  } catch (error) {
    logger.error('Error getting active QR session:', error);
    throw error;
  }
}

/**
 * Expire old QR sessions
 */
export async function expireOldSessions() {
  try {
    await conductDb.query(
      `UPDATE qr_attendance_sessions
       SET is_active = false
       WHERE is_active = true AND expired_at < NOW()`
    );
  } catch (error) {
    logger.error('Error expiring old sessions:', error);
  }
}

/**
 * Deactivate QR session manually (misalnya asisten mau stop presensi)
 */
export async function deactivateQRSession(sessionId, assistantUserId) {
  try {
    const result = await conductDb.query(
      `UPDATE qr_attendance_sessions
       SET is_active = false
       WHERE id = $1 AND assistant_user_id = $2
       RETURNING id`,
      [sessionId, assistantUserId]
    );

    if (result.rows.length === 0) {
      throw new Error('QR session not found or unauthorized');
    }

    logger.info('QR session deactivated', { sessionId, assistantUserId });

    return { success: true, sessionId: result.rows[0].id };
  } catch (error) {
    logger.error('Error deactivating QR session:', error);
    throw error;
  }
}

/**
 * Get riwayat QR Code yang telah di-generate untuk jadwal tertentu
 * Includes: waktu generate, status (active/expired/deactivated), jumlah yang hadir
 */
export async function getQRHistory(jadwalId, options = {}) {
  const { assistantUserId, limit = 10, offset = 0, status } = options;

  try {
    // Build query dengan optional filter
    let query = `
      SELECT 
        qas.id as session_id,
        qas.jadwal_id,
        qas.qr_token,
        qas.assistant_user_id,
        qas.is_active,
        qas.created_at AT TIME ZONE 'Asia/Jakarta' as created_at_wib,
        qas.created_at,
        qas.expired_at AT TIME ZONE 'Asia/Jakarta' as expired_at_wib,
        qas.expired_at,
        CASE 
          WHEN qas.is_active = false THEN 'deactivated'
          WHEN qas.expired_at < NOW() THEN 'expired'
          ELSE 'active'
        END as status,
        COUNT(k.id) as attendance_count
      FROM qr_attendance_sessions qas
      LEFT JOIN attendance k ON k.qr_session_id = qas.id
      WHERE qas.jadwal_id = $1
    `;

    const params = [jadwalId];
    let paramIndex = 2;

    // Filter by assistant if provided
    if (assistantUserId) {
      query += ` AND qas.assistant_user_id = $${paramIndex}`;
      params.push(assistantUserId);
      paramIndex++;
    }

    // Filter by status if provided
    if (status) {
      if (status === 'active') {
        query += ` AND qas.is_active = true AND qas.expired_at > NOW()`;
      } else if (status === 'expired') {
        query += ` AND qas.expired_at < NOW()`;
      } else if (status === 'deactivated') {
        query += ` AND qas.is_active = false`;
      }
    }

    query += `
      GROUP BY qas.id
      ORDER BY qas.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(limit, offset);

    const result = await conductDb.query(query, params);

    // Get total count
    let countQuery = `
      SELECT COUNT(DISTINCT qas.id) as total
      FROM qr_attendance_sessions qas
      WHERE qas.jadwal_id = $1
    `;
    
    const countParams = [jadwalId];
    let countParamIndex = 2;

    if (assistantUserId) {
      countQuery += ` AND qas.assistant_user_id = $${countParamIndex}`;
      countParams.push(assistantUserId);
      countParamIndex++;
    }

    if (status) {
      if (status === 'active') {
        countQuery += ` AND qas.is_active = true AND qas.expired_at > NOW()`;
      } else if (status === 'expired') {
        countQuery += ` AND qas.expired_at < NOW()`;
      } else if (status === 'deactivated') {
        countQuery += ` AND qas.is_active = false`;
      }
    }

    const countResult = await conductDb.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    logger.info('QR history retrieved', { 
      jadwalId, 
      assistantUserId, 
      count: result.rows.length,
      total 
    });

    return {
      history: result.rows.map(row => {
        const formatted = formatQRSessionWithWIB({
          created_at: row.created_at,
          created_at_wib: row.created_at_wib,
          expired_at: row.expired_at,
          expired_at_wib: row.expired_at_wib,
        });
        return {
          sessionId: row.session_id,
          jadwalId: row.jadwal_id,
          qrToken: row.qr_token,
          assistantUserId: row.assistant_user_id,
          status: row.status,
          attendanceCount: parseInt(row.attendance_count),
          createdAt: formatted.created_at,
          expiredAt: formatted.expired_at,
          expirySeconds: QR_EXPIRY_SECONDS,
        };
      }),
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    };
  } catch (error) {
    logger.error('Error getting QR history:', error);
    throw error;
  }
}


