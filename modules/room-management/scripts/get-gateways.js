import { ttlockService } from '../../../services/ttlock/ttlockService.js';

function printHelp() {
  console.log('TTLock Gateway Audit Script\n');
  console.log('Usage:');
  console.log('  node modules\\room-management\\scripts\\get-gateways.js [--gatewayId=<id>] [--pageSize=<n>] [--help]\n');
  console.log('Options:');
  console.log('  --gatewayId=<id>  Inspect only one gateway');
  console.log('  --pageSize=<n>    Number of gateways to fetch per page (default: 100)');
  console.log('  --help            Show this help message');
}

function parseArgs(argv) {
  const options = {
    gatewayId: null,
    pageSize: 100,
    help: false,
  };

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    if (arg.startsWith('--gatewayId=')) {
      options.gatewayId = arg.split('=')[1] || null;
      continue;
    }

    if (arg.startsWith('--pageSize=')) {
      const value = parseInt(arg.split('=')[1], 10);
      if (!Number.isNaN(value) && value > 0) {
        options.pageSize = value;
      }
    }
  }

  return options;
}

function formatTimestamp(value) {
  if (!value) return 'N/A';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'N/A';
  }

  return date.toLocaleString();
}

function displayLockName(lock) {
  return lock.lockAlias || lock.lockName || 'N/A';
}

function displayGatewayName(gateway) {
  return gateway.gatewayName || gateway.name || gateway.gatewayAlias || 'N/A';
}

async function safeGetLockDetail(lockId) {
  try {
    return await ttlockService.getLockDetail(lockId);
  } catch (error) {
    return {
      __error: error.message,
    };
  }
}

async function safeGetGatewayListByLock(lockId) {
  try {
    const response = await ttlockService.getGatewayListByLock(lockId);
    return response.list || [];
  } catch (_error) {
    return [];
  }
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  console.log('🔍 Getting Gateway Audit from TTLock Account\n');
  console.log('============================================================\n');

  console.log('📌 Step 1: Authenticating...');
  await ttlockService.getValidToken();
  console.log('✅ Authentication successful!\n');

  console.log('📌 Step 2: Fetching gateway list...');
  const gatewayResponse = await ttlockService.getGatewayList(1, options.pageSize);
  const allGateways = gatewayResponse.list || [];

  const gateways = options.gatewayId
    ? allGateways.filter((gateway) => String(gateway.gatewayId) === String(options.gatewayId))
    : allGateways;

  if (options.gatewayId && gateways.length === 0) {
    console.log(`⚠️  Gateway ${options.gatewayId} not found in this TTLock account.\n`);
    return;
  }

  if (gateways.length === 0) {
    console.log('⚠️  No gateways found in this TTLock account.\n');
    return;
  }

  console.log('✅ Gateway list retrieved!\n');
  console.log('============================================================\n');

  let onlineGatewayCount = 0;
  let totalLocks = 0;
  let failedGatewayCount = 0;
  let lockDetailFailures = 0;

  for (const [index, gateway] of gateways.entries()) {
    if (gateway.isOnline === 1) {
      onlineGatewayCount += 1;
    }

    console.log(`${index + 1}. Gateway Details:`);
    console.log(`   🌐 Gateway ID: ${gateway.gatewayId}`);
    console.log(`   🏷️  Name: ${displayGatewayName(gateway)}`);
    console.log(`   📡 MAC: ${gateway.gatewayMac || 'N/A'}`);
    console.log(`   📶 Online: ${gateway.isOnline === 1 ? 'Yes' : 'No'}`);
    console.log(`   🛜 Network: ${gateway.networkName || 'N/A'}`);
    console.log(`   🧩 Version: ${gateway.gatewayVersion || 'N/A'}`);
    console.log(`   🔢 Reported Lock Count: ${gateway.lockNum ?? 'N/A'}`);

    let gatewayLockResponse;
    try {
      gatewayLockResponse = await ttlockService.getGatewayLockList(gateway.gatewayId);
    } catch (error) {
      failedGatewayCount += 1;
      console.log(`   ❌ Failed to fetch locks for gateway ${gateway.gatewayId}: ${error.message}\n`);
      continue;
    }

    const gatewayLocks = gatewayLockResponse.list || [];
    totalLocks += gatewayLocks.length;

    if (gatewayLocks.length === 0) {
      console.log('   ⚠️  No smart locks connected to this gateway.\n');
      continue;
    }

    console.log(`   ✅ Found ${gatewayLocks.length} lock(s) connected to this gateway:\n`);

    for (const [lockIndex, lock] of gatewayLocks.entries()) {
      const detail = await safeGetLockDetail(lock.lockId);
      if (detail.__error) {
        lockDetailFailures += 1;
      }

      const gatewayMembership = detail.__error ? [] : await safeGetGatewayListByLock(lock.lockId);
      const gatewayIds = gatewayMembership.map((item) => item.gatewayId).filter(Boolean);
      const resolvedName = detail.__error ? displayLockName(lock) : displayLockName(detail);

      console.log(`   ${lockIndex + 1}. Lock Details:`);
      console.log(`      🔑 Lock ID: ${lock.lockId}`);
      console.log(`      📛 Name: ${resolvedName}`);
      console.log(`      📡 MAC: ${detail.lockMac || lock.lockMac || 'N/A'}`);
      console.log(`      📶 RSSI: ${lock.rssi ?? 'N/A'}`);
      console.log(`      🕒 RSSI Updated: ${formatTimestamp(lock.updateDate)}`);
      console.log(`      🔋 Battery: ${detail.electricQuantity ?? 'N/A'}%`);
      console.log(`      🔗 Has Gateway: ${detail.hasGateway === 1 ? 'Yes' : detail.hasGateway === 0 ? 'No' : 'N/A'}`);
      console.log(`      🌐 Gateway IDs: ${gatewayIds.length > 0 ? gatewayIds.join(', ') : String(gateway.gatewayId)}`);
      console.log(`      📦 Model: ${detail.modelNum || 'N/A'}`);
      console.log(`      🛠️  Hardware: ${detail.hardwareRevision || 'N/A'}`);
      console.log(`      🚀 Firmware: ${detail.firmwareRevision || 'N/A'}`);
      console.log(`      📅 Init Time: ${formatTimestamp(detail.date)}`);

      if (detail.__error) {
        console.log(`      ⚠️  Detail Fetch Error: ${detail.__error}`);
      }

      console.log('');
    }
  }

  console.log('============================================================\n');
  console.log('📊 Summary:\n');
  console.log(`   Total Gateways: ${gateways.length}`);
  console.log(`   Online Gateways: ${onlineGatewayCount}`);
  console.log(`   Total Locks Across Gateways: ${totalLocks}`);
  console.log(`   Gateway Fetch Failures: ${failedGatewayCount}`);
  console.log(`   Lock Detail Failures: ${lockDetailFailures}\n`);
  console.log('✅ Gateway audit completed.');
}

run()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Gateway audit failed:');
    console.error(`   ${error.message}\n`);
    process.exit(1);
  });
