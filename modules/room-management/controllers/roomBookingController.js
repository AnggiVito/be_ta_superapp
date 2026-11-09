/**
 * Room Booking Controller
 * HTTP handlers for room booking endpoints
 */

import * as bookingService from '../services/roomBookingService.js';
import { logger } from '../../../core/utils/logger.js';

export async function listRoomBookings(req, res) {
  try {
    const { roomId } = req.params;
    const { status } = req.query;
    const userId = req.user?.id;

    const bookings = await bookingService.listBookings(roomId, status, userId);
    res.json({
      success: true,
      data: bookings,
    });
  } catch (error) {
    logger.error('Error in listRoomBookings controller:', error);
    const statusCode = error.message === 'Room not found' ? 404 : 500;
    res.status(statusCode).json({
      success: false,
      message: error.message || 'Error getting bookings',
    });
  }
}

export async function listAdminRoomBookings(req, res) {
  try {
    const { status } = req.query;
    const userId = req.user?.id;

    const bookings = await bookingService.listAllBookingsForAdmin(
      status,
      userId
    );

    res.json({
      success: true,
      data: bookings,
    });
  } catch (error) {
    logger.error('Error in listAdminRoomBookings controller:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Error getting bookings',
    });
  }
}

export async function listMyRoomBookings(req, res) {
  try {
    const { status } = req.query;
    const userId = req.user?.id;

    const bookings = await bookingService.listMyBookings(status, userId);

    res.json({
      success: true,
      data: bookings,
    });
  } catch (error) {
    logger.error('Error in listMyRoomBookings controller:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Error getting booking history',
    });
  }
}

export async function listRoomBookingSchedule(req, res) {
  try {
    const { startDate, endDate, roomId } = req.query;

    const bookings = await bookingService.listScheduleBookings(
      startDate,
      endDate,
      roomId
    );

    res.json({
      success: true,
      data: bookings,
    });
  } catch (error) {
    logger.error('Error in listRoomBookingSchedule controller:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Error getting booking schedule',
    });
  }
}

export async function createRoomBooking(req, res) {
  try {
    const { roomId } = req.params;
    const { start_time, end_time, description } = req.body;
    const userId = req.user?.id;

    const booking = await bookingService.createBooking(
      roomId,
      start_time,
      end_time,
      userId,
      req.user,
      description
    );

    res.status(201).json({
      success: true,
      message: booking.status === 'pending'
        ? 'Booking request submitted'
        : 'Booking created successfully',
      data: booking,
    });
  } catch (error) {
    logger.error('Error in createRoomBooking controller:', error);
    const statusCode = error.statusCode || 400;

    res.status(statusCode).json({
      success: false,
      message: error.message || 'Error creating booking',
      data: error.data || undefined,
    });
  }
}

export async function createPublicRoomBooking(req, res) {
  try {
    const { roomId } = req.params;
    const { start_time, end_time, created_by, description } = req.body;

    const booking = await bookingService.createPublicBooking(
      roomId,
      start_time,
      end_time,
      created_by,
      description
    );

    res.status(201).json({
      success: true,
      message: 'Booking request submitted',
      data: booking,
    });
  } catch (error) {
    logger.error('Error in createPublicRoomBooking controller:', error);
    const statusCode = error.statusCode || 400;

    res.status(statusCode).json({
      success: false,
      message: error.message || 'Error creating booking',
      data: error.data || undefined,
    });
  }
}

export async function approveRoomBooking(req, res) {
  try {
    const { roomId, bookingId } = req.params;
    const userId = req.user?.id;

    const booking = await bookingService.approveBooking(roomId, bookingId, userId, req.user);

    res.json({
      success: true,
      message: 'Booking approved successfully',
      data: booking,
    });
  } catch (error) {
    logger.error('Error in approveRoomBooking controller:', error);
    res.status(error.statusCode || 400).json({
      success: false,
      message: error.message || 'Error approving booking',
      data: error.data || undefined,
    });
  }
}

export async function rejectRoomBooking(req, res) {
  try {
    const { roomId, bookingId } = req.params;
    const { rejection_note } = req.body;
    const userId = req.user?.id;

    const booking = await bookingService.rejectBooking(
      roomId,
      bookingId,
      userId,
      req.user,
      rejection_note
    );

    res.json({
      success: true,
      message: 'Booking rejected successfully',
      data: booking,
    });
  } catch (error) {
    logger.error('Error in rejectRoomBooking controller:', error);
    res.status(error.statusCode || 400).json({
      success: false,
      message: error.message || 'Error rejecting booking',
    });
  }
}

export async function generateRoomBookingPasscode(req, res) {
  try {
    const { roomId, bookingId } = req.params;
    const userId = req.user?.id;

    const result = await bookingService.generateBookingPasscode(
      roomId,
      bookingId,
      userId,
      req.body || {},
      req.user
    );

    res.status(201).json({
      success: true,
      message: 'Booking passcode generated successfully',
      data: result,
    });
  } catch (error) {
    logger.error('Error in generateRoomBookingPasscode controller:', error);
    res.status(error.statusCode || 400).json({
      success: false,
      message: error.message || 'Error generating booking passcode',
    });
  }
}

export async function checkRoomBookingConflict(req, res) {
  try {
    const { roomId } = req.params;
    const { start_time, end_time } = req.body;

    const result = await bookingService.checkConflict(
      roomId,
      start_time,
      end_time
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Error in checkRoomBookingConflict controller:', error);
    const statusCode = error.message === 'Room not found' ? 404 : 400;
    res.status(statusCode).json({
      success: false,
      message: error.message || 'Error checking conflict',
      data: error.data || undefined,
    });
  }
}

export async function cancelRoomBooking(req, res) {
  try {
    const { roomId, bookingId } = req.params;
    const userId = req.user?.id;

    const booking = await bookingService.cancelBooking(
      roomId,
      bookingId,
      userId
    );

    res.json({
      success: true,
      message: 'Booking canceled successfully',
      data: booking,
    });
  } catch (error) {
    logger.error('Error in cancelRoomBooking controller:', error);
    const statusCode = error.statusCode || 400;

    res.status(statusCode).json({
      success: false,
      message: error.message || 'Error canceling booking',
    });
  }
}
