-- Migration: 011_drop_schedule_assistants_nama_excel.sql
-- Asisten dari import Excel hanya NIM - kolom nama_excel dihapus.

DROP INDEX IF EXISTS idx_schedule_assistants_excel_unique;

ALTER TABLE schedule_assistants
  DROP COLUMN IF EXISTS nama_excel;

CREATE UNIQUE INDEX IF NOT EXISTS idx_schedule_assistants_excel_unique
  ON schedule_assistants (schedule_id, nim)
  WHERE user_id IS NULL AND nim IS NOT NULL;
