-- Audit: kapan data KPA per tahun terakhir diganti (full replace) dan oleh siapa.
-- Log peristiwa untuk jejak audit lengkap.

ALTER TABLE kpa_periods
  ADD COLUMN IF NOT EXISTS data_last_updated_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS data_last_updated_by VARCHAR(255) NULL;

COMMENT ON COLUMN kpa_periods.data_last_updated_at IS 'Terakhir unggah replace data untuk tahun ini berhasil (transaksi commit).';
COMMENT ON COLUMN kpa_periods.data_last_updated_by IS 'User id yang melakukan unggah replace terakhir.';

CREATE TABLE IF NOT EXISTS kpa_year_replace_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  period_id UUID NOT NULL REFERENCES kpa_periods(id) ON DELETE CASCADE,
  tahun INTEGER NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  occurred_by VARCHAR(255) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  transaction_count INTEGER NOT NULL DEFAULT 0,
  upload_id UUID REFERENCES kpa_uploads(id) ON DELETE SET NULL,
  prodi_budget_id UUID REFERENCES kpa_prodi_budgets(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_kpa_year_replace_events_period
  ON kpa_year_replace_events(period_id, occurred_at DESC);
