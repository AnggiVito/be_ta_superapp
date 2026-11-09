# Migration Guide

Panduan lengkap untuk database migration dengan sistem unified yang menggunakan node-pg-migrate untuk tracking.

## 🎯 Quick Start

### Check Status Migration

```bash
# Check semua module
node scripts/migrate-setup.js

# Check satu module
node scripts/migrate-setup.js registration
```

### Run Migration

```bash
# Unified migration (handle SQL & JS dengan auto-detection)
npm run migrate:unified registration

# Atau untuk JS migration baru
npm run migrate:pg:registration up
```

### Bootstrap (Untuk Production yang Sudah Ada Data)

```bash
# Mark migration SQL yang sudah pernah dijalankan
npm run migrate:bootstrap
```

## 📋 Urutan Migration

```
1. user-management    → Base module
2. activity-log      → Bergantung pada user-management
3. registration      → Base data
4. conduct          → Bergantung pada registration
5. room-management  → Independent
6. reporting        → Bergantung pada registration
7. procurement      → Independent
```

## 🔧 Commands

### Unified Migration (Recommended)

```bash
# Run migration untuk satu module
npm run migrate:unified <module-name>

# Contoh
npm run migrate:unified registration
npm run migrate:unified conduct
```

**Fitur:**
- Handle SQL dan JS migration
- Auto-detect migration yang sudah dijalankan
- Tracking di `pgmigrations` table
- Transaction safe

### JS Migration (node-pg-migrate)

```bash
# Run migration
npm run migrate:pg:<module-name> up

# Rollback
npm run migrate:pg:<module-name> down

# Create migration baru
npm run migrate:create <module-name> <migration-name>
```

### SQL Migration (Legacy)

```bash
# Run SQL migration (old system)
npm run migrate:module <module-name>
```

**Note:** 
- **JS Migration dengan node-pg-migrate (Recommended untuk migration baru)**: Support rollback, di-track di `pgmigrations`, format standar
- **SQL Migration (Legacy)**: Untuk file migration SQL yang sudah ada, tetap digunakan dengan `migrate:unified`
- Sistem lama (`migrate:module`) masih bisa digunakan, tapi disarankan pakai `migrate:pg` untuk migration baru

## 🚀 Workflow

### Database Baru

```bash
# Run unified migration untuk semua module
npm run migrate:unified registration
npm run migrate:unified conduct
# ... dst
```

### Database Sudah Ada Data (Production)

```bash
# 1. Bootstrap (mark migration SQL sebagai executed)
npm run migrate:bootstrap

# 2. Verify
npm run migrate:unified registration
# Akan skip semua yang sudah di-track
```

### Migration Baru (JS Migration dengan node-pg-migrate - Recommended)

**Untuk migration baru, gunakan JS format dengan node-pg-migrate:**

```bash
# 1. Create JS migration
npm run migrate:create <module-name> <migration-name>

# Contoh:
npm run migrate:create conduct add_booking_id_to_qr_sessions

# 2. Edit migration file
# modules/<module-name>/migrations/YYYYMMDDHHMMSS_migration_name.js

# 3. Run migration dengan node-pg-migrate
npm run migrate:pg:<module-name> up

# Contoh:
npm run migrate:pg:conduct up
```

**Format JS Migration (node-pg-migrate):**
```javascript
/**
 * Migration: YYYY-MM-DD
 * 
 * Description: What this migration does
 * Related: Feature/Issue reference
 */

exports.up = (pgm) => {
  // Add column
  pgm.addColumn('table_name', {
    new_column: {
      type: 'varchar(255)',
      notNull: false,
    },
  });

  // Add comment
  pgm.sql(`
    COMMENT ON COLUMN table_name.new_column IS 'Description';
  `);

  // Create index
  pgm.createIndex('table_name', 'column_name', {
    name: 'idx_name',
    where: 'condition',
    ifNotExists: true,
  });
};

exports.down = (pgm) => {
  // Rollback: drop index
  pgm.dropIndex('table_name', 'idx_name', {
    ifExists: true,
  });

  // Rollback: drop column
  pgm.dropColumn('table_name', 'new_column', {
    ifExists: true,
  });
};
```

**Contoh Migration File:**
- `20251206_120014_update_booking_date_comment.js` - Update comment (registration)
- `20250101_000000_add_booking_id_to_qr_sessions.cjs` - Add column (conduct)

**Note:** 
- Migration akan di-track di `pgmigrations` table oleh node-pg-migrate
- Support rollback dengan `npm run migrate:pg:<module-name> down`
- Transaction safe
- Format timestamp: `YYYYMMDDHHMMSS_migration_name.js`

### Migration Lama (SQL - Legacy)

**File migration SQL yang sudah ada tetap digunakan dengan `migrate:unified`:**

```bash
# Run SQL migrations yang sudah ada
npm run migrate:unified <module-name>
```

**Contoh Migration File (Legacy):**
- `001_create_qr_attendance_tables.sql` - Create tables (conduct)
- `002_add_checkout_field.sql` - Add column (conduct)
- `001_create_master_tables.sql` - Create tables (registration)
- `002_create_schedules_table.sql` - Create tables (registration)

**Note:** 
- Migration SQL yang sudah ada tetap dipertahankan
- Di-track di `pgmigrations` table oleh unified runner
- Untuk migration baru, gunakan JS format dengan `migrate:pg`

## 🛡️ Safety Features

- **Tracking**: Semua migration di-track di `pgmigrations` table
- **Auto-detection**: Deteksi migration yang sudah dijalankan
- **Transaction**: SQL migration dalam transaction (auto-rollback jika error)
- **Duplicate Prevention**: Migration tidak akan dijalankan 2x

## 📝 Module List

| Module | Database | Command (SQL Legacy) | Command (JS New) |
|--------|----------|---------------------|------------------|
| registration | registration_db | `npm run migrate:unified registration` | `npm run migrate:pg:registration up` |
| conduct | conduct_db | `npm run migrate:unified conduct` | `npm run migrate:pg:conduct up` |
| user-management | user_management_db | `npm run migrate:unified user-management` | `npm run migrate:pg:user-management up` |
| room-management | room_management_db | `npm run migrate:unified room-management` | `npm run migrate:pg:room-management up` |
| reporting | reporting_db | `npm run migrate:unified reporting` | `npm run migrate:pg:reporting up` |
| procurement | procurement_db | `npm run migrate:unified procurement` | `npm run migrate:pg:procurement up` |
| activity-log | user_management_db | `npm run migrate:unified activity-log` | `npm run migrate:pg:activity-log up` |

## ⚠️ Important Notes

1. **Backup database** sebelum migration di production
2. **Test di development/staging** terlebih dahulu
3. **Bootstrap dulu** untuk production yang sudah ada data
4. **Migration baru** pakai **JS format dengan node-pg-migrate** (`migrate:pg`). Migration SQL yang sudah ada tetap digunakan dengan `migrate:unified`

## 🐛 Troubleshooting

### Migration sudah dijalankan tapi masih pending

```bash
# Bootstrap untuk mark sebagai executed
npm run migrate:bootstrap <module-name>
```

### Error: "Migration tracking table not found"

Unified runner akan otomatis create. Jika masih error, cek database connection.

### Check migration status

```bash
node scripts/migrate-setup.js <module-name>
```

## 📚 Reference

- [node-pg-migrate Documentation](https://salsita.github.io/node-pg-migrate/)
- Migration files: `modules/<module-name>/migrations/`

