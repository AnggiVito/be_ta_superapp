-- Migration: 003_add_category_ratings.sql
-- Menambahkan kolom rating kategori (1-5) ke feedback_items

-- Tambah kolom kategori rating ke feedback_items
ALTER TABLE feedback_items 
ADD COLUMN IF NOT EXISTS kepuasan_ruangan INTEGER CHECK (kepuasan_ruangan >= 1 AND kepuasan_ruangan <= 5),
ADD COLUMN IF NOT EXISTS kepuasan_alat INTEGER CHECK (kepuasan_alat >= 1 AND kepuasan_alat <= 5),
ADD COLUMN IF NOT EXISTS kepuasan_sosialisasi INTEGER CHECK (kepuasan_sosialisasi >= 1 AND kepuasan_sosialisasi <= 5),
ADD COLUMN IF NOT EXISTS kepuasan_interaksi_asisten INTEGER CHECK (kepuasan_interaksi_asisten >= 1 AND kepuasan_interaksi_asisten <= 5),
ADD COLUMN IF NOT EXISTS kepuasan_platform INTEGER CHECK (kepuasan_platform >= 1 AND kepuasan_platform <= 5),
ADD COLUMN IF NOT EXISTS kepuasan_pencapaian INTEGER CHECK (kepuasan_pencapaian >= 1 AND kepuasan_pencapaian <= 5),
ADD COLUMN IF NOT EXISTS kemampuan_asisten INTEGER CHECK (kemampuan_asisten >= 1 AND kemampuan_asisten <= 5);

-- Index untuk query performa
CREATE INDEX IF NOT EXISTS idx_feedback_items_kepuasan_ruangan ON feedback_items(kepuasan_ruangan) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_feedback_items_kepuasan_alat ON feedback_items(kepuasan_alat) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_feedback_items_kepuasan_interaksi ON feedback_items(kepuasan_interaksi_asisten) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_feedback_items_kemampuan_asisten ON feedback_items(kemampuan_asisten) WHERE deleted_at IS NULL;
