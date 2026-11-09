-- Migration: 016_add_ttlock_sync_status_to_schedules.sql
-- Status sinkronisasi jadwal ke TTLock

ALTER TABLE schedules
  ADD COLUMN IF NOT EXISTS ttlock_sync_status VARCHAR(20) NOT NULL DEFAULT 'not_sync';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'check_ttlock_sync_status'
  ) THEN
    ALTER TABLE schedules
      ADD CONSTRAINT check_ttlock_sync_status
      CHECK (ttlock_sync_status IN ('not_sync', 'sync'));
  END IF;
END $$;

COMMENT ON COLUMN schedules.ttlock_sync_status IS
  'Status sinkronisasi ke TTLock: not_sync atau sync';
