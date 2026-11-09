/**
 * Migration: Create rooms table
 * Database: room_management_db
 */

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create rooms table
CREATE TABLE rooms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(120) NOT NULL,
  capacity INTEGER NOT NULL CHECK (capacity > 0),
  is_occupied BOOLEAN NOT NULL DEFAULT FALSE,
  door_lock_id VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_rooms_name ON rooms(name);
CREATE INDEX idx_rooms_is_occupied ON rooms(is_occupied);
CREATE INDEX idx_rooms_door_lock_id ON rooms(door_lock_id);

-- Add comments
COMMENT ON TABLE rooms IS 'Rooms table for room management';
COMMENT ON COLUMN rooms.id IS 'Primary key (UUID)';
COMMENT ON COLUMN rooms.name IS 'Room name';
COMMENT ON COLUMN rooms.capacity IS 'Room capacity (number of people)';
COMMENT ON COLUMN rooms.is_occupied IS 'Room occupancy status';
COMMENT ON COLUMN rooms.door_lock_id IS 'TTLock door lock ID';
COMMENT ON COLUMN rooms.created_at IS 'Record creation timestamp';
COMMENT ON COLUMN rooms.updated_at IS 'Record update timestamp';
