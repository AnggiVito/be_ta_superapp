-- Migration: 002_add_name_identifier.sql
-- Add name and identifier (NIM/NIP) fields to user_profiles for filtering and display

-- Add name field
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS name VARCHAR(255);

-- Add identifier field (can be NIM for students or NIP for lecturers/staff)
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS identifier VARCHAR(50);

-- Add index for name and identifier to facilitate search
CREATE INDEX IF NOT EXISTS idx_user_profiles_name ON user_profiles(name) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_user_profiles_identifier ON user_profiles(identifier) WHERE deleted_at IS NULL;

