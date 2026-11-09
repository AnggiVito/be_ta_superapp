-- Migration: create procurement_submission_receipts
CREATE TABLE IF NOT EXISTS procurement_submission_receipts (
  id SERIAL PRIMARY KEY,
  submission_id INTEGER NOT NULL REFERENCES procurement_submission(id) ON DELETE CASCADE,
  uploaded_by VARCHAR(255),
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type VARCHAR(255),
  realized_price NUMERIC,
  currency VARCHAR(16),
  notes TEXT,
  status VARCHAR(50) DEFAULT 'uploaded',
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_procurement_submission_receipts_submission_id ON procurement_submission_receipts (submission_id);
