/**
 * Retire legacy QR attendance tables.
 *
 * The active double-QR operational session flow stores attendance in
 * operational session tables, so these pre-operational QR tables are no
 * longer part of the Conduct attendance source of truth.
 */

exports.up = (pgm) => {
  pgm.dropTable('attendance', { ifExists: true, cascade: true });
  pgm.dropTable('qr_attendance_sessions', { ifExists: true, cascade: true });
  pgm.sql('DROP FUNCTION IF EXISTS expire_old_qr_sessions()');
};

exports.down = (_pgm) => {
  // No-op: this migration intentionally does not recreate retired legacy tables.
};
