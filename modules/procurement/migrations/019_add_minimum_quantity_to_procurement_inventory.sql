-- Add minimum_quantity to procurement_inventory
ALTER TABLE procurement_inventory
  ADD COLUMN IF NOT EXISTS minimum_quantity integer NOT NULL DEFAULT 0;

-- No additional objects required
