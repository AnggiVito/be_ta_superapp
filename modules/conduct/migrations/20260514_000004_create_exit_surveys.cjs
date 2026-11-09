exports.up = (pgm) => {
  pgm.createTable('exit_surveys', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    title: { type: 'varchar(255)', notNull: true },
    description: { type: 'text' },
    status: { type: 'varchar(20)', notNull: true, default: 'draft' },
    created_by: { type: 'varchar(255)', notNull: true },
    activated_at: { type: 'timestamptz' },
    archived_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    deleted_at: { type: 'timestamptz' },
  });

  pgm.addConstraint('exit_surveys', 'chk_exit_surveys_status', {
    check: "status IN ('draft','active','archived')",
  });

  pgm.sql(
    "CREATE UNIQUE INDEX uniq_exit_surveys_active ON exit_surveys ((1)) WHERE status = 'active' AND deleted_at IS NULL"
  );

};

exports.down = (pgm) => {
  pgm.sql('DROP INDEX IF EXISTS uniq_exit_surveys_active');
  pgm.dropTable('exit_surveys', { ifExists: true });
};
