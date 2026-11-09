-- Migration 002: Add check-out feature support
-- Related: Branch #19 - Praktikan melakukan check-out
-- Description: Add waktu_keluar column for recording check-out timestamp
-- Author: System
-- Date: 2025-11-18

-- Add waktu_keluar column for check-out feature
ALTER TABLE attendance 
ADD COLUMN IF NOT EXISTS waktu_keluar TIMESTAMP NULL;

-- Add comment for documentation
COMMENT ON COLUMN attendance.waktu_keluar IS 'Timestamp when praktikan checks out from practicum session. NULL if not yet checked out.';

-- Add index for better query performance on check-out queries
-- This helps when filtering attendance by check-out status
CREATE INDEX IF NOT EXISTS idx_attendance_waktu_keluar 
ON attendance(waktu_keluar) 
WHERE waktu_keluar IS NOT NULL;

-- Add composite index for user attendance queries with check-out
-- Useful for queries like: "Get user attendance with check-in and check-out times"
CREATE INDEX IF NOT EXISTS idx_attendance_user_checkout 
ON attendance(user_id, waktu_hadir, waktu_keluar) 
WHERE deleted_at IS NULL;

-- Add comment on table to document status values
COMMENT ON COLUMN attendance.status IS 'Attendance status: hadir (PRESENT/on-time), terlambat (LATE), izin (EXCUSED), sakit (SICK), alpha (ABSENT)';

-- Migration completed successfully
-- Next: Run tests to verify check-out functionality
