exports.up = (pgm) => {
  pgm.sql('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');

  pgm.sql(`
    CREATE TABLE IF NOT EXISTS practicum_simulations (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      simulation_name VARCHAR(255) NOT NULL,
      simulation_date DATE NOT NULL,
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      location VARCHAR(255),
      description TEXT,
      pic_user_id VARCHAR(255) NOT NULL,
      created_by VARCHAR(255) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'draft',
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMP NULL
    );
  `);

  pgm.sql(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_practicum_simulation_status'
      ) THEN
        ALTER TABLE practicum_simulations
        ADD CONSTRAINT chk_practicum_simulation_status
        CHECK (status IN ('draft', 'open', 'closed', 'cancelled'));
      END IF;
    END$$;
  `);

  pgm.sql(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_practicum_simulation_time_range'
      ) THEN
        ALTER TABLE practicum_simulations
        ADD CONSTRAINT chk_practicum_simulation_time_range
        CHECK (end_time > start_time);
      END IF;
    END$$;
  `);

  pgm.sql('CREATE INDEX IF NOT EXISTS idx_practicum_simulations_date ON practicum_simulations(simulation_date) WHERE deleted_at IS NULL;');
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_practicum_simulations_pic ON practicum_simulations(pic_user_id) WHERE deleted_at IS NULL;');
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_practicum_simulations_status ON practicum_simulations(status) WHERE deleted_at IS NULL;');
};

exports.down = (pgm) => {
  pgm.dropTable('practicum_simulations', { ifExists: true, cascade: true });
};
