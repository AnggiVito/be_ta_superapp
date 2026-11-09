exports.up = (pgm) => {
  pgm.createTable('practicum_operational_session_assistants', {
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
    assistant_user_id: {
      type: 'varchar(255)',
      notNull: true,
    },
    assistant_code: {
      type: 'varchar(50)',
    },
    assistant_name: {
      type: 'varchar(255)',
    },
    class_group: {
      type: 'varchar(50)',
    },
    assigned_by: {
      type: 'varchar(255)',
      notNull: true,
    },
    assigned_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
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
    deleted_at: {
      type: 'timestamptz',
    },
  });

  pgm.createIndex('practicum_operational_session_assistants', ['operational_session_id'], {
    name: 'idx_operational_session_assistants_session_id',
  });
  pgm.createIndex(
    'practicum_operational_session_assistants',
    ['operational_session_id', 'assistant_user_id'],
    {
      name: 'uniq_operational_session_assistant_active',
      unique: true,
      where: 'deleted_at IS NULL',
    }
  );
};

exports.down = (pgm) => {
  pgm.dropTable('practicum_operational_session_assistants', { ifExists: true });
};
