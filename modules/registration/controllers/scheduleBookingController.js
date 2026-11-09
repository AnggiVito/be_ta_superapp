import * as scheduleBookingService from '../services/scheduleBookingService.js';
import * as scheduleSlotService from '../services/scheduleSlotService.js';
import * as scheduleService from '../services/scheduleService.js';
import * as roleModel from '../../user-management/models/roleModel.js';
import { logger } from '../../../core/utils/logger.js';

/**
 * Book a slot
 * POST /schedules/:scheduleId/slots/:slotId/book
 */
export async function bookSlot(req, res, next) {
  try {
    const { slotId } = req.params;
    const userId = req.user?.id || req.user?.user_id; // From auth middleware
    
    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        message: 'Unauthorized' 
      });
    }
    
    const booking = await scheduleBookingService.bookSlot(slotId, userId);
    
    res.status(201).json({ 
      success: true, 
      data: booking,
      message: 'Slot berhasil dibooking' 
    });
  } catch (err) {
    if (err.message.includes('tidak ditemukan') || 
        err.message.includes('tidak tersedia') ||
        err.message.includes('sudah memiliki booking') ||
        err.message.includes('sudah dibooking') ||
        err.message.includes('Asisten praktikum tidak dapat melakukan booking') ||
        err.message.includes('Booking hanya bisa dilakukan maksimal 1 jam sebelum') ||
        err.message.includes('Tidak bisa melakukan booking pada slot yang sudah lewat')) {
      return res.status(400).json({ 
        success: false, 
        message: err.message 
      });
    }
    logger.error('Error in bookSlot controller:', err);
    next(err);
  }
}

/**
 * Cancel booking
 * DELETE /schedules/bookings/:bookingId
 */
export async function cancelBooking(req, res, next) {
  try {
    const { bookingId } = req.params;
    const userId = req.user?.id || req.user?.user_id;
    
    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        message: 'Unauthorized' 
      });
    }
    
    // Check if user is assistant
    const activeAssistants = await roleModel.getUsersByRole('asisten_praktikum_aktif');
    const isAssistant = activeAssistants.some(ur => ur.user_id === userId);
    
    await scheduleBookingService.cancelBooking(bookingId, userId, isAssistant);
    
    res.json({ 
      success: true, 
      message: 'Booking berhasil dibatalkan' 
    });
  } catch (err) {
    if (err.message.includes('tidak ditemukan') || 
        err.message.includes('tidak memiliki izin') ||
        err.message.includes('sudah dibatalkan') ||
        err.message.includes('bukan asisten') ||
        err.message.includes('Tidak bisa membatalkan booking 1 jam sebelum') ||
        err.message.includes('Tidak bisa membatalkan booking yang sudah lewat')) {
      return res.status(400).json({ 
        success: false, 
        message: err.message 
      });
    }
    logger.error('Error in cancelBooking controller:', err);
    next(err);
  }
}

/**
 * Get booking by id
 * GET /schedules/bookings/:bookingId
 */
export async function getBookingById(req, res, next) {
  try {
    const { bookingId } = req.params;
    const booking = await scheduleBookingService.getBookingById(bookingId);
    
    res.json({ success: true, data: booking });
  } catch (err) {
    if (err.message === 'Booking tidak ditemukan') {
      return res.status(404).json({ 
        success: false, 
        message: err.message 
      });
    }
    logger.error('Error in getBookingById controller:', err);
    next(err);
  }
}

/**
 * Get user bookings
 * GET /schedules/bookings/my-bookings
 */
export async function getMyBookings(req, res, next) {
  try {
    const userId = req.user?.id || req.user?.user_id;
    
    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        message: 'Unauthorized' 
      });
    }
    
    const { status, periode } = req.query;
    const periodeFilter = periode != null && String(periode).trim() !== ''
      ? String(periode).trim()
      : 'active';
    const bookings = await scheduleBookingService.getUserBookings(userId, {
      status,
      periode: periodeFilter,
    });
    
    res.json({ success: true, data: bookings });
  } catch (err) {
    if (err.code === 'ACTIVE_PERIODE_NOT_CONFIGURED') {
      return res.status(400).json({ success: false, message: err.message });
    }
    logger.error('Error in getMyBookings controller:', err);
    next(err);
  }
}

/**
 * Get schedule with slots and bookings
 * GET /schedules/:scheduleId/slots
 */
export async function getScheduleWithSlots(req, res, next) {
  try {
    const { scheduleId } = req.params;
    const schedule = await scheduleBookingService.getScheduleWithSlotsAndBookings(scheduleId);
    
    res.json({ success: true, data: schedule });
  } catch (err) {
    if (err.message === 'Schedule tidak ditemukan') {
      return res.status(404).json({ 
        success: false, 
        message: err.message 
      });
    }
    logger.error('Error in getScheduleWithSlots controller:', err);
    next(err);
  }
}

/**
 * Get available slots for a schedule
 * GET /schedules/:scheduleId/slots/available
 */
export async function getAvailableSlots(req, res, next) {
  try {
    const { scheduleId } = req.params;
    const slots = await scheduleSlotService.getAvailableSlotsBySchedule(scheduleId);
    
    res.json({ success: true, data: slots });
  } catch (err) {
    logger.error('Error in getAvailableSlots controller:', err);
    next(err);
  }
}

/**
 * Get bookings assigned to assistant (asisten praktikum aktif)
 * GET /schedules/bookings/my-assigned-schedules
 * Returns all bookings in schedules where the user is assigned as assistant
 */
export async function getMyAssignedSchedules(req, res, next) {
  try {
    const userId = req.user?.id || req.user?.user_id;
    
    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        message: 'Unauthorized' 
      });
    }
    
    const { status, periode } = req.query;
    const periodeFilter = periode != null && String(periode).trim() !== ''
      ? String(periode).trim()
      : 'active';
    const bookings = await scheduleBookingService.getAssistantBookings(userId, {
      status,
      periode: periodeFilter,
    });
    
    res.json({ 
      success: true, 
      data: bookings,
      message: 'Jadwal booking berhasil diambil' 
    });
  } catch (err) {
    if (err.code === 'ACTIVE_PERIODE_NOT_CONFIGURED') {
      return res.status(400).json({ success: false, message: err.message });
    }
    logger.error('Error in getMyAssignedSchedules controller:', err);
    next(err);
  }
}

