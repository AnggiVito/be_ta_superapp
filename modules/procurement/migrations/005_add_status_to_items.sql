-- Migration: add status and approval columns to procurement_pengajuan_items
BEGIN;
ALTER TABLE procurement_pengajuan_items
  ADD COLUMN IF NOT EXISTS status varchar(50) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS approved_by varchar(100),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

COMMIT;
