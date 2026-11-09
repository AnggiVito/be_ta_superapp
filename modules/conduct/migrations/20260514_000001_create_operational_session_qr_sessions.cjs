/**
 * Create practicum_operational_session_qr_sessions table (#134).
 *
 * Rolling QR untuk absensi praktikum pada operational session. QR hanya
 * berlaku untuk sesi yang sedang Ongoing dan hanya boleh di-generate oleh
 * PIC sesi (pic_user_id). Token berganti tiap 15 detik.
 */

exports.up = (pgm) => {
  pgm.createTable('practicum_operational_session_qr_sessions', {
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
    qr_token: { type: 'uuid', notNull: true, unique: true },
    qr_data: { type: 'jsonb', notNull: true },
    generated_by: { type: 'varchar(255)', notNull: true },
    is_active: { type: 'boolean', notNull: true, default: true },
    expired_at: { type: 'timestamptz', notNull: true },
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

  pgm.createIndex(
    'practicum_operational_session_qr_sessions',
    ['operational_session_id'],
    { name: 'idx_op_session_qr_session_id' }
  );
  pgm.createIndex(
    'practicum_operational_session_qr_sessions',
    ['operational_session_id', 'is_active'],
    {
      name: 'idx_op_session_qr_active',
      where: 'is_active = true',
    }
  );
};

exports.down = (pgm) => {
  pgm.dropTable('practicum_operational_session_qr_sessions', { ifExists: true });
};
