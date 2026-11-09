/**
 * Run supplemental Conduct SQL migrations (003+).
 *
 * Legacy QR attendance SQL (001–002) is skipped automatically.
 * For node-pg-migrate (.cjs) migrations (operational sessions, drop legacy, etc.):
 *   npm run migrate:pg:conduct
 *
 * Usage:
 *   node scripts/run-conduct-migration.js
 *   npm run migrate:conduct
 */

import { loadEnvSafe } from '../core/utils/envLoader.js';
import {
  runConductMigrations,
  checkConductTablesExist,
  checkLegacyConductTablesAbsent,
} from '../core/utils/migrationRunner.js';
import { testConnections } from '../config/databases.js';
import { logger } from '../core/utils/logger.js';

// Load environment variables
loadEnvSafe();

async function main() {
  try {
    logger.info('Starting Conduct module migration...');
    
    // Test database connections
    logger.info('Testing database connections...');
    const dbConnected = await testConnections();
    if (!dbConnected) {
      logger.error('Failed to connect to databases');
      process.exit(1);
    }
    logger.info('✓ Database connections OK');
    
    logger.info('Checking existing Conduct tables...');
    const tablesCheck = await checkConductTablesExist();
    
    if (tablesCheck.exists) {
      logger.info('✓ Core Conduct tables already exist:');
      tablesCheck.existing.forEach(table => logger.info(`  - ${table}`));
    } else {
      logger.info(`Missing Conduct tables: ${tablesCheck.missing.join(', ')}`);
      logger.info('Run npm run migrate:pg:conduct first if this is a fresh database.');
    }

    const legacyCheck = await checkLegacyConductTablesAbsent();
    if (!legacyCheck.absent) {
      logger.warn(`⚠ Retired legacy tables still present: ${legacyCheck.existing.join(', ')}`);
      logger.warn('  Run npm run migrate:pg:conduct (drop_legacy migration) to remove them.');
    }
    
    logger.info('Running Conduct SQL migrations (legacy 001–002 skipped)...');
    const success = await runConductMigrations();
    
    if (success) {
      logger.info('✓ Conduct SQL migrations completed successfully');
      
      const verifyCheck = await checkConductTablesExist();
      if (verifyCheck.exists) {
        logger.info('✓ Verified: core Conduct tables present');
        verifyCheck.existing.forEach(table => logger.info(`  - ${table}`));
      } else {
        logger.warn(`⚠ Warning: core Conduct tables still missing: ${verifyCheck.missing.join(', ')}`);
        logger.warn('  Run npm run migrate:pg:conduct for .cjs schema migrations.');
      }

      const legacyAfter = await checkLegacyConductTablesAbsent();
      if (!legacyAfter.absent) {
        logger.warn(`⚠ Warning: legacy tables recreated: ${legacyAfter.existing.join(', ')}`);
      } else {
        logger.info('✓ Verified: retired legacy QR tables are absent');
      }
      process.exit(0);
    } else {
      logger.error('✗ Conduct migrations failed');
      process.exit(1);
    }
  } catch (error) {
    logger.error('Conduct migration error:', error);
    process.exit(1);
  }
}

main();

