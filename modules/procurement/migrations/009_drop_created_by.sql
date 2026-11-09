-- Migration: drop created_by from procurement_pengajuan
-- This column is deprecated because requester_id is the canonical author identifier

ALTER TABLE procurement_pengajuan
  DROP COLUMN IF EXISTS created_by;
