exports.up = (pgm) => {
  // Prevent duplicate timetable rows for active (non-deleted) sessions.
  // We treat NULL registration_module_id as a fixed value so uniqueness still applies.
  pgm.sql(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_practicum_sessions_schedule_key
    ON practicum_sessions (
      COALESCE(registration_module_id, '00000000-0000-0000-0000-000000000000'::uuid),
      week_start,
      week_end,
      class_group,
      day_of_week,
      shift_start_time,
      shift_end_time,
      venue
    )
    WHERE deleted_at IS NULL;
  `);
};

exports.down = (pgm) => {
  pgm.sql('DROP INDEX IF EXISTS uq_practicum_sessions_schedule_key;');
};

