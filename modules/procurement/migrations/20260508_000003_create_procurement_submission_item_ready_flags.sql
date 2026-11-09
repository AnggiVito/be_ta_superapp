CREATE TABLE IF NOT EXISTS procurement_submission_item_ready_flags (
  id SERIAL PRIMARY KEY,
  submission_id INTEGER NOT NULL REFERENCES procurement_submission(id) ON DELETE CASCADE,
  submission_item_id INTEGER NOT NULL REFERENCES procurement_submission_items(id) ON DELETE CASCADE,
  marked_by VARCHAR(255),
  is_ready BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  UNIQUE (submission_id, submission_item_id)
);

CREATE INDEX IF NOT EXISTS idx_proc_sub_item_ready_submission_id
  ON procurement_submission_item_ready_flags (submission_id);
