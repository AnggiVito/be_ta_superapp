/**
 * Standalone Migration Runner Script
 * Menjalankan migration secara manual
 * 
 * Usage:
 *   node scripts/run-migrations.js
 *   atau
 *   npm run migrate
 */

import dotenv from 'dotenv';
import { runUserManagementMigrations, checkTablesExist } from '../core/utils/migrationRunner.js';
import { testConnections } from '../config/databases.js';
import { logger } from '../core/utils/logger.js';

// Load environment variables
import { loadEnvSafe } from '../core/utils/envLoader.js';
loadEnvSafe();

async function main() {
  try {
    logger.info('Starting migration runner...');
    
    // Test database connections
    logger.info('Testing database connections...');
    const dbConnected = await testConnections();
    if (!dbConnected) {
      logger.error('Failed to connect to databases');
      process.exit(1);
    }
    
    // Check current state
    logger.info('Checking existing tables...');
    const tablesCheck = await checkTablesExist();
    
    if (tablesCheck.exists) {
      logger.info('✓ All required tables already exist:');
      tablesCheck.existing.forEach(table => logger.info(`  - ${table}`));
      logger.info('No migration needed.');
      return;
    }
    
    logger.info('Missing tables:', tablesCheck.missing.join(', '));
    
    // Run migrations
    logger.info('Running migrations...');
    const success = await runUserManagementMigrations();
    
    if (success) {
      logger.info('✓ Migrations completed successfully');
      
      // Verify tables were created
      const verifyCheck = await checkTablesExist();
      if (verifyCheck.exists) {
        logger.info('✓ Verified: All tables created successfully');
      } else {
        logger.warn('⚠ Warning: Some tables still missing:', verifyCheck.missing.join(', '));
      }
    } else {
      logger.error('✗ Migrations failed');
      process.exit(1);
    }
  } catch (error) {
    logger.error('Migration runner error:', error);
    process.exit(1);
  }
}

main();

