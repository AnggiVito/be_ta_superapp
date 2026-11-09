-- Migration: 019_create_room_categories.sql
-- Master kategori ruangan praktikum (tetap, tanpa daftar ruangan per kategori)

CREATE TABLE IF NOT EXISTS room_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(64) NOT NULL,
  label VARCHAR(120) NOT NULL,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT room_categories_slug_key UNIQUE (slug)
);

COMMENT ON TABLE room_categories IS 'Kategori ruangan praktikum (master tetap)';
COMMENT ON COLUMN room_categories.slug IS 'Kode kategori; selaras dengan practicum_room_category ENUM dan required_room_category';

INSERT INTO room_categories (slug, label, sort_order)
VALUES
  ('classroom', 'Classroom', 1),
  ('lab_kelas', 'Lab Kelas', 2),
  ('lab_komputer', 'Lab Komputer', 3),
  ('lab_exam', 'Lab Exam', 4),
  ('lab_online', 'Lab Online', 5),
  ('lab_workshop', 'Lab Workshop', 6)
ON CONFLICT (slug) DO NOTHING;
