-- Migration: 009_add_scheduling_import_fields.sql
-- Menambahkan kolom-kolom untuk fitur import jadwal dari Excel template

ALTER TABLE schedules
  ADD COLUMN IF NOT EXISTS detail_kegiatan TEXT,
  ADD COLUMN IF NOT EXISTS tanggal DATE,
  ADD COLUMN IF NOT EXISTS jam_mulai TIME,
  ADD COLUMN IF NOT EXISTS jam_berakhir TIME,
  ADD COLUMN IF NOT EXISTS hitungan_jam NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS kelas VARCHAR(20);

-- Add check constraint for kelas
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_kelas_type'
  ) THEN
    ALTER TABLE schedules ADD CONSTRAINT check_kelas_type CHECK (kelas IN ('reguler', 'inter'));
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_schedules_tanggal ON schedules(tanggal);
CREATE INDEX IF NOT EXISTS idx_schedules_kelas ON schedules(kelas);

COMMENT ON COLUMN schedules.detail_kegiatan IS 'Detail/deskripsi kegiatan praktikum';
COMMENT ON COLUMN schedules.tanggal IS 'Tanggal pelaksanaan (DATE only)';
COMMENT ON COLUMN schedules.jam_mulai IS 'Jam mulai kegiatan (TIME only)';
COMMENT ON COLUMN schedules.jam_berakhir IS 'Jam berakhir kegiatan (TIME only)';
COMMENT ON COLUMN schedules.hitungan_jam IS 'Durasi jam (auto-calculated dari jam_berakhir - jam_mulai)';
COMMENT ON COLUMN schedules.kelas IS 'Tipe kelas: reguler atau inter';
