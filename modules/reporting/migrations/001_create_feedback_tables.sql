-- Reporting Database Schema
-- Migration: 001_create_feedback_tables.sql

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table: feedback_uploads
-- Menyimpan informasi file Excel yang diupload
CREATE TABLE IF NOT EXISTS feedback_uploads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size INTEGER NOT NULL,
    uploaded_by VARCHAR(255) NOT NULL, -- Reference ke user_id dari AUTH GATEWAY
    uploaded_at TIMESTAMP NOT NULL DEFAULT NOW(),
    periode VARCHAR(50), -- Contoh: "2024/2025 Ganjil"
    prodi_id VARCHAR(100), -- Reference ke prodi (dari modul registration)
    praktikum_id VARCHAR(100), -- Reference ke praktikum (dari modul registration)
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, processed, failed
    processed_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP NULL
);

-- Table: feedback_items
-- Menyimpan data feedback individual dari Excel
CREATE TABLE IF NOT EXISTS feedback_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    upload_id UUID NOT NULL REFERENCES feedback_uploads(id) ON DELETE CASCADE,
    row_number INTEGER NOT NULL, -- Nomor baris di Excel
    mahasiswa_nim VARCHAR(50),
    mahasiswa_nama VARCHAR(255),
    asisten_nama VARCHAR(255),
    feedback_text TEXT NOT NULL,
    sentiment VARCHAR(20), -- positive, negative, neutral
    sentiment_score DECIMAL(5,4), -- -1.0 to 1.0
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP NULL
);

-- Table: feedback_summaries
-- Menyimpan hasil aggregasi/summary feedback per praktikum/periode
CREATE TABLE IF NOT EXISTS feedback_summaries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    upload_id UUID NOT NULL REFERENCES feedback_uploads(id) ON DELETE CASCADE,
    periode VARCHAR(50),
    prodi_id VARCHAR(100),
    prodi_nama VARCHAR(255),
    praktikum_id VARCHAR(100),
    praktikum_nama VARCHAR(255),
    total_feedback INTEGER NOT NULL DEFAULT 0,
    positive_count INTEGER NOT NULL DEFAULT 0,
    negative_count INTEGER NOT NULL DEFAULT 0,
    neutral_count INTEGER NOT NULL DEFAULT 0,
    positive_percentage DECIMAL(5,2) NOT NULL DEFAULT 0,
    negative_percentage DECIMAL(5,2) NOT NULL DEFAULT 0,
    neutral_percentage DECIMAL(5,2) NOT NULL DEFAULT 0,
    average_sentiment_score DECIMAL(5,4), -- -1.0 to 1.0
    top_positive_keywords TEXT[], -- Array of keywords
    top_negative_keywords TEXT[], -- Array of keywords
    generated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP NULL
);

-- Indexes untuk performance
CREATE INDEX IF NOT EXISTS idx_feedback_uploads_uploaded_by ON feedback_uploads(uploaded_by) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_feedback_uploads_periode ON feedback_uploads(periode) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_feedback_uploads_prodi ON feedback_uploads(prodi_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_feedback_uploads_status ON feedback_uploads(status) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_feedback_items_upload_id ON feedback_items(upload_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_feedback_items_sentiment ON feedback_items(sentiment) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_feedback_summaries_upload_id ON feedback_summaries(upload_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_feedback_summaries_periode ON feedback_summaries(periode) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_feedback_summaries_prodi ON feedback_summaries(prodi_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_feedback_summaries_praktikum ON feedback_summaries(praktikum_id) WHERE deleted_at IS NULL;

-- Function untuk update updated_at automatically
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers untuk update updated_at
DROP TRIGGER IF EXISTS update_feedback_uploads_updated_at ON feedback_uploads;
CREATE TRIGGER update_feedback_uploads_updated_at BEFORE UPDATE ON feedback_uploads
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_feedback_items_updated_at ON feedback_items;
CREATE TRIGGER update_feedback_items_updated_at BEFORE UPDATE ON feedback_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_feedback_summaries_updated_at ON feedback_summaries;
CREATE TRIGGER update_feedback_summaries_updated_at BEFORE UPDATE ON feedback_summaries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
