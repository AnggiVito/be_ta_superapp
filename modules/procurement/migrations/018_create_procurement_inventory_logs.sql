-- Migration: create procurement_inventory_logs table
-- Stores inventory stock changes for audit and UI display
CREATE TABLE IF NOT EXISTS procurement_inventory_logs (
  id bigserial PRIMARY KEY,
  inventory_id bigint REFERENCES procurement_inventory(id) ON DELETE SET NULL,
  item_name text,
  change_amount integer NOT NULL,
  action varchar(64) NOT NULL,
  note text,
  submission_id bigint,
  requester_name varchar(255),
  created_by varchar(255),
  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_procurement_inventory_logs_inventory_id ON procurement_inventory_logs(inventory_id);
CREATE INDEX IF NOT EXISTS idx_procurement_inventory_logs_submission_id ON procurement_inventory_logs(submission_id);
