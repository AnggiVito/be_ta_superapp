/**
 * TTLock Account Sync Service
 * Syncs TTLock account locks into rooms and passcodes into passcode_logs.
 */

import { roomManagementDb } from '../../../config/databases.js';
import { logger } from '../../../core/utils/logger.js';
import { ttlockService } from '../../../services/ttlock/ttlockService.js';

const DEFAULT_CAPACITY = 45;
const PAGE_SIZE = 100;

function normalizeCapacity(value) {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) || parsed <= 0 ? DEFAULT_CAPACITY : parsed;
}

function normalizeRoomName(lock) {
  const name = lock.lockAlias || lock.lockName || '';
  const trimmed = String(name).trim();
  if (trimmed.length > 0) {
    return trimmed;
  }
  return `TTLock Lock ${lock.lockId}`;
}

function dedupeLocks(locks) {
  const seen = new Set();
  const unique = [];

  for (const lock of locks) {
    const lockId = lock?.lockId;
    if (lockId === undefined || lockId === null) {
      continue;
    }

    const key = String(lockId);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(lock);
  }

  return unique;
}

function mapPasscodeType(keyboardPwdType) {
  const type = parseInt(keyboardPwdType, 10);
  switch (type) {
    case 1:
      return 'onetime';
    case 2:
      return 'permanent';
    case 3:
      return 'temporary';
    default:
      return null;
  }
}

function parseTtlockDate(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const numeric = Number(value);
  if (!Number.isNaN(numeric) && numeric > 0) {
    return new Date(numeric);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function getPasscodeId(passcode) {
  const value = passcode.keyboardPwdId || passcode.passcodeId || passcode.id;
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function getPasscodeName(passcode, passcodeId) {
  return (
    passcode.keyboardPwdName ||
    passcode.passcodeName ||
    passcode.name ||
    `TTLock Passcode ${passcodeId}`
  );
}

async function getRoomsByDoorLockId() {
  const result = await roomManagementDb.query(
    `SELECT id, name, capacity, is_occupied, door_lock_id
     FROM rooms
     WHERE door_lock_id IS NOT NULL`
  );

  const byDoorLockId = new Map();
  for (const row of result.rows) {
    byDoorLockId.set(String(row.door_lock_id), row);
  }

  return byDoorLockId;
}

async function getExistingCreatedPasscodeIds() {
  const result = await roomManagementDb.query(
    `SELECT DISTINCT passcode_id
     FROM passcode_logs
     WHERE action = 'created'
       AND passcode_id IS NOT NULL`
  );

  return new Set(result.rows.map((row) => String(row.passcode_id)));
}

async function insertRoom(client, lock, defaultCapacity) {
  const result = await client.query(
    `INSERT INTO rooms (name, capacity, is_occupied, door_lock_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, NOW(), NOW())
     RETURNING id, name, capacity, is_occupied, door_lock_id`,
    [normalizeRoomName(lock), defaultCapacity, false, String(lock.lockId)]
  );

  return result.rows[0];
}

async function insertPasscodeLog(client, room, lockId, passcode, createdBy) {
  const passcodeId = getPasscodeId(passcode);
  const passcodeType = mapPasscodeType(passcode.keyboardPwdType);

  if (!passcodeId || !passcodeType) {
    return {
      inserted: false,
      skipped: true,
      reason: !passcodeId ? 'missing_passcode_id' : 'unsupported_passcode_type',
      passcode,
    };
  }

  const result = await client.query(
    `INSERT INTO passcode_logs
     (room_id, lock_id, passcode_id, passcode_name, passcode_type,
      start_date, end_date, created_by, action, metadata, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'created', $9, NOW(), NOW())
     RETURNING *`,
    [
      room.id,
      String(lockId),
      passcodeId,
      getPasscodeName(passcode, passcodeId),
      passcodeType,
      parseTtlockDate(passcode.startDate),
      parseTtlockDate(passcode.endDate),
      createdBy || null,
      JSON.stringify({
        syncedFromTtlock: true,
        ttlockResponse: passcode,
      }),
    ]
  );

  return {
    inserted: true,
    skipped: false,
    log: result.rows[0],
  };
}

/**
 * Sync all account locks and their passcodes into local room management tables.
 */
export async function syncTtlockAccount(options = {}) {
  const defaultCapacity = normalizeCapacity(options.defaultCapacity);
  const createdBy = options.createdBy || null;

  logger.info('Starting TTLock account sync', { defaultCapacity, createdBy });

  const locks = dedupeLocks(await ttlockService.getLockList(1, PAGE_SIZE));
  const roomsByDoorLockId = await getRoomsByDoorLockId();
  const existingPasscodeIds = await getExistingCreatedPasscodeIds();

  const client = await roomManagementDb.connect();
  const insertedRooms = [];
  const lockFailures = [];
  const skippedPasscodes = [];

  let roomsAlreadyPresent = 0;
  let passcodesDetected = 0;
  let passcodesInserted = 0;
  let passcodesAlreadyPresent = 0;

  try {
    await client.query('BEGIN');

    for (const lock of locks) {
      const lockId = String(lock.lockId);
      let room = roomsByDoorLockId.get(lockId);

      if (room) {
        roomsAlreadyPresent += 1;
      } else {
        room = await insertRoom(client, lock, defaultCapacity);
        roomsByDoorLockId.set(lockId, room);
        insertedRooms.push(room);
      }

      try {
        const response = await ttlockService.getPasscodeList(lockId, 1, PAGE_SIZE);
        const passcodes = response?.list || [];
        passcodesDetected += passcodes.length;

        for (const passcode of passcodes) {
          const passcodeId = getPasscodeId(passcode);
          if (!passcodeId) {
            skippedPasscodes.push({
              lockId,
              reason: 'missing_passcode_id',
              ttlockResponse: passcode,
            });
            continue;
          }

          const passcodeIdKey = String(passcodeId);
          if (existingPasscodeIds.has(passcodeIdKey)) {
            passcodesAlreadyPresent += 1;
            continue;
          }

          const insertResult = await insertPasscodeLog(
            client,
            room,
            lockId,
            passcode,
            createdBy
          );

          if (insertResult.inserted) {
            existingPasscodeIds.add(passcodeIdKey);
            passcodesInserted += 1;
          } else {
            skippedPasscodes.push({
              lockId,
              reason: insertResult.reason,
              ttlockResponse: insertResult.passcode,
            });
          }
        }
      } catch (error) {
        lockFailures.push({
          lockId,
          lockName: normalizeRoomName(lock),
          error: error.message,
        });
        logger.warn('Failed to sync passcodes for TTLock lock', {
          lockId,
          error: error.message,
        });
      }
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('TTLock account sync failed:', error);
    throw error;
  } finally {
    client.release();
  }

  const summary = {
    locksDetected: locks.length,
    roomsCreated: insertedRooms.length,
    roomsAlreadyPresent,
    passcodesDetected,
    passcodesInserted,
    passcodesAlreadyPresent,
    lockFailures,
    skippedPasscodes,
    insertedRooms,
  };

  logger.info('TTLock account sync completed', summary);
  return summary;
}
