-- Migration: change procurement_notifications.user_id to varchar to accept non-numeric user ids
BEGIN;

ALTER TABLE procurement_notifications
  ALTER COLUMN user_id TYPE varchar(100) USING user_id::varchar;

-- recreate index if needed (index on user_id as varchar still valid)
DROP INDEX IF EXISTS idx_procurement_notifications_user_id;
CREATE INDEX IF NOT EXISTS idx_procurement_notifications_user_id ON procurement_notifications (user_id);

COMMIT;
