-- Migration: Add nama_praktikum column to feedback_items
-- Description: Menyimpan nama praktikum dari kolom "Nama Praktikum" di Excel
--              agar data bisa difilter dan diagregasi per praktikum / per prodi

ALTER TABLE feedback_items
ADD COLUMN IF NOT EXISTS nama_praktikum VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_feedback_items_nama_praktikum
ON feedback_items(nama_praktikum)
WHERE deleted_at IS NULL;
