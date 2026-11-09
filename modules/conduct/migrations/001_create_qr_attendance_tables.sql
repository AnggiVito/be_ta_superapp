-- Conduct Database Schema
-- Migration: 001_create_qr_attendance_tables.sql

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table: qr_attendance_sessions
-- Menyimpan QR code untuk presensi dengan auto-refresh setiap 30 detik
CREATE TABLE IF NOT EXISTS qr_attendance_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    jadwal_id UUID NOT NULL, -- Reference ke jadwal dari registration_db
    assistant_user_id VARCHAR(255) NOT NULL, -- User ID asisten yang generate QR
    qr_token VARCHAR(500) NOT NULL UNIQUE, -- Token unik untuk QR code
    qr_data TEXT NOT NULL, -- Full QR code data (JSON)
    is_active BOOLEAN NOT NULL DEFAULT true, -- Status QR masih aktif atau tidak
    expired_at TIMESTAMP NOT NULL, -- Waktu expire (30 detik dari created_at)
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Index untuk query performa
CREATE INDEX IF NOT EXISTS idx_qr_sessions_jadwal ON qr_attendance_sessions(jadwal_id);
CREATE INDEX IF NOT EXISTS idx_qr_sessions_token ON qr_attendance_sessions(qr_token) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_qr_sessions_active ON qr_attendance_sessions(is_active, expired_at);
CREATE INDEX IF NOT EXISTS idx_qr_sessions_assistant ON qr_attendance_sessions(assistant_user_id);

-- Table: attendance (attendance records)
CREATE TABLE IF NOT EXISTS attendance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    jadwal_id UUID NOT NULL, -- Reference ke jadwal dari registration_db
    user_id VARCHAR(255) NOT NULL, -- User ID praktikan
    qr_session_id UUID, -- Reference ke QR session yang digunakan untuk scan
    status VARCHAR(50) NOT NULL DEFAULT 'hadir', -- hadir, izin, sakit, alpha
    waktu_hadir TIMESTAMP, -- Waktu scan QR / manual input
    keterangan TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP NULL,
    
    -- Foreign key ke QR session (optional)
    CONSTRAINT fk_attendance_qr_session FOREIGN KEY (qr_session_id) 
        REFERENCES qr_attendance_sessions(id) ON DELETE SET NULL,
    
    -- Unique constraint: satu user hanya bisa hadir sekali per jadwal
    CONSTRAINT unique_user_jadwal UNIQUE (jadwal_id, user_id)
);

-- Index untuk attendance
CREATE INDEX IF NOT EXISTS idx_attendance_jadwal ON attendance(jadwal_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_attendance_user ON attendance(user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_attendance_qr_session ON attendance(qr_session_id);

-- Function untuk update updated_at automatically
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers untuk update updated_at
DROP TRIGGER IF EXISTS update_qr_sessions_updated_at ON qr_attendance_sessions;
CREATE TRIGGER update_qr_sessions_updated_at BEFORE UPDATE ON qr_attendance_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_attendance_updated_at ON attendance;
CREATE TRIGGER update_attendance_updated_at BEFORE UPDATE ON attendance
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function untuk auto-expire QR sessions
CREATE OR REPLACE FUNCTION expire_old_qr_sessions()
RETURNS void AS $$
BEGIN
    UPDATE qr_attendance_sessions
    SET is_active = false
    WHERE is_active = true 
    AND expired_at < NOW();
END;
$$ language 'plpgsql';

-- Note: Untuk production, bisa setup cron job untuk panggil expire_old_qr_sessions()
-- Atau handle di application level setiap kali generate QR baru
