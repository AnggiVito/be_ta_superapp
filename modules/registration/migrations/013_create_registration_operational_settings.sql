-- Operational settings (cutoff, key-value JSONB) + holidays — registration_db
-- Dijalankan oleh migrate:unified / runUnifiedMigrations (bukan hanya node-pg-migrate).

CREATE TABLE IF NOT EXISTS registration_settings (
  setting_key VARCHAR(191) PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS registration_holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_date DATE NOT NULL,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT registration_holidays_holiday_date_key UNIQUE (holiday_date)
);

CREATE INDEX IF NOT EXISTS idx_registration_holidays_holiday_date
  ON registration_holidays (holiday_date);

COMMENT ON TABLE registration_settings IS 'Key-value konfig registrasi (cutoff, flag, dll.); value berupa JSONB';
COMMENT ON COLUMN registration_settings.setting_key IS 'Unik snake_case, contoh: enrollment_cutoff_date';
COMMENT ON COLUMN registration_settings.value IS 'Nilai JSON (skalar string, object, array)';
COMMENT ON TABLE registration_holidays IS 'Tanggal libur / non-hari kerja untuk validasi atau tampilan jadwal';
