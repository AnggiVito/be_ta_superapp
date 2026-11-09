-- Migration: 021_add_class_group_to_practicum_enrollments.sql
-- Kelas akademik per mahasiswa yang di-assign ke praktikum (mis. SI-46-01)

ALTER TABLE practicum_enrollments
  ADD COLUMN IF NOT EXISTS class_group VARCHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS uq_practicum_enrollments_practicum_student
  ON practicum_enrollments (practicum_id, student_id);

COMMENT ON COLUMN practicum_enrollments.class_group IS 'Kelas akademik mahasiswa/praktikan, mis. SI-46-01';
