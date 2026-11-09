/**
 * Practicum Schedule Sync Service
 * Publishes assigned registration schedules to room_bookings and provisions TTLock access.
 */

import { registrationDb, userManagementDb } from '../../../config/databases.js';
import { logger } from '../../../core/utils/logger.js';
import * as roomModel from '../models/roomModel.js';
import * as bookingModel from '../models/roomBookingModel.js';
import * as passcodeService from './passcodeService.js';
import * as cardService from './cardService.js';
import * as cardModel from '../models/cardModel.js';
import * as passcodeModel from '../models/passcodeModel.js';
import { resolveSemesterCodeFilter } from '../../conduct/services/registrationPlotScheduleService.js';
import {
  formatWibNaiveTimestamp,
  normalizeTimePart,
  toWibNaiveFromInstant,
  wibToUtcTimestamp,
} from './timezoneUtil.js';

function makeServiceError(message, statusCode = 400, data = null) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (data) error.data = data;
  return error;
}

function normalizeText(value) {
  return String(value ?? '').trim().toLowerCase();
}

function digitsOnly(value) {
  return String(value ?? '').replace(/\D/g, '');
}

/**
 * Match schedule NIM (Excel: numeric) to profile nipnim (e.g. H1D022001).
 */
function nipnimMatchesAssistantNim(nipnim, nim) {
  const normalizedNim = normalizeText(nim);
  const normalizedNipnim = normalizeText(nipnim);
  if (!normalizedNim || !normalizedNipnim) return false;
  if (normalizedNim === normalizedNipnim) return true;

  const nimDigits = digitsOnly(normalizedNim);
  const nipnimDigits = digitsOnly(normalizedNipnim);
  if (!nimDigits || !nipnimDigits) return false;
  if (nimDigits === nipnimDigits) return true;

  const minSuffixLength = 6;
  if (nimDigits.length >= minSuffixLength && nipnimDigits.endsWith(nimDigits)) {
    return true;
  }
  if (nipnimDigits.length >= minSuffixLength && nimDigits.endsWith(nipnimDigits)) {
    return true;
  }

  return false;
}

function hasKartuAkses(profile) {
  const value = profile?.kartu_akses_number;
  return value != null && String(value).trim() !== '';
}

function buildScheduleTimes(schedule) {
  const tanggal = schedule.tanggal;
  const jamMulai = schedule.jam_mulai;
  const jamBerakhir = schedule.jam_berakhir;

  // Excel/import wall-clock (WIB) is authoritative for room_bookings (timestamp without TZ).
  if (tanggal && jamMulai && jamBerakhir) {
    const startRaw = `${tanggal}T${normalizeTimePart(jamMulai)}+07:00`;
    const endRaw = `${tanggal}T${normalizeTimePart(jamBerakhir)}+07:00`;
    return {
      startTime: new Date(startRaw),
      endTime: new Date(endRaw),
      startTimeNaive: formatWibNaiveTimestamp(tanggal, jamMulai),
      endTimeNaive: formatWibNaiveTimestamp(tanggal, jamBerakhir),
    };
  }

  if (schedule.start_time && schedule.end_time) {
    const startTime = new Date(schedule.start_time);
    const endTime = new Date(schedule.end_time);
    return {
      startTime,
      endTime,
      startTimeNaive: toWibNaiveFromInstant(startTime),
      endTimeNaive: toWibNaiveFromInstant(endTime),
    };
  }

  throw makeServiceError('Schedule is missing date or time fields');
}

function buildBookingDescription(schedule) {
  const parts = [
    schedule.detail_kegiatan,
    schedule.practicum_name,
    schedule.module_name,
    schedule.kelas ? `Kelas: ${schedule.kelas}` : null,
  ].filter(Boolean);
  return parts.join(' — ') || 'Practicum schedule';
}

async function scheduleHasColumn(columnName) {
  const result = await registrationDb.query(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'schedules'
       AND column_name = $1
     LIMIT 1`,
    [columnName]
  );
  return result.rowCount > 0;
}

async function fetchSchedulesForSync(semesterCode, forceResync = false) {
  const normalizedSemesterCode = await resolveSemesterCodeFilter(semesterCode);
  const hasSemesterCode = await scheduleHasColumn('semester_code');

  const values = [];
  let semesterFilter = '';
  if (normalizedSemesterCode && hasSemesterCode) {
    values.push(normalizedSemesterCode);
    semesterFilter = `AND s.semester_code = $${values.length}`;
  }

  const result = await registrationDb.query(
    `SELECT
       s.id,
       s.module_id,
       s.tanggal,
       s.jam_mulai,
       s.jam_berakhir,
       s.detail_kegiatan,
       s.kelas,
       s.venue,
       s.start_time,
       s.end_time,
       s.ttlock_sync_status,
       pm.name AS module_name,
       p.name AS practicum_name,
       COALESCE(
         (SELECT json_agg(
           json_build_object('user_id', sa.user_id, 'nim', sa.nim)
           ORDER BY sa.created_at
         )
          FROM schedule_assistants sa
          WHERE sa.schedule_id = s.id),
         '[]'::json
       ) AS assistants
     FROM schedules s
     LEFT JOIN practicum_modules pm ON pm.id = s.module_id
     LEFT JOIN practicums p ON p.id = pm.practicum_id
     WHERE s.venue IS NOT NULL
       AND TRIM(s.venue) <> ''
       AND s.tanggal IS NOT NULL
       AND s.jam_mulai IS NOT NULL
       AND s.jam_berakhir IS NOT NULL
       ${forceResync ? '' : "AND COALESCE(s.ttlock_sync_status, 'not_sync') = 'not_sync'"}
       ${semesterFilter}
     ORDER BY s.tanggal ASC, s.jam_mulai ASC`,
    values
  );

  return result.rows;
}

function buildRoomNameIndex(rooms) {
  const index = new Map();
  for (const room of rooms) {
    const key = normalizeText(room.name);
    if (key && !index.has(key)) {
      index.set(key, room);
    }
  }
  return index;
}

function resolveRoomForVenue(venue, roomIndex) {
  const key = normalizeText(venue);
  return key ? roomIndex.get(key) || null : null;
}

async function loadProfilesForAssistants(assistants) {
  const userIds = [];
  const nims = [];

  for (const assistant of assistants) {
    if (assistant?.user_id) userIds.push(String(assistant.user_id).trim());
    if (assistant?.nim) nims.push(String(assistant.nim).trim());
  }

  if (userIds.length === 0 && nims.length === 0) {
    return { byUserId: new Map(), byNipnim: new Map(), allProfiles: [] };
  }

  const normalizedNims = nims.map((nim) => normalizeText(nim));
  const nimDigits = nims.map((nim) => digitsOnly(nim)).filter(Boolean);

  const result = await userManagementDb.query(
    `SELECT user_id, name, nipnim, kartu_akses_number
     FROM user_profiles
     WHERE deleted_at IS NULL
       AND (
         user_id = ANY($1::text[])
         OR lower(nipnim) = ANY($2::text[])
         OR regexp_replace(lower(nipnim), '[^0-9]', '', 'g') = ANY($3::text[])
         OR EXISTS (
           SELECT 1
           FROM unnest($3::text[]) AS nd(n)
           WHERE length(nd.n) >= 6
             AND regexp_replace(lower(nipnim), '[^0-9]', '', 'g') LIKE '%' || nd.n
         )
       )`,
    [
      userIds.length ? userIds : [''],
      normalizedNims.length ? normalizedNims : [''],
      nimDigits.length ? nimDigits : [''],
    ]
  );

  const byUserId = new Map();
  const byNipnim = new Map();
  for (const row of result.rows) {
    byUserId.set(normalizeText(row.user_id), row);
    if (row.nipnim) {
      byNipnim.set(normalizeText(row.nipnim), row);
    }
  }

  return { byUserId, byNipnim, allProfiles: result.rows };
}

function resolveAssistantProfiles(assistants, profileMaps) {
  const matched = [];

  for (const assistant of assistants) {
    let profile = null;
    if (assistant?.user_id) {
      profile = profileMaps.byUserId.get(normalizeText(assistant.user_id)) || null;
    }
    if (!profile && assistant?.nim) {
      profile = profileMaps.byNipnim.get(normalizeText(assistant.nim)) || null;
    }
    if (!profile && assistant?.nim) {
      profile =
        (profileMaps.allProfiles || []).find((row) =>
          nipnimMatchesAssistantNim(row.nipnim, assistant.nim)
        ) || null;
    }
    if (profile) {
      matched.push({
        userId: profile.user_id,
        name: profile.name,
        nipnim: profile.nipnim,
        kartuAksesNumber: profile.kartu_akses_number,
        sourceNim: assistant.nim || null,
        hasKartuAkses: hasKartuAkses(profile),
      });
    }
  }

  return matched;
}

function decideAccessMode(matchedAssistants) {
  if (matchedAssistants.length === 0) {
    return {
      mode: 'passcode',
      reason: 'No assistant NIM matched a user profile',
      rfidAssistants: [],
      needsPasscode: true,
    };
  }

  const rfidAssistants = matchedAssistants.filter((assistant) => assistant.hasKartuAkses);
  const missingKartu = matchedAssistants.filter((assistant) => !assistant.hasKartuAkses);

  if (rfidAssistants.length === 0) {
    return {
      mode: 'passcode',
      reason: 'Matched assistant(s) have no kartu akses on profile',
      rfidAssistants: [],
      needsPasscode: true,
    };
  }

  if (missingKartu.length > 0) {
    return {
      mode: 'rfid+passcode',
      reason:
        'RFID for assistant(s) with kartu akses; passcode for assistant(s) without kartu',
      rfidAssistants,
      needsPasscode: true,
    };
  }

  return {
    mode: 'rfid',
    reason: 'All matched assistants have kartu akses',
    rfidAssistants,
    needsPasscode: false,
  };
}

function getScheduleAccessWindow(schedule) {
  const { startTime, endTime, startTimeNaive, endTimeNaive } = buildScheduleTimes(schedule);
  return { startTime, endTime, startTimeNaive, endTimeNaive };
}

async function removeExistingPracticumSyncCardsForSchedule({
  roomId,
  scheduleId,
  userId,
}) {
  const logs = await cardModel.findActivePracticumSyncCardLogs(roomId, scheduleId);
  const removedCardIds = new Set();

  for (const log of logs) {
    if (removedCardIds.has(log.card_id)) continue;
    try {
      await cardService.deleteCard(roomId, log.card_id, userId, 2, log.card_number);
      removedCardIds.add(log.card_id);
    } catch (error) {
      logger.warn('Could not remove prior practicum sync card for schedule', {
        scheduleId,
        cardId: log.card_id,
        error: error.message,
      });
    }
  }

  return removedCardIds.size;
}

async function removeExistingPracticumSyncCardsForCardNumber({
  roomId,
  cardNumber,
  userId,
}) {
  const logs = await cardModel.findActivePracticumSyncCardLogsByNumber(roomId, cardNumber);
  const removedCardIds = new Set();

  for (const log of logs) {
    if (removedCardIds.has(log.card_id)) continue;
    try {
      await cardService.deleteCard(roomId, log.card_id, userId, 2, log.card_number);
      removedCardIds.add(log.card_id);
    } catch (error) {
      logger.warn('Could not remove prior practicum sync card for kartu', {
        roomId,
        cardNumber,
        cardId: log.card_id,
        error: error.message,
      });
    }
  }

  return removedCardIds.size;
}

function buildPracticumPasscodeName(schedule, booking) {
  return `Practicum: ${schedule.detail_kegiatan || schedule.module_name || booking.id}`;
}

async function cleanupStalePracticumPasscodesForRoom(roomId, userId) {
  const logs = await passcodeModel.findActivePracticumSyncPasscodeLogsByRoom(roomId);
  const removed = new Set();

  for (const log of logs) {
    if (log.passcode_id == null || removed.has(log.passcode_id)) continue;
    try {
      await passcodeService.deletePasscode(roomId, log.passcode_id, userId);
      removed.add(log.passcode_id);
    } catch (error) {
      logger.warn('Could not remove stale practicum passcode on room', {
        roomId,
        passcodeId: log.passcode_id,
        error: error.message,
      });
    }
  }

  return removed.size;
}

async function removeExistingPracticumSyncPasscodes({
  roomId,
  scheduleId,
  passcodeName,
  userId,
}) {
  const bySchedule = await passcodeModel.findActivePracticumSyncPasscodeLogs(roomId, scheduleId);
  const byName = await passcodeModel.findActivePracticumSyncPasscodeLogsByName(roomId, passcodeName);
  const toRemove = new Map();

  for (const log of [...bySchedule, ...byName]) {
    if (log.passcode_id != null) {
      toRemove.set(log.passcode_id, log);
    }
  }

  for (const log of toRemove.values()) {
    try {
      await passcodeService.deletePasscode(roomId, log.passcode_id, userId);
    } catch (error) {
      logger.warn('Could not remove prior practicum sync passcode', {
        scheduleId,
        passcodeId: log.passcode_id,
        passcodeName: log.passcode_name,
        error: error.message,
      });
    }
  }

  return toRemove.size;
}

/**
 * Register RFID cards on TTLock locks.
 * Multiple schedules sharing the same room+cardNumber get merged into
 * one card entry spanning the earliest start → latest end time window
 * (TTLock only supports one entry per physical card number per lock).
 */
async function provisionRfidPerSchedule({
  schedules,
  results,
  userId,
  dryRun = false,
}) {
  const scheduleById = new Map(schedules.map((schedule) => [schedule.id, schedule]));
  const syncedResults = results
    .filter(
      (result) =>
        (result.status === 'synced' || result.status === 're_synced') &&
        String(result.accessMode || '').includes('rfid')
    )
    .sort((a, b) => {
      const scheduleA = scheduleById.get(a.scheduleId);
      const scheduleB = scheduleById.get(b.scheduleId);
      const startA = scheduleA ? getScheduleAccessWindow(scheduleA).startTimeNaive : '';
      const startB = scheduleB ? getScheduleAccessWindow(scheduleB).startTimeNaive : '';
      return String(startA).localeCompare(String(startB));
    });

  if (syncedResults.length === 0) {
    return [];
  }

  // Group by (roomId, cardNumber) — TTLock hanya mendukung satu entry per kartu per lock
  const groups = new Map();

  for (const result of syncedResults) {
    const schedule = scheduleById.get(result.scheduleId);
    if (!schedule) continue;

    const { startTimeNaive, endTimeNaive } = getScheduleAccessWindow(schedule);
    const assistants = Array.isArray(result.rfidAssistants) ? result.rfidAssistants : [];
    const scheduleLabel = schedule.detail_kegiatan || schedule.module_name || schedule.tanggal;

    for (const assistant of assistants) {
      if (!assistant?.hasKartuAkses) continue;
      const cardNumber = String(assistant.kartuAksesNumber).trim();
      const cardKey = `${result.roomId}:${cardNumber}`;

      if (!groups.has(cardKey)) {
        groups.set(cardKey, {
          roomId: result.roomId,
          cardNumber,
          assistant,
          entries: [],
        });
      }

      groups.get(cardKey).entries.push({
        result,
        schedule,
        scheduleLabel,
        startTimeNaive,
        endTimeNaive,
        cardName: `${assistant.name || assistant.nipnim || 'Assistant'} (${scheduleLabel})`,
      });
    }
  }

  const provisioned = [];

  for (const group of groups.values()) {
    // Hitung window gabungan: start paling awal, end paling akhir
    let mergedStart = group.entries[0].startTimeNaive;
    let mergedEnd = group.entries[0].endTimeNaive;
    const scheduleIds = new Set();
    for (const entry of group.entries) {
      scheduleIds.add(entry.schedule.id);
      if (entry.startTimeNaive < mergedStart) mergedStart = entry.startTimeNaive;
      if (entry.endTimeNaive > mergedEnd) mergedEnd = entry.endTimeNaive;
    }
    const mergedLabel = `${group.assistant.name || group.assistant.nipnim || 'Assistant'} (${scheduleIds.size} jadwal)`;

    if (dryRun) {
      for (const entry of group.entries) {
        provisioned.push({
          scheduleId: entry.schedule.id,
          roomId: group.roomId,
          cardNumber: group.cardNumber,
          startTimeNaive: mergedStart,
          endTimeNaive: mergedEnd,
          onLock: true,
          dryRun: true,
          merged: scheduleIds.size > 1,
        });
      }
      continue;
    }

    try {
      const room = await roomModel.getRoomById(group.roomId);
      if (!room?.door_lock_id) {
        throw makeServiceError(`Room for lock provisioning does not have a smart lock configured`);
      }

      // Remove every prior practicum-sync card for this kartu on the lock,
      // then always re-add via TTLock so the physical lock stays in sync.
      await removeExistingPracticumSyncCardsForCardNumber({
        roomId: group.roomId,
        cardNumber: group.cardNumber,
        userId,
      });

      const card = await cardService.addCard(group.roomId, {
        cardNumber: group.cardNumber,
        cardName: mergedLabel,
        startDate: mergedStart,
        endDate: mergedEnd,
        createdBy: userId,
        persistLog: false,
        metadata: {
          source: 'practicum_schedule_sync',
          mergedScheduleIds: [...scheduleIds],
          nipnim: group.assistant.nipnim,
          onLock: true,
        },
      });

      // Log ke database untuk setiap schedule agar semua terlihat di web
      for (const entry of group.entries) {
        await cardModel.logCardCreation({
          roomId: group.roomId,
          lockId: room.door_lock_id,
          cardId: card.cardId,
          cardNumber: group.cardNumber,
          cardName: entry.cardName,
          startDate: mergedStart,
          endDate: mergedEnd,
          createdBy: userId,
          metadata: {
            source: 'practicum_schedule_sync',
            registrationScheduleId: entry.schedule.id,
            bookingId: entry.result.bookingId,
            nipnim: group.assistant.nipnim,
            onLock: true,
            mergedWindow: true,
            mergedScheduleIds: [...scheduleIds],
          },
        });

        if (entry.result.bookingId) {
          await bookingModel.appendBookingSyncMetadata(entry.result.bookingId, {
            rfidCardId: card.cardId,
            rfidCardNumber: group.cardNumber,
            scheduleWindow: {
              start: mergedStart,
              end: mergedEnd,
            },
            onLock: true,
            mergedWindow: true,
          });
        }

        provisioned.push({
          scheduleId: entry.schedule.id,
          roomId: group.roomId,
          cardNumber: group.cardNumber,
          cardId: card.cardId,
          startTimeNaive: mergedStart,
          endTimeNaive: mergedEnd,
          onLock: true,
          merged: scheduleIds.size > 1,
        });
      }
    } catch (error) {
      logger.error('Failed to provision practicum RFID', {
        roomId: group.roomId,
        cardNumber: group.cardNumber,
        scheduleIds: [...scheduleIds],
        error: error.message,
      });
      for (const entry of group.entries) {
        provisioned.push({
          scheduleId: entry.schedule.id,
          roomId: group.roomId,
          cardNumber: group.cardNumber,
          failed: true,
          reason: error.message,
        });
      }
    }
  }

  return provisioned;
}

async function markScheduleSynced(scheduleId) {
  await registrationDb.query(
    `UPDATE schedules
     SET ttlock_sync_status = 'sync', updated_at = NOW()
     WHERE id = $1`,
    [scheduleId]
  );
}

async function markScheduleNotSynced(scheduleId) {
  await registrationDb.query(
    `UPDATE schedules
     SET ttlock_sync_status = 'not_sync', updated_at = NOW()
     WHERE id = $1`,
    [scheduleId]
  );
}

function applyRfidProvisioningFailures(results, rfidProvisioning) {
  const failuresByScheduleId = new Map();
  for (const entry of rfidProvisioning) {
    if (!entry?.failed || !entry.scheduleId) continue;
    failuresByScheduleId.set(entry.scheduleId, entry.reason || 'Failed to provision RFID on lock');
  }
  if (failuresByScheduleId.size === 0) {
    return { failed: 0, syncedDelta: 0, reSyncedDelta: 0 };
  }

  let failed = 0;
  let syncedDelta = 0;
  let reSyncedDelta = 0;

  for (const result of results) {
    const reason = failuresByScheduleId.get(result.scheduleId);
    if (!reason || !String(result.accessMode || '').includes('rfid')) continue;

    if (result.status === 'synced') syncedDelta += 1;
    if (result.status === 're_synced') reSyncedDelta += 1;

    result.status = 'failed';
    result.reason = reason;
    failed += 1;
  }

  return { failed, syncedDelta, reSyncedDelta };
}

async function provisionPasscode({ roomId, booking, schedule, userId, forceReplace = false }) {
  const { startTimeNaive, endTimeNaive } = getScheduleAccessWindow(schedule);
  const passcodeName = buildPracticumPasscodeName(schedule, booking);

  await removeExistingPracticumSyncPasscodes({
    roomId,
    scheduleId: schedule.id,
    passcodeName,
    userId,
  });

  const passcode = await passcodeService.createTemporaryPasscode(roomId, {
    name: passcodeName,
    startDate: startTimeNaive,
    endDate: endTimeNaive,
    createdBy: userId,
    metadata: {
      bookingId: booking.id,
      registrationScheduleId: schedule.id,
      source: 'practicum_schedule_sync',
    },
  });

  if (forceReplace) {
    await bookingModel.relinkBookingPasscode(roomId, booking.id, passcode.id, userId);
  } else {
    await bookingModel.linkBookingPasscode(roomId, booking.id, passcode.id, userId);
  }
  return passcode;
}

async function applyAccessProvisioning({
  roomId,
  booking,
  schedule,
  accessDecision,
  matchedAssistants,
  userId,
  startTime,
  endTime,
  venue,
  forceResync = false,
}) {
  let accessDetails = {};

  if (accessDecision.needsPasscode) {
    const passcode = await provisionPasscode({
      roomId,
      booking,
      schedule,
      userId,
      forceReplace: forceResync,
    });
    accessDetails.passcodeId = passcode.passcodeId;
    accessDetails.passcodeLogId = passcode.id;
  }

  await bookingModel.updateBookingSyncMetadata(booking.id, accessDecision.mode, {
    accessReason: accessDecision.reason,
    matchedAssistants,
    rfidAssistants: accessDecision.rfidAssistants,
    venue,
    accessWindow: {
      start: startTime.toISOString(),
      end: endTime.toISOString(),
    },
    ...accessDetails,
  });
  await markScheduleSynced(schedule.id);

  return accessDetails;
}

async function processSchedule({
  schedule,
  roomIndex,
  userId,
  dryRun,
  forceResync = false,
}) {
  const existingBooking = await bookingModel.findBookingByRegistrationScheduleId(schedule.id, 'active');
  if (existingBooking && !forceResync) {
    return {
      scheduleId: schedule.id,
      status: 'skipped',
      reason: 'Booking already exists for this schedule',
      bookingId: existingBooking.id,
    };
  }

  if (!forceResync && schedule.ttlock_sync_status === 'sync' && !existingBooking) {
    return {
      scheduleId: schedule.id,
      status: 'skipped',
      reason: 'Schedule already marked as synced',
    };
  }

  const room = resolveRoomForVenue(schedule.venue, roomIndex);
  if (!room) {
    return {
      scheduleId: schedule.id,
      status: 'failed',
      reason: `Room not found for venue "${schedule.venue}"`,
    };
  }

  if (!room.door_lock_id) {
    return {
      scheduleId: schedule.id,
      status: 'failed',
      reason: `Room "${room.name}" does not have a smart lock configured`,
    };
  }

  let startTime;
  let endTime;
  let startTimeNaive;
  let endTimeNaive;
  try {
    ({ startTime, endTime, startTimeNaive, endTimeNaive } = buildScheduleTimes(schedule));
  } catch (error) {
    return {
      scheduleId: schedule.id,
      status: 'failed',
      reason: error.message,
    };
  }

  if (!existingBooking) {
    const conflict = await bookingModel.findActiveConflict(room.id, startTimeNaive, endTimeNaive);
    if (conflict) {
      return {
        scheduleId: schedule.id,
        status: 'failed',
        reason: 'Booking time conflict on the same room',
        conflictBookingId: conflict.id,
      };
    }
  }

  const assistants = Array.isArray(schedule.assistants) ? schedule.assistants : [];
  const profileMaps = await loadProfilesForAssistants(assistants);
  const matchedAssistants = resolveAssistantProfiles(assistants, profileMaps);
  const accessDecision = decideAccessMode(matchedAssistants);

  if (dryRun) {
    return {
      scheduleId: schedule.id,
      status: 'dry_run',
      roomId: room.id,
      roomName: room.name,
      accessMode: accessDecision.mode,
      accessReason: accessDecision.reason,
      matchedAssistants,
      rfidAssistants: accessDecision.rfidAssistants,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
    };
  }

  let booking = existingBooking;
  if (booking && forceResync) {
    booking = await bookingModel.updateSyncedBookingTimes(
      booking.id,
      startTimeNaive,
      endTimeNaive
    ) ?? booking;
  }
  if (!booking) {
    const description = buildBookingDescription(schedule);
    booking = await bookingModel.createSyncedBooking({
      roomId: room.id,
      startTime: startTimeNaive,
      endTime: endTimeNaive,
      createdBy: userId,
      description,
      registrationScheduleId: schedule.id,
      accessMode: accessDecision.mode,
      syncMetadata: {
        accessReason: accessDecision.reason,
        matchedAssistants,
        venue: schedule.venue,
      },
    });
  }

  const resultStatus = existingBooking && forceResync ? 're_synced' : 'synced';

  try {
    const accessDetails = await applyAccessProvisioning({
      roomId: room.id,
      booking,
      schedule,
      accessDecision,
      matchedAssistants,
      userId,
      startTime,
      endTime,
      venue: schedule.venue,
      forceResync,
    });

    return {
      scheduleId: schedule.id,
      status: resultStatus,
      bookingId: booking.id,
      roomId: room.id,
      roomName: room.name,
      accessMode: accessDecision.mode,
      accessReason: accessDecision.reason,
      matchedAssistants,
      rfidAssistants: accessDecision.rfidAssistants,
      accessWindow: {
        start: startTime.toISOString(),
        end: endTime.toISOString(),
      },
      ...accessDetails,
    };
  } catch (error) {
    logger.error('Practicum sync failed after booking creation', {
      scheduleId: schedule.id,
      bookingId: booking.id,
      error: error.message,
    });

    await bookingModel.cancelBooking(room.id, booking.id, userId);

    return {
      scheduleId: schedule.id,
      status: 'failed',
      reason: error.message || 'Failed to provision lock access',
      bookingId: booking.id,
    };
  }
}

export async function syncPracticumSchedules({
  semesterCode,
  userId,
  dryRun = false,
  forceResync = false,
}) {
  if (!userId) {
    throw makeServiceError('User ID is required', 401);
  }

  const schedules = await fetchSchedulesForSync(semesterCode, forceResync);
  const rooms = await roomModel.getAllRooms();
  const roomIndex = buildRoomNameIndex(rooms);

  if (forceResync && !dryRun) {
    const roomIds = new Set();
    for (const schedule of schedules) {
      const room = resolveRoomForVenue(schedule.venue, roomIndex);
      if (room?.id) roomIds.add(room.id);
    }
    for (const roomId of roomIds) {
      await cleanupStalePracticumPasscodesForRoom(roomId, userId);
    }
  }

  const results = [];
  let synced = 0;
  let reSynced = 0;
  let planned = 0;
  let skipped = 0;
  let failed = 0;

  for (const schedule of schedules) {
    const result = await processSchedule({
      schedule,
      roomIndex,
      userId,
      dryRun,
      forceResync,
    });
    results.push(result);

    if (result.status === 'synced') {
      synced += 1;
    } else if (result.status === 're_synced') {
      reSynced += 1;
    } else if (result.status === 'dry_run') {
      planned += 1;
    } else if (result.status === 'skipped') {
      skipped += 1;
    } else if (result.status === 'failed') {
      failed += 1;
    }
  }

  const rfidProvisioning = await provisionRfidPerSchedule({
    schedules,
    results,
    userId,
    dryRun,
  });

  if (!dryRun) {
    const rfidFailureStats = applyRfidProvisioningFailures(results, rfidProvisioning);
    failed += rfidFailureStats.failed;
    synced -= rfidFailureStats.syncedDelta;
    reSynced -= rfidFailureStats.reSyncedDelta;

    for (const entry of rfidProvisioning) {
      if (entry?.failed && entry.scheduleId) {
        await markScheduleNotSynced(entry.scheduleId);
      }
    }
  }

  const passcodesProvisioned = results.filter(
    (result) =>
      (result.status === 'synced' || result.status === 're_synced') &&
      result.passcodeLogId
  ).length;

  return {
    total: schedules.length,
    synced,
    reSynced,
    planned,
    skipped,
    failed,
    dryRun,
    forceResync,
    passcodesProvisioned,
    rfidProvisioning,
    ttlockNote:
      'Kartu RFID aktif untuk jadwal yang sedang/akan berjalan. TTLock hanya menampilkan 1 kartu per nomor kartu fisik pada tab Cards.',
    results,
  };
}
