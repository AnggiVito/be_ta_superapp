/**
 * Run Migration dengan node-pg-migrate
 * 
 * Wrapper script untuk menjalankan migration per module menggunakan node-pg-migrate.
 * Catatan: modul **registration** (dan beberapa modul lain) juga punya file `.sql` di
 * folder `modules/<nama-modul>/migrations/` yang dijalankan oleh skrip migrate per-modul (run-module-migration.js),
 * bukan oleh skrip ini — pastikan kedua jalur migrasi sesuai kebutuhan deploy Anda.
 * Script ini mendukung multi-database dan per-module migration.
 * 
 * Usage:
 *   node scripts/run-pg-migration.js <module-name> [direction] [count]
 * 
 * Directions:
 *   up      - Run pending migrations (default)
 *   down    - Rollback last migration
 *   up:1    - Run 1 pending migration
 *   down:1  - Rollback 1 migration
 * 
 * Examples:
 *   node scripts/run-pg-migration.js registration up
 *   node scripts/run-pg-migration.js conduct down
 *   node scripts/run-pg-migration.js user-management up:2
 */

import { getModuleConfig, getAllModuleNames } from '../core/migrations/config.js';
import { loadEnvSafe } from '../core/utils/envLoader.js';
import { logger } from '../core/utils/logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
loadEnvSafe();

/**
 * Parse direction and count from argument
 * Examples: "up", "down", "up:2", "down:1"
 */
function parseDirection(directionArg) {
  if (!directionArg) {
    return { direction: 'up', count: null };
  }

  const parts = directionArg.split(':');
  const direction = parts[0];
  const count = parts[1] ? parseInt(parts[1], 10) : null;

  if (!['up', 'down'].includes(direction)) {
    throw new Error(`Invalid direction: ${direction}. Must be 'up' or 'down'`);
  }

  return { direction, count };
}

/**
 * Run migration untuk satu module
 */
async function runModuleMigration(moduleName, directionArg = 'up') {
  try {
    const config = getModuleConfig(moduleName);
    const { direction, count } = parseDirection(directionArg);

    logger.info(`\n📦 Running migration for ${config.name} module...`);
    logger.info(`   Database: ${config.connectionString.split('@')[1] || 'N/A'}`);
    logger.info(`   Direction: ${direction}${count ? ` (${count} migration(s))` : ''}`);
    logger.info(`   Migrations dir: ${config.migrationsDir}`);

    // Test database connection
    try {
      await config.db.query('SELECT 1');
      logger.info('   ✓ Database connection OK');
    } catch (error) {
      logger.error(`   ✗ Database connection failed: ${error.message}`);
      throw error;
    }

    // Prepare migration options
    const migrationsDir = path.join(__dirname, '..', config.migrationsDir);
    
    const migrationOptions = {
      databaseUrl: config.connectionString,
      dir: migrationsDir,
      direction: direction,
      migrationsTable: config.migrationsTable,
      count: count || undefined, // undefined means all
      dryRun: false,
      verbose: true,
      log: (msg) => {
        // node-pg-migrate uses console.log, redirect to our logger
        if (msg.includes('✓') || msg.includes('success')) {
          logger.info(`   ${msg}`);
        } else if (msg.includes('✗') || msg.includes('error') || msg.includes('Error')) {
          logger.error(`   ${msg}`);
        } else {
          logger.info(`   ${msg}`);
        }
      }
    };

    // Run migration
    logger.info(`\n   Running migrations...`);
    
    // Use createRequire untuk import CommonJS module (node-pg-migrate)
    // karena dynamic import ES module mungkin tidak kompatibel dengan CommonJS
    const require = createRequire(import.meta.url);
    const nodePgMigrateModule = require('node-pg-migrate');
    
    // node-pg-migrate bisa export sebagai function langsung atau object dengan default
    let nodePgMigrate;
    if (typeof nodePgMigrateModule === 'function') {
      nodePgMigrate = nodePgMigrateModule;
    } else if (nodePgMigrateModule && typeof nodePgMigrateModule.default === 'function') {
      nodePgMigrate = nodePgMigrateModule.default;
    } else {
      throw new Error(`Cannot find node-pg-migrate function. Type: ${typeof nodePgMigrateModule}`);
    }
    
    const result = await nodePgMigrate(migrationOptions);

    if (result && result.length > 0) {
      logger.info(`\n   ✓ Migration completed successfully`);
      logger.info(`   Processed ${result.length} migration(s):`);
      result.forEach((migration, index) => {
        logger.info(`     ${index + 1}. ${migration.name}`);
      });
    } else {
      logger.info(`\n   ✓ No migrations to run (database is up to date)`);
    }

    return { success: true, migrations: result || [] };
  } catch (error) {
    logger.error(`\n✗ Migration failed for ${moduleName}:`, error);
    throw error;
  }
}

/**
 * Show migration status untuk satu module
 */
async function showStatus(moduleName) {
  try {
    const config = getModuleConfig(moduleName);
    
    logger.info(`\n📊 Migration Status for ${config.name} module:`);
    logger.info(`   Database: ${config.connectionString.split('@')[1] || 'N/A'}`);

    // Get all migration files
    const migrationsDir = path.join(__dirname, '..', config.migrationsDir);
    
    if (!fs.existsSync(migrationsDir)) {
      logger.warn(`   ⚠ Migrations directory not found: ${migrationsDir}`);
      return;
    }

    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.js') || file.endsWith('.cjs') || file.endsWith('.sql'))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

    // Get executed migrations from database
    let executedMigrations = [];
    try {
      const result = await config.db.query(`
        SELECT name FROM ${config.migrationsTable} ORDER BY run_on;
      `);
      executedMigrations = result.rows.map(row => row.name);
    } catch (error) {
      // Table might not exist yet
      logger.warn(`   ⚠ Migration tracking table not found. Run bootstrap first.`);
      return;
    }

    logger.info(`\n   Migration Files (${migrationFiles.length}):`);
    migrationFiles.forEach((file, index) => {
      const isExecuted = executedMigrations.includes(file);
      const status = isExecuted ? '✓' : '○';
      logger.info(`     ${status} ${file}`);
    });

    const pending = migrationFiles.filter(f => !executedMigrations.includes(f));
    if (pending.length > 0) {
      logger.info(`\n   ⚠ ${pending.length} pending migration(s):`);
      pending.forEach(file => logger.info(`     - ${file}`));
    } else {
      logger.info(`\n   ✓ All migrations are up to date`);
    }
  } catch (error) {
    logger.error(`Error showing status for ${moduleName}:`, error);
  }
}

/**
 * Main execution
 */
async function main() {
  const moduleName = process.argv[2];
  const directionArg = process.argv[3] || 'up';

  if (!moduleName) {
    logger.error('Please provide module name');
    logger.info('\nUsage: node scripts/run-pg-migration.js <module-name> [direction] [count]');
    logger.info('\nAvailable modules:');
    getAllModuleNames().forEach(mod => {
      logger.info(`  - ${mod}`);
    });
    logger.info('\nDirections:');
    logger.info('  up      - Run pending migrations (default)');
    logger.info('  down    - Rollback last migration');
    logger.info('  up:2    - Run 2 pending migrations');
    logger.info('  down:1  - Rollback 1 migration');
    logger.info('\nExamples:');
    logger.info('  node scripts/run-pg-migration.js registration up');
    logger.info('  node scripts/run-pg-migration.js conduct down');
    logger.info('  node scripts/run-pg-migration.js user-management status');
    process.exit(1);
  }

  // Special command: status
  if (directionArg === 'status') {
    await showStatus(moduleName);
    return;
  }

  try {

    await runModuleMigration(moduleName, directionArg);
    
    logger.info('\n✅ Migration completed!');
  } catch (error) {
    logger.error('\n✗ Migration failed:', error);
    process.exit(1);
  }
}

main();

