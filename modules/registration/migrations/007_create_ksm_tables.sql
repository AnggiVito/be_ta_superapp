-- Create tables for KSM imports and entries
CREATE TABLE IF NOT EXISTS ksm_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_by UUID,
  filename TEXT NOT NULL,
  original_filename TEXT,
  status VARCHAR(32) DEFAULT 'pending', -- pending, processing, completed, failed
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ksm_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ksm_import_id UUID NOT NULL,
  nim VARCHAR(64),
  course_code VARCHAR(64),
  course_name TEXT,
  day VARCHAR(32),
  time_range VARCHAR(64),
  location TEXT,
  mapped BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  CONSTRAINT fk_ksm_import FOREIGN KEY (ksm_import_id) REFERENCES ksm_imports(id) ON DELETE CASCADE
);
