/** Per submission line item: invoice metadata, prices, dynamic fields; receipts linked to item. */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS procurement_submission_item_invoice_details (
      id BIGSERIAL PRIMARY KEY,
      submission_item_id BIGINT NOT NULL UNIQUE
        REFERENCES procurement_submission_items(id) ON DELETE CASCADE,
      submission_id INTEGER NOT NULL
        REFERENCES procurement_submission(id) ON DELETE CASCADE,
      normal_price NUMERIC(18, 2),
      actual_price NUMERIC(18, 2),
      line_items JSONB NOT NULL DEFAULT '[]'::jsonb,
      uploaded_by VARCHAR(255),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_procurement_item_invoice_details_submission
      ON procurement_submission_item_invoice_details (submission_id);

    ALTER TABLE procurement_submission_receipts
      ADD COLUMN IF NOT EXISTS submission_item_id BIGINT
        REFERENCES procurement_submission_items(id) ON DELETE SET NULL;

    CREATE INDEX IF NOT EXISTS idx_procurement_receipts_submission_item
      ON procurement_submission_receipts (submission_id, submission_item_id, file_role);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_procurement_receipts_submission_item;
    ALTER TABLE procurement_submission_receipts DROP COLUMN IF EXISTS submission_item_id;
    DROP TABLE IF EXISTS procurement_submission_item_invoice_details;
  `);
};
