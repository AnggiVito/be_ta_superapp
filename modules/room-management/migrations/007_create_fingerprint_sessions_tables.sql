/**
 * Migration: Create fingerprint_sessions and fingerprint_session_rooms tables
 * Database: room_management_db
 * Purpose: Support batch fingerprint registration across multiple locks
 */

-- Create fingerprint_sessions table (session header)
CREATE TABLE fingerprint_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4 (),
    person_name VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ongoing',
    created_by VARCHAR(100),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP
);

-- Create fingerprint_session_rooms table (per-lock tracking)
CREATE TABLE fingerprint_session_rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4 (),
    session_id UUID NOT NULL REFERENCES fingerprint_sessions (id) ON DELETE CASCADE,
    room_id UUID NOT NULL REFERENCES rooms (id) ON DELETE CASCADE,
    lock_id BIGINT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    fingerprint_id BIGINT,
    fingerprint_number VARCHAR(100),
    known_fingerprint_ids JSONB DEFAULT '[]',
    detected_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_fp_sessions_status ON fingerprint_sessions (status);

CREATE INDEX idx_fp_sessions_created_at ON fingerprint_sessions (created_at);

CREATE INDEX idx_fp_session_rooms_session_id ON fingerprint_session_rooms (session_id);

CREATE INDEX idx_fp_session_rooms_room_id ON fingerprint_session_rooms (room_id);

CREATE INDEX idx_fp_session_rooms_status ON fingerprint_session_rooms (status);

-- Composite index
CREATE INDEX idx_fp_session_rooms_session_status ON fingerprint_session_rooms (session_id, status);

-- Comments
COMMENT ON TABLE fingerprint_sessions IS 'Batch fingerprint registration sessions';

COMMENT ON COLUMN fingerprint_sessions.status IS 'Session status: ongoing, completed, cancelled';

COMMENT ON COLUMN fingerprint_sessions.person_name IS 'Name of the person registering their fingerprint';

COMMENT ON TABLE fingerprint_session_rooms IS 'Per-room tracking for fingerprint registration sessions';

COMMENT ON COLUMN fingerprint_session_rooms.known_fingerprint_ids IS 'Fingerprint IDs known at session creation (for diff detection)';

COMMENT ON COLUMN fingerprint_session_rooms.fingerprint_id IS 'Newly detected fingerprint ID from TTLock';

COMMENT ON COLUMN fingerprint_session_rooms.status IS 'Room status: pending, done, failed';