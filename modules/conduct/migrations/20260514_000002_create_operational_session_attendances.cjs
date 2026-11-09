/**
 * Create practicum_operational_session_attendances table (#136).
 *
 * Praktikan check-in satu kali per operational session via rolling QR absensi.
 */

exports.up = (pgm) => {
  pgm.createTable('practicum_operational_session_attendances', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    operational_session_id: {
      type: 'uuid',
      notNull: true,
      references: 'practicum_operational_sessions(id)',
      onDelete: 'CASCADE',
    },
    user_id: { type: 'varchar(255)', notNull: true },
    qr_session_id: {
      type: 'uuid',
      references: 'practicum_operational_session_qr_sessions(id)',
      onDelete: 'SET NULL',
    },
    attendance_time: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    attendance_status: {
      type: 'varchar(20)',
      notNull: true,
      default: 'present',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.addConstraint(
    'practicum_operational_session_attendances',
    'uq_op_session_attendance_user',
    'UNIQUE (operational_session_id, user_id)'
  );
  pgm.createIndex(
    'practicum_operational_session_attendances',
    ['operational_session_id'],
    { name: 'idx_op_session_attendance_session_id' }
  );
  pgm.createIndex(
    'practicum_operational_session_attendances',
    ['user_id'],
    { name: 'idx_op_session_attendance_user_id' }
  );
};

exports.down = (pgm) => {
  pgm.dropTable('practicum_operational_session_attendances', { ifExists: true });
};
