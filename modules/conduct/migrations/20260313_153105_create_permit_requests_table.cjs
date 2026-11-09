exports.up = (pgm) => {
  pgm.sql('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');

  pgm.sql(`
    CREATE TABLE IF NOT EXISTS permit_requests (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id VARCHAR(255) NOT NULL,
      user_name VARCHAR(255) NOT NULL,
      user_nim VARCHAR(100) NOT NULL,
      academic_role VARCHAR(50) NOT NULL DEFAULT 'praktikan',
      reason VARCHAR(20) NOT NULL,
      absent_date DATE NOT NULL,
      evidence_base64 TEXT,
      evidence_url TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      keterangan TEXT,
      reviewed_by VARCHAR(255),
      reviewed_at TIMESTAMP,
      review_note TEXT,
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
        WHERE conname = 'chk_permit_reason'
      ) THEN
        ALTER TABLE permit_requests
        ADD CONSTRAINT chk_permit_reason
        CHECK (reason IN ('izin', 'sakit'));
      END IF;
    END$$;
  `);

  pgm.sql(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_permit_status'
      ) THEN
        ALTER TABLE permit_requests
        ADD CONSTRAINT chk_permit_status
        CHECK (status IN ('pending', 'approved', 'rejected'));
      END IF;
    END$$;
  `);

  pgm.sql(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_permit_academic_role'
      ) THEN
        ALTER TABLE permit_requests
        ADD CONSTRAINT chk_permit_academic_role
        CHECK (academic_role IN ('praktikan', 'asisten_praktikum'));
      END IF;
    END$$;
  `);

  pgm.sql('CREATE INDEX IF NOT EXISTS idx_permit_requests_user_id ON permit_requests(user_id) WHERE deleted_at IS NULL;');
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_permit_requests_status ON permit_requests(status) WHERE deleted_at IS NULL;');
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_permit_requests_absent_date ON permit_requests(absent_date) WHERE deleted_at IS NULL;');
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_permit_requests_reason ON permit_requests(reason) WHERE deleted_at IS NULL;');
};

exports.down = (pgm) => {
  pgm.dropTable('permit_requests', { ifExists: true, cascade: true });
};
