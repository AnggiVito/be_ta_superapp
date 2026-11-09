exports.up = (pgm) => {
  pgm.addColumns('practicum_operational_sessions', {
    cancellation_reason: { type: 'varchar(100)' },
    cancellation_notes: { type: 'text' },
    cancelled_by: { type: 'varchar(255)' },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('practicum_operational_sessions', [
    'cancellation_reason',
    'cancellation_notes',
    'cancelled_by',
  ], { ifExists: true });
};
