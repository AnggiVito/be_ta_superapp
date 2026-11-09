-- Migration: 003_add_individual_mentoring_to_modules.sql
-- Menambahkan flag dan durasi untuk metode mentoring individu di practicum_modules
-- Juga menambahkan kolom description yang diperlukan

-- Tambah kolom untuk individual mentoring dan description
ALTER TABLE practicum_modules 
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS is_individual_mentoring BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS mentoring_duration_minutes INT;

-- Add comment untuk dokumentasi
COMMENT ON COLUMN practicum_modules.description IS 'Deskripsi atau penjelasan tentang module praktikum';
COMMENT ON COLUMN practicum_modules.is_individual_mentoring IS 'Flag untuk menandakan apakah module menggunakan metode mentoring individu';
COMMENT ON COLUMN practicum_modules.mentoring_duration_minutes IS 'Durasi mentoring per individu dalam menit (hanya diisi jika is_individual_mentoring = true)';

