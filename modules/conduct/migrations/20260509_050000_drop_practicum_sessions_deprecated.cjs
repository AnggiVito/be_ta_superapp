exports.up = (pgm) => {
  // Deprecated feature: practicum_sessions (jadwal dibuat di Conduct).
  // Current design: jadwal berasal dari Registration, Conduct hanya membuat
  // practicum_operational_sessions.
  pgm.dropTable('practicum_sessions', { ifExists: true, cascade: true });
};

exports.down = (_pgm) => {
  // No-op: this migration intentionally does not recreate deprecated table.
};

