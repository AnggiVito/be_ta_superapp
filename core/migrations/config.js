/**
 * Migration Configuration per Module
 * Mapping module ke database connection yang sesuai
 */

import { 
  registrationDb, 
  conductDb, 
  userManagementDb,
  roomManagementDb,
  reportingDb,
  procurementDb 
} from '../../config/databases.js';
import { loadEnvSafe } from '../utils/envLoader.js';

// Load environment variables
loadEnvSafe();

/**
 * Get database connection string from environment variables
 * node-pg-migrate needs connection string, not Pool object
 */
function getConnectionString(envPrefix, defaultHost, defaultDb) {
  const host = process.env[`${envPrefix}_DB_HOST`] || defaultHost;
  const port = process.env[`${envPrefix}_DB_PORT`] || '5432';
  const user = process.env[`${envPrefix}_DB_USER`] || 'postgres';
  const password = process.env[`${envPrefix}_DB_PASSWORD`] || 'postgres';
  const database = process.env[`${envPrefix}_DB_NAME`] || defaultDb;

  // URL encode password untuk handle special characters
  const encodedPassword = encodeURIComponent(password);
  
  return `postgresql://${user}:${encodedPassword}@${host}:${port}/${database}`;
}

/**
 * Module configuration mapping
 * Setiap module punya konfigurasi sendiri dengan database yang sesuai
 */
export const moduleMigrationConfig = {
  'registration': {
    name: 'Registration',
    db: registrationDb,
    migrationsDir: 'modules/registration/migrations',
    connectionString: getConnectionString('REGISTRATION', 'registration_db', 'registration_db'),
    migrationsTable: 'pgmigrations'
  },
  'conduct': {
    name: 'Conduct',
    db: conductDb,
    migrationsDir: 'modules/conduct/migrations',
    connectionString: getConnectionString('CONDUCT', 'conduct_db', 'conduct_db'),
    migrationsTable: 'pgmigrations'
  },
  'user-management': {
    name: 'User Management',
    db: userManagementDb,
    migrationsDir: 'modules/user-management/migrations',
    connectionString: getConnectionString('USER_MANAGEMENT', 'user_management_db', 'user_management_db'),
    migrationsTable: 'pgmigrations'
  },
  'room-management': {
    name: 'Room Management',
    db: roomManagementDb,
    migrationsDir: 'modules/room-management/migrations',
    connectionString: getConnectionString('ROOM_MANAGEMENT', 'room_management_db', 'room_management_db'),
    migrationsTable: 'pgmigrations'
  },
  'reporting': {
    name: 'Reporting',
    db: reportingDb,
    migrationsDir: 'modules/reporting/migrations',
    connectionString: getConnectionString('REPORTING', 'reporting_db', 'reporting_db'),
    migrationsTable: 'pgmigrations'
  },
  'procurement': {
    name: 'Procurement',
    db: procurementDb,
    migrationsDir: 'modules/procurement/migrations',
    connectionString: getConnectionString('PROCUREMENT', 'procurement_db', 'procurement_db'),
    migrationsTable: 'pgmigrations'
  },
  'activity-log': {
    name: 'Activity Log',
    db: userManagementDb, // Activity log menggunakan userManagementDb
    migrationsDir: 'modules/activity-log/migrations',
    connectionString: getConnectionString('USER_MANAGEMENT', 'user_management_db', 'user_management_db'),
    migrationsTable: 'pgmigrations'
  }
};

/**
 * Get module config by name
 */
export function getModuleConfig(moduleName) {
  const config = moduleMigrationConfig[moduleName];
  if (!config) {
    throw new Error(`Unknown module: ${moduleName}. Available: ${Object.keys(moduleMigrationConfig).join(', ')}`);
  }
  return config;
}

/**
 * Get all module names
 */
export function getAllModuleNames() {
  return Object.keys(moduleMigrationConfig);
}

