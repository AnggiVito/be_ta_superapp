-- Migration: rename procurement_pengajuan -> procurement_submission
-- and procurement_pengajuan_items -> procurement_submission_items
-- and column pengajuan_id -> submission_id

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'procurement_pengajuan') AND
     NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'procurement_submission') THEN
    EXECUTE 'ALTER TABLE procurement_pengajuan RENAME TO procurement_submission';
  END IF;
END$$;

-- Rename items table only when source exists and target doesn't
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'procurement_pengajuan_items') AND
     NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'procurement_submission_items') THEN
    EXECUTE 'ALTER TABLE procurement_pengajuan_items RENAME TO procurement_submission_items';
  END IF;
END$$;
-- Rename FK column on items table
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='procurement_submission_items' AND column_name='pengajuan_id') THEN
    ALTER TABLE procurement_submission_items RENAME COLUMN pengajuan_id TO submission_id;
  END IF;
END$$;

-- NOTE: Index and constraint names are preserved by PostgreSQL but may still contain the old
-- text in their identifier. If you want to rename indexes/constraints, add ALTER INDEX ... RENAME.

COMMIT;
