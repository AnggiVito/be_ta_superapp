/**
 * Script to run a specific registration migration file
 * 
 * Usage:
 *   node scripts/run-registration-migration.js <migration-file-name>
 *   atau
 *   node scripts/run-registration-migration.js 006_fix_booking_unique_constraints.sql
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { registrationDb } from '../config/databases.js';
import { logger } from '../core/utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
import { loadEnvSafe } from '../core/utils/envLoader.js';
loadEnvSafe();

async function runMigration(migrationFileName) {
  try {
    const migrationsDir = path.join(__dirname, '../modules/registration/migrations');
    const migrationPath = path.join(migrationsDir, migrationFileName);
    
    if (!fs.existsSync(migrationPath)) {
      logger.error(`Migration file not found: ${migrationPath}`);
      process.exit(1);
    }
    
    logger.info(`Running migration: ${migrationFileName}`);
    
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Execute migration
    await registrationDb.query(migrationSQL);
    
    logger.info(`✓ Migration completed successfully: ${migrationFileName}`);
    process.exit(0);
  } catch (error) {
    logger.error(`✗ Migration failed: ${migrationFileName}`, error);
    process.exit(1);
  }
}

// Get migration file name from command line arguments
const migrationFileName = process.argv[2];

if (!migrationFileName) {
  logger.error('Please provide migration file name as argument');
  logger.info('Usage: node scripts/run-registration-migration.js <migration-file-name>');
  process.exit(1);
}

runMigration(migrationFileName);

