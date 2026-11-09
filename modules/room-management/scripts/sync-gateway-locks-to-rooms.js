import { roomManagementDb } from '../../../config/databases.js';
import { ttlockService } from '../../../services/ttlock/ttlockService.js';

const DEFAULT_CAPACITY = 45;

function printHelp() {
  console.log('TTLock Gateway Locks -> Rooms Sync Script\n');
  console.log('Usage:');
  console.log('  node modules\\room-management\\scripts\\sync-gateway-locks-to-rooms.js [--apply] [--gatewayId=<id>] [--default-capacity=<n>] [--help]\n');
  console.log('Behavior:');
  console.log('  - Default mode is dry-run (no database writes)');
  console.log('  - Use --apply to insert missing rooms into the room_management database');
  console.log('  - Existing rooms matched by door_lock_id are left unchanged\n');
  console.log('Options:');
  console.log('  --apply                 Insert missing rooms into the database');
  console.log('  --gatewayId=<id>        Sync locks from one gateway only');
  console.log(`  --default-capacity=<n>  Capacity used for newly created rooms (default: ${DEFAULT_CAPACITY})`);
  console.log('  --help                  Show this help message');
}

function parseArgs(argv) {
  const options = {
    apply: false,
    gatewayId: null,
    defaultCapacity: DEFAULT_CAPACITY,
    help: false,
  };

  for (const arg of argv) {
    if (arg === '--apply') {
      options.apply = true;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    if (arg.startsWith('--gatewayId=')) {
      options.gatewayId = arg.split('=')[1] || null;
      continue;
    }

    if (arg.startsWith('--default-capacity=')) {
      const value = parseInt(arg.split('=')[1], 10);
      if (!Number.isNaN(value) && value > 0) {
        options.defaultCapacity = value;
      }
    }
  }

  return options;
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
  const result = [];

  for (const lock of locks) {
    const key = String(lock.lockId);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(lock);
  }

  return result;
}

async function fetchExistingRoomsByDoorLockId() {
  const result = await roomManagementDb.query(
    `SELECT id, name, capacity, is_occupied, door_lock_id
     FROM rooms
     WHERE door_lock_id IS NOT NULL`
  );

  const byDoorLockId = new Map();
  for (const row of result.rows) {
    byDoorLockId.set(String(row.door_lock_id), row);
  }

  return {
    rows: result.rows,
    byDoorLockId,
  };
}

async function insertRoom(client, room) {
  const result = await client.query(
    `INSERT INTO rooms (name, capacity, is_occupied, door_lock_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, NOW(), NOW())
     RETURNING id, name, capacity, is_occupied, door_lock_id`,
    [room.name, room.capacity, false, room.doorLockId]
  );

  return result.rows[0];
}

function printRoomCandidate(index, candidate, reason) {
  console.log(`${index + 1}. ${candidate.name}`);
  console.log(`   Lock ID: ${candidate.doorLockId}`);
  console.log(`   Gateway: ${candidate.gatewayName} (${candidate.gatewayId})`);
  console.log(`   MAC: ${candidate.lockMac}`);
  console.log(`   Capacity: ${candidate.capacity}`);
  console.log(`   Reason: ${reason}`);
  console.log('');
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const modeLabel = options.apply ? 'APPLY' : 'DRY-RUN';
  console.log(`🔄 TTLock Gateway Lock Sync to Rooms (${modeLabel})\n`);
  console.log('============================================================\n');

  console.log('📌 Step 1: Authenticating with TTLock...');
  await ttlockService.getValidToken();
  console.log('✅ Authentication successful!\n');

  console.log('📌 Step 2: Fetching gateway list...');
  const gatewayResponse = await ttlockService.getGatewayList(1, 100);
  const allGateways = gatewayResponse.list || [];
  const gateways = options.gatewayId
    ? allGateways.filter((gateway) => String(gateway.gatewayId) === String(options.gatewayId))
    : allGateways;

  if (options.gatewayId && gateways.length === 0) {
    throw new Error(`Gateway ${options.gatewayId} not found in this TTLock account`);
  }

  if (gateways.length === 0) {
    console.log('⚠️  No gateways found in this TTLock account.\n');
    return;
  }

  console.log(`✅ Found ${gateways.length} gateway(s).\n`);

  console.log('📌 Step 3: Collecting locks from selected gateways...');
  const collectedLocks = [];
  const gatewayFailures = [];

  for (const gateway of gateways) {
    try {
      const response = await ttlockService.getGatewayLockList(gateway.gatewayId);
      const locks = response.list || [];
      for (const lock of locks) {
        collectedLocks.push({
          lockId: String(lock.lockId),
          lockAlias: lock.lockAlias || null,
          lockName: lock.lockName || null,
          lockMac: lock.lockMac || 'N/A',
          gatewayId: String(gateway.gatewayId),
          gatewayName: gateway.gatewayName || gateway.name || gateway.gatewayAlias || 'N/A',
        });
      }
    } catch (error) {
      gatewayFailures.push({
        gatewayId: gateway.gatewayId,
        gatewayName: gateway.gatewayName || gateway.name || gateway.gatewayAlias || 'N/A',
        error: error.message,
      });
    }
  }

  const uniqueLocks = dedupeLocks(collectedLocks);
  console.log(`✅ Detected ${uniqueLocks.length} unique lock(s) from gateway data.\n`);

  console.log('📌 Step 4: Comparing against existing rooms...');
  const existingRooms = await fetchExistingRoomsByDoorLockId();
  const existingLockIds = new Set(existingRooms.byDoorLockId.keys());
  const detectedLockIds = new Set(uniqueLocks.map((lock) => lock.lockId));

  const toCreate = [];
  const alreadyPresent = [];

  for (const lock of uniqueLocks) {
    const existing = existingRooms.byDoorLockId.get(lock.lockId);
    if (existing) {
      alreadyPresent.push({
        lock,
        room: existing,
      });
      continue;
    }

    toCreate.push({
      name: normalizeRoomName(lock),
      capacity: options.defaultCapacity,
      doorLockId: lock.lockId,
      lockMac: lock.lockMac,
      gatewayId: lock.gatewayId,
      gatewayName: lock.gatewayName,
    });
  }

  const missingFromTtlock = existingRooms.rows.filter(
    (room) => !detectedLockIds.has(String(room.door_lock_id))
  );

  console.log('============================================================\n');
  console.log('📋 Sync Preview:\n');
  console.log(`   Existing Rooms with door_lock_id: ${existingRooms.rows.length}`);
  console.log(`   Locks Detected from Gateways: ${uniqueLocks.length}`);
  console.log(`   Rooms to Create: ${toCreate.length}`);
  console.log(`   Rooms Already Present: ${alreadyPresent.length}`);
  console.log(`   Existing Rooms Missing from TTLock: ${missingFromTtlock.length}`);
  console.log(`   Gateway Fetch Failures: ${gatewayFailures.length}\n`);

  if (toCreate.length > 0) {
    console.log('🆕 Rooms to Create:\n');
    toCreate.forEach((candidate, index) => {
      printRoomCandidate(index, candidate, 'Lock detected from gateway but not found in rooms table');
    });
  } else {
    console.log('✅ No new rooms need to be created.\n');
  }

  if (alreadyPresent.length > 0) {
    console.log('ℹ️  Locks Already Present in rooms:\n');
    alreadyPresent.forEach(({ lock, room }, index) => {
      console.log(`${index + 1}. Lock ID ${lock.lockId}`);
      console.log(`   Existing Room: ${room.name} (${room.id})`);
      console.log(`   Gateway: ${lock.gatewayName} (${lock.gatewayId})`);
      console.log('');
    });
  }

  if (missingFromTtlock.length > 0) {
    console.log('⚠️  Existing Rooms Missing from Current TTLock Gateway Scan:\n');
    missingFromTtlock.forEach((room, index) => {
      console.log(`${index + 1}. ${room.name}`);
      console.log(`   Room ID: ${room.id}`);
      console.log(`   door_lock_id: ${room.door_lock_id}`);
      console.log('');
    });
  }

  if (gatewayFailures.length > 0) {
    console.log('❌ Gateway Fetch Failures:\n');
    gatewayFailures.forEach((failure, index) => {
      console.log(`${index + 1}. ${failure.gatewayName} (${failure.gatewayId})`);
      console.log(`   Error: ${failure.error}`);
      console.log('');
    });
  }

  if (!options.apply) {
    console.log('============================================================\n');
    console.log('🧪 Dry-run only. No database changes were made.');
    console.log('   To insert missing rooms, rerun with: --apply\n');
    return;
  }

  if (toCreate.length === 0) {
    console.log('============================================================\n');
    console.log('✅ Apply mode completed. Nothing new to insert.\n');
    return;
  }

  console.log('📌 Step 5: Inserting missing rooms into database...');
  const client = await roomManagementDb.connect();

  try {
    await client.query('BEGIN');

    const insertedRooms = [];
    for (const candidate of toCreate) {
      const inserted = await insertRoom(client, candidate);
      insertedRooms.push(inserted);
    }

    await client.query('COMMIT');

    console.log('✅ Insert completed successfully!\n');
    insertedRooms.forEach((room, index) => {
      console.log(`${index + 1}. ${room.name}`);
      console.log(`   Room ID: ${room.id}`);
      console.log(`   door_lock_id: ${room.door_lock_id}`);
      console.log(`   Capacity: ${room.capacity}`);
      console.log('');
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  console.log('============================================================\n');
  console.log('✅ Sync finished.\n');
}

run()
  .then(async () => {
    await roomManagementDb.end();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('\n❌ Sync failed:');
    console.error(`   ${error.message}\n`);
    try {
      await roomManagementDb.end();
    } catch (_error) {
      // Ignore shutdown errors in script mode.
    }
    process.exit(1);
  });
