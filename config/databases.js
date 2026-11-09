import pkg from 'pg';
import { loadEnvSafe } from '../core/utils/envLoader.js';

const { Pool, types } = pkg;

// Prevent timezone shifting for DATE / TIMESTAMP WITHOUT TIME ZONE.
// By default node-postgres parses these into JS Date objects in the local
// timezone of the Node process, which can cause off-by-one day bugs.
// Keep them as raw strings instead.
try {
  // DATE
  types.setTypeParser(1082, (value) => value);
  // TIMESTAMP WITHOUT TIME ZONE
  types.setTypeParser(1114, (value) => value);
} catch (_) {
  // ignore if types is unavailable
}
// Load environment variables (tidak override yang sudah di-set dari Docker)
loadEnvSafe();

// Connection pool configuration untuk high concurrency (4000 users)
const poolConfig = {
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS || 10000),
};

/** Prevent Node crash on idle pool clients after DB restart (admin command). */
function attachPoolErrorGuard(pool, label) {
  pool.on('error', (err) => {
    console.warn(`[db-pool:${label}]`, err?.message || err);
  });
}

// Registration Database Connection Pool
export const registrationDb = new Pool({
  host: process.env.REGISTRATION_DB_HOST || 'registration_db',
  port: parseInt(process.env.REGISTRATION_DB_PORT || '5432'),
  user: process.env.REGISTRATION_DB_USER || 'postgres',
  password: process.env.REGISTRATION_DB_PASSWORD || 'postgres',
  database: process.env.REGISTRATION_DB_NAME || 'registration_db',
  ...poolConfig,
});

// Conduct Database Connection Pool
export const conductDb = new Pool({
  host: process.env.CONDUCT_DB_HOST || 'conduct_db',
  port: parseInt(process.env.CONDUCT_DB_PORT || '5432'),
  user: process.env.CONDUCT_DB_USER || 'postgres',
  password: process.env.CONDUCT_DB_PASSWORD || 'postgres',
  database: process.env.CONDUCT_DB_NAME || 'conduct_db',
  ...poolConfig,
});

// User Management Database Connection Pool
export const userManagementDb = new Pool({
  host: process.env.USER_MANAGEMENT_DB_HOST || 'user_management_db',
  port: parseInt(process.env.USER_MANAGEMENT_DB_PORT || '5432'),
  user: process.env.USER_MANAGEMENT_DB_USER || 'postgres',
  password: process.env.USER_MANAGEMENT_DB_PASSWORD || 'postgres',
  database: process.env.USER_MANAGEMENT_DB_NAME || 'user_management_db',
  ...poolConfig,
});

// Room Management Database Connection Pool
export const roomManagementDb = new Pool({
  host: process.env.ROOM_MANAGEMENT_DB_HOST || 'room_management_db',
  port: parseInt(process.env.ROOM_MANAGEMENT_DB_PORT || '5432'),
  user: process.env.ROOM_MANAGEMENT_DB_USER || 'postgres',
  password: process.env.ROOM_MANAGEMENT_DB_PASSWORD || 'postgres',
  database: process.env.ROOM_MANAGEMENT_DB_NAME || 'room_management_db',
  ...poolConfig,
});

// Reporting Database Connection Pool
export const reportingDb = new Pool({
  host: process.env.REPORTING_DB_HOST || 'reporting_db',
  port: parseInt(process.env.REPORTING_DB_PORT || '5432'),
  user: process.env.REPORTING_DB_USER || 'postgres',
  password: process.env.REPORTING_DB_PASSWORD || 'postgres',
  database: process.env.REPORTING_DB_NAME || 'reporting_db',
  ...poolConfig,
});

// Procurement Database Connection Pool
export const procurementDb = new Pool({
  host: process.env.PROCUREMENT_DB_HOST || 'procurement_db',
  port: parseInt(process.env.PROCUREMENT_DB_PORT || '5432'),
  user: process.env.PROCUREMENT_DB_USER || 'postgres',
  password: process.env.PROCUREMENT_DB_PASSWORD || 'postgres',
  database: process.env.PROCUREMENT_DB_NAME || 'procurement_db',
  ...poolConfig,
});

for (const [label, pool] of [
  ['registration', registrationDb],
  ['conduct', conductDb],
  ['user-management', userManagementDb],
  ['room-management', roomManagementDb],
  ['reporting', reportingDb],
  ['procurement', procurementDb],
]) {
  attachPoolErrorGuard(pool, label);
}

async function pingDb(label, pool) {
  try {
    await pool.query('SELECT 1');
    console.log(`✓ ${label} database connected`);
    return true;
  } catch (error) {
    console.warn(`✗ ${label} database unavailable:`, error?.message || error);
    return false;
  }
}

// Test database connections (core modules required; others optional for degraded start)
export async function testConnections() {
  const core = await Promise.all([
    pingDb('Registration', registrationDb),
    pingDb('User Management', userManagementDb),
    pingDb('Procurement', procurementDb),
  ]);
  await Promise.all([
    pingDb('Conduct', conductDb),
    pingDb('Room Management', roomManagementDb),
    pingDb('Reporting', reportingDb),
  ]);
  return core.every(Boolean);
}

// Close all database connections
export async function closeConnections() {
  await registrationDb.end();
  await conductDb.end();
  await userManagementDb.end();
  await roomManagementDb.end();
  await reportingDb.end();
  await procurementDb.end();
  console.log('Database connections closed');
}

