-- Migration: 018_add_week_number_to_practicum_modules.sql
-- Minggu pelaksanaan per modul praktikum (untuk plotting jadwal & ruangan)

ALTER TABLE practicum_modules
  ADD COLUMN IF NOT EXISTS week_number INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_practicum_modules_week_number_positive'
  ) THEN
    ALTER TABLE practicum_modules
      ADD CONSTRAINT chk_practicum_modules_week_number_positive
      CHECK (week_number IS NULL OR week_number > 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_practicum_modules_week_number
  ON practicum_modules(practicum_id, week_number);

COMMENT ON COLUMN practicum_modules.week_number IS
  'Minggu pelaksanaan modul dalam semester (bilangan bulat positif, mis. 7 untuk minggu ke-7)';
