/**
 * Unified Migration Runner
 * 
 * Script unified untuk menjalankan migration (SQL dan JS) dengan tracking node-pg-migrate.
 * Semua migration akan di-track di pgmigrations table untuk konsistensi.
 * 
 * Usage:
 *   node scripts/run-unified-migration.js <module-name>
 * 
 * Examples:
 *   node scripts/run-unified-migration.js registration
 *   node scripts/run-unified-migration.js conduct
 */

import { runUnifiedMigrations, getMigrationStatus } from '../core/migrations/unifiedRunner.js';
import { getModuleConfig, getAllModuleNames } from '../core/migrations/config.js';
import { loadEnvSafe } from '../core/utils/envLoader.js';
import { testConnections } from '../config/databases.js';
import { logger } from '../core/utils/logger.js';

loadEnvSafe();

async function main() {
  const moduleName = process.argv[2];

  if (!moduleName) {
    logger.error('Please provide module name');
    logger.info('\nUsage: node scripts/run-unified-migration.js <module-name>');
    logger.info('\nAvailable modules:');
    getAllModuleNames().forEach(mod => {
      logger.info(`  - ${mod}`);
    });
    process.exit(1);
  }

  try {
    // Test database connections
    logger.info('Testing database connections...');
    const dbConnected = await testConnections();
    if (!dbConnected) {
      logger.error('✗ Failed to connect to databases');
      process.exit(1);
    }
    logger.info('✓ Database connections OK\n');

    const config = getModuleConfig(moduleName);
    logger.info(`Running unified migrations for ${config.name}...\n`);

    // Check current status
    const status = await getMigrationStatus(moduleName);
    if (!status.exists) {
      logger.error(`Migrations directory not found for ${moduleName}`);
      process.exit(1);
    }

    logger.info(`Migration Status:`);
    logger.info(`  Total: ${status.total}`);
    logger.info(`  Executed: ${status.executed}`);
    logger.info(`  Pending: ${status.pending}\n`);

    if (status.pending === 0) {
      logger.info('✓ All migrations are up-to-date');
      return;
    }

    // Show pending migrations
    const pending = status.migrations.filter(m => !m.executed);
    if (pending.length > 0) {
      logger.info('Pending migrations:');
      pending.forEach(m => {
        logger.info(`  ${m.type === 'sql' ? '📄' : '📝'} ${m.name}`);
      });
      logger.info('');
    }

    // Run migrations
    const result = await runUnifiedMigrations(moduleName);

    if (result.success) {
      logger.info('\n✅ Unified migration completed successfully!');
      
      if (result.results) {
        if (result.results.executed.length > 0) {
          logger.info(`\nExecuted migrations:`);
          result.results.executed.forEach(file => {
            logger.info(`  ✓ ${file}`);
          });
        }
        
        if (result.results.skipped.length > 0) {
          logger.info(`\nSkipped migrations:`);
          result.results.skipped.forEach(file => {
            logger.info(`  ⊘ ${file}`);
          });
        }
      }
    } else {
      logger.error('\n✗ Unified migration failed');
      if (result.error) {
        logger.error(`Error: ${result.error}`);
      }
      process.exit(1);
    }
  } catch (error) {
    logger.error('Migration error:', error);
    process.exit(1);
  }
}

main();

