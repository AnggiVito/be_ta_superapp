-- Migration: 008_laboran_compare_tables.sql
-- Upload laporan keuangan laboran + hasil compare vs procurement (read-only)

CREATE TABLE IF NOT EXISTS laboran_keuangan_uploads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tahun INTEGER NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size INTEGER,
    sheet_count INTEGER NOT NULL DEFAULT 0,
    transaction_count INTEGER NOT NULL DEFAULT 0,
    uploaded_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP NULL
);

CREATE TABLE IF NOT EXISTS laboran_keuangan_sheets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    upload_id UUID NOT NULL REFERENCES laboran_keuangan_uploads(id) ON DELETE CASCADE,
    sheet_name VARCHAR(255) NOT NULL,
    sheet_index INTEGER NOT NULL DEFAULT 0,
    kode_pp VARCHAR(50),
    nama_pp VARCHAR(255),
    kode_akun VARCHAR(50),
    nama_akun VARCHAR(255),
    no_drk VARCHAR(100),
    kegiatan TEXT,
    anggaran_tw1 BIGINT NOT NULL DEFAULT 0,
    anggaran_tw2 BIGINT NOT NULL DEFAULT 0,
    anggaran_tw3 BIGINT NOT NULL DEFAULT 0,
    anggaran_tw4 BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS laboran_keuangan_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    upload_id UUID NOT NULL REFERENCES laboran_keuangan_uploads(id) ON DELETE CASCADE,
    sheet_id UUID NOT NULL REFERENCES laboran_keuangan_sheets(id) ON DELETE CASCADE,
    triwulan SMALLINT NOT NULL CHECK (triwulan BETWEEN 1 AND 4),
    no_bukti VARCHAR(100),
    no_dokumen VARCHAR(100),
    tanggal DATE,
    keterangan TEXT,
    debet BIGINT NOT NULL DEFAULT 0,
    kredit BIGINT NOT NULL DEFAULT 0,
    balance BIGINT NOT NULL DEFAULT 0,
    nominal BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS keuangan_compare_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    upload_id UUID NOT NULL REFERENCES laboran_keuangan_uploads(id) ON DELETE CASCADE,
    tahun INTEGER NOT NULL,
    run_by VARCHAR(255) NOT NULL,
    matched_count INTEGER NOT NULL DEFAULT 0,
    missing_laboran_count INTEGER NOT NULL DEFAULT 0,
    missing_kpa_count INTEGER NOT NULL DEFAULT 0,
    mismatch_count INTEGER NOT NULL DEFAULT 0,
    is_fully_matched BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS keuangan_compare_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    run_id UUID NOT NULL REFERENCES keuangan_compare_runs(id) ON DELETE CASCADE,
    status VARCHAR(40) NOT NULL,
    kode_pp VARCHAR(50),
    nama_pp VARCHAR(255),
    laboran_transaction_id UUID REFERENCES laboran_keuangan_transactions(id) ON DELETE SET NULL,
    procurement_item_id VARCHAR(64),
    procurement_submission_id VARCHAR(64),
    laboran_no_bukti VARCHAR(100),
    laboran_keterangan TEXT,
    laboran_nominal BIGINT,
    laboran_tanggal DATE,
    procurement_item_name TEXT,
    procurement_reference VARCHAR(128),
    procurement_nominal BIGINT,
    procurement_tanggal DATE,
    message TEXT,
    match_score NUMERIC(6, 4),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_laboran_uploads_tahun
    ON laboran_keuangan_uploads(tahun) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_laboran_uploads_created
    ON laboran_keuangan_uploads(created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_laboran_sheets_upload
    ON laboran_keuangan_sheets(upload_id);
CREATE INDEX IF NOT EXISTS idx_laboran_sheets_kode_pp
    ON laboran_keuangan_sheets(kode_pp);
CREATE INDEX IF NOT EXISTS idx_laboran_tx_upload
    ON laboran_keuangan_transactions(upload_id);
CREATE INDEX IF NOT EXISTS idx_laboran_tx_sheet
    ON laboran_keuangan_transactions(sheet_id);
CREATE INDEX IF NOT EXISTS idx_laboran_tx_bukti
    ON laboran_keuangan_transactions(no_bukti);
CREATE INDEX IF NOT EXISTS idx_compare_runs_upload
    ON keuangan_compare_runs(upload_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_compare_results_run
    ON keuangan_compare_results(run_id, status);

DROP TRIGGER IF EXISTS update_laboran_keuangan_uploads_updated_at ON laboran_keuangan_uploads;
CREATE TRIGGER update_laboran_keuangan_uploads_updated_at BEFORE UPDATE ON laboran_keuangan_uploads
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
