import axios from 'axios';
import { config } from 'dotenv';

config();

const AUTH_GATEWAY_URL = process.env.AUTH_GATEWAY_URL || 'https://dev-fri-gateway.virtualfri.id';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';

async function login(username, password) {
  try {
    const res = await axios.post(`${AUTH_GATEWAY_URL}/login`, { username, password }, { timeout: 10000 });
    return res.data;
  } catch (err) {
    if (err.response) {
      console.error(`Auth gateway response error for ${username}:`, err.response.status, err.response.data);
    } else {
      console.error(`Error connecting to auth gateway for ${username}:`, err.message);
    }
    return null;
  }
}

async function assignRole(adminToken, targetUserId, role) {
  try {
    const res = await axios.post(
      `${BACKEND_URL}/api/user-management/users/${encodeURIComponent(targetUserId)}/roles`,
      { role },
      { headers: { Authorization: `Bearer ${adminToken}` }, timeout: 10000 }
    );
    return res.data;
  } catch (err) {
    if (err.response) {
      console.error('Backend response error:', err.response.status, err.response.data);
    } else {
      console.error('Error connecting to backend:', err.message);
    }
    return null;
  }
}

(async function main() {
  console.log('Assigning asisten_praktikum (+ asisten_praktikum_aktif) to M001 via backend roles API');

  // 1) Login as admin (KAUR001)
  const adminUser = await login('KAUR001', 'dev123');
  if (!adminUser || !adminUser.token) {
    console.error('Failed to get admin token (KAUR001). Aborting.');
    process.exit(1);
  }
  const adminToken = adminUser.token;
  console.log('Obtained admin token for KAUR001');

  // 2) Login as target (M001) to get user id
  const targetUser = await login('M001', 'dev123');
  if (!targetUser || !targetUser.user || !targetUser.user.id) {
    console.error('Failed to get M001 user info from auth gateway. Aborting.');
    process.exit(1);
  }
  const targetUserId = targetUser.user.id;
  console.log('M001 user_id:', targetUserId);

  // Ensure user has 'asisten_praktikum' first
  console.log("Ensuring user has 'asisten_praktikum' role first...");
  const ensureBase = await assignRole(adminToken, targetUserId, 'asisten_praktikum');
  console.log('Assign base role result:', ensureBase);

  // Then assign active role
  console.log("Now assigning 'asisten_praktikum_aktif'...");
  const result = await assignRole(adminToken, targetUserId, 'asisten_praktikum_aktif');
  console.log('Assign active role result:', result);

  // 4) Optionally verify via GET
  try {
    const verify = await axios.get(`${BACKEND_URL}/api/user-management/users/${encodeURIComponent(targetUserId)}/roles`, { headers: { Authorization: `Bearer ${adminToken}` }, timeout: 10000 });
    console.log('Current roles for user:', verify.data);
  } catch (err) {
    if (err.response) console.error('Verify response error:', err.response.status, err.response.data);
    else console.error('Verify request error:', err.message);
  }
})();
