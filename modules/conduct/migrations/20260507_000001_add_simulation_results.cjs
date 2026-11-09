exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE practicum_simulations
      ADD COLUMN IF NOT EXISTS result_note TEXT,
      ADD COLUMN IF NOT EXISTS result_submitted_at TIMESTAMP NULL,
      ADD COLUMN IF NOT EXISTS result_submitted_by VARCHAR(255) NULL;
  `);

  pgm.sql('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');

  pgm.sql(`
    CREATE TABLE IF NOT EXISTS practicum_simulation_result_attachments (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      simulation_id UUID NOT NULL REFERENCES practicum_simulations(id) ON DELETE CASCADE,
      file_path TEXT NOT NULL,
      file_url TEXT NOT NULL,
      mime_type VARCHAR(100) NOT NULL,
      original_name TEXT,
      uploaded_at TIMESTAMP NOT NULL DEFAULT NOW(),
      uploaded_by VARCHAR(255) NULL
    );
  `);

  pgm.sql(
    'CREATE INDEX IF NOT EXISTS idx_sim_result_attachments_simulation_id ON practicum_simulation_result_attachments(simulation_id);'
  );
};

exports.down = (pgm) => {
  pgm.dropTable('practicum_simulation_result_attachments', { ifExists: true, cascade: true });

  pgm.sql(`
    ALTER TABLE practicum_simulations
      DROP COLUMN IF EXISTS result_note,
      DROP COLUMN IF EXISTS result_submitted_at,
      DROP COLUMN IF EXISTS result_submitted_by;
  `);
};