-- Migration: 004_update_schedules_time_fields.sql
-- Mengubah scheduled_at menjadi start_time dan menambahkan end_time

-- Rename scheduled_at menjadi start_time
ALTER TABLE schedules 
RENAME COLUMN scheduled_at TO start_time;

-- Tambah kolom end_time
ALTER TABLE schedules 
ADD COLUMN IF NOT EXISTS end_time TIMESTAMP WITH TIME ZONE;

-- Add comment untuk dokumentasi
COMMENT ON COLUMN schedules.start_time IS 'Waktu mulai jadwal asisten';
COMMENT ON COLUMN schedules.end_time IS 'Waktu akhir jadwal asisten';

-- Update index
DROP INDEX IF EXISTS idx_schedules_scheduled_at;
CREATE INDEX IF NOT EXISTS idx_schedules_start_time ON schedules(start_time);
CREATE INDEX IF NOT EXISTS idx_schedules_end_time ON schedules(end_time);

