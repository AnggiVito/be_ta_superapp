-- Migration: 020_rename_kelas_to_classroom_and_drop_category_rooms.sql
-- Untuk environment yang sudah menjalankan 019 versi lama (dengan category_rooms / slug kelas)

DROP TABLE IF EXISTS category_rooms;

-- Perbarui slug kelas -> classroom di master kategori
UPDATE room_categories
SET slug = 'classroom', label = 'Classroom', updated_at = NOW()
WHERE slug = 'kelas';

INSERT INTO room_categories (slug, label, sort_order)
VALUES ('classroom', 'Classroom', 1)
ON CONFLICT (slug) DO NOTHING;

DELETE FROM room_categories WHERE slug = 'kelas';

-- Tambah nilai enum classroom jika belum ada
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'practicum_room_category' AND e.enumlabel = 'classroom'
  ) THEN
    ALTER TYPE practicum_room_category ADD VALUE 'classroom';
  END IF;
END
$$;

-- Migrasi data modul yang masih memakai kelas
UPDATE practicum_modules
SET required_room_category = 'classroom'::practicum_room_category
WHERE required_room_category::text = 'kelas';
