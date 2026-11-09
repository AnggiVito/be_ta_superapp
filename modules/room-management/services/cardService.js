/**
 * IC Card Service
 * Business logic untuk IC card management dengan TTLock integration
 * Includes byte-reversal conversion for USB reader → TTLock format
 */

import * as roomModel from '../models/roomModel.js';
import * as cardModel from '../models/cardModel.js';
import { ttlockService } from '../../../services/ttlock/ttlockService.js';
import { logger } from '../../../core/utils/logger.js';
import {
  coerceWibNaiveTimestamp,
  wibToUtcTimestamp,
} from './timezoneUtil.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function cardNumbersMatch(ttlockNumber, readerNumber) {
  const reader = String(readerNumber ?? '').trim();
  const lock = String(ttlockNumber ?? '').trim();
  if (!reader || !lock) return false;
  if (reader === lock) return true;
  try {
    return reverseCardNumber(reader) === lock || reverseCardNumber(lock) === reader;
  } catch {
    return false;
  }
}

function mapActiveLogToCard(log) {
    return {
        cardId: log.card_id,
        cardNumber: log.card_number,
        cardName: log.card_name,
        startDate: coerceWibNaiveTimestamp(log.start_date),
        endDate: coerceWibNaiveTimestamp(log.end_date),
        createDate: coerceWibNaiveTimestamp(log.created_at),
        source: 'database',
    };
}

/**
 * Convert card number from USB reader format to TTLock reversed format
 * USB Reader outputs decimal UID → convert to hex → reverse bytes → convert back to decimal
 * 
 * Example: 2672633271 → 9F4B19B7 → B7194B9F → 3072675231
 * 
 * @param {string|number} usbReaderNumber - Decimal card number from USB reader
 * @returns {string} Reversed card number for TTLock API
 */
export function reverseCardNumber(usbReaderNumber) {
    // Convert to unsigned 32-bit integer
    const num = parseInt(usbReaderNumber) >>> 0;

    // Convert to hex string, padded to 8 characters
    const hex = num.toString(16).toUpperCase().padStart(8, '0');

    // Reverse bytes (pairs of hex characters)
    const reversed = hex.match(/.{2}/g).reverse().join('');

    // Convert back to decimal string
    const reversedDecimal = parseInt(reversed, 16).toString();
    

    logger.info('Card number conversion:', {
        usbReader: usbReaderNumber,
        hex,
        reversedHex: reversed,
        ttlockNumber: reversedDecimal,
    });

    return reversedDecimal;
}

/**
 * Add IC card to a room's lock
 * The USB reader outputs the card number in "reversed" byte order compared to how the lock reads it.
 * The TTLock API endpoint addForReversedCardNumber accepts this reversed format directly
 * and handles the internal conversion — so we pass the USB reader number as-is.
 * 
 * @param {string} roomId - Room UUID
 * @param {object} data - Card data { cardNumber, cardName, startDate, endDate, createdBy }
 * @returns {Promise<object>} Created card info
 */
export async function addCard(roomId, data) {
    try {
        // Get room with lock_id
        const room = await roomModel.getRoomById(roomId);
        if (!room) {
            throw new Error('Room not found');
        }

        if (!room.door_lock_id) {
            throw new Error('Room does not have a smart lock configured');
        }

        // Pass USB reader number directly to TTLock API
        // The addForReversedCardNumber endpoint handles the byte-reversal internally
        const cardNumber = data.cardNumber;

        // Build options
        const options = {
            addType: 2, // WiFi gateway
        };
        if (data.cardName) options.cardName = data.cardName;
        const startDateNaive = data.startDate ? coerceWibNaiveTimestamp(data.startDate) : null;
        const endDateNaive = data.endDate ? coerceWibNaiveTimestamp(data.endDate) : null;
        if (startDateNaive) options.startDate = wibToUtcTimestamp(startDateNaive);
        if (endDateNaive) options.endDate = wibToUtcTimestamp(endDateNaive);

        logger.info('Adding IC card:', {
            roomId,
            lockId: room.door_lock_id,
            cardNumber: cardNumber,
        });

        // Call TTLock API
        const result = await ttlockService.addICCard(
            room.door_lock_id,
            cardNumber,
            options
        );

        if (!result || !result.cardId) {
            throw new Error('TTLock API did not return card data');
        }

        const confirmedOnLock = await waitForCardOnLock(
            room.door_lock_id,
            result.cardId
        );
        if (!confirmedOnLock) {
            throw new Error(
                'TTLock accepted the card but it is not visible on the lock yet. ' +
                'Check the WiFi gateway is online, then retry sync.'
            );
        }

        let log = null;
        if (data.persistLog !== false) {
            log = await cardModel.logCardCreation({
                roomId: room.id,
                lockId: room.door_lock_id,
                cardId: result.cardId,
                cardNumber: cardNumber,
                cardName: data.cardName || null,
                startDate: startDateNaive,
                endDate: endDateNaive,
                createdBy: data.createdBy || null,
                metadata: {
                    ...(data.metadata || {}),
                    ttlockResponse: result,
                },
            });
        }

        return {
            id: log?.id || null,
            cardId: result.cardId,
            cardNumber: cardNumber,
            cardName: data.cardName || null,
            roomId: room.id,
            roomName: room.name,
            lockId: room.door_lock_id,
            createdAt: log?.created_at || null,
        };
    } catch (error) {
        logger.error('Error adding IC card:', error);
        throw error;
    }
}

/**
 * Change IC card validity period on a room's lock via TTLock gateway.
 */
export async function changeCardPeriod(roomId, cardId, startDate, endDate, changeType = 2) {
    const room = await roomModel.getRoomById(roomId);
    if (!room?.door_lock_id) {
        throw new Error('Room does not have a smart lock configured');
    }

    const startDateNaive = coerceWibNaiveTimestamp(startDate);
    const endDateNaive = coerceWibNaiveTimestamp(endDate);

    await ttlockService.changeICCardPeriod(room.door_lock_id, cardId, {
        startDate: wibToUtcTimestamp(startDateNaive),
        endDate: wibToUtcTimestamp(endDateNaive),
        changeType,
    });

    return {
        cardId,
        startDate: startDateNaive,
        endDate: endDateNaive,
        lockId: room.door_lock_id,
    };
}

/**
 * Add the same IC card to multiple room locks.
 * Each TTLock lock creates its own cardId, so every room is processed independently.
 *
 * @param {object} data - Bulk card data
 * @param {Array<string>} data.roomIds - Selected room UUIDs
 * @param {boolean} data.allRooms - Whether to target every room with a smart lock
 * @returns {Promise<object>} Bulk result with successes and failures
 */
export async function addCardBulk(data) {
    const rooms = await roomModel.getAllRooms();
    const smartLockRooms = rooms.filter((room) => room.door_lock_id);
    const requestedRoomIds = Array.isArray(data.roomIds) ? data.roomIds : [];
    const targetRooms = data.allRooms
        ? smartLockRooms
        : rooms.filter((room) => requestedRoomIds.includes(room.id));
    const foundRoomIds = targetRooms.map((room) => room.id);
    const missingRoomIds = data.allRooms
        ? []
        : requestedRoomIds.filter((roomId) => !foundRoomIds.includes(roomId));

    if (targetRooms.length === 0 && missingRoomIds.length === 0) {
        throw new Error('No smart-lock rooms selected');
    }

    const successes = [];
    const failures = missingRoomIds.map((roomId) => ({
        roomId,
        roomName: null,
        lockId: null,
        message: 'Room not found',
    }));

    for (const room of targetRooms) {
        try {
            const result = await addCard(room.id, data);
            successes.push(result);
        } catch (error) {
            logger.error('Bulk IC card room assignment failed:', {
                roomId: room.id,
                roomName: room.name,
                error: error.message,
            });
            failures.push({
                roomId: room.id,
                roomName: room.name,
                lockId: room.door_lock_id,
                message: error.message || 'Failed to add IC card',
            });
        }
    }

    return {
        requestedRooms: targetRooms.length + missingRoomIds.length,
        successCount: successes.length,
        failureCount: failures.length,
        successes,
        failures,
    };
}

/**
 * Get list of IC cards for a room (from TTLock API)
 * @param {string} roomId - Room UUID
 * @param {object} options - Query options (pageNo, pageSize)
 * @returns {Promise<object>} Card list with pagination
 */
export async function getCardList(roomId, options = {}) {
    try {
        const room = await roomModel.getRoomById(roomId);
        if (!room) {
            throw new Error('Room not found');
        }

        if (!room.door_lock_id) {
            throw new Error('Room does not have a smart lock configured');
        }

        const pageNo = options.pageNo || 1;
        const pageSize = options.pageSize || 20;

        logger.info('Getting IC card list:', {
            roomId,
            lockId: room.door_lock_id,
            pageNo,
            pageSize,
        });

        const activeLogs = await cardModel.getActiveCreatedCardLogs(roomId);
        const loggedCardIds = new Set(
            activeLogs.map((log) => log.card_id).filter((id) => id != null)
        );

        let ttlockOnly = [];
        try {
            const result = await ttlockService.getICCardList(
                room.door_lock_id,
                pageNo,
                Math.max(pageSize, 100)
            );
            ttlockOnly = (result.list || []).filter(
                (card) => card?.cardId != null && !loggedCardIds.has(card.cardId)
            );
        } catch (ttlockError) {
            logger.warn('TTLock card list unavailable, using database registrations only', {
                roomId,
                error: ttlockError.message,
            });
        }

        const list = [
            ...activeLogs.map(mapActiveLogToCard),
            ...ttlockOnly.map((card) => ({
                ...card,
                source: 'ttlock',
            })),
        ];

        return {
            pageNo,
            pageSize,
            roomId: room.id,
            roomName: room.name,
            lockId: room.door_lock_id,
            total: list.length,
            list,
        };
    } catch (error) {
        logger.error('Error getting IC card list:', error);
        throw error;
    }
}

/**
 * Map a card log row to API response shape
 * @param {object} log - Database row
 * @returns {object}
 */
function mapCardLogRow(log) {
    return {
        id: log.id,
        cardId: log.card_id,
        cardNumber: log.card_number,
        cardName: log.card_name,
        action: log.action,
        startDate: coerceWibNaiveTimestamp(log.start_date),
        endDate: coerceWibNaiveTimestamp(log.end_date),
        createdAt: coerceWibNaiveTimestamp(log.created_at),
        createdBy: log.created_by,
        deletedBy: log.deleted_by,
        metadata: log.metadata,
    };
}

/**
 * Get card audit logs for a room (from card_logs table)
 * @param {string} roomId - Room UUID
 * @param {object} options - Query options
 * @returns {Promise<object>} Card log list with pagination
 */
export async function getCardLogList(roomId, options = {}) {
    try {
        const room = await roomModel.getRoomById(roomId);
        if (!room) {
            throw new Error('Room not found');
        }

        const pageNo = options.pageNo || 1;
        const pageSize = options.pageSize || 20;

        if (options.active !== undefined) {
            return await getCardLogListWithActiveFilter(roomId, options);
        }

        const filters = {};
        if (options.action) {
            filters.action = options.action;
        }

        const offset = (pageNo - 1) * pageSize;
        const logs = await cardModel.getCardLogsByRoom(roomId, {
            limit: pageSize,
            offset,
            ...filters,
        });
        const total = await cardModel.countCardLogsByRoom(roomId, filters);

        return {
            pageNo,
            pageSize,
            total,
            totalPages: Math.ceil(total / pageSize),
            list: logs.map(mapCardLogRow),
        };
    } catch (error) {
        logger.error('Error getting card log list:', error);
        throw error;
    }
}

/**
 * Get card log list with active/inactive filter
 * @param {string} roomId - Room UUID
 * @param {object} options - Query options with active filter
 * @returns {Promise<object>} Card log list with pagination
 */
async function getCardLogListWithActiveFilter(roomId, options) {
    const { roomManagementDb } = await import('../../../config/databases.js');

    const pageNo = options.pageNo || 1;
    const pageSize = options.pageSize || 20;
    const wantActive = options.active === true;

    let query = `SELECT * FROM card_logs WHERE room_id = $1 AND action = 'created'`;
    const values = [roomId];

    query += ` ORDER BY created_at DESC`;

    const allLogsResult = await roomManagementDb.query(query, values);
    const deletedCardIds = await cardModel.getDeletedCardIdsByRoom(roomId);
    const now = new Date();

    const filteredLogs = allLogsResult.rows.filter((log) => {
        const isDeleted = deletedCardIds.has(log.card_id);
        const isExpired = log.end_date && new Date(log.end_date) < now;
        const isActive = !isDeleted && !isExpired;
        return wantActive ? isActive : !isActive;
    });

    const total = filteredLogs.length;
    const totalPages = Math.ceil(total / pageSize);
    const startIndex = (pageNo - 1) * pageSize;
    const paginatedLogs = filteredLogs.slice(startIndex, startIndex + pageSize);

    return {
        pageNo,
        pageSize,
        total,
        totalPages,
        list: paginatedLogs.map(mapCardLogRow),
    };
}

/**
 * Delete an IC card
 * @param {string} roomId - Room UUID
 * @param {number} cardId - TTLock card ID
 * @param {string} deletedBy - User who deleted the card
 * @param {number} deleteType - 1=Bluetooth, 2=WiFi gateway (default), 3=NB-IoT
 * @returns {Promise<object>} Delete result
 */
async function waitForCardOnLock(lockId, cardId, attempts = 6, delayMs = 2000) {
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        const list = await ttlockService.getICCardList(lockId, 1, 100);
        const found = (list.list || []).some((card) => card.cardId === cardId);
        if (found) {
            return true;
        }
        if (attempt < attempts) {
            await sleep(delayMs);
        }
    }
    return false;
}

/**
 * Remove every IC card on the lock that matches the USB reader card number.
 */
export async function removeLockCardsByReaderNumber(
    roomId,
    cardNumber,
    deletedBy = null,
    deleteType = 2
) {
    const room = await roomModel.getRoomById(roomId);
    if (!room?.door_lock_id) {
        throw new Error('Room does not have a smart lock configured');
    }

    const list = await ttlockService.getICCardList(room.door_lock_id, 1, 100);
    const matches = (list.list || []).filter((card) =>
        cardNumbersMatch(card.cardNumber, cardNumber)
    );

    for (const card of matches) {
        await deleteCard(roomId, card.cardId, deletedBy, deleteType, cardNumber);
    }

    return matches.length;
}

async function resolveCardLogForDeletion(roomId, cardId, cardNumber = null) {
    let cardLog =
        (await cardModel.getCardLogByRoomAndCardId(roomId, cardId)) ||
        (await cardModel.getCardLogByCardId(cardId));

    if (!cardLog && cardNumber) {
        cardLog = await cardModel.getLatestCreatedCardLogByRoomAndNumber(
            roomId,
            String(cardNumber).trim()
        );
    }

    if (cardLog && cardLog.room_id !== roomId) {
        throw new Error('Card does not belong to this room');
    }

    return cardLog;
}

export async function deleteCard(
    roomId,
    cardId,
    deletedBy = null,
    deleteType = 2,
    cardNumber = null
) {
    try {
        const room = await roomModel.getRoomById(roomId);
        if (!room) {
            throw new Error('Room not found');
        }

        if (!room.door_lock_id) {
            throw new Error('Room does not have a smart lock configured');
        }

        const cardLog = await resolveCardLogForDeletion(roomId, cardId, cardNumber);

        const alreadyDeleted = await cardModel.isCardDeletedInRoom(roomId, cardId);
        if (alreadyDeleted) {
            const err = new Error('Card has already been deleted');
            err.statusCode = 409;
            throw err;
        }

        logger.info('Deleting IC card:', {
            roomId,
            cardId,
            cardNumber: cardNumber || cardLog?.card_number || null,
            lockId: room.door_lock_id,
            deleteType,
            hasCardLog: Boolean(cardLog),
        });

        try {
            await ttlockService.deleteICCard(room.door_lock_id, cardId, deleteType);
        } catch (error) {
            const alreadyGone = Number(error.ttlockErrcode) === -1021;
            if (!alreadyGone) {
                throw error;
            }
            logger.warn('TTLock card already removed from lock', {
                roomId,
                cardId,
                lockId: room.door_lock_id,
            });
        }

        await cardModel.logCardDeletion({
            roomId: room.id,
            lockId: room.door_lock_id,
            cardId,
            cardNumber: cardLog?.card_number || cardNumber || null,
            cardName: cardLog?.card_name || null,
            startDate: cardLog?.start_date || null,
            endDate: cardLog?.end_date || null,
            deletedBy,
            metadata: {
                deleteType,
                deletedWithoutLocalLog: !cardLog,
            },
        });

        return {
            success: true,
            message: 'IC card deleted successfully',
            cardId,
        };
    } catch (error) {
        logger.error('Error deleting IC card:', error);
        throw error;
    }
}
