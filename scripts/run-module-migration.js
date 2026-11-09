/**
 * Script to run migrations for a specific module
 * 
 * Usage:
 *   node scripts/run-module-migration.js <module-name>
 * 
 * Available modules:
 *   - user-management
 *   - reporting
 *   - activity-log
 *   - registration
 *   - conduct
 *   - procurement
 *   - room-management
 * 
 * Examples:
 *   node scripts/run-module-migration.js conduct
 *   node scripts/run-module-migration.js registration
 *   node scripts/run-module-migration.js user-management
 */

import { loadEnvSafe } from '../core/utils/envLoader.js';
import {
  runUserManagementMigrations,
  runReportingMigrations,
  runActivityLogMigrations,
  runRegistrationMigrations,
  runConductMigrations,
  runProcurementMigrations,
  runRoomManagementMigrations,
  checkTablesExist,
  checkReportingTablesExist,
  checkActivityLogTablesExist,
  checkRegistrationTablesExist,
  checkConductTablesExist,
  checkProcurementTablesExist,
  checkRoomManagementTablesExist,
} from '../core/utils/migrationRunner.js';
import {
  registrationDb,
  conductDb,
  userManagementDb,
  roomManagementDb,
  reportingDb,
  procurementDb,
} from '../config/databases.js';
import { logger } from '../core/utils/logger.js';

// Load environment variables
loadEnvSafe();

/** Hanya tes koneksi DB yang dipakai modul tersebut (host lokal tidak punya hostname container lain). */
async function pingModuleDatabase(moduleName) {
  const poolByModule = {
    'user-management': userManagementDb,
    reporting: reportingDb,
    'activity-log': userManagementDb,
    registration: registrationDb,
    conduct: conductDb,
    procurement: procurementDb,
    'room-management': roomManagementDb,
  };
  const pool = poolByModule[moduleName];
  if (!pool) {
    logger.error(`No database mapping for module: ${moduleName}`);
    return false;
  }
  await pool.query('SELECT 1');
  return true;
}

// Module configuration mapping
const moduleConfig = {
  'user-management': {
    runMigration: runUserManagementMigrations,
    checkTables: checkTablesExist,
    name: 'User Management',
  },
  'reporting': {
    runMigration: runReportingMigrations,
    checkTables: checkReportingTablesExist,
    name: 'Reporting',
  },
  'activity-log': {
    runMigration: runActivityLogMigrations,
    checkTables: checkActivityLogTablesExist,
    name: 'Activity Log',
  },
  'registration': {
    runMigration: runRegistrationMigrations,
    checkTables: checkRegistrationTablesExist,
    name: 'Registration',
  },
  'conduct': {
    runMigration: runConductMigrations,
    checkTables: checkConductTablesExist,
    name: 'Conduct',
  },
  'procurement': {
    runMigration: runProcurementMigrations,
    checkTables: checkProcurementTablesExist,
    name: 'Procurement',
  },
  'room-management': {
    runMigration: runRoomManagementMigrations,
    checkTables: checkRoomManagementTablesExist,
    name: 'Room Management',
  },
};

async function runModuleMigration(moduleName) {
  try {
    const config = moduleConfig[moduleName];
    
    if (!config) {
      logger.error(`Unknown module: ${moduleName}`);
      logger.info('Available modules:');
      Object.keys(moduleConfig).forEach(mod => {
        logger.info(`  - ${mod}`);
      });
      process.exit(1);
    }

    logger.info(`Starting migration for ${config.name} module...`);
    
    logger.info('Testing database connection for this module...');
    try {
      await pingModuleDatabase(moduleName);
    } catch (e) {
      logger.error(`Failed to connect to database for ${config.name}: ${e.message}`);
      process.exit(1);
    }
    logger.info('✓ Database connection OK');
    
    // Check current state (for info only)
    logger.info(`Checking existing tables for ${config.name}...`);
    const tablesCheck = await config.checkTables();
    
    if (tablesCheck.exists) {
      logger.info(`✓ All required tables already exist for ${config.name}:`);
      tablesCheck.existing.forEach(table => logger.info(`  - ${table}`));
      logger.info('Note: Running migrations anyway to ensure schema is up-to-date (migrations use IF NOT EXISTS)');
    } else {
      logger.info(`Missing tables for ${config.name}: ${tablesCheck.missing.join(', ')}`);
    }
    
    // Always run migrations (they use IF NOT EXISTS, so safe to run multiple times)
    logger.info(`Running ${config.name} migrations...`);
    const success = await config.runMigration();
    
    if (success) {
      logger.info(`✓ ${config.name} migrations completed successfully`);
      
      // Verify tables were created
      const verifyCheck = await config.checkTables();
      if (verifyCheck.exists) {
        logger.info(`✓ Verified: All ${config.name} tables created successfully`);
      } else {
        logger.warn(`⚠ Warning: Some ${config.name} tables still missing: ${verifyCheck.missing.join(', ')}`);
      }
    } else {
      logger.error(`✗ ${config.name} migrations failed`);
      process.exit(1);
    }
  } catch (error) {
    logger.error(`Migration error for ${moduleName}:`, error);
    process.exit(1);
  }
}

// Get module name from command line arguments
const moduleName = process.argv[2];

if (!moduleName) {
  logger.error('Please provide module name as argument');
  logger.info('Usage: node scripts/run-module-migration.js <module-name>');
  logger.info('');
  logger.info('Available modules:');
  Object.keys(moduleConfig).forEach(mod => {
    logger.info(`  - ${mod}`);
  });
  logger.info('');
  logger.info('Examples:');
  logger.info('  node scripts/run-module-migration.js conduct');
  logger.info('  node scripts/run-module-migration.js registration');
  logger.info('  node scripts/run-module-migration.js user-management');
  process.exit(1);
}

runModuleMigration(moduleName);

