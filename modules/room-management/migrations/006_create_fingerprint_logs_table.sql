/**
 * Migration: Create fingerprint_logs table
 * Database: room_management_db
 * Purpose: Log all fingerprint operations (add/delete) for audit trail
 */

-- Create fingerprint_logs table
CREATE TABLE fingerprint_logs (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Foreign key to rooms table
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,

  -- TTLock identifiers
  lock_id BIGINT NOT NULL,
  fingerprint_id BIGINT,

  -- Fingerprint information
  fingerprint_number VARCHAR(100),
  fingerprint_name VARCHAR(100),
  fingerprint_type INTEGER, -- 1=normal, 4=cyclic

  -- Time validity (for cyclic or timed fingerprints)
  start_date TIMESTAMP,
  end_date TIMESTAMP,
  cyclic_config JSONB,

  -- Action tracking
  action VARCHAR(20) NOT NULL DEFAULT 'created', -- 'created' or 'deleted'

  -- User tracking
  created_by VARCHAR(100),
  deleted_by VARCHAR(100),

  -- Additional metadata
  metadata JSONB,

  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_fingerprint_logs_room_id ON fingerprint_logs(room_id);
CREATE INDEX idx_fingerprint_logs_lock_id ON fingerprint_logs(lock_id);
CREATE INDEX idx_fingerprint_logs_fingerprint_id ON fingerprint_logs(fingerprint_id);
CREATE INDEX idx_fingerprint_logs_action ON fingerprint_logs(action);
CREATE INDEX idx_fingerprint_logs_created_at ON fingerprint_logs(created_at);

-- Composite index for common queries
CREATE INDEX idx_fingerprint_logs_room_action ON fingerprint_logs(room_id, action);

-- Add comments
COMMENT ON TABLE fingerprint_logs IS 'Audit log for fingerprint operations';
COMMENT ON COLUMN fingerprint_logs.id IS 'Primary key (UUID)';
COMMENT ON COLUMN fingerprint_logs.room_id IS 'Room associated with this fingerprint';
COMMENT ON COLUMN fingerprint_logs.lock_id IS 'TTLock lock ID';
COMMENT ON COLUMN fingerprint_logs.fingerprint_id IS 'TTLock fingerprint ID';
COMMENT ON COLUMN fingerprint_logs.fingerprint_number IS 'Fingerprint code';
COMMENT ON COLUMN fingerprint_logs.fingerprint_name IS 'Fingerprint name';
COMMENT ON COLUMN fingerprint_logs.fingerprint_type IS 'Fingerprint type: 1=normal, 4=cyclic';
COMMENT ON COLUMN fingerprint_logs.start_date IS 'Start date for timed fingerprints';
COMMENT ON COLUMN fingerprint_logs.end_date IS 'End date for timed fingerprints';
COMMENT ON COLUMN fingerprint_logs.cyclic_config IS 'Cyclic time configuration (startTime, endTime, weekDay)';
COMMENT ON COLUMN fingerprint_logs.action IS 'Action performed (created/deleted)';
COMMENT ON COLUMN fingerprint_logs.created_by IS 'User who added the fingerprint';
COMMENT ON COLUMN fingerprint_logs.deleted_by IS 'User who deleted the fingerprint';
COMMENT ON COLUMN fingerprint_logs.metadata IS 'Additional metadata (TTLock response, etc.)';
COMMENT ON COLUMN fingerprint_logs.created_at IS 'Record creation timestamp';
COMMENT ON COLUMN fingerprint_logs.updated_at IS 'Record update timestamp';
