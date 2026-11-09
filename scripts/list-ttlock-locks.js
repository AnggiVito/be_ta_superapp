/**
 * One-time script to list all locks registered in the TTLock gateway
 * Run: node scripts/list-ttlock-locks.js
 */
import crypto from 'crypto';
import axios from 'axios';

const CLIENT_ID = 'dfb76229c7b847dbbfd33957819d906c';
const CLIENT_SECRET = '8354ed4c84fc39ad36dde93823d8d0f0';
const USERNAME = 'muadzamclg@gmail.com';
const PASSWORD = '@Jam250904';
const BASE_URL = 'https://euapi.ttlock.com';

async function getAccessToken() {
  const passwordMd5 = crypto.createHash('md5').update(PASSWORD).digest('hex');

  const authData = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    username: USERNAME,
    password: passwordMd5,
    grant_type: 'password',
  });

  const response = await axios.post(
    `${BASE_URL}/oauth2/token`,
    authData.toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  return response.data.access_token;
}

async function listLocks(accessToken) {
  const params = new URLSearchParams({
    clientId: CLIENT_ID,
    accessToken,
    pageNo: 1,
    pageSize: 20,
    date: Date.now(),
  });

  const response = await axios.post(
    `${BASE_URL}/v3/lock/list`,
    params.toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  return response.data;
}

(async () => {
  try {
    console.log('Authenticating with TTLock...');
    const token = await getAccessToken();
    console.log('Got access token:', token.substring(0, 20) + '...');

    console.log('\nFetching lock list...');
    const result = await listLocks(token);

    if (result.errcode && result.errcode !== 0) {
      console.error('API Error:', result);
      process.exit(1);
    }

    const locks = result.list || [];
    if (locks.length === 0) {
      console.log('No locks found in gateway.');
    } else {
      console.log(`\nFound ${locks.length} lock(s):\n`);
      locks.forEach((lock, i) => {
        console.log(`[${i + 1}] lockId: ${lock.lockId}`);
        console.log(`    Name:  ${lock.lockAlias || lock.lockName || '(no name)'}`);
        console.log(`    MAC:   ${lock.lockMac || 'N/A'}`);
        console.log(`    Model: ${lock.lockVersion?.showAdminKbpwdFlag !== undefined ? 'supports passcode' : lock.lockVersion?.protocolVersion || 'N/A'}`);
        console.log();
      });
    }
  } catch (err) {
    console.error('Error:', err.response?.data || err.message);
    process.exit(1);
  }
})();
