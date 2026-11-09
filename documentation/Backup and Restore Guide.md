# Backup and Restore Guide

Dokumentasi lengkap untuk melakukan backup dan restore database PostgreSQL serta folder uploads pada proyek ini.

## 📋 Daftar Isi

1. [Overview](#overview)
2. [Struktur Backup](#struktur-backup)
3. [Backup Database](#backup-database)
4. [Backup Uploads](#backup-uploads)
5. [Restore Database](#restore-database)
6. [Restore Uploads](#restore-uploads)
7. [Best Practices](#best-practices)
8. [Troubleshooting](#troubleshooting)

---

## Overview

Proyek ini menggunakan Docker dengan named volumes untuk menyimpan data database dan bind mount untuk folder uploads. Script backup dan restore telah disediakan untuk memudahkan proses backup dan restore data.

### Komponen yang Di-backup

1. **Database PostgreSQL** (3 database):
   - `registration_db` - Database untuk modul registration
   - `conduct_db` - Database untuk modul conduct (container `fri-conduct-db`)
   - `user_management_db` - Database untuk modul user management

2. **Folder Uploads**:
   - Folder `uploads/` yang berisi file-file yang diunggah oleh user (seperti TTD, dokumen, dll)

---

## Struktur Backup

Backup akan disimpan di direktori berikut:

```
backups/
├── database/
│   └── YYYYMMDD_HHMMSS/
│       ├── registration_db.dump
│       ├── conduct_db.dump
│       ├── user_management_db.dump
│       └── backup_info.txt
└── uploads/
    └── YYYYMMDD_HHMMSS/
        ├── uploads.tar.gz
        └── backup_info.txt
```

Setiap backup memiliki timestamp untuk memudahkan identifikasi dan manajemen.

---

## Backup Database

### Cara Menggunakan

#### 1. Backup Manual

Jalankan script backup database:

```bash
./scripts/backup-db.sh
```

Atau dengan custom backup directory:

```bash
./scripts/backup-db.sh /path/to/backup/directory
```

#### 2. Backup Otomatis (Cron Job)

Untuk backup otomatis, tambahkan ke crontab:

```bash
# Backup setiap hari jam 2 pagi
0 2 * * * cd /path/to/project && ./scripts/backup-db.sh >> logs/backup.log 2>&1

# Backup setiap minggu (Minggu jam 1 pagi)
0 1 * * 0 cd /path/to/project && ./scripts/backup-db.sh >> logs/backup.log 2>&1
```

### Format Backup

- **Format**: PostgreSQL Custom Format (`.dump`)
- **Keuntungan**: 
  - Dapat di-restore secara selektif (tabel tertentu saja)
  - Kompresi otomatis
  - Lebih cepat untuk database besar
  - Mendukung parallel restore

### Environment Variables

Script backup dapat dikonfigurasi dengan environment variables:

```bash
export REGISTRATION_DB_NAME=registration_db
export CONDUCT_DB_NAME=conduct_db
export USER_MANAGEMENT_DB_NAME=user_management_db
export REGISTRATION_DB_USER=postgres
export CONDUCT_DB_USER=postgres
export USER_MANAGEMENT_DB_USER=postgres
```

### Output

Script akan menghasilkan:
- File backup untuk setiap database (`.dump`)
- File `backup_info.txt` berisi metadata backup
- Summary report di console

**Contoh Output:**
```
=== Database Backup Script ===
Backup directory: /path/to/project/backups/database/20240115_143022

Backing up registration_db from fri-registration-db...
✓ Successfully backed up registration_db
Backing up conduct_db from fri-conduct-db...
✓ Successfully backed up conduct_db
Backing up user_management_db from fri-user-management-db...
✓ Successfully backed up user_management_db

=== Backup Summary ===
Backup location: /path/to/project/backups/database/20240115_143022
Successful backups: 3
Failed backups: 0
✓ All backups completed successfully!
```

---

## Backup Uploads

### Cara Menggunakan

#### 1. Backup Manual

Jalankan script backup uploads:

```bash
./scripts/backup-uploads.sh
```

Atau dengan custom backup directory:

```bash
./scripts/backup-uploads.sh /path/to/backup/directory
```

#### 2. Backup Otomatis (Cron Job)

```bash
# Backup setiap hari jam 3 pagi
0 3 * * * cd /path/to/project && ./scripts/backup-uploads.sh >> logs/backup.log 2>&1
```

### Format Backup

- **Format**: tar.gz (gzip compressed)
- **Keuntungan**:
  - Kompresi tinggi
  - Preserves file permissions
  - Mudah di-extract

### Output

Script akan menghasilkan:
- File `uploads.tar.gz` berisi seluruh folder uploads
- File `backup_info.txt` berisi metadata backup
- Summary report di console

**Contoh Output:**
```
=== Uploads Backup Script ===
Backup directory: /path/to/project/backups/uploads/20240115_143500

Backing up uploads folder...
✓ Successfully backed up uploads folder
  File size: 15M
  Location: /path/to/project/backups/uploads/20240115_143500/uploads.tar.gz

Contents backed up:
  - file1.pdf
  - file2.jpg
  - ttd/signature1.png
  ... and 50 more files

=== Backup Summary ===
Backup location: /path/to/project/backups/uploads/20240115_143500/uploads.tar.gz
✓ Uploads backup completed successfully!
```

---

## Restore Database

### ⚠️ PERINGATAN

Restore database akan **menimpa data yang ada**. Pastikan untuk:
1. Backup data saat ini terlebih dahulu
2. Memastikan container database sedang berjalan
3. Memverifikasi backup file yang akan digunakan

### Cara Menggunakan

#### 1. Restore Semua Database

```bash
./scripts/restore-db.sh backups/database/20240115_143022
```

Script akan meminta konfirmasi sebelum melakukan restore.

#### 2. Restore Database Tertentu

```bash
# Restore hanya registration_db
./scripts/restore-db.sh backups/database/20240115_143022 registration_db

# Restore hanya conduct_db (alias: execution_db untuk backup lama)
./scripts/restore-db.sh backups/database/20240115_143022 conduct_db

# Restore hanya user_management_db
./scripts/restore-db.sh backups/database/20240115_143022 user_management_db
```

### Prasyarat

1. **Container harus berjalan**:
   ```bash
   docker compose up -d registration_db conduct_db user_management_db
   ```

2. **Backup file harus ada**:
   - `registration_db.dump`
   - `conduct_db.dump` (backup lama mungkin `execution_db.dump`; restore script mendukung keduanya)
   - `user_management_db.dump`

### Proses Restore

1. Script akan meminta konfirmasi
2. Menyalin backup file ke container
3. Menutup koneksi aktif ke database
4. Melakukan restore menggunakan `pg_restore`
5. Membersihkan file temporary

**Contoh Output:**
```
=== Database Restore Script ===
Backup directory: backups/database/20240115_143022

WARNING: This will restore ALL databases from backup!
Are you sure you want to continue? (yes/no): yes

Restoring registration_db to fri-registration-db...
  Dropping existing connections...
  Restoring database...
✓ Successfully restored registration_db

=== Restore Summary ===
Successful restores: 3
Failed restores: 0
✓ All restores completed successfully!
```

---

## Restore Uploads

### ⚠️ PERINGATAN

Restore uploads akan **menimpa folder uploads yang ada**. Script akan membuat safety backup otomatis sebelum restore.

### Cara Menggunakan

```bash
./scripts/restore-uploads.sh backups/uploads/20240115_143500/uploads.tar.gz
```

### Proses Restore

1. Script akan meminta konfirmasi
2. Membuat safety backup dari uploads yang ada (jika ada)
3. Mengekstrak backup file ke folder uploads
4. Menampilkan summary

**Contoh Output:**
```
=== Uploads Restore Script ===
Backup file: backups/uploads/20240115_143500/uploads.tar.gz
Target directory: /path/to/project/uploads

WARNING: This will restore uploads folder from backup!
Are you sure you want to continue? (yes/no): yes

Creating safety backup of existing uploads...
✓ Safety backup created: /path/to/project/uploads_backup_20240115_150000.tar.gz

Extracting backup...
✓ Successfully restored uploads folder

=== Restore Summary ===
Total files restored: 53
Total size: 15M
✓ Uploads restore completed successfully!
```

---

## Best Practices

### 1. Jadwal Backup

**Rekomendasi:**
- **Database**: Setiap hari (untuk production) atau setiap minggu (untuk development)
- **Uploads**: Setiap hari atau setiap kali ada perubahan signifikan

### 2. Retensi Backup

Simpan backup dengan strategi berikut:
- **Daily backups**: Simpan 7 hari terakhir
- **Weekly backups**: Simpan 4 minggu terakhir
- **Monthly backups**: Simpan 12 bulan terakhir

### 3. Verifikasi Backup

Selalu verifikasi backup setelah dibuat:
```bash
# Cek ukuran file backup
ls -lh backups/database/YYYYMMDD_HHMMSS/

# Cek metadata
cat backups/database/YYYYMMDD_HHMMSS/backup_info.txt
```

### 4. Storage Backup

**Untuk Development:**
- Simpan di local storage atau network drive

**Untuk Production:**
- Simpan di cloud storage (AWS S3, Google Cloud Storage, dll)
- Gunakan script tambahan untuk upload ke cloud setelah backup
- Implementasikan encryption untuk data sensitif

### 5. Testing Restore

**PENTING**: Test restore secara berkala di environment staging untuk memastikan backup dapat digunakan.

### 6. Monitoring

Monitor ukuran backup dan alert jika:
- Backup gagal
- Ukuran backup tidak normal (terlalu kecil atau terlalu besar)
- Backup tidak dibuat sesuai jadwal

### 7. Script Backup All-in-One

Buat script untuk backup semua komponen sekaligus:

```bash
#!/bin/bash
# scripts/backup-all.sh

set -e

echo "Starting full backup..."
./scripts/backup-db.sh
./scripts/backup-uploads.sh
echo "Full backup completed!"
```

---

## Troubleshooting

### Upgrade dari `execution_db` ke `conduct_db` (Docker Compose)

- Service Postgres untuk modul conduct sekarang bernama **`conduct_db`** (container **`fri-conduct-db`**). Hapus container lama yang tidak ada di compose supaya tidak bentrok port, misalnya:
  ```bash
  docker compose -f docker-compose.yml down --remove-orphans
  ```
- Volume data baru bernama **`conduct_db_data`**. Jika server masih punya volume lama **`execution_db_data`** berisi data production, lakukan migrasi satu kali (salin isi volume ke volume baru) atau gunakan [external volume](https://docs.docker.com/compose/compose-file/07-volumes/#external) yang menunjuk ke volume lama hingga jadwal migrasi.

### Database Backup Gagal

**Error: Container is not running**
```bash
# Solusi: Start container terlebih dahulu
docker compose up -d registration_db conduct_db user_management_db
```

**Error: Permission denied**
```bash
# Solusi: Pastikan script executable
chmod +x scripts/backup-db.sh
```

**Error: pg_dump failed**
```bash
# Solusi: Cek koneksi database dan credentials
docker exec fri-registration-db psql -U postgres -c "SELECT version();"
```

### Uploads Backup Gagal

**Error: Uploads directory not found**
```bash
# Solusi: Script akan membuat directory otomatis, atau buat manual
mkdir -p uploads
```

**Error: Permission denied**
```bash
# Solusi: Cek permission folder uploads
ls -la uploads/
chmod -R 755 uploads/
```

### Database Restore Gagal

**Error: Container is not running**
```bash
# Solusi: Start container
docker-compose up -d
```

**Error: Database is being accessed by other users**
```bash
# Solusi: Script akan otomatis terminate connections, jika masih gagal:
docker exec fri-registration-db psql -U postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'registration_db' AND pid <> pg_backend_pid();"
```

**Error: Backup file format tidak valid**
```bash
# Solusi: Pastikan menggunakan backup file yang benar (format .dump)
file backups/database/YYYYMMDD_HHMMSS/registration_db.dump
```

### Uploads Restore Gagal

**Error: Backup file tidak ditemukan**
```bash
# Solusi: Pastikan path backup file benar
ls -la backups/uploads/YYYYMMDD_HHMMSS/uploads.tar.gz
```

**Error: Permission denied saat extract**
```bash
# Solusi: Cek permission folder uploads
chmod -R 755 uploads/
```

---

## Contoh Workflow Lengkap

### Backup Harian

```bash
# 1. Backup database
./scripts/backup-db.sh

# 2. Backup uploads
./scripts/backup-uploads.sh

# 3. (Optional) Upload ke cloud storage
# aws s3 sync backups/ s3://your-bucket/backups/
```

### Restore dari Backup

```bash
# 1. List backup yang tersedia
ls -la backups/database/
ls -la backups/uploads/

# 2. Pilih backup yang akan digunakan (contoh: 20240115_143022)

# 3. Restore database
./scripts/restore-db.sh backups/database/20240115_143022

# 4. Restore uploads
./scripts/restore-uploads.sh backups/uploads/20240115_143500/uploads.tar.gz

# 5. Verifikasi
docker exec fri-registration-db psql -U postgres -c "SELECT COUNT(*) FROM your_table;"
ls -la uploads/
```

---

## Catatan Penting

1. **Backup database menggunakan PostgreSQL Custom Format** yang memerlukan `pg_restore` untuk restore (bukan `psql`)

2. **Folder uploads menggunakan bind mount**, jadi backup langsung dari host filesystem, bukan dari container

3. **Named volumes untuk database** tidak perlu di-backup secara langsung karena sudah di-backup melalui `pg_dump`

4. **Safety backup** dibuat otomatis saat restore uploads untuk mencegah kehilangan data

5. **Timestamp format**: `YYYYMMDD_HHMMSS` untuk memudahkan sorting dan identifikasi

---

## Support

Jika mengalami masalah atau pertanyaan, silakan:
1. Cek section Troubleshooting di atas
2. Cek log file (jika menggunakan cron job)
3. Hubungi tim development

---

**Last Updated**: 2024-01-15
**Version**: 1.0

