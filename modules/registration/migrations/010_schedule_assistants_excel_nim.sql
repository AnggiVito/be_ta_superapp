-- Migration: 010_schedule_assistants_excel_nim.sql
-- Asisten dari import Excel: NIM (1-15 digit) + nama/teks dari Excel (tanpa lookup user_management).
-- Asisten dari API manual: user_id (gateway) saja, nim NULL.

ALTER TABLE schedule_assistants
  ADD COLUMN IF NOT EXISTS nim VARCHAR(15),
  ADD COLUMN IF NOT EXISTS nama_excel VARCHAR(255);

COMMENT ON COLUMN schedule_assistants.nim IS 'NIM dari Excel (1-15 digit angka); dipakai bila baris tanpa user_id';
COMMENT ON COLUMN schedule_assistants.nama_excel IS 'Nama/teks bebas dari Excel (max 255 char)';

ALTER TABLE schedule_assistants
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE schedule_assistants
  DROP CONSTRAINT IF EXISTS unique_schedule_assistant;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_schedule_assistant_row'
  ) THEN
    ALTER TABLE schedule_assistants ADD CONSTRAINT check_schedule_assistant_row CHECK (
      (user_id IS NOT NULL AND nim IS NULL)
      OR (user_id IS NULL AND nim IS NOT NULL AND nim ~ '^[0-9]{1,15}$')
    );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_schedule_assistants_user_unique
  ON schedule_assistants (schedule_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_schedule_assistants_excel_unique
  ON schedule_assistants (schedule_id, nim, COALESCE(nama_excel, ''))
  WHERE user_id IS NULL AND nim IS NOT NULL;
