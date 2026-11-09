-- Migration: 016_add_lab_and_study_program_if_missing.sql
-- Ensure procurement_submission has study_program_id and lab_id columns and supporting indexes
BEGIN;

-- Add columns if they do not exist (safe to run multiple times)
ALTER TABLE procurement_submission
  ADD COLUMN IF NOT EXISTS study_program_id uuid;

ALTER TABLE procurement_submission
  ADD COLUMN IF NOT EXISTS lab_id uuid;

-- Some older DBs may be missing updated_at column; add if needed
ALTER TABLE procurement_submission
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

-- Create indexes if missing
CREATE INDEX IF NOT EXISTS idx_procurement_submission_study_program_id ON procurement_submission (study_program_id);
CREATE INDEX IF NOT EXISTS idx_procurement_submission_lab_id ON procurement_submission (lab_id);

COMMIT;
