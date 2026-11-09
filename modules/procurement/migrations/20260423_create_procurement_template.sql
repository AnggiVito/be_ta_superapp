-- Migration: create procurement_template table to store single template (file stored in DB as bytea)
CREATE TABLE IF NOT EXISTS procurement_template (
  slot TEXT PRIMARY KEY DEFAULT 'default',
  file_name TEXT NOT NULL,
  mime_type TEXT,
  file_data BYTEA NOT NULL,
  uploaded_by TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT now()
);

-- Optional constraint: limit file size to 10MB (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'procurement_template_max_size'
  ) THEN
    ALTER TABLE procurement_template
      ADD CONSTRAINT procurement_template_max_size CHECK (octet_length(file_data) <= 10 * 1024 * 1024);
  END IF;
END $$;

-- Index on uploaded_at for audit queries
CREATE INDEX IF NOT EXISTS procurement_template_uploaded_at_idx ON procurement_template (uploaded_at);
