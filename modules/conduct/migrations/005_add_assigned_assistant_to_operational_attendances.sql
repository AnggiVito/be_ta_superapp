ALTER TABLE practicum_operational_session_attendances
  ADD COLUMN IF NOT EXISTS assigned_assistant_user_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS assigned_qr_session_id UUID REFERENCES practicum_operational_session_qr_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_op_session_attendance_assigned_assistant
  ON practicum_operational_session_attendances (operational_session_id, assigned_assistant_user_id);

CREATE INDEX IF NOT EXISTS idx_op_session_attendance_assigned_qr_session
  ON practicum_operational_session_attendances (assigned_qr_session_id);
