CREATE TABLE IF NOT EXISTS procurement_submission_item_photos (
  id SERIAL PRIMARY KEY,
  submission_id INTEGER NOT NULL REFERENCES procurement_submission(id) ON DELETE CASCADE,
  submission_item_id INTEGER NOT NULL REFERENCES procurement_submission_items(id) ON DELETE CASCADE,
  uploaded_by VARCHAR(255),
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type VARCHAR(255),
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proc_sub_item_photos_submission_id
  ON procurement_submission_item_photos (submission_id);

CREATE INDEX IF NOT EXISTS idx_proc_sub_item_photos_item_id
  ON procurement_submission_item_photos (submission_item_id);
