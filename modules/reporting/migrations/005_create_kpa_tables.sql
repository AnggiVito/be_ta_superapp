-- Reporting Database Schema
-- Migration: 005_create_kpa_tables.sql
-- Kartu Pengawasan Anggaran (KPA) — Financial Reporting Tables

-- Table: kpa_periods
-- Menyimpan periode anggaran per tahun
CREATE TABLE IF NOT EXISTS kpa_periods (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tahun INTEGER NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'draft', -- draft, active, archived
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP NULL,
    CONSTRAINT kpa_periods_tahun_unique UNIQUE (tahun)
);

-- Table: kpa_prodi_budgets
-- Menyimpan alokasi anggaran per prodi per periode
CREATE TABLE IF NOT EXISTS kpa_prodi_budgets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    period_id UUID NOT NULL REFERENCES kpa_periods(id) ON DELETE CASCADE,
    kode_pp VARCHAR(50),
    nama_pp VARCHAR(255) NOT NULL,
    kode_akun VARCHAR(50),
    nama_akun VARCHAR(255),
    no_drk VARCHAR(100),
    kegiatan TEXT,
    anggaran_tw1 BIGINT NOT NULL DEFAULT 0,
    anggaran_tw2 BIGINT NOT NULL DEFAULT 0,
    anggaran_tw3 BIGINT NOT NULL DEFAULT 0,
    anggaran_tw4 BIGINT NOT NULL DEFAULT 0,
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP NULL
);

-- Table: kpa_transactions
-- Menyimpan baris transaksi dari file KPA
CREATE TABLE IF NOT EXISTS kpa_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    prodi_budget_id UUID NOT NULL REFERENCES kpa_prodi_budgets(id) ON DELETE CASCADE,
    triwulan SMALLINT NOT NULL CHECK (triwulan BETWEEN 1 AND 4),
    no_bukti VARCHAR(100),
    no_dokumen VARCHAR(100),
    tanggal DATE,
    keterangan TEXT,
    debet BIGINT NOT NULL DEFAULT 0,
    kredit BIGINT NOT NULL DEFAULT 0,
    balance BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP NULL
);

-- Table: kpa_uploads
-- Menyimpan riwayat file KPA yang diupload
CREATE TABLE IF NOT EXISTS kpa_uploads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    period_id UUID NOT NULL REFERENCES kpa_periods(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size INTEGER,
    uploaded_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_kpa_periods_tahun ON kpa_periods(tahun) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_kpa_periods_status ON kpa_periods(status) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_kpa_prodi_budgets_period ON kpa_prodi_budgets(period_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_kpa_prodi_budgets_kode_pp ON kpa_prodi_budgets(kode_pp) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_kpa_transactions_prodi_budget ON kpa_transactions(prodi_budget_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_kpa_transactions_triwulan ON kpa_transactions(triwulan) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_kpa_transactions_tanggal ON kpa_transactions(tanggal) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_kpa_uploads_period ON kpa_uploads(period_id) WHERE deleted_at IS NULL;

-- Triggers untuk updated_at (reuse function from migration 001)
DROP TRIGGER IF EXISTS update_kpa_periods_updated_at ON kpa_periods;
CREATE TRIGGER update_kpa_periods_updated_at BEFORE UPDATE ON kpa_periods
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_kpa_prodi_budgets_updated_at ON kpa_prodi_budgets;
CREATE TRIGGER update_kpa_prodi_budgets_updated_at BEFORE UPDATE ON kpa_prodi_budgets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_kpa_transactions_updated_at ON kpa_transactions;
CREATE TRIGGER update_kpa_transactions_updated_at BEFORE UPDATE ON kpa_transactions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_kpa_uploads_updated_at ON kpa_uploads;
CREATE TRIGGER update_kpa_uploads_updated_at BEFORE UPDATE ON kpa_uploads
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
