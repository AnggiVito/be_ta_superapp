-- Link each KPA upload row to the prodi_budget row created from that file (for reprocess & reporting scope).

ALTER TABLE kpa_uploads
  ADD COLUMN IF NOT EXISTS prodi_budget_id UUID REFERENCES kpa_prodi_budgets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_kpa_uploads_prodi_budget ON kpa_uploads(prodi_budget_id)
  WHERE deleted_at IS NULL AND prodi_budget_id IS NOT NULL;
