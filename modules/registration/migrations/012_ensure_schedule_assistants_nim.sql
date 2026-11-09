-- Migration: 012_ensure_schedule_assistants_nim.sql
-- Perbaikan / idempotent: pastikan kolom nim + constraint + index sesuai kode backend.
-- Aman dijalankan ulang (mis. DB yang belum pernah sukses menjalankan 010/011).

ALTER TABLE schedule_assistants
  ADD COLUMN IF NOT EXISTS nim VARCHAR(15);

COMMENT ON COLUMN schedule_assistants.nim IS 'NIM dari Excel (1-15 digit angka); dipakai bila baris tanpa user_id';

-- Hilangkan duplikat (schedule_id, nim) untuk baris import Excel agar unique index bisa dibuat
DELETE FROM schedule_assistants sa
WHERE sa.user_id IS NULL
  AND sa.nim IS NOT NULL
  AND sa.ctid NOT IN (
    SELECT MIN(ctid)
    FROM schedule_assistants
    WHERE user_id IS NULL AND nim IS NOT NULL
    GROUP BY schedule_id, nim
  );

-- Baris yang melanggar aturan baru (bersihkan sebelum CHECK)
DELETE FROM schedule_assistants
WHERE (user_id IS NULL AND nim IS NULL)
   OR (user_id IS NULL AND nim IS NOT NULL AND nim !~ '^[0-9]{1,15}$')
   OR (user_id IS NOT NULL AND nim IS NOT NULL);

ALTER TABLE schedule_assistants
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE schedule_assistants
  DROP CONSTRAINT IF EXISTS unique_schedule_assistant;

DROP INDEX IF EXISTS idx_schedule_assistants_excel_unique;
DROP INDEX IF EXISTS idx_schedule_assistants_user_unique;

ALTER TABLE schedule_assistants
  DROP COLUMN IF EXISTS nama_excel;

ALTER TABLE schedule_assistants
  DROP CONSTRAINT IF EXISTS check_schedule_assistant_row;

ALTER TABLE schedule_assistants
  ADD CONSTRAINT check_schedule_assistant_row CHECK (
    (user_id IS NOT NULL AND nim IS NULL)
    OR (user_id IS NULL AND nim IS NOT NULL AND nim ~ '^[0-9]{1,15}$')
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_schedule_assistants_user_unique
  ON schedule_assistants (schedule_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_schedule_assistants_excel_unique
  ON schedule_assistants (schedule_id, nim)
  WHERE user_id IS NULL AND nim IS NOT NULL;
