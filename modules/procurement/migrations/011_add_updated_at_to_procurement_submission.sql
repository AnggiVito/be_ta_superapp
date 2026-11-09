-- Migration: add updated_at column to procurement_submission
-- This migration makes the procurement_submission table consistent with other tables
-- by adding an updated_at timestamptz column with a default value.
BEGIN;

ALTER TABLE procurement_submission
ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

COMMIT;
