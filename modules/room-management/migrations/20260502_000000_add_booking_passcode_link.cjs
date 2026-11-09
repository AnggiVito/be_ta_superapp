/**
 * Migration: 2026-05-02
 *
 * Link approved room bookings to generated passcode logs.
 * Related: Booking approval to passcode generation flow
 */

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE room_bookings
      ADD COLUMN IF NOT EXISTS passcode_log_id UUID REFERENCES passcode_logs(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS passcode_generated_by UUID,
      ADD COLUMN IF NOT EXISTS passcode_generated_at TIMESTAMP;

    CREATE INDEX IF NOT EXISTS idx_room_bookings_passcode_log_id
      ON room_bookings(passcode_log_id)
      WHERE passcode_log_id IS NOT NULL;

    COMMENT ON COLUMN room_bookings.passcode_log_id IS 'Generated passcode_logs.id linked to this booking';
    COMMENT ON COLUMN room_bookings.passcode_generated_by IS 'User ID who generated the booking passcode';
    COMMENT ON COLUMN room_bookings.passcode_generated_at IS 'Timestamp when booking passcode was generated';
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_room_bookings_passcode_log_id;

    ALTER TABLE room_bookings
      DROP COLUMN IF EXISTS passcode_log_id,
      DROP COLUMN IF EXISTS passcode_generated_by,
      DROP COLUMN IF EXISTS passcode_generated_at;
  `);
};
