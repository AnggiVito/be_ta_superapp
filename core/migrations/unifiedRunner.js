/**
 * Unified Migration Runner
 * 
 * Sistem unified yang menggunakan node-pg-migrate untuk tracking,
 * tapi bisa handle baik SQL maupun JS migration files.
 * 
 * Semua migration akan:
 * 1. Di-track di pgmigrations table (node-pg-migrate)
 * 2. Bisa rollback (untuk JS) atau manual (untuk SQL)
 * 3. Transaction safe
 * 4. Prevent duplicate execution
 */

import { getModuleConfig } from './config.js';
import { logger } from '../utils/logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function migrationNameVariants(name) {
  const raw = String(name ?? '').trim();
  const base = raw.replace(/\.(sql|cjs|js)$/i, '');
  return [...new Set([raw, base, `${base}.sql`, `${base}.cjs`, `${base}.js`])];
}

function isMigrationNameExecuted(migrationName, executedMigrations) {
  const executed = new Set(executedMigrations);
  return migrationNameVariants(migrationName).some((variant) => executed.has(variant));
}

/**
 * Split SQL into statements, handling dollar-quoted strings ($$...$$) and single-quoted literals ('...').
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

/**
 * Execute SQL migration file
 */
async function executeSQLMigration(db, sqlPath, migrationName) {
  try {
    logger.info(`Executing SQL migration: ${migrationName}`);
    
    const sql = fs.readFileSync(sqlPath, 'utf8');
    const statements = splitSQLStatements(sql);
    
    if (statements.length === 0) {
      logger.warn(`No statements found in ${migrationName}`);
      return true;
    }
    
    logger.info(`  Found ${statements.length} statement(s)`);
    
    // Some PostgreSQL statements cannot run inside transaction blocks
    // (e.g. ALTER TYPE ... ADD VALUE). Detect and fallback to non-transaction mode.
    const requiresNonTransactionalMode = statements.some(statement =>
      /alter\s+type\s+.+\s+add\s+value/i.test(statement)
    );

    const client = await db.connect();
    
    try {
      if (!requiresNonTransactionalMode) {
        await client.query('BEGIN');
      } else {
        logger.info('  Running in non-transactional mode (PostgreSQL DDL limitation detected)');
      }
      
      for (let i = 0; i < statements.length; i++) {
        let statement = statements[i].trim();
        
        if (!statement.endsWith(';')) {
          statement += ';';
        }
        
        try {
          if (!requiresNonTransactionalMode) {
            await client.query('SAVEPOINT migration_statement_sp');
          }

          await client.query(statement);
          logger.info(`  ✓ Statement ${i + 1}/${statements.length} executed`);
        } catch (stmtError) {
          // Ignore IF NOT EXISTS errors
          if (stmtError.message && (
            stmtError.message.includes('already exists') ||
            stmtError.message.includes('duplicate column') ||
            stmtError.message.includes('relation already exists') ||
            stmtError.message.includes('trigger already exists') ||
            stmtError.code === '42710' // duplicate_object error code
          )) {
            if (!requiresNonTransactionalMode) {
              await client.query('ROLLBACK TO SAVEPOINT migration_statement_sp');
            }
            logger.info(`  ⚠ Statement ${i + 1}/${statements.length} skipped (already exists)`);
            continue;
          }
          throw stmtError;
        } finally {
          if (!requiresNonTransactionalMode) {
            await client.query('RELEASE SAVEPOINT migration_statement_sp');
          }
        }
      }
      
      if (!requiresNonTransactionalMode) {
        await client.query('COMMIT');
      }
      logger.info(`✓ SQL migration completed: ${migrationName}`);
      return true;
    } catch (error) {
      if (!requiresNonTransactionalMode) {
        await client.query('ROLLBACK');
      }
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error(`✗ SQL migration failed: ${migrationName}`, error);
    throw error;
  }
}

/**
 * Execute JS migration file (node-pg-migrate format)
 */
async function executeJSMigration(db, jsPath, migrationName) {
  try {
    logger.info(`Executing JS migration: ${migrationName}`);
    
    // Import migration module
    const migrationModule = await import(jsPath);
    
    if (!migrationModule.up) {
      throw new Error(`Migration ${migrationName} missing exports.up`);
    }
    
    // Create pgm object (simplified version of node-pg-migrate's pgm)
    // We'll use the actual node-pg-migrate for this
    // For now, just log that we need to use run-pg-migration.js
    logger.warn(`  JS migrations should be run via: node scripts/run-pg-migration.js`);
    logger.warn(`  This unified runner focuses on SQL migrations with tracking`);
    
    return false;
  } catch (error) {
    logger.error(`✗ JS migration failed: ${migrationName}`, error);
    throw error;
  }
}

/**
 * Check if migration is already executed (tracked in pgmigrations)
 */
async function isMigrationExecuted(db, migrationsTable, migrationName) {
  try {
    const variants = migrationNameVariants(migrationName);
    const result = await db.query(`
      SELECT name FROM ${migrationsTable} WHERE name = ANY($1::text[]);
    `, [variants]);

    return result.rows.length > 0;
  } catch (error) {
    // Table might not exist
    return false;
  }
}

/**
 * Check if SQL migration was already executed by verifying schema
 * This is a safety check for migrations that were run before tracking was implemented
 */
async function isSQLMigrationAlreadyApplied(db, migrationName, sqlPath) {
  try {
    // Read SQL file to check what it creates
    const sql = fs.readFileSync(sqlPath, 'utf8').toLowerCase();
    
    // Check for CREATE TABLE statements
    const createTableMatches = sql.match(/create\s+table\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)/gi);
    
    if (createTableMatches) {
      for (const match of createTableMatches) {
        // Extract table name
        const tableNameMatch = match.match(/(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)/i);
        if (tableNameMatch && tableNameMatch[1]) {
          const tableName = tableNameMatch[1];
          
          // Check if table exists
          const result = await db.query(`
            SELECT EXISTS (
              SELECT FROM information_schema.tables 
              WHERE table_schema = 'public' 
              AND table_name = $1
            );
          `, [tableName]);
          
          // If table doesn't exist, migration probably not applied
          if (!result.rows[0].exists) {
            return false;
          }
        }
      }
      
      // If all tables exist, migration was likely applied
      return true;
    }
    
    // For ALTER TABLE or other operations, we can't reliably detect
    // Return false to be safe (will try to run, but IF NOT EXISTS will protect)
    return false;
  } catch (error) {
    // If we can't read file or check, assume not applied
    return false;
  }
}

/**
 * Mark migration as executed
 */
async function markMigrationExecuted(db, migrationsTable, migrationName) {
  try {
    await db.query(`
      INSERT INTO ${migrationsTable} (name, run_on)
      VALUES ($1, NOW())
      ON CONFLICT (name) DO NOTHING;
    `, [migrationName]);
    
    logger.info(`  ✓ Migration tracked: ${migrationName}`);
  } catch (error) {
    logger.error(`  ✗ Failed to track migration: ${migrationName}`, error);
    throw error;
  }
}

/**
 * Ensure migration tracking table exists
 */
async function ensureTrackingTable(db, migrationsTable) {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS ${migrationsTable} (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        run_on TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
  } catch (error) {
    logger.error(`Failed to create tracking table:`, error);
    throw error;
  }
}

/**
 * Run all migrations for a module (unified)
 * Handles both SQL and JS migrations with node-pg-migrate tracking
 */
export async function runUnifiedMigrations(moduleName) {
  try {
    const config = getModuleConfig(moduleName);
    const migrationsDir = path.join(__dirname, '..', '..', config.migrationsDir);
    
    if (!fs.existsSync(migrationsDir)) {
      logger.warn(`Migrations directory not found: ${migrationsDir}`);
      return { success: false, message: 'Migrations directory not found' };
    }
    
    // Ensure tracking table exists
    await ensureTrackingTable(config.db, config.migrationsTable);
    
    // Get all migration files
    const allFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql') || file.endsWith('.js') || file.endsWith('.cjs'))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    
    if (allFiles.length === 0) {
      logger.warn(`No migration files found in ${migrationsDir}`);
      return { success: true, message: 'No migrations to run' };
    }
    
    logger.info(`Found ${allFiles.length} migration file(s) for ${config.name}`);
    
    const results = {
      executed: [],
      skipped: [],
      failed: []
    };
    
    // Process each migration
    for (const file of allFiles) {
      const migrationPath = path.join(migrationsDir, file);
      
      // Check if already executed (tracked in pgmigrations)
      const isTracked = await isMigrationExecuted(config.db, config.migrationsTable, file);
      
      if (isTracked) {
        logger.info(`⊘ Skipping (already tracked): ${file}`);
        results.skipped.push(file);
        continue;
      }
      
      // For SQL migrations, check if already applied (for migrations run before tracking)
      if (file.endsWith('.sql')) {
        const isAlreadyApplied = await isSQLMigrationAlreadyApplied(config.db, file, migrationPath);
        
        if (isAlreadyApplied) {
          logger.info(`⊘ Migration already applied (but not tracked): ${file}`);
          logger.info(`  → Marking as executed in tracking table...`);
          
          // Mark as executed without running (safe because already applied)
          await markMigrationExecuted(config.db, config.migrationsTable, file);
          results.skipped.push(file);
          continue;
        }
      }
      
      try {
        // Execute based on file type
        if (file.endsWith('.sql')) {
          await executeSQLMigration(config.db, migrationPath, file);
          await markMigrationExecuted(config.db, config.migrationsTable, file);
          results.executed.push(file);
        } else if (file.endsWith('.js') || file.endsWith('.cjs')) {
          // JS migrations should use node-pg-migrate directly
          logger.warn(`  JS migration ${file} should be run via node-pg-migrate`);
          logger.warn(`  Use: node scripts/run-pg-migration.js ${moduleName} up`);
          results.skipped.push(file);
        }
      } catch (error) {
        logger.error(`Failed to execute ${file}:`, error);
        results.failed.push(file);
        // Stop on first failure
        break;
      }
    }
    
    // After running SQL migrations, if there are JS/.cjs migrations present
    // attempt to run pending JS migrations via node-pg-migrate so unified
    // execution covers both SQL and JS migrations.
    const hasJSMigrations = allFiles.some(f => f.endsWith('.js') || f.endsWith('.cjs'));

    if (hasJSMigrations) {
      try {
        logger.info('Detected JS/CJS migrations — invoking node-pg-migrate to apply them');
        const require = createRequire(import.meta.url);
        const nodePgMigrateModule = require('node-pg-migrate');
        let nodePgMigrate;
        if (typeof nodePgMigrateModule === 'function') {
          nodePgMigrate = nodePgMigrateModule;
        } else if (nodePgMigrateModule && typeof nodePgMigrateModule.default === 'function') {
          nodePgMigrate = nodePgMigrateModule.default;
        }

        if (nodePgMigrate) {
          const migrationOptions = {
            databaseUrl: config.connectionString,
            dir: migrationsDir,
            direction: 'up',
            migrationsTable: config.migrationsTable,
            count: undefined,
            dryRun: false,
            verbose: true
          };

          const jsResult = await nodePgMigrate(migrationOptions);
          if (jsResult && jsResult.length > 0) {
            jsResult.forEach(m => {
              if (!results.executed.includes(m.name)) {
                results.executed.push(m.name);
              }
            });
            logger.info(`  ✓ node-pg-migrate applied ${jsResult.length} migration(s)`);
          } else {
            logger.info('  ✓ No pending JS migrations (node-pg-migrate)');
          }
        } else {
          logger.warn('  Could not load node-pg-migrate to run JS migrations');
        }
      } catch (nodePgError) {
        logger.error('  ✗ node-pg-migrate execution failed:', nodePgError);
        results.failed.push('node-pg-migrate');
      }
    }

    // Summary
    logger.info(`\n✓ Migration summary for ${config.name}:`);
    logger.info(`  Executed: ${results.executed.length}`);
    logger.info(`  Skipped: ${results.skipped.length}`);
    if (results.failed.length > 0) {
      logger.error(`  Failed: ${results.failed.length}`);
      return { success: false, results };
    }
    
    return { success: true, results };
  } catch (error) {
    logger.error(`Error running unified migrations for ${moduleName}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Get migration status for a module
 */
export async function getMigrationStatus(moduleName) {
  try {
    const config = getModuleConfig(moduleName);
    const migrationsDir = path.join(__dirname, '..', '..', config.migrationsDir);
    
    if (!fs.existsSync(migrationsDir)) {
      return { exists: false, migrations: [] };
    }
    
    const allFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql') || file.endsWith('.js') || file.endsWith('.cjs'))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    
    let executedMigrations = [];
    try {
      const result = await config.db.query(`
        SELECT name FROM ${config.migrationsTable} ORDER BY run_on;
      `);
      executedMigrations = result.rows.map(row => row.name);
    } catch (error) {
      // Table might not exist
    }
    
    const migrations = allFiles.map(file => ({
      name: file,
      type: file.endsWith('.sql') ? 'sql' : 'js', // .js and .cjs are both JS migrations
      executed: isMigrationNameExecuted(file, executedMigrations),
    }));

    const pendingCount = migrations.filter((migration) => !migration.executed).length;

    return {
      exists: true,
      migrations,
      total: allFiles.length,
      executed: migrations.filter((migration) => migration.executed).length,
      pending: pendingCount,
    };
  } catch (error) {
    logger.error(`Error getting migration status for ${moduleName}:`, error);
    return { exists: false, migrations: [], error: error.message };
  }
}

