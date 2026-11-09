-- Migration: add quantity_text and unit_price_text to procurement_pengajuan
BEGIN;
ALTER TABLE procurement_pengajuan
  ADD COLUMN IF NOT EXISTS quantity_text text,
  ADD COLUMN IF NOT EXISTS unit_price_text text;
COMMIT;
