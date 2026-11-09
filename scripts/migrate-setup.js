/**
 * Migration Setup Helper
 * 
 * Script ini membantu setup migration awal dengan menampilkan:
 * 1. Status migration per module
 * 2. Command yang perlu dijalankan
 * 3. Checklist migration yang sudah/wajib dijalankan
 * 
 * Usage:
 *   node scripts/migrate-setup.js                    # Show status semua module
 *   node scripts/migrate-setup.js <module-name>       # Show status satu module
 *   node scripts/migrate-setup.js <module-name> run   # Run migration untuk module
 */

import { getModuleConfig, getAllModuleNames } from '../core/migrations/config.js';
import { loadEnvSafe } from '../core/utils/envLoader.js';
import { testConnections } from '../config/databases.js';
import { logger } from '../core/utils/logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
loadEnvSafe();

/**
 * Urutan module yang disarankan untuk migration awal
 * Module dengan dependency lebih rendah dijalankan lebih dulu
 */
const MIGRATION_ORDER = [
  'user-management',    // Base module, biasanya dijalankan pertama
  'activity-log',       // Bergantung pada user-management
  'registration',       // Base data (study programs, labs, dll)
  'conduct',            // Bergantung pada registration
  'room-management',    // Independent
  'reporting',          // Bergantung pada registration
  'procurement'          // Independent
];

/**
 * List migration SQL yang sudah ada per module
 */
const EXISTING_SQL_MIGRATIONS = {
  'registration': [
    '001_create_master_tables.sql',
    '002_create_schedules_table.sql',
    '003_add_individual_mentoring_to_modules.sql',
    '004_update_schedules_time_fields.sql',
    '005_create_schedule_slots_and_bookings.sql',
    '006_fix_booking_unique_constraints.sql'
  ],
  'conduct': [
    '001_create_qr_attendance_tables.sql',
    '002_add_checkout_field.sql'
  ],
  'user-management': [
    '001_create_tables.sql',
    '002_add_nama_nim.sql',
    '003_fix_unique_constraint.sql'
  ],
  'room-management': [
    '001_create_rooms_table.sql',
    '002_create_passcode_logs_table.sql'
  ],
  'reporting': [
    '001_create_feedback_tables.sql',
    '002_add_overall_sentiment.sql'
  ],
  'procurement': [
    '001_create_procurement_pengajuan_table.sql',
    '002_drop_requester_nim_column.sql',
    '003_create_procurement_pengajuan_items.sql',
    '004_add_requester_id.sql',
    '005_add_status_to_items.sql',
    '006_add_specification_to_items.sql',
    '007_add_quantity_unitprice_text.sql',
    '008_drop_quantity_unitprice.sql',
    '009_drop_created_by.sql',
    '010_rename_pengajuan_to_submission.sql',
    '011_add_updated_at_to_procurement_submission.sql',
    '012_create_procurement_notifications_table.sql',
    '013_alter_procurement_notifications_user_id_to_varchar.sql',
    '014_create_procurement_submission_drafts.sql',
    '015_create_procurement_submission_receipts.sql'
  ],
  'activity-log': [
    '001_create_activity_logs_table.sql'
  ]
};

/**
 * Check migration status untuk satu module
 */
async function checkModuleStatus(moduleName) {
  try {
    const config = getModuleConfig(moduleName);
    const migrationsDir = path.join(__dirname, '..', config.migrationsDir);
    
    // Check if migrations directory exists
    const dirExists = fs.existsSync(migrationsDir);
    
    // Get all migration files
    let migrationFiles = [];
    if (dirExists) {
      migrationFiles = fs.readdirSync(migrationsDir)
        .filter(file => file.endsWith('.js') || file.endsWith('.cjs') || file.endsWith('.sql'))
        .sort();
    }

    // Get executed migrations from database
    let executedMigrations = [];
    let trackingTableExists = false;
    
    try {
      const result = await config.db.query(`
        SELECT name FROM ${config.migrationsTable} ORDER BY run_on;
      `);
      executedMigrations = result.rows.map(row => row.name);
      trackingTableExists = true;
    } catch (error) {
      // Table might not exist yet
      trackingTableExists = false;
    }

    // Separate SQL and JS migrations
    const sqlMigrations = migrationFiles.filter(f => f.endsWith('.sql'));
    const jsMigrations = migrationFiles.filter(f => f.endsWith('.js') || f.endsWith('.cjs'));

    // Check which SQL migrations are tracked
    const trackedSqlMigrations = sqlMigrations.filter(f => executedMigrations.includes(f));
    const untrackedSqlMigrations = sqlMigrations.filter(f => !executedMigrations.includes(f));

    // Check which JS migrations are tracked
    const trackedJsMigrations = jsMigrations.filter(f => executedMigrations.includes(f));
    const untrackedJsMigrations = jsMigrations.filter(f => !executedMigrations.includes(f));

    return {
      moduleName,
      config,
      dirExists,
      trackingTableExists,
      sqlMigrations,
      jsMigrations,
      trackedSqlMigrations,
      untrackedSqlMigrations,
      trackedJsMigrations,
      untrackedJsMigrations,
      totalMigrations: migrationFiles.length,
      totalTracked: executedMigrations.length,
      needsBootstrap: sqlMigrations.length > 0 && !trackingTableExists,
      needsSqlMigration: untrackedSqlMigrations.length > 0,
      needsJsMigration: untrackedJsMigrations.length > 0
    };
  } catch (error) {
    logger.error(`Error checking status for ${moduleName}:`, error);
    return null;
  }
}

/**
 * Display status untuk satu module
 */
function displayModuleStatus(status) {
  if (!status) {
    logger.error(`Failed to get status for module`);
    return;
  }

  const { moduleName, config, dirExists, trackingTableExists, sqlMigrations, jsMigrations, 
          trackedSqlMigrations, untrackedSqlMigrations, trackedJsMigrations, untrackedJsMigrations,
          needsBootstrap, needsSqlMigration, needsJsMigration } = status;

  logger.info(`\n${'═'.repeat(60)}`);
  logger.info(`📦 Module: ${config.name}`);
  logger.info(`${'═'.repeat(60)}`);
  logger.info(`   Database: ${config.connectionString.split('@')[1] || 'N/A'}`);
  logger.info(`   Migrations Dir: ${config.migrationsDir}`);
  logger.info(`   Directory Exists: ${dirExists ? '✓' : '✗'}`);
  logger.info(`   Tracking Table: ${trackingTableExists ? '✓' : '✗'}`);

  // SQL Migrations Status
  if (sqlMigrations.length > 0) {
    logger.info(`\n   📄 SQL Migrations (${sqlMigrations.length}):`);
    sqlMigrations.forEach(file => {
      const isTracked = trackedSqlMigrations.includes(file);
      const status = isTracked ? '✓ Tracked' : '○ Not Tracked';
      logger.info(`      ${status}: ${file}`);
    });
  }

  // JS Migrations Status
  if (jsMigrations.length > 0) {
    logger.info(`\n   📝 JS Migrations (${jsMigrations.length}):`);
    jsMigrations.forEach(file => {
      const isTracked = trackedJsMigrations.includes(file);
      const status = isTracked ? '✓ Executed' : '○ Pending';
      logger.info(`      ${status}: ${file}`);
    });
  }

  // Action Required
  logger.info(`\n   🎯 Action Required:`);
  
  if (!dirExists) {
    logger.warn(`      ⚠ Migrations directory tidak ditemukan`);
  } else if (needsBootstrap) {
    logger.warn(`      ⚠ Perlu bootstrap migration tracking`);
    logger.info(`      → Command: npm run migrate:bootstrap ${moduleName}`);
    logger.info(`      → Atau: node scripts/bootstrap-migration-tracking.js ${moduleName}`);
  } else if (needsSqlMigration) {
    logger.warn(`      ⚠ Ada ${untrackedSqlMigrations.length} SQL migration yang belum di-track`);
    logger.info(`      → Command: npm run migrate:module ${moduleName}`);
    logger.info(`      → Atau: node scripts/run-module-migration.js ${moduleName}`);
  } else if (needsJsMigration) {
    logger.warn(`      ⚠ Ada ${untrackedJsMigrations.length} JS migration yang belum dijalankan`);
    logger.info(`      → Command: npm run migrate:pg:${moduleName} up`);
    logger.info(`      → Atau: node scripts/run-pg-migration.js ${moduleName} up`);
  } else {
    logger.info(`      ✓ Semua migration sudah up-to-date`);
  }

  logger.info(`${'═'.repeat(60)}\n`);
}

/**
 * Display summary untuk semua module
 */
function displaySummary(allStatuses) {
  logger.info(`\n${'═'.repeat(60)}`);
  logger.info(`📊 Migration Setup Summary`);
  logger.info(`${'═'.repeat(60)}\n`);

  const modules = MIGRATION_ORDER.filter(m => allStatuses[m]);
  
  logger.info(`Urutan Migration yang Disarankan:\n`);
  
  modules.forEach((moduleName, index) => {
    const status = allStatuses[moduleName];
    const { needsBootstrap, needsSqlMigration, needsJsMigration, totalTracked, totalMigrations } = status;
    
    const statusIcon = (needsBootstrap || needsSqlMigration || needsJsMigration) ? '○' : '✓';
    const statusText = (needsBootstrap || needsSqlMigration || needsJsMigration) ? 'PENDING' : 'OK';
    
    logger.info(`${index + 1}. ${statusIcon} ${moduleName.padEnd(20)} [${statusText}] (${totalTracked}/${totalMigrations} tracked)`);
  });

  logger.info(`\n${'═'.repeat(60)}`);
  logger.info(`Quick Commands:\n`);
  
  modules.forEach(moduleName => {
    const status = allStatuses[moduleName];
    const { needsBootstrap, needsSqlMigration, needsJsMigration } = status;
    
    if (needsBootstrap) {
      logger.info(`   Bootstrap:  npm run migrate:bootstrap ${moduleName}`);
    } else if (needsSqlMigration) {
      logger.info(`   SQL Migrate: npm run migrate:module ${moduleName}`);
    } else if (needsJsMigration) {
      logger.info(`   JS Migrate:  npm run migrate:pg:${moduleName} up`);
    }
  });

  logger.info(`\n${'═'.repeat(60)}\n`);
}

/**
 * Get command untuk run migration berdasarkan status
 */
function getMigrationCommand(status) {
  const { moduleName, needsBootstrap, needsSqlMigration, needsJsMigration } = status;
  
  if (needsBootstrap) {
    return {
      type: 'bootstrap',
      command: `node scripts/bootstrap-migration-tracking.js ${moduleName}`,
      npmCommand: `npm run migrate:bootstrap ${moduleName}`,
      description: 'Bootstrap migration tracking (mark SQL migrations as executed)'
    };
  } else if (needsSqlMigration) {
    return {
      type: 'sql',
      command: `node scripts/run-module-migration.js ${moduleName}`,
      npmCommand: `npm run migrate:${moduleName}`,
      description: 'Run SQL migrations (old system)'
    };
  } else if (needsJsMigration) {
    return {
      type: 'js',
      command: `node scripts/run-pg-migration.js ${moduleName} up`,
      npmCommand: `npm run migrate:pg:${moduleName} up`,
      description: 'Run JS migrations (new system with node-pg-migrate)'
    };
  } else {
    return {
      type: 'none',
      command: null,
      npmCommand: null,
      description: 'All migrations are up-to-date'
    };
  }
}

/**
 * Main execution
 */
async function main() {
  const moduleName = process.argv[2];
  const action = process.argv[3];

  // Test database connections
  logger.info('Testing database connections...');
  const dbConnected = await testConnections();
  if (!dbConnected) {
    logger.error('✗ Failed to connect to databases');
    process.exit(1);
  }
  logger.info('✓ Database connections OK\n');

  if (moduleName && action === 'run') {
    // Show command to run for specific module
    const status = await checkModuleStatus(moduleName);
    if (status) {
      displayModuleStatus(status);
      const command = getMigrationCommand(status);
      
      if (command.type !== 'none') {
        logger.info(`\n🚀 To run migration, execute:`);
        logger.info(`   ${command.command}`);
        logger.info(`\n   Or using npm:`);
        logger.info(`   ${command.npmCommand}`);
        logger.info(`\n   Description: ${command.description}`);
      }
    }
  } else if (moduleName) {
    // Show status for specific module
    const status = await checkModuleStatus(moduleName);
    displayModuleStatus(status);
  } else {
    // Show status for all modules
    logger.info('🔍 Checking migration status for all modules...\n');
    
    const allStatuses = {};
    for (const mod of getAllModuleNames()) {
      allStatuses[mod] = await checkModuleStatus(mod);
    }

    // Display individual statuses
    for (const mod of MIGRATION_ORDER) {
      if (allStatuses[mod]) {
        displayModuleStatus(allStatuses[mod]);
      }
    }

    // Display summary
    displaySummary(allStatuses);
    
    // Show quick action guide
    logger.info(`\n💡 Quick Actions:\n`);
    logger.info(`   Check one module:    node scripts/migrate-setup.js <module-name>`);
    logger.info(`   Get command:         node scripts/migrate-setup.js <module-name> run`);
    logger.info(`   Bootstrap all:       npm run migrate:bootstrap`);
    logger.info(`   Bootstrap one:       node scripts/bootstrap-migration-tracking.js <module-name>\n`);
  }
}

main().catch(error => {
  logger.error('Error:', error);
  process.exit(1);
});

