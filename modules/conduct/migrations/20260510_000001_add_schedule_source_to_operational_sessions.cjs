exports.up = (pgm) => {
  pgm.addColumn('practicum_operational_sessions', {
    schedule_source: {
      type: 'varchar(50)',
      notNull: true,
      default: 'registration_dummy',
    },
  });

  pgm.sql(`
    ALTER TABLE practicum_operational_sessions
    ADD CONSTRAINT chk_operational_sessions_schedule_source
      CHECK (schedule_source IN ('registration_dummy','registration_api'));
  `);
};

exports.down = (pgm) => {
  pgm.sql(
    'ALTER TABLE practicum_operational_sessions DROP CONSTRAINT IF EXISTS chk_operational_sessions_schedule_source;'
  );
  pgm.dropColumn('practicum_operational_sessions', 'schedule_source');
};

