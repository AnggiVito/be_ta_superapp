/**
 * Bootstrap Migration Tracking
 * 
 * Script ini menandai semua migration SQL yang sudah pernah dijalankan
 * sebagai "sudah dijalankan" di tracking table node-pg-migrate.
 * 
 * Script ini AMAN untuk production karena:
 * - Hanya INSERT ke tracking table, TIDAK menjalankan migration
 * - Menggunakan ON CONFLICT untuk avoid duplicate
 * - Tidak mengubah schema atau data
 * 
 * Usage:
 *   node scripts/bootstrap-migration-tracking.js [module-name]
 *   atau tanpa argumen untuk bootstrap semua module
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
 * List semua migration SQL yang sudah ada per module
 * Migration ini akan di-mark sebagai "sudah dijalankan"
 */
const existingMigrations = {
  'registration': [
    '001_create_master_tables.sql',
    '002_create_schedules_table.sql',
    '003_add_individual_mentoring_to_modules.sql',
    '004_update_schedules_time_fields.sql',
    '005_create_schedule_slots_and_bookings.sql',
    '006_fix_booking_unique_constraints.sql',
    '007_create_ksm_tables.sql',
    '008_add_module_id_to_ksm_imports.sql',
    '009_add_scheduling_import_fields.sql',
    '010_schedule_assistants_excel_nim.sql',
    '011_drop_schedule_assistants_nama_excel.sql',
    '012_ensure_schedule_assistants_nim.sql'
  ],
  'conduct': [
    '001_create_qr_attendance_tables.sql',
    '002_add_checkout_field.sql'
  ],
  'user-management': [
    '001_create_tables.sql',
    '002_add_nama_nim.sql',
    '003_fix_unique_constraint.sql',
    '004_add_kode_asisten_praktikum.sql'
  ],
  'room-management': [
    '001_create_rooms_table.sql',
    '002_create_passcode_logs_table.sql',
    '005_add_custom_passcode_types.sql',
    '006_create_fingerprint_logs_table.sql',
    '007_create_fingerprint_sessions_tables.sql',
    '008_create_card_logs_table.sql',
    '009_create_room_bookings_table.sql'
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
 * Bootstrap migration tracking untuk satu module
 */
async function bootstrapModule(moduleName) {
  try {
    const config = getModuleConfig(moduleName);
    const migrations = existingMigrations[moduleName] || [];
    
    if (migrations.length === 0) {
      logger.warn(`No existing migrations found for module: ${moduleName}`);
      return;
    }

    logger.info(`\n📦 Bootstrapping ${config.name} module...`);
    logger.info(`   Database: ${config.connectionString.split('@')[1] || 'N/A'}`);
    logger.info(`   Found ${migrations.length} existing migration(s)`);

    // Create migration tracking table if not exists
    await config.db.query(`
      CREATE TABLE IF NOT EXISTS ${config.migrationsTable} (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        run_on TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    logger.info(`   ✓ Created/verified migration tracking table: ${config.migrationsTable}`);

    // Mark all existing migrations as already run
    let inserted = 0;
    let skipped = 0;
    
    for (const migration of migrations) {
      // Check if migration file actually exists
      const migrationPath = path.join(__dirname, '..', config.migrationsDir, migration);
      if (!fs.existsSync(migrationPath)) {
        logger.warn(`   ⚠ Migration file not found: ${migration} (skipping)`);
        continue;
      }

      try {
        const trackedName = path.parse(migration).name;
        // Insert dengan timestamp kemarin (untuk menunjukkan sudah dijalankan sebelumnya)
        const result = await config.db.query(`
          INSERT INTO ${config.migrationsTable} (name, run_on)
          VALUES ($1, NOW() - INTERVAL '1 day')
          ON CONFLICT (name) DO NOTHING
          RETURNING id;
        `, [trackedName]);

        if (result.rows.length > 0) {
          logger.info(`   ✓ Marked as already run: ${migration}`);
          inserted++;
        } else {
          logger.info(`   ⊘ Already tracked: ${migration}`);
          skipped++;
        }
      } catch (error) {
        logger.error(`   ✗ Error tracking ${migration}:`, error.message);
        throw error;
      }
    }

    logger.info(`   ✓ Bootstrap complete: ${inserted} inserted, ${skipped} already tracked`);
    
    return { success: true, inserted, skipped };
  } catch (error) {
    logger.error(`✗ Bootstrap failed for ${moduleName}:`, error);
    throw error;
  }
}

/**
 * Bootstrap semua module
 */
async function bootstrapAll() {
  try {
    logger.info('🚀 Starting migration tracking bootstrap...\n');
    
    // Test database connections
    logger.info('Testing database connections...');
    const dbConnected = await testConnections();
    if (!dbConnected) {
      logger.error('✗ Failed to connect to databases');
      process.exit(1);
    }
    logger.info('✓ All database connections OK\n');

    const modules = getAllModuleNames();
    const results = {};

    for (const moduleName of modules) {
      try {
        results[moduleName] = await bootstrapModule(moduleName);
      } catch (error) {
        logger.error(`Failed to bootstrap ${moduleName}:`, error);
        results[moduleName] = { success: false, error: error.message };
      }
    }

    // Summary
    logger.info('\n📊 Bootstrap Summary:');
    logger.info('═'.repeat(50));
    
    let totalInserted = 0;
    let totalSkipped = 0;
    let failed = 0;

    for (const [moduleName, result] of Object.entries(results)) {
      if (result.success) {
        totalInserted += result.inserted || 0;
        totalSkipped += result.skipped || 0;
        logger.info(`✓ ${moduleName}: ${result.inserted || 0} inserted, ${result.skipped || 0} skipped`);
      } else {
        failed++;
        logger.error(`✗ ${moduleName}: Failed - ${result.error || 'Unknown error'}`);
      }
    }

    logger.info('═'.repeat(50));
    logger.info(`Total: ${totalInserted} migrations tracked, ${totalSkipped} already existed`);
    
    if (failed > 0) {
      logger.warn(`⚠ ${failed} module(s) failed`);
      process.exit(1);
    } else {
      logger.info('\n✅ All modules bootstrapped successfully!');
      logger.info('   You can now use node-pg-migrate for new migrations.');
    }
  } catch (error) {
    logger.error('Bootstrap error:', error);
    process.exit(1);
  }
}

/**
 * Bootstrap satu module saja
 */
async function bootstrapSingle(moduleName) {
  try {
    logger.info('🚀 Starting migration tracking bootstrap...\n');
    
    // Test database connections
    logger.info('Testing database connections...');
    const dbConnected = await testConnections();
    if (!dbConnected) {
      logger.error('✗ Failed to connect to databases');
      process.exit(1);
    }
    logger.info('✓ Database connections OK\n');

    await bootstrapModule(moduleName);
    
    logger.info('\n✅ Bootstrap complete!');
  } catch (error) {
    logger.error('Bootstrap error:', error);
    process.exit(1);
  }
}

// Main execution
const moduleName = process.argv[2];

if (moduleName) {
  bootstrapSingle(moduleName);
} else {
  bootstrapAll();
}

