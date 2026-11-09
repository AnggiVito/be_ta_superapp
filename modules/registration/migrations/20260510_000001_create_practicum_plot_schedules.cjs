exports.up = (pgm) => {
  pgm.sql('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');

  // Dummy integration table: final plotted practicum schedule per semester.
  // This is a temporary stand-in until Registration API is finalized.
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS practicum_plot_schedules (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

      semester_code VARCHAR(50) NOT NULL,
      registration_practicum_id UUID NULL,
      registration_module_id UUID NULL,

      practicum_name TEXT NOT NULL,
      module_name TEXT NOT NULL,

      class_group VARCHAR(50) NOT NULL,
      day_of_week VARCHAR(20) NOT NULL,
      shift_code VARCHAR(50) NULL,
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      venue TEXT NOT NULL,
      capacity INTEGER NOT NULL DEFAULT 0,

      week_number INTEGER NOT NULL,
      module_sequence INTEGER NOT NULL,

      -- Assistants/PIC as user_id list.
      assistants TEXT[] NOT NULL DEFAULT '{}',

      status VARCHAR(50) NOT NULL DEFAULT 'final',

      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      CONSTRAINT chk_plot_schedule_day_of_week
        CHECK (day_of_week IN ('monday','tuesday','wednesday','thursday','friday','saturday','sunday')),
      CONSTRAINT chk_plot_schedule_time_order
        CHECK (end_time > start_time),
      CONSTRAINT chk_plot_schedule_capacity_non_negative
        CHECK (capacity >= 0),
      CONSTRAINT chk_plot_schedule_week_number_positive
        CHECK (week_number > 0),
      CONSTRAINT chk_plot_schedule_module_sequence_positive
        CHECK (module_sequence > 0),
      CONSTRAINT chk_plot_schedule_status
        CHECK (status IN ('draft','final','archived'))
    );
  `);

  pgm.sql(
    'CREATE INDEX IF NOT EXISTS idx_plot_schedules_semester ON practicum_plot_schedules(semester_code);'
  );
  pgm.sql(
    'CREATE INDEX IF NOT EXISTS idx_plot_schedules_practicum ON practicum_plot_schedules(semester_code, practicum_name);'
  );
  pgm.sql(
    'CREATE INDEX IF NOT EXISTS idx_plot_schedules_module_order ON practicum_plot_schedules(semester_code, practicum_name, module_sequence, week_number);'
  );
  pgm.sql(
    'CREATE INDEX IF NOT EXISTS idx_plot_schedules_module_id ON practicum_plot_schedules(registration_module_id);'
  );
};

exports.down = (pgm) => {
  pgm.dropTable('practicum_plot_schedules', { ifExists: true, cascade: true });
};
