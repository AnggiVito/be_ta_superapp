-- Migration: create procurement_notifications table for in-app messages
BEGIN;

CREATE TABLE IF NOT EXISTS procurement_notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  data JSONB DEFAULT '{}'::jsonb,
  channel VARCHAR(32) DEFAULT 'in_app',
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_procurement_notifications_user_id ON procurement_notifications (user_id);
CREATE INDEX IF NOT EXISTS idx_procurement_notifications_user_id_created_at ON procurement_notifications (user_id, created_at DESC);

COMMIT;
