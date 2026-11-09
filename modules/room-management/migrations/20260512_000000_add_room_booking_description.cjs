/**
 * Migration: 2026-05-12
 *
 * Add purpose/description text to room booking requests.
 */

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE room_bookings
      ADD COLUMN IF NOT EXISTS description TEXT;

    COMMENT ON COLUMN room_bookings.description IS 'User-provided booking purpose or description';
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE room_bookings
      DROP COLUMN IF EXISTS description;
  `);
};
