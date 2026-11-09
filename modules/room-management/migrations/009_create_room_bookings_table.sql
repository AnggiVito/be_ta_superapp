/**
 * Migration: Create room_bookings table
 * Database: room_management_db
 */

-- Create room_bookings table
CREATE TABLE IF NOT EXISTS room_bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_by UUID NOT NULL,
  canceled_by UUID,
  canceled_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CHECK (end_time > start_time)
);

-- Prevent conflicts: same room + same timeslot when active
CREATE UNIQUE INDEX IF NOT EXISTS unique_room_booking_active_slot
ON room_bookings(room_id, start_time, end_time)
WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_room_bookings_room_id ON room_bookings(room_id);
CREATE INDEX IF NOT EXISTS idx_room_bookings_status ON room_bookings(status);
CREATE INDEX IF NOT EXISTS idx_room_bookings_created_by ON room_bookings(created_by);

-- Comments
COMMENT ON TABLE room_bookings IS 'Room bookings with time slots';
COMMENT ON COLUMN room_bookings.room_id IS 'Room ID';
COMMENT ON COLUMN room_bookings.start_time IS 'Booking start time';
COMMENT ON COLUMN room_bookings.end_time IS 'Booking end time';
COMMENT ON COLUMN room_bookings.status IS 'Booking status (active/canceled)';
COMMENT ON COLUMN room_bookings.created_by IS 'User ID who created booking';
COMMENT ON COLUMN room_bookings.canceled_by IS 'User ID who canceled booking';
COMMENT ON COLUMN room_bookings.canceled_at IS 'Cancellation timestamp';
