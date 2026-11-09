-- Create procurement_inventory_categories table and add category_id to procurement_inventory
CREATE TABLE IF NOT EXISTS procurement_inventory_categories (
  id bigserial PRIMARY KEY,
  name varchar(255) NOT NULL UNIQUE,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add category_id column to procurement_inventory if missing
ALTER TABLE procurement_inventory ADD COLUMN IF NOT EXISTS category_id bigint;

-- Add foreign key constraint (if constraint name not exists, create it)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = 'procurement_inventory' AND tc.constraint_name = 'fk_procurement_inventory_category'
  ) THEN
    ALTER TABLE procurement_inventory
      ADD CONSTRAINT fk_procurement_inventory_category
      FOREIGN KEY (category_id) REFERENCES procurement_inventory_categories(id) ON DELETE SET NULL;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_procurement_inventory_category_id ON procurement_inventory (category_id);
