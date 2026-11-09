/**
 * Add rejection note for room booking approval workflow.
 */

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE room_bookings
      ADD COLUMN IF NOT EXISTS rejection_note TEXT;

    COMMENT ON COLUMN room_bookings.rejection_note IS
      'Admin-provided reason shown to requester when a booking is rejected';
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE room_bookings
      DROP COLUMN IF EXISTS rejection_note;
  `);
};
