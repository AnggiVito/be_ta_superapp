CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS practicum_attendance_plot_reassignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_id UUID NOT NULL REFERENCES practicum_operational_session_attendances(id) ON DELETE CASCADE,
  operational_session_id UUID NOT NULL REFERENCES practicum_operational_sessions(id) ON DELETE CASCADE,
  student_user_id VARCHAR(255) NOT NULL,
  from_assistant_user_id VARCHAR(255),
  to_assistant_user_id VARCHAR(255) NOT NULL,
  changed_by_user_id VARCHAR(255) NOT NULL,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attendance_plot_reassignments_attendance_id
  ON practicum_attendance_plot_reassignments(attendance_id);

CREATE INDEX IF NOT EXISTS idx_attendance_plot_reassignments_session_id
  ON practicum_attendance_plot_reassignments(operational_session_id);

CREATE INDEX IF NOT EXISTS idx_attendance_plot_reassignments_changed_by
  ON practicum_attendance_plot_reassignments(changed_by_user_id);
