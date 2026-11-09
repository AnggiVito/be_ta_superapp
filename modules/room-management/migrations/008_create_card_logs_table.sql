-- =============================================
-- Migration: 008_create_card_logs_table
-- Description: Create card_logs table for IC card audit trail
-- =============================================

-- Create card_logs table
CREATE TABLE IF NOT EXISTS card_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    room_id UUID NOT NULL REFERENCES rooms (id) ON DELETE CASCADE,
    lock_id VARCHAR(50) NOT NULL,
    card_id INTEGER,
    card_number VARCHAR(100),
    card_name VARCHAR(255),
    start_date TIMESTAMP WITH TIME ZONE,
    end_date TIMESTAMP WITH TIME ZONE,
    created_by VARCHAR(255),
    deleted_by VARCHAR(255),
    action VARCHAR(50) NOT NULL DEFAULT 'created',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_card_logs_room_id ON card_logs (room_id);

CREATE INDEX IF NOT EXISTS idx_card_logs_lock_id ON card_logs (lock_id);

CREATE INDEX IF NOT EXISTS idx_card_logs_card_id ON card_logs (card_id);

CREATE INDEX IF NOT EXISTS idx_card_logs_action ON card_logs (action);

CREATE INDEX IF NOT EXISTS idx_card_logs_created_at ON card_logs (created_at);

-- Table comment
COMMENT ON TABLE card_logs IS 'Audit log for IC card operations (add/delete) on smart locks';