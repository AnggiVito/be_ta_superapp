/**
 * Test Database Configuration
 * 
 * Database config khusus untuk testing yang connect ke localhost
 * Digunakan agar test bisa berjalan di host (bukan di Docker)
 */

import pkg from 'pg';
const { Pool } = pkg;

// Room Management Database Connection Pool untuk Testing
// Connect ke localhost:5441 (external port dari Docker dev compose)
export const roomManagementDb = new Pool({
  host: 'localhost',
  port: 5441,
  user: 'postgres',
  password: 'postgres',
  database: 'room_management_db',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

console.log('✓ Test database config loaded: localhost:5441');
