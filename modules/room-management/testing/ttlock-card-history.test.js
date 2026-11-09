/**
 * Unit Test: IC Card History Filter Testing
 *
 * Test suite untuk memastikan filter card log history berfungsi dengan baik
 * berdasarkan action dan active status.
 *
 * Test Scenarios:
 * 1. action: all
 * 2. action: created
 * 3. action: deleted
 * 4. active: true (not deleted and not expired)
 * 5. active: false (deleted or expired)
 *
 * IMPORTANT:
 * - Database harus running: docker compose up -d
 * - Test room harus sudah ada di database
 */

import dotenv from 'dotenv';
dotenv.config();

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { getCardLogList } from '../services/cardService.js';
import { roomManagementDb } from './testDatabaseConfig.js';

const TEST_ROOM_ID = '165b57e6-507b-40a0-92dc-05198e947b84';
const TEST_LOCK_ID = '12405430';

const TEST_CARD_ACTIVE = 990001;
const TEST_CARD_EXPIRED = 990002;
const TEST_CARD_DELETED = 990003;

let createdLogIds = [];

async function getRoomById(roomId) {
  const result = await roomManagementDb.query(
    `SELECT * FROM rooms WHERE id = $1`,
    [roomId]
  );
  return result.rows[0] || null;
}

async function createCardLog(data) {
  const result = await roomManagementDb.query(
    `INSERT INTO card_logs
     (room_id, lock_id, card_id, card_number, card_name,
      start_date, end_date, created_by, action, metadata, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
     RETURNING *`,
    [
      data.roomId,
      data.lockId,
      data.cardId || null,
      data.cardNumber || null,
      data.cardName || null,
      data.startDate || null,
      data.endDate || null,
      data.createdBy || null,
      data.action || 'created',
      JSON.stringify(data.metadata || {}),
    ]
  );
  return result.rows[0];
}

async function deleteCardLog(logId) {
  await roomManagementDb.query(`DELETE FROM card_logs WHERE id = $1`, [logId]);
}

describe('IC Card History Filter Tests', () => {
  beforeAll(async () => {
    const room = await getRoomById(TEST_ROOM_ID);
    if (!room) {
      throw new Error(`Test room not found: ${TEST_ROOM_ID}`);
    }

    const past = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const activeLog = await createCardLog({
      roomId: TEST_ROOM_ID,
      lockId: TEST_LOCK_ID,
      cardId: TEST_CARD_ACTIVE,
      cardNumber: '1111111111',
      cardName: 'Test - Active Card',
      endDate: future,
      action: 'created',
    });
    createdLogIds.push(activeLog.id);

    const expiredLog = await createCardLog({
      roomId: TEST_ROOM_ID,
      lockId: TEST_LOCK_ID,
      cardId: TEST_CARD_EXPIRED,
      cardNumber: '2222222222',
      cardName: 'Test - Expired Card',
      endDate: past,
      action: 'created',
    });
    createdLogIds.push(expiredLog.id);

    const deletedCreatedLog = await createCardLog({
      roomId: TEST_ROOM_ID,
      lockId: TEST_LOCK_ID,
      cardId: TEST_CARD_DELETED,
      cardNumber: '3333333333',
      cardName: 'Test - Deleted Card',
      endDate: future,
      action: 'created',
    });
    createdLogIds.push(deletedCreatedLog.id);

    const deletedLog = await createCardLog({
      roomId: TEST_ROOM_ID,
      lockId: TEST_LOCK_ID,
      cardId: TEST_CARD_DELETED,
      cardNumber: '3333333333',
      cardName: 'Test - Deleted Card',
      action: 'deleted',
    });
    createdLogIds.push(deletedLog.id);
  }, 30000);

  afterAll(async () => {
    for (const logId of createdLogIds) {
      try {
        await deleteCardLog(logId);
      } catch (_) {
        // ignore cleanup errors
      }
    }
  }, 30000);

  test('should return all card logs with pagination', async () => {
    const result = await getCardLogList(TEST_ROOM_ID, {
      pageNo: 1,
      pageSize: 50,
    });

    expect(result).toHaveProperty('list');
    expect(Array.isArray(result.list)).toBe(true);
    expect(result.total).toBeGreaterThanOrEqual(4);
  });

  test('should return only created card logs when action=created', async () => {
    const result = await getCardLogList(TEST_ROOM_ID, {
      pageNo: 1,
      pageSize: 50,
      action: 'created',
    });

    result.list.forEach((log) => {
      expect(log.action).toBe('created');
    });

    const hasActive = result.list.some((log) => log.cardId === TEST_CARD_ACTIVE);
    expect(hasActive).toBe(true);
  });

  test('should return only deleted card logs when action=deleted', async () => {
    const result = await getCardLogList(TEST_ROOM_ID, {
      pageNo: 1,
      pageSize: 50,
      action: 'deleted',
    });

    result.list.forEach((log) => {
      expect(log.action).toBe('deleted');
    });

    const hasDeleted = result.list.some((log) => log.cardId === TEST_CARD_DELETED);
    expect(hasDeleted).toBe(true);
  });

  test('should return only active cards when active=true', async () => {
    const result = await getCardLogList(TEST_ROOM_ID, {
      pageNo: 1,
      pageSize: 50,
      active: true,
    });

    const cardIds = result.list.map((log) => log.cardId);
    expect(cardIds).toContain(TEST_CARD_ACTIVE);
    expect(cardIds).not.toContain(TEST_CARD_EXPIRED);
    expect(cardIds).not.toContain(TEST_CARD_DELETED);
  });

  test('should return only inactive cards when active=false', async () => {
    const result = await getCardLogList(TEST_ROOM_ID, {
      pageNo: 1,
      pageSize: 50,
      active: false,
    });

    const cardIds = result.list.map((log) => log.cardId);
    expect(cardIds).toContain(TEST_CARD_EXPIRED);
    expect(cardIds).toContain(TEST_CARD_DELETED);
    expect(cardIds).not.toContain(TEST_CARD_ACTIVE);
  });
});
