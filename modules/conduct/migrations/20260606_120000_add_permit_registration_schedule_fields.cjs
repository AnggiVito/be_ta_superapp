exports.up = (pgm) => {
  pgm.addColumns('permit_requests', {
    original_registration_schedule_id: { type: 'uuid', notNull: false },
    shift_registration_schedule_id: { type: 'uuid', notNull: false },
  });

  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_permit_requests_original_schedule
    ON permit_requests(original_registration_schedule_id)
    WHERE deleted_at IS NULL;
  `);

  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_permit_requests_shift_schedule
    ON permit_requests(shift_registration_schedule_id)
    WHERE deleted_at IS NULL;
  `);
};

exports.down = (pgm) => {
  pgm.dropIndex('permit_requests', 'idx_permit_requests_shift_schedule', {
    ifExists: true,
  });
  pgm.dropIndex('permit_requests', 'idx_permit_requests_original_schedule', {
    ifExists: true,
  });
  pgm.dropColumns('permit_requests', [
    'original_registration_schedule_id',
    'shift_registration_schedule_id',
  ]);
};
