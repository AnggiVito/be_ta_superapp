/**
 * Add PIC + per-session active assistants (#133 follow-up).
 *
 * Key ideas:
 * - PIC is an attribute of a session, not a user role. The first
 *   asisten_praktikum that opens a session becomes its PIC.
 * - "Active assistant" state is per-session, not global. A separate
 *   table tracks which assistants are active for a given session and
 *   how they activated (PIC open or QR scan).
 */

exports.up = (pgm) => {
  pgm.addColumns('practicum_operational_sessions', {
    pic_user_id: { type: 'varchar(255)' },
    pic_opened_at: { type: 'timestamptz' },
  });

  pgm.createIndex('practicum_operational_sessions', ['pic_user_id'], {
    name: 'idx_operational_sessions_pic_user_id',
  });

  pgm.createTable('practicum_operational_session_active_assistants', {
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
    activation_method: { type: 'varchar(20)', notNull: true },
    activated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.addConstraint(
    'practicum_operational_session_active_assistants',
    'chk_activation_method',
    { check: "activation_method IN ('pic_open','qr_scan')" }
  );

  pgm.createIndex(
    'practicum_operational_session_active_assistants',
    ['operational_session_id'],
    { name: 'idx_session_active_assistants_session_id' }
  );

  pgm.createIndex(
    'practicum_operational_session_active_assistants',
    ['operational_session_id', 'user_id'],
    {
      name: 'uniq_session_active_assistant',
      unique: true,
    }
  );
};

exports.down = (pgm) => {
  pgm.dropTable('practicum_operational_session_active_assistants', {
    ifExists: true,
  });

  pgm.dropIndex(
    'practicum_operational_sessions',
    ['pic_user_id'],
    { name: 'idx_operational_sessions_pic_user_id', ifExists: true }
  );

  pgm.dropColumns('practicum_operational_sessions', ['pic_user_id', 'pic_opened_at'], {
    ifExists: true,
  });
};
