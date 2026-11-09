-- Migration: 017_rename_ruangan_back_to_venue.sql
-- Kembalikan kolom ruangan ke venue jika sempat di-rename sebelumnya

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'schedules'
      AND column_name = 'ruangan'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'schedules'
      AND column_name = 'venue'
  ) THEN
    ALTER TABLE schedules RENAME COLUMN ruangan TO venue;
  END IF;
END $$;

COMMENT ON COLUMN schedules.venue IS
  'Lokasi/venue jadwal praktikum (null sampai penugasan laboran)';
