-- Create procurement_inventory table
CREATE TABLE IF NOT EXISTS procurement_inventory (
  id bigserial PRIMARY KEY,
  item_name varchar(255) NOT NULL,
  stock integer NOT NULL DEFAULT 0,
  created_by varchar(128),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_procurement_inventory_item_name ON procurement_inventory (item_name);
