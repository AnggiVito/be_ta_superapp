exports.up = (pgm) => {
  // Hybrid design:
  // - Conduct stores practicum timetable (class/day/shift/week range)
  // - References to registration master data are stored as UUIDs (no FK across services)

  // Make legacy datetime fields optional (we don't want Conduct to be the source of truth
  // for specific dates yet; timetable is shift-based).
  pgm.alterColumn('practicum_sessions', 'start_time', {
    notNull: false,
  });
  pgm.alterColumn('practicum_sessions', 'end_time', {
    notNull: false,
  });

  // Drop old constraint if it exists (it will fail when start/end are null).
  pgm.sql(
    "ALTER TABLE practicum_sessions DROP CONSTRAINT IF EXISTS chk_practicum_sessions_time_order;"
  );

  // Registration master-data references
  pgm.addColumn('practicum_sessions', {
    registration_practicum_id: { type: 'uuid', notNull: false },
    registration_module_id: { type: 'uuid', notNull: false },
  });

  // Timetable fields (shift-based)
  pgm.addColumn('practicum_sessions', {
    class_group: { type: 'text', notNull: false },
    day_of_week: { type: 'varchar(20)', notNull: false },
    shift_start_time: { type: 'time', notNull: false },
    shift_end_time: { type: 'time', notNull: false },
    week_start: { type: 'int', notNull: false },
    week_end: { type: 'int', notNull: false },
    venue: { type: 'text', notNull: false },
  });

  pgm.sql(`
    ALTER TABLE practicum_sessions
    ADD CONSTRAINT chk_practicum_sessions_week_range
      CHECK (week_start > 0 AND week_end >= week_start);
  `);
  pgm.sql(`
    ALTER TABLE practicum_sessions
    ADD CONSTRAINT chk_practicum_sessions_shift_time_order
      CHECK (shift_end_time > shift_start_time);
  `);

  // Helpful indexes
  pgm.sql(
    'CREATE INDEX IF NOT EXISTS idx_practicum_sessions_reg_module_id ON practicum_sessions(registration_module_id) WHERE deleted_at IS NULL;'
  );
  pgm.sql(
    'CREATE INDEX IF NOT EXISTS idx_practicum_sessions_day_of_week ON practicum_sessions(day_of_week) WHERE deleted_at IS NULL;'
  );
};

exports.down = (pgm) => {
  // Best-effort rollback (kept simple)
  pgm.sql(
    "ALTER TABLE practicum_sessions DROP CONSTRAINT IF EXISTS chk_practicum_sessions_week_range;"
  );
  pgm.sql(
    "ALTER TABLE practicum_sessions DROP CONSTRAINT IF EXISTS chk_practicum_sessions_shift_time_order;"
  );

  pgm.dropIndex('practicum_sessions', 'idx_practicum_sessions_reg_module_id', { ifExists: true });
  pgm.dropIndex('practicum_sessions', 'idx_practicum_sessions_day_of_week', { ifExists: true });

  pgm.dropColumns('practicum_sessions', [
    'registration_practicum_id',
    'registration_module_id',
    'class_group',
    'day_of_week',
    'shift_start_time',
    'shift_end_time',
    'week_start',
    'week_end',
    'venue',
  ]);

  // Restore legacy constraint and not-null fields
  pgm.alterColumn('practicum_sessions', 'start_time', { notNull: true });
  pgm.alterColumn('practicum_sessions', 'end_time', { notNull: true });
  pgm.sql(`
    ALTER TABLE practicum_sessions
    ADD CONSTRAINT chk_practicum_sessions_time_order CHECK (end_time > start_time);
  `);
};

