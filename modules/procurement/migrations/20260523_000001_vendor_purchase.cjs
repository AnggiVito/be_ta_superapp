/** Vendor purchase (mitra) for submissions ≥ threshold — partner + line items with actual price. */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS procurement_submission_vendor_purchase (
      submission_id INTEGER PRIMARY KEY
        REFERENCES procurement_submission(id) ON DELETE CASCADE,
      partner_name VARCHAR(255) NOT NULL DEFAULT '',
      uploaded_by VARCHAR(255),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS procurement_submission_vendor_purchase_lines (
      id BIGSERIAL PRIMARY KEY,
      submission_id INTEGER NOT NULL
        REFERENCES procurement_submission(id) ON DELETE CASCADE,
      submission_item_id BIGINT NOT NULL
        REFERENCES procurement_submission_items(id) ON DELETE CASCADE,
      quantity NUMERIC(18, 4) NOT NULL,
      normal_price NUMERIC(18, 2) NOT NULL,
      actual_price NUMERIC(18, 2) NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (submission_id, submission_item_id)
    );

    CREATE INDEX IF NOT EXISTS idx_procurement_vendor_purchase_lines_submission
      ON procurement_submission_vendor_purchase_lines (submission_id, sort_order);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_procurement_vendor_purchase_lines_submission;
    DROP TABLE IF EXISTS procurement_submission_vendor_purchase_lines;
    DROP TABLE IF EXISTS procurement_submission_vendor_purchase;
  `);
};
