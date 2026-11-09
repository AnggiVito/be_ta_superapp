exports.up = (pgm) => {
  pgm.createTable('practicum_simulation_attendance', {
    id: {
      type: 'UUID',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()'),
    },
    simulation_id: {
      type: 'UUID',
      notNull: true,
      references: '"practicum_simulations"',
      onDelete: 'CASCADE',
    },
    scanned_by: {
      type: 'VARCHAR(255)',
      notNull: true,
      comment: 'User ID of asisten_praktikum_aktif who scanned',
    },
    qr_session_id: {
      type: 'UUID',
      references: '"practicum_simulation_qr_sessions"',
      onDelete: 'SET NULL',
    },
    scanned_at: {
      type: 'TIMESTAMP',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    scanned_ip: {
      type: 'VARCHAR(64)',
      notNull: false,
      comment: 'Client IP address when scanning QR',
    },
    scanned_user_agent: {
      type: 'TEXT',
      notNull: false,
      comment: 'Client user agent when scanning QR',
    },
    created_at: {
      type: 'TIMESTAMP',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    updated_at: {
      type: 'TIMESTAMP',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  }, {
    ifNotExists: true,
  });

  // Create indexes for performance
  pgm.createIndex('practicum_simulation_attendance', 'simulation_id', {
    ifNotExists: true,
  });
  pgm.createIndex('practicum_simulation_attendance', 'scanned_by', {
    ifNotExists: true,
  });
  pgm.createIndex('practicum_simulation_attendance', 'scanned_at', {
    ifNotExists: true,
  });
  pgm.createIndex('practicum_simulation_attendance', 'scanned_ip', {
    ifNotExists: true,
  });

  // Add unique constraint to prevent duplicate scans
  pgm.sql(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'unique_simulation_attendance_per_user'
      ) THEN
        ALTER TABLE practicum_simulation_attendance
        ADD CONSTRAINT unique_simulation_attendance_per_user
        UNIQUE (simulation_id, scanned_by);
      END IF;
    END$$;
  `);
};

exports.down = (pgm) => {
  pgm.dropTable('practicum_simulation_attendance', {
    ifExists: true,
    cascade: true,
  });
};
