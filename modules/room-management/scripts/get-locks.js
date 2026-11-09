import { ttlockClient } from '../../../services/ttlock/ttlockClient.js';
import { logger } from '../../../core/utils/logger.js';

/**
 * Script untuk mendapatkan daftar semua lock dari akun TTLock
 * Gunakan Lock ID ini untuk mengisi field door_lock_id di database
 */

async function getLockList() {
  console.log('🔍 Getting Lock List from TTLock Account\n');
  console.log('============================================================\n');

  try {
    // Get access token
    console.log('📌 Step 1: Authenticating...');
    const token = await ttlockClient.getAccessToken();
    
    if (!token) {
      console.error('❌ Failed to get access token!');
      return;
    }
    
    console.log('✅ Authentication successful!\n');

    // Get lock list
    console.log('📌 Step 2: Fetching lock list...');
    const response = await ttlockClient.request('POST', '/v3/lock/list', {
      pageNo: 1,
      pageSize: 100
    }, token);

    // TTLock API returns list directly when successful (no errcode field)
    if (response.list || response.total !== undefined) {
      console.log('✅ Lock list retrieved!\n');
      console.log('============================================================');
      
      if (response.list && response.list.length > 0) {
        console.log(`\n📋 Found ${response.list.length} Lock(s) in your account:\n`);
        
        response.list.forEach((lock, index) => {
          console.log(`${index + 1}. Lock Details:`);
          console.log(`   🔑 Lock ID: ${lock.lockId}`);
          console.log(`   📛 Name: ${lock.lockAlias || 'N/A'}`);
          console.log(`   🔋 Battery: ${lock.electricQuantity}%`);
          console.log(`   📡 Status: ${lock.lockData ? 'Online' : 'Offline'}`);
          console.log(`   📅 Created: ${lock.date ? new Date(lock.date).toLocaleString() : 'N/A'}`);
          console.log('');
        });

        console.log('============================================================\n');
        console.log('📝 How to use Lock ID:\n');
        console.log('1. Copy the Lock ID from above');
        console.log('2. Insert/Update room in database:');
        console.log('');
        console.log('   Example SQL:');
        console.log('   INSERT INTO rooms (name, capacity, door_lock_id)');
        console.log('   VALUES (\'Room 101\', 20, \'YOUR_LOCK_ID\');');
        console.log('');
        console.log('   OR update existing room:');
        console.log('   UPDATE rooms SET door_lock_id = \'YOUR_LOCK_ID\' WHERE id = \'room-uuid\';');
        console.log('');
        console.log('3. Then you can create passcodes for that room via API\n');

      } else {
        console.log('\n⚠️  No locks found in your TTLock account!\n');
        console.log('📱 Please add a smart lock to your TTLock account:');
        console.log('   1. Download TTLock app from App Store/Play Store');
        console.log('   2. Login with your account (muadzamclg@gmail.com)');
        console.log('   3. Add your smart lock via Bluetooth');
        console.log('   4. Run this script again to get the Lock ID\n');
      }

    } else {
      console.error(`\n❌ API Error: ${response.errmsg || 'Unknown error'}`);
      console.error(`   Error Code: ${response.errcode}\n`);
    }

    console.log('============================================================\n');

  } catch (error) {
    console.error('\n❌ Error getting lock list:');
    console.error(`   ${error.message}\n`);
    
    if (error.response?.data) {
      console.error('   API Response:');
      console.error(`   ${JSON.stringify(error.response.data, null, 2)}\n`);
    }
  }
}

// Run the script
getLockList()
  .then(() => {
    console.log('✅ Script completed.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
