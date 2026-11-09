-- Migration: add specification column to procurement_pengajuan_items
BEGIN;
ALTER TABLE procurement_pengajuan_items
  ADD COLUMN IF NOT EXISTS specification text;
COMMIT;
