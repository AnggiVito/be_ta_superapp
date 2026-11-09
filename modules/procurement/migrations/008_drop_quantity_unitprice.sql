-- Migration: drop legacy numeric quantity and unit_price from procurement_pengajuan
BEGIN;
ALTER TABLE procurement_pengajuan
  DROP COLUMN IF EXISTS quantity,
  DROP COLUMN IF EXISTS unit_price;
COMMIT;
