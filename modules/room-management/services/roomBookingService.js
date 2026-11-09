/**
 * Room Booking Service
 * Business logic for room bookings
 */

import * as roomModel from '../models/roomModel.js';
import * as bookingModel from '../models/roomBookingModel.js';
import * as passcodeService from './passcodeService.js';
import * as bookingNotificationService from './roomBookingNotificationService.js';
import { logger } from '../../../core/utils/logger.js';
import * as roleService from '../../user-management/services/roleService.js';
import * as profileModel from '../../user-management/models/profileModel.js';

function makeServiceError(message, statusCode, data = null) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (data) error.data = data;
  return error;
}

function normalizeRole(role) {
  const normalized = String(role ?? '').toLowerCase().trim().replace(/-/g, '_');
  switch (normalized) {
    case 'kaur':
    case 'kepala_urusan_laboratorium':
    case 'kepala_urusan_lab':
      return 'kaur_lab';
    default:
      return normalized;
  }
}

function jwtRoles(userData) {
  if (!userData) return new Set();
  const roles = new Set();
  const push = (value) => {
    if (!value) return;
    if (typeof value === 'string') {
      roles.add(normalizeRole(value));
      return;
    }
    roles.add(normalizeRole(value.role || value.name || value.value));
  };
  push(userData.role);
  push(userData.user_role);
  push(userData.userRole);
  if (Array.isArray(userData.roles)) {
    for (const r of userData.roles) push(r);
  }
  return roles;
}

async function isRoomAdmin(userId, userData = {}) {
  const adminRoles = ['kaur_lab', 'laboran', 'tpa'];
  for (const role of adminRoles) {
    if (await roleService.userHasRole(userId, role)) return true;
  }
  // JWT fallback — jika role ada di token tapi belum di DB
  const jRoles = jwtRoles(userData);
  return adminRoles.some((r) => jRoles.has(normalizeRole(r)));
}

function parseMetadata(metadata) {
  if (!metadata) return {};
  if (typeof metadata === 'object') return metadata;
  try {
    return JSON.parse(metadata);
  } catch {
    return {};
  }
}

function exposeBookingPasscode(booking, userId, isAdmin) {
  const isOwner = booking.created_by === userId;
  const canViewPasscode = isAdmin || isOwner;
  const metadata = parseMetadata(booking.linked_passcode_metadata);

  const exposed = {
    ...booking,
    linked_passcode_id: undefined,
    linked_passcode_name: undefined,
    linked_passcode_type: undefined,
    linked_passcode_start_date: undefined,
    linked_passcode_end_date: undefined,
    linked_passcode_metadata: undefined,
  };

  if (!booking.passcode_log_id || !canViewPasscode) {
    return {
      ...exposed,
      passcode_log_id: canViewPasscode ? booking.passcode_log_id : null,
      passcode_generated_by: canViewPasscode ? booking.passcode_generated_by : null,
      passcode_generated_at: canViewPasscode ? booking.passcode_generated_at : null,
      passcode: null,
      passcode_id: null,
      passcode_name: null,
      passcode_type: null,
      passcode_start_date: null,
      passcode_end_date: null,
    };
  }

  return {
    ...exposed,
    passcode: metadata.passcode || null,
    passcode_id: booking.linked_passcode_id || null,
    passcode_name: booking.linked_passcode_name || null,
    passcode_type: booking.linked_passcode_type || null,
    passcode_start_date: booking.linked_passcode_start_date || null,
    passcode_end_date: booking.linked_passcode_end_date || null,
  };
}

async function decorateBookings(bookings, userId) {
  const isAdmin = userId ? await isRoomAdmin(userId) : false;
  return bookings.map((booking) => exposeBookingPasscode(booking, userId, isAdmin));
}

async function getRoomForNotification(roomId) {
  try {
    return await roomModel.getRoomById(roomId);
  } catch (error) {
    logger.warn('Failed to load room for booking notification:', {
      roomId,
      error: error.message,
    });
    return null;
  }
}

function formatRoleName(role) {
  const labels = {
    kaur_lab: 'Kaur Lab',
    laboran: 'Laboran',
    tpa: 'TPA',
  };
  return labels[role] || role;
}

function extractJwtRoles(userData = {}) {
  const roles = [];

  if (Array.isArray(userData.roles)) {
    roles.push(
      ...userData.roles.map((role) => (
        typeof role === 'string'
          ? role
          : role?.role || role?.name || role?.slug || role?.role_name
      ))
    );
  }

  if (userData.role) {
    roles.push(userData.role);
  }

  return roles.filter(Boolean);
}

function buildUserLabel(userId, profile, roles = [], userData = {}) {
  const name = profile?.name ||
    profile?.full_name ||
    userData?.full_name ||
    userData?.name ||
    userData?.username ||
    userId ||
    '-';
  const roleSlugs = [
    ...roles.map((role) => role.role),
    ...extractJwtRoles(userData),
  ].filter(Boolean);
  const adminRoles = [...new Set(roleSlugs)]
    .filter((role) => ['kaur_lab', 'laboran', 'tpa'].includes(role))
    .map(formatRoleName);

  if (adminRoles.length === 0) {
    return name;
  }

  return `${name} (${adminRoles.join(', ')})`;
}

async function getUserNotificationLabel(userId, userData = {}) {
  if (!userId) return '-';

  try {
    const [profile, roles] = await Promise.all([
      profileModel.getUserProfile(userId),
      roleService.getActiveUserRoles(userId),
    ]);

    return buildUserLabel(userId, profile, roles, userData);
  } catch (error) {
    logger.warn('Failed to load user label for booking notification:', {
      userId,
      error: error.message,
    });
    return buildUserLabel(userId, null, [], userData);
  }
}

async function withRequesterLabel(booking, requesterData = {}) {
  if (!booking) return booking;
  const requesterLabel = await getUserNotificationLabel(booking.created_by, requesterData);
  return {
    ...booking,
    requesterLabel,
    requester_label: requesterLabel,
  };
}

async function decorateBooking(booking, userId) {
  if (!booking) return booking;
  const [decorated] = await decorateBookings([booking], userId);
  return decorated;
}

async function notifyPendingBooking(room, booking, requesterData = {}) {
  if (booking.status === 'pending') {
    await bookingNotificationService.notifyPendingBookingCreated({
      room,
      booking: await withRequesterLabel(booking, requesterData),
    });
  }
}

export async function listBookings(roomId, status, userId) {
  try {
    const room = await roomModel.getRoomById(roomId);
    if (!room) {
      throw new Error('Room not found');
    }

    const bookings = await bookingModel.listBookingsByRoom(roomId, status);
    const labeledBookings = await Promise.all(
      bookings.map((booking) => withRequesterLabel(booking))
    );
    return await decorateBookings(labeledBookings, userId);
  } catch (error) {
    logger.error('Error in listBookings service:', error);
    throw error;
  }
}

export async function listAllBookingsForAdmin(status, userId) {
  try {
    const bookings = await bookingModel.listBookingsForAdmin(status);
    const labeledBookings = await Promise.all(
      bookings.map((booking) => withRequesterLabel(booking))
    );
    return await decorateBookings(labeledBookings, userId);
  } catch (error) {
    logger.error('Error in listAllBookingsForAdmin service:', error);
    throw error;
  }
}

export async function listMyBookings(status, userId) {
  try {
    if (!userId) {
      throw makeServiceError('User not authenticated', 401);
    }

    const bookings = await bookingModel.listBookingsForUser(userId, status);
    const labeledBookings = await Promise.all(
      bookings.map((booking) => withRequesterLabel(booking))
    );
    return await decorateBookings(labeledBookings, userId);
  } catch (error) {
    logger.error('Error in listMyBookings service:', error);
    throw error;
  }
}

export async function listScheduleBookings(startDate, endDate, roomId = null) {
  try {
    if (!startDate || !endDate) {
      throw makeServiceError('startDate and endDate are required', 400);
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw makeServiceError('startDate and endDate must be valid dates', 400);
    }

    if (end <= start) {
      throw makeServiceError('endDate must be after startDate', 400);
    }

    const bookings = await bookingModel.listActiveBookingsForSchedule(
      start.toISOString(),
      end.toISOString(),
      roomId || null
    );

    return Promise.all(bookings.map((booking) => withRequesterLabel(booking)));
  } catch (error) {
    logger.error('Error in listScheduleBookings service:', error);
    throw error;
  }
}

export async function createBooking(roomId, startTime, endTime, userId, userData = {}, description = null) {
  try {
    const room = await roomModel.getRoomById(roomId);
    if (!room) {
      throw makeServiceError('Room not found', 404);
    }

    const isAdmin = await isRoomAdmin(userId, userData);
    const status = isAdmin ? 'active' : 'pending';

    if (status === 'active') {
      const conflict = await bookingModel.findActiveConflict(
        roomId,
        startTime,
        endTime
      );
      if (conflict) {
        const conflictData = await withRequesterLabel({
          ...conflict,
          room_name: room.name,
          door_lock_id: room.door_lock_id,
          capacity: room.capacity,
        });
        throw makeServiceError('Booking conflict', 409, {
          conflict: true,
          booking: conflictData,
        });
      }
    }

    const booking = await bookingModel.createBooking(
      roomId,
      startTime,
      endTime,
      userId,
      status,
      description?.trim() || null
    );

    await notifyPendingBooking(room, booking, userData);

    return withRequesterLabel({
      ...booking,
      room_name: room.name,
      door_lock_id: room.door_lock_id,
      capacity: room.capacity,
    }, userData);
  } catch (error) {
    logger.error('Error in createBooking service:', error);
    throw error;
  }
}

export async function createPublicBooking(roomId, startTime, endTime, createdBy, description = null) {
  try {
    const room = await roomModel.getRoomById(roomId);
    if (!room) {
      throw makeServiceError('Room not found', 404);
    }

    const booking = await bookingModel.createBooking(
      roomId,
      startTime,
      endTime,
      createdBy,
      'pending',
      description?.trim() || null
    );

    await notifyPendingBooking(room, booking);

    return booking;
  } catch (error) {
    logger.error('Error in createPublicBooking service:', error);
    throw error;
  }
}

export async function checkConflict(roomId, startTime, endTime) {
  try {
    const room = await roomModel.getRoomById(roomId);
    if (!room) {
      throw makeServiceError('Room not found', 404);
    }

    const conflict = await bookingModel.findActiveConflict(
      roomId,
      startTime,
      endTime
    );

    const conflictWithContext = conflict
      ? await withRequesterLabel({
          ...conflict,
          room_name: room.name,
          door_lock_id: room.door_lock_id,
          capacity: room.capacity,
        })
      : null;

    return {
      conflict: !!conflict,
      booking: conflictWithContext,
    };
  } catch (error) {
    logger.error('Error in checkConflict service:', error);
    throw error;
  }
}

export async function cancelBooking(roomId, bookingId, userId) {
  try {
    const booking = await bookingModel.getBookingByRoomAndId(roomId, bookingId);
    if (!booking) {
      throw makeServiceError('Booking not found', 404);
    }

    if (!['pending', 'active'].includes(booking.status)) {
      throw makeServiceError('Booking cannot be canceled', 400);
    }

    const isOwner = booking.created_by === userId;
    const isAdmin = await isRoomAdmin(userId);

    if (!isOwner && !isAdmin) {
      throw makeServiceError('Forbidden', 403);
    }

    const canceled = await bookingModel.cancelBooking(roomId, bookingId, userId);
    if (!canceled) {
      throw makeServiceError('Failed to cancel booking', 400);
    }

    return canceled;
  } catch (error) {
    logger.error('Error in cancelBooking service:', error);
    throw error;
  }
}

export async function approveBooking(roomId, bookingId, userId, userData = {}) {
  try {
    const booking = await bookingModel.getBookingByRoomAndId(roomId, bookingId);
    if (!booking) {
      throw makeServiceError('Booking not found', 404);
    }

    if (booking.status !== 'pending') {
      throw makeServiceError('Only pending bookings can be approved', 400);
    }

    const conflict = await bookingModel.findActiveConflict(
      roomId,
      booking.start_time,
      booking.end_time
    );
    if (conflict) {
      const room = await roomModel.getRoomById(roomId);
      const conflictData = await withRequesterLabel({
        ...conflict,
        room_name: room?.name || booking.room_name,
        door_lock_id: room?.door_lock_id,
        capacity: room?.capacity,
      });
      throw makeServiceError('Booking conflict', 409, {
        conflict: true,
        booking: conflictData,
      });
    }

    const approved = await bookingModel.approveBooking(roomId, bookingId, userId);
    if (!approved) {
      throw makeServiceError('Failed to approve booking', 400);
    }

    return withRequesterLabel(approved);
  } catch (error) {
    logger.error('Error in approveBooking service:', error);
    throw error;
  }
}

export async function rejectBooking(roomId, bookingId, userId, userData = {}, rejectionNote = '') {
  try {
    const normalizedNote = typeof rejectionNote === 'string'
      ? rejectionNote.trim()
      : '';

    if (!normalizedNote) {
      throw makeServiceError('Rejection note is required', 400);
    }

    if (normalizedNote.length > 1000) {
      throw makeServiceError('Rejection note must be at most 1000 characters', 400);
    }

    const booking = await bookingModel.getBookingByRoomAndId(roomId, bookingId);
    if (!booking) {
      throw makeServiceError('Booking not found', 404);
    }

    if (booking.status !== 'pending') {
      throw makeServiceError('Only pending bookings can be rejected', 400);
    }

    const rejected = await bookingModel.rejectBooking(
      roomId,
      bookingId,
      userId,
      normalizedNote
    );
    if (!rejected) {
      throw makeServiceError('Failed to reject booking', 400);
    }

    const room = await getRoomForNotification(roomId);
    const [actorLabel, bookingWithRequester] = await Promise.all([
      getUserNotificationLabel(userId, userData),
      withRequesterLabel(rejected),
    ]);

    await bookingNotificationService.notifyBookingRejected({
      room,
      booking: bookingWithRequester,
      actorId: userId,
      actorLabel,
    });
    await bookingNotificationService.notifyRequesterBookingRejected({
      room,
      booking: bookingWithRequester,
      actorId: userId,
      actorLabel,
    });

    return bookingWithRequester;
  } catch (error) {
    logger.error('Error in rejectBooking service:', error);
    throw error;
  }
}

function buildBookingPasscodePayload(booking, data, userId) {
  const type = data.type || 'temporary';
  const name = data.name || `Booking passcode ${booking.id}`;
  const metadata = { bookingId: booking.id };

  switch (type) {
    case 'temporary':
      return {
        type,
        payload: {
          name,
          startDate: new Date(booking.start_time).toISOString(),
          endDate: new Date(booking.end_time).toISOString(),
          createdBy: userId,
          metadata,
        },
      };
    case 'custom_temporary':
      if (!data.customPasscode) {
        throw makeServiceError('Custom passcode is required', 400);
      }
      return {
        type,
        payload: {
          name,
          passcode: data.customPasscode,
          startDate: new Date(booking.start_time).toISOString(),
          endDate: new Date(booking.end_time).toISOString(),
          createdBy: userId,
          metadata,
        },
      };
    case 'permanent':
      return {
        type,
        payload: {
          name,
          createdBy: userId,
          metadata,
        },
      };
    case 'custom_permanent':
      if (!data.customPasscode) {
        throw makeServiceError('Custom passcode is required', 400);
      }
      return {
        type,
        payload: {
          name,
          passcode: data.customPasscode,
          createdBy: userId,
          metadata,
        },
      };
    case 'onetime':
      return {
        type,
        payload: {
          name,
          validityHours: data.validityHours || 6,
          createdBy: userId,
          metadata,
        },
      };
    default:
      throw makeServiceError('Unsupported passcode type', 400);
  }
}

async function createPasscodeForBooking(roomId, booking, data, userId) {
  const { type, payload } = buildBookingPasscodePayload(booking, data, userId);

  switch (type) {
    case 'temporary':
      return passcodeService.createTemporaryPasscode(roomId, payload);
    case 'custom_temporary':
      return passcodeService.createCustomTemporaryPasscode(roomId, payload);
    case 'permanent':
      return passcodeService.createPermanentPasscode(roomId, payload);
    case 'custom_permanent':
      return passcodeService.createCustomPermanentPasscode(roomId, payload);
    case 'onetime':
      return passcodeService.createOneTimePasscode(roomId, payload);
    default:
      throw makeServiceError('Unsupported passcode type', 400);
  }
}

export async function generateBookingPasscode(roomId, bookingId, userId, data = {}, userData = {}) {
  try {
    const booking = await bookingModel.getBookingByRoomAndId(roomId, bookingId);
    if (!booking) {
      throw makeServiceError('Booking not found', 404);
    }

    if (booking.status !== 'active') {
      throw makeServiceError('Only approved bookings can receive passcodes', 400);
    }

    if (booking.passcode_log_id) {
      throw makeServiceError('Passcode already generated for this booking', 409);
    }

    const passcode = await createPasscodeForBooking(roomId, booking, data, userId);
    if (!passcode?.id) {
      throw makeServiceError('Failed to create booking passcode log', 500);
    }

    const linked = await bookingModel.linkBookingPasscode(
      roomId,
      bookingId,
      passcode.id,
      userId
    );
    if (!linked) {
      throw makeServiceError('Passcode already generated for this booking', 409);
    }

    const refreshed = await bookingModel.getBookingByRoomAndId(roomId, bookingId);
    const [decorated] = await decorateBookings([refreshed], userId);
    const room = await getRoomForNotification(roomId);
    const [actorLabel, bookingWithRequester] = await Promise.all([
      getUserNotificationLabel(userId, userData),
      withRequesterLabel(refreshed),
    ]);

    await bookingNotificationService.notifyBookingPasscodeGenerated({
      room,
      booking: bookingWithRequester,
      passcode,
      actorId: userId,
      actorLabel,
    });
    await bookingNotificationService.notifyRequesterBookingPasscodeGenerated({
      room,
      booking: bookingWithRequester,
      passcode,
      actorId: userId,
      actorLabel,
    });

    return {
      booking: decorated,
      passcode,
    };
  } catch (error) {
    logger.error('Error in generateBookingPasscode service:', error);
    throw error;
  }
}
