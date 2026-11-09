-- Link submission line items to procurement_inventory (vendor / stock tracking).
ALTER TABLE procurement_submission_items
  ADD COLUMN IF NOT EXISTS inventory_id bigint;

CREATE INDEX IF NOT EXISTS idx_procurement_submission_items_inventory_id
  ON procurement_submission_items(inventory_id)
  WHERE inventory_id IS NOT NULL;
