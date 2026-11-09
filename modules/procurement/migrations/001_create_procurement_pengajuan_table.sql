-- Migration: create procurement_pengajuan table (minimal fields for create endpoint)
CREATE TABLE IF NOT EXISTS procurement_pengajuan (
  id serial PRIMARY KEY,
  requester_name text NOT NULL,
  requester_nim varchar(50),
  requester_role varchar(50) NOT NULL,
  department text,
  lab text,
  item_name text NOT NULL,
  specification text,
  quantity integer NOT NULL,
  unit_price numeric NOT NULL,
  total_price numeric NOT NULL,
  purpose text,
  status varchar(50) NOT NULL DEFAULT 'submitted',
  created_by varchar(100),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_procurement_pengajuan_status ON procurement_pengajuan(status);
-- Create index on requester_nim only when the column actually exists to avoid
-- failing the migration when previous/parallel changes removed the column.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'procurement_pengajuan' AND column_name = 'requester_nim'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_procurement_pengajuan_requester_nim ON procurement_pengajuan(requester_nim)';
  END IF;
END$$;
