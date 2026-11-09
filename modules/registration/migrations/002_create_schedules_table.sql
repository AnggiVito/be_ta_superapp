-- Registration Database Schema
-- Migration: 002_create_schedules_table.sql
-- Menambahkan tabel schedules dan schedule_assistants untuk mengelola jadwal praktikum

-- Enable pgcrypto for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Drop old schedules table if it exists (from migration 001) and recreate with new schema
-- The old schema used enrollment_id, new schema uses module_id
DROP TABLE IF EXISTS schedules CASCADE;

-- Table: schedules
-- Menyimpan informasi jadwal praktikum per module
CREATE TABLE schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL REFERENCES practicum_modules(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMP WITH TIME ZONE,
  venue TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Table: schedule_assistants
-- Junction table untuk many-to-many relationship antara schedules dan asisten
-- Asisten yang bertugas adalah user dengan role asisten_praktikum_aktif
CREATE TABLE IF NOT EXISTS schedule_assistants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  user_id VARCHAR(255) NOT NULL, -- Reference ke user_id dari AUTH GATEWAY
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  CONSTRAINT unique_schedule_assistant UNIQUE (schedule_id, user_id)
);

-- Indexes untuk performa query
CREATE INDEX IF NOT EXISTS idx_schedules_module_id ON schedules(module_id);
CREATE INDEX IF NOT EXISTS idx_schedules_scheduled_at ON schedules(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_schedule_assistants_schedule_id ON schedule_assistants(schedule_id);
CREATE INDEX IF NOT EXISTS idx_schedule_assistants_user_id ON schedule_assistants(user_id);

-- Function untuk update updated_at automatically
CREATE OR REPLACE FUNCTION update_schedules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger untuk update updated_at
DROP TRIGGER IF EXISTS update_schedules_updated_at ON schedules;
CREATE TRIGGER update_schedules_updated_at BEFORE UPDATE ON schedules
    FOR EACH ROW EXECUTE FUNCTION update_schedules_updated_at();

