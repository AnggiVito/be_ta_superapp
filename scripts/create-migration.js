/**
 * Create New Migration File
 * 
 * Helper script untuk membuat migration file baru per module.
 * Migration akan dibuat dalam format node-pg-migrate (JavaScript).
 * 
 * Usage:
 *   node scripts/create-migration.js <module-name> <migration-name>
 * 
 * Examples:
 *   node scripts/create-migration.js registration add_user_preferences
 *   node scripts/create-migration.js conduct add_attendance_notes
 */

import { getModuleConfig, getAllModuleNames } from '../core/migrations/config.js';
import { loadEnvSafe } from '../core/utils/envLoader.js';
import { logger } from '../core/utils/logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
loadEnvSafe();

/**
 * Generate migration file name dengan timestamp
 */
function generateMigrationFileName(migrationName) {
  const timestamp = new Date().toISOString()
    .replace(/[-:]/g, '')
    .replace(/\..+/, '')
    .replace('T', '_');
  
  // Clean migration name (lowercase, replace spaces with underscores)
  const cleanName = migrationName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  
  return `${timestamp}_${cleanName}.js`;
}

/**
 * Generate migration template
 */
function generateMigrationTemplate() {
  return `/**
 * Migration: ${new Date().toISOString()}
 * 
 * Up migration: Add your schema changes here
 * Down migration: Add rollback logic here
 */

exports.up = (pgm) => {
  // Example: Create table
  // pgm.createTable('table_name', {
  //   id: 'id',
  //   name: { type: 'varchar(255)', notNull: true },
  //   created_at: { type: 'timestamp', notNull: true, default: pgm.func('current_timestamp') }
  // });

  // Example: Add column
  // pgm.addColumn('existing_table', {
  //   new_column: { type: 'varchar(255)' }
  // });

  // Example: Create index
  // pgm.createIndex('table_name', 'column_name');

  // TODO: Add your migration logic here
};

exports.down = (pgm) => {
  // Example: Drop table
  // pgm.dropTable('table_name');

  // Example: Drop column
  // pgm.dropColumn('existing_table', 'new_column');

  // Example: Drop index
  // pgm.dropIndex('table_name', 'column_name');

  // TODO: Add your rollback logic here
};
`;
}

/**
 * Create migration file untuk satu module
 */
async function createMigration(moduleName, migrationName) {
  try {
    const config = getModuleConfig(moduleName);
    
    if (!migrationName) {
      throw new Error('Migration name is required');
    }

    logger.info(`\n📝 Creating migration for ${config.name} module...`);
    logger.info(`   Migration name: ${migrationName}`);
    logger.info(`   Migrations dir: ${config.migrationsDir}`);

    // Prepare migration directory
    const migrationsDir = path.join(__dirname, '..', config.migrationsDir);
    
    if (!fs.existsSync(migrationsDir)) {
      logger.info(`   Creating migrations directory: ${migrationsDir}`);
      fs.mkdirSync(migrationsDir, { recursive: true });
    }

    // Generate migration file name
    const fileName = generateMigrationFileName(migrationName);
    const filePath = path.join(migrationsDir, fileName);

    // Check if file already exists
    if (fs.existsSync(filePath)) {
      throw new Error(`Migration file already exists: ${fileName}`);
    }

    // Generate and write migration template
    const template = generateMigrationTemplate();
    fs.writeFileSync(filePath, template, 'utf8');

    logger.info(`\n   ✓ Migration file created: ${fileName}`);
    logger.info(`   📍 Location: ${filePath}`);
    logger.info(`\n   Next steps:`);
    logger.info(`   1. Edit the migration file to add your schema changes`);
    logger.info(`   2. Run: node scripts/run-pg-migration.js ${moduleName} up`);
    
    return { success: true, filePath, fileName };
  } catch (error) {
    logger.error(`\n✗ Failed to create migration:`, error);
    throw error;
  }
}

/**
 * Main execution
 */
async function main() {
  const moduleName = process.argv[2];
  const migrationName = process.argv[3];

  if (!moduleName || !migrationName) {
    logger.error('Please provide module name and migration name');
    logger.info('\nUsage: node scripts/create-migration.js <module-name> <migration-name>');
    logger.info('\nAvailable modules:');
    getAllModuleNames().forEach(mod => {
      logger.info(`  - ${mod}`);
    });
    logger.info('\nExamples:');
    logger.info('  node scripts/create-migration.js registration add_user_preferences');
    logger.info('  node scripts/create-migration.js conduct add_attendance_notes');
    logger.info('  node scripts/create-migration.js user-management add_email_verification');
    process.exit(1);
  }

  try {
    await createMigration(moduleName, migrationName);
    logger.info('\n✅ Migration file created successfully!');
  } catch (error) {
    logger.error('\n✗ Failed to create migration:', error);
    process.exit(1);
  }
}

main();

