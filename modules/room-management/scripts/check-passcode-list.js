import { ttlockService } from '../../../services/ttlock/ttlockService.js';
import { logger } from '../../../core/utils/logger.js';

/**
 * Script untuk cek passcode list di TTLock
 * Untuk diagnosa apakah passcode benar-benar tersync
 */

async function checkPasscodeList() {
  console.log('🔍 Checking Passcode List from TTLock\n');
  console.log('============================================================\n');

  try {
    const lockId = '12405430'; // Lock: "inibaruini"
    
    console.log(`📌 Getting passcode list for Lock ID: ${lockId}\n`);
    
    const passcodeList = await ttlockService.getPasscodeList(lockId, 1, 50);
    
    if (!passcodeList || !passcodeList.list) {
      console.log('❌ No passcodes found or API error');
      console.log('Response:', JSON.stringify(passcodeList, null, 2));
      return;
    }
    
    console.log(`✅ Found ${passcodeList.total || 0} passcode(s)\n`);
    console.log('============================================================\n');
    
    if (passcodeList.list && passcodeList.list.length > 0) {
      passcodeList.list.forEach((pwd, index) => {
        console.log(`${index + 1}. Passcode Details:`);
        console.log(`   🆔 ID: ${pwd.keyboardPwdId}`);
        console.log(`   📛 Name: ${pwd.keyboardPwdName}`);
        console.log(`   🔢 Passcode: ${pwd.keyboardPwd || 'Hidden'}`);
        console.log(`   📋 Type: ${pwd.keyboardPwdType} (${getTypeName(pwd.keyboardPwdType)})`);
        
        if (pwd.startDate) {
          const start = new Date(pwd.startDate);
          console.log(`   ⏰ Start: ${start.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`);
        }
        
        if (pwd.endDate) {
          const end = new Date(pwd.endDate);
          console.log(`   ⏰ End: ${end.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`);
        }
        
        console.log(`   📊 Status: ${pwd.keyboardPwdStatus || 'N/A'}`);
        console.log(`   🔄 Send Status: ${pwd.sendStatus || 'N/A'}`);
        console.log('');
      });
    }
    
    console.log('============================================================');
    console.log('✅ Script completed.\n');
    
  } catch (error) {
    console.error('\n❌ Error getting passcode list:');
    console.error(`   ${error.message}`);
    
    if (error.response?.data) {
      console.error('\n   API Response:');
      console.error(`   ${JSON.stringify(error.response.data, null, 2)}`);
    }
  }
}

function getTypeName(type) {
  const types = {
    1: 'One-time',
    2: 'Permanent',
    3: 'Period/Temporary',
    4: 'Delete',
    5: 'Weekend Cyclic',
    6: 'Daily Cyclic',
    7: 'Workday Cyclic',
    8: 'Monday Cyclic',
    9: 'Tuesday Cyclic',
    10: 'Wednesday Cyclic',
    11: 'Thursday Cyclic',
    12: 'Friday Cyclic',
    13: 'Saturday Cyclic',
    14: 'Sunday Cyclic'
  };
  return types[type] || 'Unknown';
}

// Run the script
checkPasscodeList()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });
