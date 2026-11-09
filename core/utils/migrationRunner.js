/**
 * Migration Runner
 * Menjalankan migration SQL files ke database
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { userManagementDb, reportingDb, registrationDb, conductDb, procurementDb, roomManagementDb } from '../../config/databases.js';
import { logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Split SQL into statements, handling dollar-quoted strings ($$...$$) and single-quoted literals ('...').
 * Semicolon di dalam string kutip tunggal (mis. COMMENT ... 'teks; lanjut') bukan pemisah pernyataan.
 */
function splitSQLStatements(sql) {
  const statements = [];
  let currentStatement = '';
  let inDollarQuote = false;
  let dollarTag = '';
  let inSingleQuote = false;
  let i = 0;

  while (i < sql.length) {
    const char = sql[i];

    if (inDollarQuote) {
      if (i + dollarTag.length <= sql.length) {
        const potentialTag = sql.substring(i, i + dollarTag.length);
        if (potentialTag === dollarTag) {
          currentStatement += dollarTag;
          const tagLength = dollarTag.length;
          inDollarQuote = false;
          dollarTag = '';
          i += tagLength;
          continue;
        }
      }
      currentStatement += char;
      i++;
      continue;
    }

    if (inSingleQuote) {
      currentStatement += char;
      if (char === "'") {
        if (i + 1 < sql.length && sql[i + 1] === "'") {
          currentStatement += sql[i + 1];
          i += 2;
          continue;
        }
        inSingleQuote = false;
      }
      i++;
      continue;
    }

    if (char === "'" && !inDollarQuote) {
      inSingleQuote = true;
      currentStatement += char;
      i++;
      continue;
    }

    if (char === '$') {
      let tagEnd = i + 1;
      while (tagEnd < sql.length && sql[tagEnd] !== '$') {
        tagEnd++;
      }

      if (tagEnd < sql.length) {
        dollarTag = sql.substring(i, tagEnd + 1);
        inDollarQuote = true;
        currentStatement += dollarTag;
        i = tagEnd + 1;
        continue;
      }
    }

    if (char === ';') {
      const trimmed = currentStatement.trim();
      if (trimmed.length > 0) {
        const cleaned = trimmed.replace(/--.*$/gm, '').trim();
        if (cleaned.length > 0) {
          statements.push(trimmed);
        }
      }
      currentStatement = '';
      i++;
      continue;
    }

    currentStatement += char;
    i++;
  }

  if (currentStatement.trim().length > 0) {
    const trimmed = currentStatement.trim();
    const cleaned = trimmed.replace(/--.*$/gm, '').trim();
    if (cleaned.length > 0) {
      statements.push(trimmed);
    }
  }

  return statements;
}

/** Error yang boleh diabaikan saat migrasi idempotent (pernyataan sudah terpasang). */
function isIgnorableMigrationStatementError(err) {
  const msg = err && err.message ? err.message : '';
  return (
    msg.includes('already exists') ||
    msg.includes('duplicate column') ||
    msg.includes('relation already exists')
  );
}

/**
 * Run migration file (satu transaksi per file + SAVEPOINT per pernyataan).
 * Tanpa SAVEPOINT, error yang di-skip akan membuat transaksi aborted dan pernyataan berikutnya gagal.
 */
async function runMigrationFile(db, migrationPath, migrationName) {
  const client = await db.connect();
  try {
    logger.info(`Running migration: ${migrationName}`);

    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    const statements = splitSQLStatements(migrationSQL);

    if (statements.length === 0) {
      logger.warn(`No statements found in ${migrationName}`);
      return true;
    }

    logger.info(`  Found ${statements.length} statement(s) to execute`);

    await client.query('BEGIN');

    for (let i = 0; i < statements.length; i++) {
      let statement = statements[i].trim();
      if (!statement.endsWith(';')) {
        statement += ';';
      }

      if (statement.includes('$$')) {
        const preview = statement.substring(0, 100).replace(/\n/g, ' ');
        logger.debug(`  Executing statement ${i + 1} (contains $$): ${preview}...`);
      }

      const sp = `m_sp_${i}`;
      await client.query(`SAVEPOINT ${sp}`);

      try {
        await client.query(statement);
        await client.query(`RELEASE SAVEPOINT ${sp}`);
        logger.info(`  ✓ Statement ${i + 1}/${statements.length} executed`);
      } catch (stmtError) {
        await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);

        if (isIgnorableMigrationStatementError(stmtError)) {
          logger.info(`  ⚠ Statement ${i + 1}/${statements.length} skipped (${stmtError.message.split('\n')[0]})`);
          continue;
        }
        throw stmtError;
      }
    }

    await client.query('COMMIT');
    logger.info(`✓ Migration completed: ${migrationName}`);
    return true;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }

    if (error.message && error.message.includes('already exists')) {
      logger.warn(`Migration ${migrationName} skipped (already exists)`);
      return true;
    }

    logger.error(`✗ Migration failed: ${migrationName}`, error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Run all migrations for user management module
 */
export async function runUserManagementMigrations() {
  try {
    const migrationsDir = path.join(
      __dirname,
      '../../modules/user-management/migrations'
    );
    
    // Check if migrations directory exists
    if (!fs.existsSync(migrationsDir)) {
      logger.warn('Migrations directory not found:', migrationsDir);
      return false;
    }
    
    // Get all migration files sorted by name
    const files = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();
    
    if (files.length === 0) {
      logger.warn('No migration files found');
      return false;
    }
    
    logger.info(`Found ${files.length} migration file(s)`);
    
    // Run each migration
    for (const file of files) {
      const migrationPath = path.join(migrationsDir, file);
      await runMigrationFile(userManagementDb, migrationPath, file);
    }
    
    logger.info('✓ All user management migrations completed');
    return true;
  } catch (error) {
    logger.error('Error running migrations:', error);
    return false;
  }
}

/**
 * Check if tables exist
 */
export async function checkTablesExist() {
  try {
    const result = await userManagementDb.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('user_profiles', 'user_roles')
    `);
    
    const existingTables = result.rows.map(row => row.table_name);
    const requiredTables = ['user_profiles', 'user_roles'];
    const missingTables = requiredTables.filter(t => !existingTables.includes(t));
    
    return {
      exists: missingTables.length === 0,
      existing: existingTables,
      missing: missingTables,
    };
  } catch (error) {
    logger.error('Error checking tables:', error);
    return {
      exists: false,
      existing: [],
      missing: ['user_profiles', 'user_roles'],
    };
  }
}

/**
 * Run all migrations for reporting module
 */
export async function runReportingMigrations() {
  try {
    const migrationsDir = path.join(
      __dirname,
      '../../modules/reporting/migrations'
    );
    
    // Check if migrations directory exists
    if (!fs.existsSync(migrationsDir)) {
      logger.warn('Reporting migrations directory not found:', migrationsDir);
      return false;
    }
    
    // Get all migration files sorted by name
    const files = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();
    
    if (files.length === 0) {
      logger.warn('No reporting migration files found');
      return false;
    }
    
    logger.info(`Found ${files.length} reporting migration file(s)`);
    
    // Run each migration
    for (const file of files) {
      const migrationPath = path.join(migrationsDir, file);
      await runMigrationFile(reportingDb, migrationPath, file);
    }
    
    logger.info('✓ All reporting migrations completed');
    return true;
  } catch (error) {
    logger.error('Error running reporting migrations:', error);
    return false;
  }
}

/**
 * Check if reporting tables exist
 */
export async function checkReportingTablesExist() {
  try {
    const result = await reportingDb.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('feedback_uploads', 'feedback_items', 'feedback_summaries')
    `);
    
    const existingTables = result.rows.map(row => row.table_name);
    const requiredTables = ['feedback_uploads', 'feedback_items', 'feedback_summaries'];
    const missingTables = requiredTables.filter(t => !existingTables.includes(t));
    
    return {
      exists: missingTables.length === 0,
      existing: existingTables,
      missing: missingTables,
    };
  } catch (error) {
    logger.error('Error checking reporting tables:', error);
    return {
      exists: false,
      existing: [],
      missing: ['feedback_uploads', 'feedback_items', 'feedback_summaries'],
    };
  }
}

/**
 * Run all migrations for activity log module
 */
export async function runActivityLogMigrations() {
  try {
    const migrationsDir = path.join(
      __dirname,
      '../../modules/activity-log/migrations'
    );
    
    // Check if migrations directory exists
    if (!fs.existsSync(migrationsDir)) {
      logger.warn('Activity log migrations directory not found:', migrationsDir);
      return false;
    }
    
    // Get all migration files sorted by name
    const files = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();
    
    if (files.length === 0) {
      logger.warn('No activity log migration files found');
      return false;
    }
    
    logger.info(`Found ${files.length} activity log migration file(s)`);
    
    // Run each migration (activity log uses userManagementDb)
    for (const file of files) {
      const migrationPath = path.join(migrationsDir, file);
      await runMigrationFile(userManagementDb, migrationPath, file);
    }
    
    logger.info('✓ All activity log migrations completed');
    return true;
  } catch (error) {
    logger.error('Error running activity log migrations:', error);
    return false;
  }
}

/**
 * Check if activity log tables exist
 */
export async function checkActivityLogTablesExist() {
  try {
    const result = await userManagementDb.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('activity_logs')
    `);
    
    const existingTables = result.rows.map(row => row.table_name);
    const requiredTables = ['activity_logs'];
    const missingTables = requiredTables.filter(t => !existingTables.includes(t));
    
    return {
      exists: missingTables.length === 0,
      existing: existingTables,
      missing: missingTables,
    };
  } catch (error) {
    logger.error('Error checking activity log tables:', error);
    return {
      exists: false,
      existing: [],
      missing: ['activity_logs'],
    };
  }
}

/**
 * Run all migrations for registration module
 */
export async function runRegistrationMigrations() {
  try {
    const migrationsDir = path.join(
      __dirname,
      '../../modules/registration/migrations'
    );
    
    // Check if migrations directory exists
    if (!fs.existsSync(migrationsDir)) {
      logger.warn('Registration migrations directory not found:', migrationsDir);
      return false;
    }
    
    // Get all migration files sorted by name
    const files = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();
    
    if (files.length === 0) {
      logger.warn('No registration migration files found');
      return false;
    }
    
    logger.info(`Found ${files.length} registration migration file(s)`);
    
    // Run each migration
    for (const file of files) {
      const migrationPath = path.join(migrationsDir, file);
      await runMigrationFile(registrationDb, migrationPath, file);
    }
    
    logger.info('✓ All registration migrations completed');
    return true;
  } catch (error) {
    logger.error('Error running registration migrations:', error);
    return false;
  }
}

/**
 * Check if registration tables exist
 */
export async function checkRegistrationTablesExist() {
  try {
    const result = await registrationDb.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('study_programs', 'laboratories', 'practicums', 'practicum_modules', 'students', 'practicum_enrollments', 'schedules')
    `);
    
    const existingTables = result.rows.map(row => row.table_name);
    const requiredTables = ['study_programs', 'laboratories', 'practicums', 'practicum_modules', 'students', 'practicum_enrollments', 'schedules'];
    const missingTables = requiredTables.filter(t => !existingTables.includes(t));
    
    return {
      exists: missingTables.length === 0,
      existing: existingTables,
      missing: missingTables,
    };
  } catch (error) {
    logger.error('Error checking registration tables:', error);
    return {
      exists: false,
      existing: [],
      missing: ['study_programs', 'laboratories', 'practicums', 'practicum_modules', 'students', 'practicum_enrollments', 'schedules'],
    };
  }
}


/** Retired by 20260605_000001_drop_legacy_qr_attendance_tables.cjs — must not be re-applied. */
const RETIRED_CONDUCT_SQL_MIGRATIONS = new Set([
  '001_create_qr_attendance_tables.sql',
  '002_add_checkout_field.sql',
]);

const CONDUCT_REQUIRED_TABLES = [
  'practicum_operational_sessions',
  'practicum_operational_session_attendances',
];

/**
 * Run supplemental SQL migrations for conduct module (003+).
 * Legacy QR attendance SQL (001–002) is skipped; use migrate:pg:conduct for .cjs migrations.
 */
export async function runConductMigrations() {
  try {
    const migrationsDir = path.join(
      __dirname,
      '../../modules/conduct/migrations'
    );
    
    // Check if migrations directory exists
    if (!fs.existsSync(migrationsDir)) {
      logger.warn('Conduct migrations directory not found:', migrationsDir);
      return false;
    }
    
    const allSqlFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();

    const files = allSqlFiles.filter(file => !RETIRED_CONDUCT_SQL_MIGRATIONS.has(file));
    const skipped = allSqlFiles.filter(file => RETIRED_CONDUCT_SQL_MIGRATIONS.has(file));

    skipped.forEach(file => {
      logger.info(`Skipping retired conduct SQL migration: ${file}`);
    });
    
    if (files.length === 0) {
      logger.warn('No active conduct SQL migration files found');
      return skipped.length > 0;
    }
    
    logger.info(`Found ${files.length} conduct SQL migration file(s)`);
    
    for (const file of files) {
      const migrationPath = path.join(migrationsDir, file);
      await runMigrationFile(conductDb, migrationPath, file);
    }
    
    logger.info('✓ All conduct SQL migrations completed');
    return true;
  } catch (error) {
    logger.error('Error running conduct migrations:', error);
    return false;
  }
}

/**
 * Check if core conduct (operational session) tables exist.
 */
export async function checkConductTablesExist() {
  try {
    const placeholders = CONDUCT_REQUIRED_TABLES.map((_, i) => `$${i + 1}`).join(', ');
    const result = await conductDb.query(
      `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN (${placeholders})
    `,
      CONDUCT_REQUIRED_TABLES
    );
    
    const existingTables = result.rows.map(row => row.table_name);
    const missingTables = CONDUCT_REQUIRED_TABLES.filter(t => !existingTables.includes(t));
    
    return {
      exists: missingTables.length === 0,
      existing: existingTables,
      missing: missingTables,
    };
  } catch (error) {
    logger.error('Error checking conduct tables:', error);
    return {
      exists: false,
      existing: [],
      missing: [...CONDUCT_REQUIRED_TABLES],
    };
  }
}

/**
 * Warn if retired legacy QR attendance tables were recreated.
 */
export async function checkLegacyConductTablesAbsent() {
  try {
    const result = await conductDb.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('qr_attendance_sessions', 'attendance')
    `);

    const existing = result.rows.map(row => row.table_name);
    return {
      absent: existing.length === 0,
      existing,
    };
  } catch (error) {
    logger.error('Error checking legacy conduct tables:', error);
    return { absent: true, existing: [] };
  }
}

/**
 * Run all migrations for procurement module
 */
export async function runProcurementMigrations() {
  try {
    const migrationsDir = path.join(
      __dirname,
      '../../modules/procurement/migrations'
    );
    
    // Check if migrations directory exists
    if (!fs.existsSync(migrationsDir)) {
      logger.warn('Procurement migrations directory not found:', migrationsDir);
      return false;
    }
    
    // Delegate to unified runner to ensure consistent ordering and handling
    // of SQL and JS (.cjs) migrations. This keeps procurement migrations
    // running from earliest to latest using the unified runner logic.
    const { runUnifiedMigrations } = await import('../migrations/unifiedRunner.js');
    const unifiedResult = await runUnifiedMigrations('procurement');
    return unifiedResult.success;
    
    if (files.length === 0) {
      logger.warn('No procurement migration files found');
      return false;
    }
    
    logger.info(`Found ${files.length} procurement migration file(s)`);
    
    // Run each migration
    for (const file of files) {
      const migrationPath = path.join(migrationsDir, file);
      await runMigrationFile(procurementDb, migrationPath, file);
    }
    
    logger.info('✓ All procurement migrations completed');
    return true;
  } catch (error) {
    logger.error('Error running procurement migrations:', error);
    return false;
  }
}

/**
 * Check if procurement tables exist
 */
export async function checkProcurementTablesExist() {
  try {
    const result = await procurementDb.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('procurement_pengajuan', 'procurement_pengajuan_items')
    `);
    
    const existingTables = result.rows.map(row => row.table_name);
    const requiredTables = ['procurement_pengajuan', 'procurement_pengajuan_items'];
    const missingTables = requiredTables.filter(t => !existingTables.includes(t));
    
    return {
      exists: missingTables.length === 0,
      existing: existingTables,
      missing: missingTables,
    };
  } catch (error) {
    logger.error('Error checking procurement tables:', error);
    return {
      exists: false,
      existing: [],
      missing: ['procurement_pengajuan', 'procurement_pengajuan_items'],
    };
  }
}

/**
 * Run all migrations for room management module
 */
export async function runRoomManagementMigrations() {
  try {
    const migrationsDir = path.join(
      __dirname,
      '../../modules/room-management/migrations'
    );
    
    // Check if migrations directory exists
    if (!fs.existsSync(migrationsDir)) {
      logger.warn('Room management migrations directory not found:', migrationsDir);
      return false;
    }
    
    // Get all migration files sorted by name
    const files = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();
    
    if (files.length === 0) {
      logger.warn('No room management migration files found');
      return false;
    }
    
    logger.info(`Found ${files.length} room management migration file(s)`);
    
    // Run each migration
    for (const file of files) {
      const migrationPath = path.join(migrationsDir, file);
      await runMigrationFile(roomManagementDb, migrationPath, file);
    }
    
    logger.info('✓ All room management migrations completed');
    return true;
  } catch (error) {
    logger.error('Error running room management migrations:', error);
    return false;
  }
}

/**
 * Check if room management tables exist
 */
export async function checkRoomManagementTablesExist() {
  try {
    const result = await roomManagementDb.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('rooms', 'passcode_logs')
    `);
    
    const existingTables = result.rows.map(row => row.table_name);
    const requiredTables = ['rooms', 'passcode_logs'];
    const missingTables = requiredTables.filter(t => !existingTables.includes(t));
    
    return {
      exists: missingTables.length === 0,
      existing: existingTables,
      missing: missingTables,
    };
  } catch (error) {
    logger.error('Error checking room management tables:', error);
    return {
      exists: false,
      existing: [],
      missing: ['rooms', 'passcode_logs'],
    };
  }
}
