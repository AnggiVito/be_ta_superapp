exports.up = (pgm) => {
  pgm.addColumns('practicum_operational_sessions', {
    status_changed_by: { type: 'varchar(255)' },
    status_changed_at: { type: 'timestamptz' },
    status_change_note: { type: 'text' },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('practicum_operational_sessions', [
    'status_changed_by',
    'status_changed_at',
    'status_change_note',
  ], { ifExists: true });
};
