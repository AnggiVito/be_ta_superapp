import { ttlockClient } from '../../../services/ttlock/ttlockClient.js';
import { logger } from '../../../core/utils/logger.js';

/**
 * Script untuk mendapatkan detail lengkap sebuah passcode
 * Untuk compare passcode yang working vs tidak working
 */

async function getPasscodeDetail() {
  console.log('🔍 Getting Passcode Detail from TTLock\n');
  console.log('============================================================\n');

  try {
    const lockId = '12405430';
    const passcodeIdWorking = '38110444'; // "ini adalah passcode one time dari ttlock" - WORKING
    const passcodeIdNotWorking = '38110234'; // "cksaa" - NOT WORKING
    
    console.log('📌 Getting access token...');
    const token = await ttlockClient.getAccessToken();
    console.log('✅ Token obtained\n');
    
    // Get detail for WORKING passcode
    console.log('🔍 Passcode #1 (WORKING - from TTLock app)');
    console.log(`   ID: ${passcodeIdWorking}`);
    console.log(`   Name: "ini adalah passcode one time dari ttlock"\n`);
    
    const detailWorking = await ttlockClient.request('POST', '/v3/keyboardPwd/get', {
      lockId: parseInt(lockId),
      keyboardPwdId: parseInt(passcodeIdWorking)
    }, token);
    
    console.log('   Full Response:');
    console.log(JSON.stringify(detailWorking, null, 2));
    console.log('\n============================================================\n');
    
    // Get detail for NOT WORKING passcode
    console.log('🔍 Passcode #2 (NOT WORKING - from API)');
    console.log(`   ID: ${passcodeIdNotWorking}`);
    console.log(`   Name: "cksaa"\n`);
    
    const detailNotWorking = await ttlockClient.request('POST', '/v3/keyboardPwd/get', {
      lockId: parseInt(lockId),
      keyboardPwdId: parseInt(passcodeIdNotWorking)
    }, token);
    
    console.log('   Full Response:');
    console.log(JSON.stringify(detailNotWorking, null, 2));
    console.log('\n============================================================\n');
    
    // Compare
    console.log('🔍 COMPARISON:');
    console.log('');
    
    const keys = new Set([
      ...Object.keys(detailWorking),
      ...Object.keys(detailNotWorking)
    ]);
    
    keys.forEach(key => {
      const val1 = detailWorking[key];
      const val2 = detailNotWorking[key];
      
      if (JSON.stringify(val1) !== JSON.stringify(val2)) {
        console.log(`   ❌ DIFFERENT: ${key}`);
        console.log(`      Working:     ${JSON.stringify(val1)}`);
        console.log(`      Not Working: ${JSON.stringify(val2)}`);
      } else {
        console.log(`   ✅ SAME: ${key} = ${JSON.stringify(val1)}`);
      }
    });
    
    console.log('\n============================================================');
    console.log('✅ Script completed.\n');
    
  } catch (error) {
    console.error('\n❌ Error getting passcode detail:');
    console.error(`   ${error.message}`);
    
    if (error.response?.data) {
      console.error('\n   API Response:');
      console.error(`   ${JSON.stringify(error.response.data, null, 2)}`);
    }
  }
}

// Run the script
getPasscodeDetail()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });
