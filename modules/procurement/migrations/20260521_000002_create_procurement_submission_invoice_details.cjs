/** Structured invoice metadata (date, normal price, adjustments) per submission. */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS procurement_submission_invoice_details (
      id BIGSERIAL PRIMARY KEY,
      submission_id INTEGER NOT NULL UNIQUE REFERENCES procurement_submission(id) ON DELETE CASCADE,
      invoice_date DATE NOT NULL,
      normal_price NUMERIC(18, 2) NOT NULL,
      uploaded_by VARCHAR(255),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_procurement_invoice_details_submission
      ON procurement_submission_invoice_details (submission_id);

    CREATE TABLE IF NOT EXISTS procurement_submission_invoice_adjustments (
      id BIGSERIAL PRIMARY KEY,
      submission_id INTEGER NOT NULL REFERENCES procurement_submission(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL DEFAULT '',
      amount NUMERIC(18, 2) NOT NULL,
      sign VARCHAR(8) NOT NULL DEFAULT 'plus' CHECK (sign IN ('plus', 'minus')),
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_procurement_invoice_adjustments_submission
      ON procurement_submission_invoice_adjustments (submission_id, sort_order);

    ALTER TABLE procurement_submission_receipts
      ADD COLUMN IF NOT EXISTS file_role VARCHAR(32) NOT NULL DEFAULT 'invoice';

    CREATE INDEX IF NOT EXISTS idx_procurement_receipts_submission_role
      ON procurement_submission_receipts (submission_id, file_role);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_procurement_receipts_submission_role;
    ALTER TABLE procurement_submission_receipts DROP COLUMN IF EXISTS file_role;
    DROP TABLE IF EXISTS procurement_submission_invoice_adjustments;
    DROP TABLE IF EXISTS procurement_submission_invoice_details;
  `);
};
