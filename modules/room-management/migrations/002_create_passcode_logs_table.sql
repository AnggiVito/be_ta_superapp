/**
 * Migration: Create passcode_logs table
 * Database: room_management_db
 * Purpose: Log all passcode creation and deletion for audit trail
 */

-- Create passcode_type enum
CREATE TYPE passcode_type_enum AS ENUM ('permanent', 'temporary', 'onetime');

-- Create action enum
CREATE TYPE passcode_action_enum AS ENUM ('created', 'deleted', 'updated');

-- Create passcode_logs table
CREATE TABLE passcode_logs (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Foreign key to rooms table
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  
  -- TTLock identifiers
  lock_id BIGINT NOT NULL,
  passcode_id BIGINT,
  
  -- Passcode information
  passcode_name VARCHAR(100) NOT NULL,
  passcode_type passcode_type_enum,
  start_date TIMESTAMP,
  end_date TIMESTAMP,
  
  -- Action tracking
  action passcode_action_enum NOT NULL DEFAULT 'created',
  
  -- User tracking (optional, for future auth integration)
  created_by VARCHAR(100),
  deleted_by VARCHAR(100),
  
  -- Additional metadata
  metadata JSONB,
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_passcode_logs_room_id ON passcode_logs(room_id);
CREATE INDEX idx_passcode_logs_lock_id ON passcode_logs(lock_id);
CREATE INDEX idx_passcode_logs_passcode_id ON passcode_logs(passcode_id);
CREATE INDEX idx_passcode_logs_action ON passcode_logs(action);
CREATE INDEX idx_passcode_logs_created_at ON passcode_logs(created_at);

-- Composite index for common queries
CREATE INDEX idx_passcode_logs_room_action ON passcode_logs(room_id, action);

-- Add comments
COMMENT ON TABLE passcode_logs IS 'Audit log for passcode operations';
COMMENT ON COLUMN passcode_logs.id IS 'Primary key (UUID)';
COMMENT ON COLUMN passcode_logs.room_id IS 'Room associated with this passcode';
COMMENT ON COLUMN passcode_logs.lock_id IS 'TTLock lock ID';
COMMENT ON COLUMN passcode_logs.passcode_id IS 'TTLock passcode ID';
COMMENT ON COLUMN passcode_logs.passcode_name IS 'Name/description of the passcode';
COMMENT ON COLUMN passcode_logs.passcode_type IS 'Type of passcode (permanent/temporary/onetime)';
COMMENT ON COLUMN passcode_logs.start_date IS 'Start date for temporary passcodes';
COMMENT ON COLUMN passcode_logs.end_date IS 'End date for temporary passcodes';
COMMENT ON COLUMN passcode_logs.action IS 'Action performed on passcode (created/deleted/updated)';
COMMENT ON COLUMN passcode_logs.created_by IS 'User who created the passcode';
COMMENT ON COLUMN passcode_logs.deleted_by IS 'User who deleted the passcode';
COMMENT ON COLUMN passcode_logs.metadata IS 'Additional metadata (e.g., booking reference)';
COMMENT ON COLUMN passcode_logs.created_at IS 'Record creation timestamp';
COMMENT ON COLUMN passcode_logs.updated_at IS 'Record update timestamp';
