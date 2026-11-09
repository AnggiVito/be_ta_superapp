/**
 * Assign asisten_praktikum + asisten_praktikum_aktif ke user M001
 * dengan query langsung ke user_management_db (tidak perlu backend HTTP jalan).
 *
 * Usage: node scripts/assign-m001-asisten-aktif-db.js
 * Env: AUTH_GATEWAY_URL, USER_MANAGEMENT_DB_* (lihat config/databases.js / .env)
 */
import axios from 'axios';
import { config } from 'dotenv';
import * as roleService from '../modules/user-management/services/roleService.js';
import { userManagementDb } from '../config/databases.js';

config();

const AUTH_GATEWAY_URL = process.env.AUTH_GATEWAY_URL || 'https://dev-fri-gateway.virtualfri.id';

async function login(username, password) {
  const res = await axios.post(
    `${AUTH_GATEWAY_URL}/login`,
    { username, password },
    { timeout: 15000 }
  );
  return res.data;
}

async function main() {
  console.log('Login M001 di auth gateway untuk ambil user_id...');
  const data = await login('M001', 'dev123');
  if (!data?.user?.id) {
    throw new Error('Login M001 gagal: tidak ada user.id');
  }
  const userId = String(data.user.id);
  console.log('M001 user_id:', userId);

  await roleService.assignRole(userId, 'asisten_praktikum', 'system');
  console.log("OK: role 'asisten_praktikum'");

  await roleService.assignRole(userId, 'asisten_praktikum_aktif', 'system');
  console.log("OK: role 'asisten_praktikum_aktif'");

  await userManagementDb.end();
  console.log('Selesai. User M001 sekarang punya asisten_praktikum + asisten_praktikum_aktif.');
}

main().catch((err) => {
  console.error(err.response?.data || err.message || err);
  userManagementDb.end().finally(() => process.exit(1));
});
