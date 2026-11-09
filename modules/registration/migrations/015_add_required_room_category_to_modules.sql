-- Migration: 015_add_required_room_category_to_modules.sql
-- Kategori ruangan yang dibutuhkan saat menjalankan modul praktikum

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'practicum_room_category') THEN
    CREATE TYPE practicum_room_category AS ENUM (
      'classroom',
      'lab_kelas',
      'lab_komputer',
      'lab_exam',
      'lab_online',
      'lab_workshop'
    );
  END IF;
END
$$;

ALTER TABLE practicum_modules
  ADD COLUMN IF NOT EXISTS required_room_category practicum_room_category;

COMMENT ON COLUMN practicum_modules.required_room_category IS
  'Kategori ruangan yang dibutuhkan modul: classroom, lab_kelas, lab_komputer, lab_exam, lab_online, lab_workshop';
