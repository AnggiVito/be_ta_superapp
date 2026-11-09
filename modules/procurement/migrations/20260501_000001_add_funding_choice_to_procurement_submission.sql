-- Add funding choice tracking to procurement_submission
ALTER TABLE procurement_submission
  ADD COLUMN IF NOT EXISTS funding_choice varchar(64);

ALTER TABLE procurement_submission
  ADD COLUMN IF NOT EXISTS funding_set_by varchar(64);

ALTER TABLE procurement_submission
  ADD COLUMN IF NOT EXISTS funding_set_at timestamp without time zone;

-- Optional: create index for faster lookups by funding_choice
CREATE INDEX IF NOT EXISTS idx_procurement_submission_funding_choice ON procurement_submission (funding_choice);
