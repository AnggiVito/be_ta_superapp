/**
 * Migration: link room bookings to registration schedules (practicum sync)
 */

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE room_bookings
      ADD COLUMN IF NOT EXISTS registration_schedule_id UUID,
      ADD COLUMN IF NOT EXISTS access_mode VARCHAR(20),
      ADD COLUMN IF NOT EXISTS sync_metadata JSONB DEFAULT '{}'::jsonb;

    CREATE UNIQUE INDEX IF NOT EXISTS unique_room_booking_registration_schedule_active
      ON room_bookings (registration_schedule_id)
      WHERE registration_schedule_id IS NOT NULL AND status = 'active';

    CREATE INDEX IF NOT EXISTS idx_room_bookings_registration_schedule_id
      ON room_bookings (registration_schedule_id)
      WHERE registration_schedule_id IS NOT NULL;

    COMMENT ON COLUMN room_bookings.registration_schedule_id IS 'Source registration schedule UUID for practicum sync';
    COMMENT ON COLUMN room_bookings.access_mode IS 'Lock access mode: passcode or rfid';
    COMMENT ON COLUMN room_bookings.sync_metadata IS 'Practicum sync details (assistants, warnings, TTLock ids)';
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS unique_room_booking_registration_schedule_active;
    DROP INDEX IF EXISTS idx_room_bookings_registration_schedule_id;

    ALTER TABLE room_bookings
      DROP COLUMN IF EXISTS sync_metadata,
      DROP COLUMN IF EXISTS access_mode,
      DROP COLUMN IF EXISTS registration_schedule_id;
  `);
};
