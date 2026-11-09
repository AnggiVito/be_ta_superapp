-- Migration: add requester_id to procurement_pengajuan
BEGIN;
ALTER TABLE procurement_pengajuan
  ADD COLUMN IF NOT EXISTS requester_id varchar(100);

-- backfill from created_by where available
UPDATE procurement_pengajuan
  SET requester_id = created_by
  WHERE requester_id IS NULL AND created_by IS NOT NULL;

COMMIT;
