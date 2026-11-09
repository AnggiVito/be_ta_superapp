/**
 * Remove duplicate practicum-sync timed cards on a room lock.
 * Usage (inside Docker):
 *   node scripts/cleanup-practicum-sync-cards.js <roomId> [cardNumber]
 */

import { loadEnvSafe } from '../core/utils/envLoader.js';
import * as cardModel from '../modules/room-management/models/cardModel.js';
import * as cardService from '../modules/room-management/services/cardService.js';
import { roomManagementDb } from '../config/databases.js';

loadEnvSafe();

const roomId = process.argv[2];
const cardNumberFilter = process.argv[3] || null;

if (!roomId) {
  console.error('Usage: node scripts/cleanup-practicum-sync-cards.js <roomId> [cardNumber]');
  process.exit(1);
}

async function main() {
  let query = `SELECT * FROM card_logs
    WHERE room_id = $1 AND action = 'created' AND card_id IS NOT NULL`;
  const values = [roomId];
  if (cardNumberFilter) {
    query += ` AND card_number = $2`;
    values.push(cardNumberFilter);
  }
  query += ` ORDER BY created_at ASC`;

  const { rows } = await roomManagementDb.query(query, values);
  const deletedIds = await cardModel.getDeletedCardIdsByRoom(roomId);
  const active = rows.filter((row) => !deletedIds.has(row.card_id));

  const groups = new Map();
  for (const log of active) {
    const key = `${log.card_number}|${log.start_date}|${log.end_date}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(log);
  }

  let removed = 0;
  for (const [, logs] of groups) {
    if (logs.length <= 1) continue;
    const keep = logs[logs.length - 1];
    for (const log of logs.slice(0, -1)) {
      try {
        await cardService.deleteCard(roomId, log.card_id, 'cleanup-script');
        console.log(`Deleted duplicate cardId=${log.card_id} (${log.card_number})`);
        removed += 1;
      } catch (error) {
        console.warn(`Skip cardId=${log.card_id}: ${error.message}`);
      }
    }
    console.log(`Kept cardId=${keep.card_id} for window ${keep.start_date} - ${keep.end_date}`);
  }

  console.log(`Done. Removed ${removed} duplicate(s).`);
  await roomManagementDb.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
