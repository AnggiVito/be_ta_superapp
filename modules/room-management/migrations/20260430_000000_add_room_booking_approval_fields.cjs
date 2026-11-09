/**
 * Migration: 2026-04-30
 *
 * Add approval workflow fields to room_bookings.
 * Related: Room booking approval flow
 */

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE room_bookings
      ADD COLUMN IF NOT EXISTS approved_by UUID,
      ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS rejected_by UUID,
      ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP;

    COMMENT ON COLUMN room_bookings.status IS 'Booking status (pending/active/rejected/canceled)';
    COMMENT ON COLUMN room_bookings.approved_by IS 'User ID who approved booking';
    COMMENT ON COLUMN room_bookings.approved_at IS 'Approval timestamp';
    COMMENT ON COLUMN room_bookings.rejected_by IS 'User ID who rejected booking';
    COMMENT ON COLUMN room_bookings.rejected_at IS 'Rejection timestamp';
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE room_bookings
      DROP COLUMN IF EXISTS approved_by,
      DROP COLUMN IF EXISTS approved_at,
      DROP COLUMN IF EXISTS rejected_by,
      DROP COLUMN IF EXISTS rejected_at;

    COMMENT ON COLUMN room_bookings.status IS 'Booking status (active/canceled)';
  `);
};
