-- Migration: drop requester_nim column from procurement_pengajuan
BEGIN;

-- Drop index if exists
DROP INDEX IF EXISTS idx_procurement_pengajuan_requester_nim;

-- Drop column if exists
ALTER TABLE procurement_pengajuan DROP COLUMN IF EXISTS requester_nim;

COMMIT;
