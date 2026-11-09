-- Kode singkat asisten (1-4 huruf) untuk kolom "Kode Asisten" pada template import jadwal Registration
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS kode_asisten_praktikum VARCHAR(4);

COMMENT ON COLUMN user_profiles.kode_asisten_praktikum IS 'Kode asisten praktikum (1-4 huruf A-Z), unik per user aktif; dipakai import jadwal Excel';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_kode_asisten_praktikum_format'
  ) THEN
    ALTER TABLE user_profiles
      ADD CONSTRAINT check_kode_asisten_praktikum_format
      CHECK (kode_asisten_praktikum IS NULL OR kode_asisten_praktikum ~ '^[A-Za-z]{1,4}$');
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_kode_asisten_unique
  ON user_profiles (LOWER(kode_asisten_praktikum))
  WHERE deleted_at IS NULL AND kode_asisten_praktikum IS NOT NULL;
