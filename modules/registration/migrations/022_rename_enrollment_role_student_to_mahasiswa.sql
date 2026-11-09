-- Migration: 022_rename_enrollment_role_student_to_mahasiswa.sql
-- Role enrollment mahasiswa/praktikan: student -> mahasiswa

UPDATE practicum_enrollments
SET role = 'mahasiswa', updated_at = NOW()
WHERE role = 'student';

ALTER TABLE practicum_enrollments
  ALTER COLUMN role SET DEFAULT 'mahasiswa';

COMMENT ON COLUMN practicum_enrollments.role IS 'Role di praktikum: mahasiswa, asisten_praktikum, asisten_praktikum_aktif, dll.';
