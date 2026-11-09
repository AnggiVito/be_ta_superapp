-- Migration: create procurement_pengajuan_items table
BEGIN;

-- Create items table without forcing a foreign key; add FK only if parent exists.
CREATE TABLE IF NOT EXISTS procurement_pengajuan_items (
  id serial PRIMARY KEY,
  pengajuan_id integer NOT NULL,
  item_name text NOT NULL,
  unit_price numeric NOT NULL,
  quantity integer NOT NULL,
  total_price numeric NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pengajuan_items_pengajuan_id ON procurement_pengajuan_items(pengajuan_id);

-- Add FK constraint only when the referenced table exists to avoid migration failures
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'procurement_pengajuan') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
      WHERE tc.table_name = 'procurement_pengajuan_items' AND tc.constraint_type = 'FOREIGN KEY' AND kcu.column_name = 'pengajuan_id'
    ) THEN
      ALTER TABLE procurement_pengajuan_items
        ADD CONSTRAINT fk_pengajuan FOREIGN KEY (pengajuan_id) REFERENCES procurement_pengajuan(id) ON DELETE CASCADE;
    END IF;
  END IF;
END$$;

COMMIT;
