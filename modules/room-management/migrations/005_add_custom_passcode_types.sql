-- Migration: Add custom passcode types to enum
-- Date: 2025-12-03
-- Description: Menambahkan 'custom-temporary' dan 'custom-permanent' ke passcode_type_enum

-- PostgreSQL doesn't support ALTER TYPE ... ADD VALUE inside transaction
-- We need to add new enum values

-- Add 'custom-temporary' to passcode_type_enum
ALTER TYPE passcode_type_enum ADD VALUE IF NOT EXISTS 'custom-temporary';

-- Add 'custom-permanent' to passcode_type_enum
ALTER TYPE passcode_type_enum ADD VALUE IF NOT EXISTS 'custom-permanent';

-- Update comment
COMMENT ON COLUMN passcode_logs.passcode_type IS 'Type of passcode (permanent/temporary/onetime/custom-temporary/custom-permanent)';
