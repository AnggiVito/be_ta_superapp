-- 021_create_procurement_submission_proposals.sql
-- Store requester-uploaded proposal file per submission (including draft submissions)

CREATE TABLE IF NOT EXISTS procurement_submission_proposals (
  id SERIAL PRIMARY KEY,
  submission_id INTEGER NOT NULL REFERENCES procurement_submission(id) ON DELETE CASCADE,
  uploaded_by VARCHAR(128),
  file_name TEXT NOT NULL,
  mime_type VARCHAR(255),
  file_data BYTEA NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
);

-- one proposal file per submission
-- Add unique constraint only if it doesn't exist (guard for idempotency)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'procurement_submission_proposals_submission_id_unique'
  ) THEN
    ALTER TABLE procurement_submission_proposals
      ADD CONSTRAINT procurement_submission_proposals_submission_id_unique UNIQUE (submission_id);
  END IF;
END$$;

-- max file size 10MB
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'procurement_submission_proposals_max_size'
  ) THEN
    ALTER TABLE procurement_submission_proposals
      ADD CONSTRAINT procurement_submission_proposals_max_size
      CHECK (octet_length(file_data) <= 10 * 1024 * 1024);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_proc_submission_proposals_submission_id
  ON procurement_submission_proposals(submission_id);
