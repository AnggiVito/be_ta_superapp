-- User Management Database Schema
-- Migration: 001_create_tables.sql

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table: user_profiles
-- Menyimpan data tambahan user (TTD, no rekening)
-- user_id reference ke AUTH GATEWAY (tidak replicate data user)
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR(255) NOT NULL UNIQUE, -- Reference ke user_id dari AUTH GATEWAY
    ttd TEXT, -- Base64 encoded signature image
    ttd_file_path VARCHAR(500), -- Path ke file jika disimpan di storage
    no_rekening VARCHAR(50), -- No rekening khusus asisten praktikum
    bank_name VARCHAR(100), -- Nama bank
    account_name VARCHAR(255), -- Nama pemilik rekening
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP NULL
);

-- Index untuk user_id
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id) WHERE deleted_at IS NULL;

-- Table: user_roles
-- Mengelola role user untuk praktikum
CREATE TABLE IF NOT EXISTS user_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR(255) NOT NULL, -- Reference ke user_id dari AUTH GATEWAY
    role VARCHAR(50) NOT NULL, -- asisten_praktikum, asisten_praktikum_aktif, koordinator_praktikum, kaur_lab, laboran
    is_active BOOLEAN NOT NULL DEFAULT true,
    assigned_at TIMESTAMP NOT NULL DEFAULT NOW(),
    assigned_by VARCHAR(255), -- user_id yang assign role ini
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP NULL,
    CONSTRAINT unique_user_role UNIQUE (user_id, role, deleted_at)
);

-- Index untuk user_id dan role
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role) WHERE deleted_at IS NULL AND is_active = true;
CREATE INDEX IF NOT EXISTS idx_user_roles_user_role ON user_roles(user_id, role) WHERE deleted_at IS NULL AND is_active = true;

-- Note: Tabel asisten_praktikum_assignments akan dibuat di modul registration

-- Function untuk update updated_at automatically
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers untuk update updated_at
DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON user_profiles;
CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_roles_updated_at ON user_roles;
CREATE TRIGGER update_user_roles_updated_at BEFORE UPDATE ON user_roles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

