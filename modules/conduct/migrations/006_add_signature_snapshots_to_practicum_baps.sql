ALTER TABLE practicum_baps
  ADD COLUMN IF NOT EXISTS lecturer_signature_ttd_file_path TEXT,
  ADD COLUMN IF NOT EXISTS lecturer_signature_ttd_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS lecturer_signature_snapshot_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS laboran_signature_ttd_file_path TEXT,
  ADD COLUMN IF NOT EXISTS laboran_signature_ttd_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS laboran_signature_snapshot_at TIMESTAMPTZ;

ALTER TABLE practicum_bap_attendance_rows
  ADD COLUMN IF NOT EXISTS student_signature_ttd_file_path TEXT,
  ADD COLUMN IF NOT EXISTS student_signature_ttd_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS student_signature_snapshot_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS assistant_signature_user_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS assistant_signature_ttd_file_path TEXT,
  ADD COLUMN IF NOT EXISTS assistant_signature_ttd_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS assistant_signature_snapshot_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_practicum_bap_rows_assistant_signature_user
  ON practicum_bap_attendance_rows (assistant_signature_user_id);
