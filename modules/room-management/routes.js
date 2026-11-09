/**
 * Room Management Module Routes
 * Mengelola ruangan, passcode, dan fingerprint untuk smart lock integration
 */

import express from 'express';
import { validateJWT } from '../../core/auth/jwt-validator.js';
import { requireRole } from '../user-management/middleware/roleValidator.js';
import * as roomController from './controllers/roomController.js';
import * as passcodeController from './controllers/passcodeController.js';
import * as fingerprintController from './controllers/fingerprintController.js';
import * as fingerprintSessionController from './controllers/fingerprintSessionController.js';
import * as roomBookingController from './controllers/roomBookingController.js';
import * as telegramController from './controllers/telegramController.js';
import {
  validateCreateRoom,
  validateUpdateRoom,
  validateUuidParams,
} from './middleware/roomValidator.js';
import {
  validateCreateBooking,
  validateCreatePublicBooking,
  validateConflictCheck,
  validateRejectBooking,
  validateBookingParams,
  validateRoomParams,
} from './middleware/roomBookingValidator.js';
import {
  validateCreatePermanentPasscode,
  validateCreateTemporaryPasscode,
  validateCreateOneTimePasscode,
  validateUpdatePasscodeName,
  validateListPasscodesQuery,
} from './middleware/passcodeValidator.js';
import {
  validateListFingerprintsQuery,
  validateCreateSession,
  validateSessionId,
} from './middleware/fingerprintValidator.js';

import * as cardController from './controllers/cardController.js';
import * as practicumScheduleSyncController from './controllers/practicumScheduleSyncController.js';
import {
  validateAddCard,
  validateBulkAddCard,
  validateListCardsQuery,
  validateListCardLogsQuery,
} from './middleware/cardValidator.js';
import { validatePracticumScheduleSync } from './middleware/practicumScheduleSyncValidator.js';

const router = express.Router();
const ROOM_ADMIN_ROLES = ['kaur_lab', 'laboran', 'tpa'];

/**
 * Module health check
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    module: 'room-management',
    message: 'Room Management module is running',
  });
});

/**
 * Create public room booking request without JWT.
 * Temporary fallback while auth gateway is unavailable.
 * POST /api/room-management/public/rooms/:roomId/bookings
 */
router.post(
  '/public/rooms/:roomId/bookings',
  validateRoomParams,
  validateCreatePublicBooking,
  roomBookingController.createPublicRoomBooking
);

// ==================== Telegram Routes ====================

router.post(
  '/telegram/link-code',
  validateJWT,
  telegramController.createLinkCode
);

router.get(
  '/telegram/status',
  validateJWT,
  telegramController.getStatus
);

router.delete(
  '/telegram/link',
  validateJWT,
  telegramController.unlink
);

router.post(
  '/telegram/webhook',
  telegramController.webhook
);

router.post(
  '/telegram/webhook/register',
  validateJWT,
  requireRole(...ROOM_ADMIN_ROLES),
  telegramController.registerWebhook
);

// ==================== Room Routes ====================

/**
 * Get all rooms
 * GET /api/room-management/rooms
 */
router.get('/rooms', validateJWT, roomController.getAllRooms);

/**
 * Get room by ID
 * GET /api/room-management/rooms/:id
 */
router.get('/rooms/:id', validateJWT, validateUuidParams, roomController.getRoomById);

/**
 * Get battery level of a room's smart lock
 * GET /api/room-management/rooms/:roomId/battery
 */
router.get('/rooms/:roomId/battery', validateJWT, roomController.getBatteryLevel);

/**
 * Sync TTLock account locks and passcodes (Kaur/Laboran/TPA only)
 * POST /api/room-management/rooms/sync-ttlock-account
 */
router.post(
  '/rooms/sync-ttlock-account',
  validateJWT,
  requireRole(...ROOM_ADMIN_ROLES),
  roomController.syncTtlockAccount
);

/**
 * Sync assigned practicum schedules to room bookings + TTLock access
 * POST /api/room-management/practicum-schedules/sync
 */
router.post(
  '/practicum-schedules/sync',
  validateJWT,
  requireRole(...ROOM_ADMIN_ROLES),
  validatePracticumScheduleSync,
  practicumScheduleSyncController.syncPracticumSchedules
);

/**
 * List current user's room bookings across rooms.
 * GET /api/room-management/bookings/me?status=pending
 */
router.get(
  '/bookings/me',
  validateJWT,
  roomBookingController.listMyRoomBookings
);

/**
 * List active and pending room bookings for calendar schedule.
 * GET /api/room-management/bookings/schedule?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&roomId=optional
 */
router.get(
  '/bookings/schedule',
  validateJWT,
  roomBookingController.listRoomBookingSchedule
);

/**
 * List all room bookings across rooms (Kaur/Laboran/TPA only)
 * GET /api/room-management/bookings?status=pending
 */
router.get(
  '/bookings',
  validateJWT,
  requireRole(...ROOM_ADMIN_ROLES),
  roomBookingController.listAdminRoomBookings
);

/**
 * List room bookings (Laboran & Mahasiswa)
 * GET /api/room-management/rooms/:roomId/bookings
 */
router.get(
  '/rooms/:roomId/bookings',
  validateJWT,
  validateRoomParams,
  roomBookingController.listRoomBookings
);

/**
 * Create room booking (Laboran & Mahasiswa)
 * POST /api/room-management/rooms/:roomId/bookings
 */
router.post(
  '/rooms/:roomId/bookings',
  validateJWT,
  validateRoomParams,
  validateCreateBooking,
  roomBookingController.createRoomBooking
);

/**
 * Check booking conflict (Laboran & Mahasiswa)
 * POST /api/room-management/rooms/:roomId/bookings/conflicts
 */
router.post(
  '/rooms/:roomId/bookings/conflicts',
  validateJWT,
  validateRoomParams,
  validateConflictCheck,
  roomBookingController.checkRoomBookingConflict
);

/**
 * Approve pending booking (Kaur/Laboran/TPA only)
 * PATCH /api/room-management/rooms/:roomId/bookings/:bookingId/approve
 */
router.patch(
  '/rooms/:roomId/bookings/:bookingId/approve',
  validateJWT,
  requireRole(...ROOM_ADMIN_ROLES),
  validateBookingParams,
  roomBookingController.approveRoomBooking
);

/**
 * Reject pending booking (Kaur/Laboran/TPA only)
 * PATCH /api/room-management/rooms/:roomId/bookings/:bookingId/reject
 */
router.patch(
  '/rooms/:roomId/bookings/:bookingId/reject',
  validateJWT,
  requireRole(...ROOM_ADMIN_ROLES),
  validateBookingParams,
  validateRejectBooking,
  roomBookingController.rejectRoomBooking
);

/**
 * Generate passcode for approved booking (Kaur/Laboran/TPA only)
 * POST /api/room-management/rooms/:roomId/bookings/:bookingId/passcode
 */
router.post(
  '/rooms/:roomId/bookings/:bookingId/passcode',
  validateJWT,
  requireRole(...ROOM_ADMIN_ROLES),
  validateBookingParams,
  roomBookingController.generateRoomBookingPasscode
);

/**
 * Cancel booking (Laboran & Mahasiswa)
 * DELETE /api/room-management/rooms/:roomId/bookings/:bookingId
 */
router.delete(
  '/rooms/:roomId/bookings/:bookingId',
  validateJWT,
  validateBookingParams,
  roomBookingController.cancelRoomBooking
);

/**
 * Create a new room (Kaur/Laboran/TPA only)
 * POST /api/room-management/rooms
 */
router.post(
  '/rooms',
  validateJWT,
  requireRole(...ROOM_ADMIN_ROLES),
  validateCreateRoom,
  roomController.createRoom
);

/**
 * Update a room (Kaur/Laboran/TPA only)
 * PUT /api/room-management/rooms/:id
 */
router.put(
  '/rooms/:id',
  validateJWT,
  requireRole(...ROOM_ADMIN_ROLES),
  validateUuidParams,
  validateUpdateRoom,
  roomController.updateRoom
);

/**
 * Delete a room (Kaur/Laboran/TPA only)
 * DELETE /api/room-management/rooms/:id
 */
router.delete(
  '/rooms/:id',
  validateJWT,
  requireRole(...ROOM_ADMIN_ROLES),
  validateUuidParams,
  roomController.deleteRoom
);

/**
 * Mark room as occupied
 * PATCH /api/room-management/rooms/:id/occupy
 */
router.patch(
  '/rooms/:id/occupy',
  validateJWT,
  validateUuidParams,
  roomController.occupyRoom
);

/**
 * Mark room as vacant
 * PATCH /api/room-management/rooms/:id/vacate
 */
router.patch(
  '/rooms/:id/vacate',
  validateJWT,
  validateUuidParams,
  roomController.vacateRoom
);

// ==================== Passcode Routes ====================

/**
 * Get list of all passcodes for a room
 * GET /api/room-management/rooms/:roomId/passcodes
 */
router.get(
  '/rooms/:roomId/passcodes',
  validateJWT,
  validateListPasscodesQuery,
  passcodeController.getPasscodeList
);

/**
 * Create a permanent passcode
 * POST /api/room-management/rooms/:roomId/passcodes/permanent
 */
router.post(
  '/rooms/:roomId/passcodes/permanent',
  validateJWT,
  // TODO: Add role check
  validateCreatePermanentPasscode,
  passcodeController.createPermanentPasscode
);

/**
 * Create a temporary passcode (with start and end date)
 * POST /api/room-management/rooms/:roomId/passcodes/temporary
 */
router.post(
  '/rooms/:roomId/passcodes/temporary',
  validateJWT,
  // TODO: Add role check
  validateCreateTemporaryPasscode,
  passcodeController.createTemporaryPasscode
);

/**
 * Create a one-time passcode (valid for X hours)
 * POST /api/room-management/rooms/:roomId/passcodes/onetime
 */
router.post(
  '/rooms/:roomId/passcodes/onetime',
  validateJWT,
  // TODO: Add role check
  validateCreateOneTimePasscode,
  passcodeController.createOneTimePasscode
);

/**
 * Delete a passcode
 * DELETE /api/room-management/rooms/:roomId/passcodes/:passcodeId
 */
router.delete(
  '/rooms/:roomId/passcodes/:passcodeId',
  validateJWT,
  // TODO: Add role check
  passcodeController.deletePasscode
);

/**
 * Update passcode name
 * PATCH /api/room-management/rooms/:roomId/passcodes/:passcodeId/name
 */
router.patch(
  '/rooms/:roomId/passcodes/:passcodeId/name',
  validateJWT,
  // TODO: Add role check
  validateUpdatePasscodeName,
  passcodeController.updatePasscodeName
);

/**
 * Create a custom temporary passcode (user-defined 4-9 digit passcode with time period)
 * POST /api/room-management/rooms/:roomId/passcodes/custom/temporary
 */
router.post(
  '/rooms/:roomId/passcodes/custom/temporary',
  validateJWT,
  // TODO: Add role check
  // Validation akan dilakukan di controller
  passcodeController.createCustomTemporaryPasscode
);

/**
 * Create a custom permanent passcode (user-defined 4-9 digit passcode, permanent)
 * POST /api/room-management/rooms/:roomId/passcodes/custom/permanent
 */
router.post(
  '/rooms/:roomId/passcodes/custom/permanent',
  validateJWT,
  // TODO: Add role check
  // Validation akan dilakukan di controller
  passcodeController.createCustomPermanentPasscode
);

// ==================== Fingerprint Routes ====================

/**
 * Get fingerprint list for a room
 * GET /api/room-management/rooms/:roomId/fingerprints
 */
router.get(
  '/rooms/:roomId/fingerprints',
  validateJWT,
  validateListFingerprintsQuery,
  fingerprintController.getFingerprintList
);

/**
 * Delete a fingerprint
 * DELETE /api/room-management/rooms/:roomId/fingerprints/:fingerprintId
 */
router.delete(
  '/rooms/:roomId/fingerprints/:fingerprintId',
  validateJWT,
  // TODO: Add role check for admin only
  fingerprintController.deleteFingerprint
);

// ==================== Fingerprint Session Routes ====================

/**
 * Create a fingerprint registration session
 * POST /api/room-management/fingerprint-sessions
 */
router.post(
  '/fingerprint-sessions',
  validateJWT,
  validateCreateSession,
  fingerprintSessionController.createSession
);

/**
 * Get all fingerprint sessions
 * GET /api/room-management/fingerprint-sessions
 */
router.get(
  '/fingerprint-sessions',
  validateJWT,
  fingerprintSessionController.getAllSessions
);

/**
 * Get fingerprint session by ID
 * GET /api/room-management/fingerprint-sessions/:sessionId
 */
router.get(
  '/fingerprint-sessions/:sessionId',
  validateJWT,
  validateSessionId,
  fingerprintSessionController.getSession
);

/**
 * Check session for newly enrolled fingerprints
 * POST /api/room-management/fingerprint-sessions/:sessionId/check
 */
router.post(
  '/fingerprint-sessions/:sessionId/check',
  validateJWT,
  validateSessionId,
  fingerprintSessionController.checkSession
);

/**
 * Cancel a fingerprint registration session
 * PATCH /api/room-management/fingerprint-sessions/:sessionId/cancel
 */
router.patch(
  '/fingerprint-sessions/:sessionId/cancel',
  validateJWT,
  validateSessionId,
  fingerprintSessionController.cancelSession
);

// ==================== IC Card Routes ====================

/**
 * Add IC card to multiple room locks
 * POST /api/room-management/cards/bulk
 */
router.post(
  '/cards/bulk',
  validateJWT,
  requireRole(...ROOM_ADMIN_ROLES),
  validateBulkAddCard,
  cardController.addCardBulk
);

/**
 * Get IC card audit logs for a room
 * GET /api/room-management/rooms/:roomId/card-logs
 */
router.get(
  '/rooms/:roomId/card-logs',
  validateJWT,
  validateListCardLogsQuery,
  cardController.getCardLogList
);

/**
 * Get IC card list for a room
 * GET /api/room-management/rooms/:roomId/cards
 */
router.get(
  '/rooms/:roomId/cards',
  validateJWT,
  validateListCardsQuery,
  cardController.getCardList
);

/**
 * Add IC card to a room's lock
 * POST /api/room-management/rooms/:roomId/cards
 */
router.post(
  '/rooms/:roomId/cards',
  validateJWT,
  validateAddCard,
  cardController.addCard
);

/**
 * Delete an IC card
 * DELETE /api/room-management/rooms/:roomId/cards/:cardId
 */
router.delete(
  '/rooms/:roomId/cards/:cardId',
  validateJWT,
  requireRole(...ROOM_ADMIN_ROLES),
  cardController.deleteCard
);

export default router;
