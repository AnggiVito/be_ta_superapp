-- 014_create_procurement_submission_drafts.sql
-- Creates a simple drafts table for procurement submissions
CREATE TABLE IF NOT EXISTS procurement_submission_drafts (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(128) NOT NULL,
  title VARCHAR(255),
  data JSONB NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_procurement_submission_drafts_user_id ON procurement_submission_drafts(user_id);
