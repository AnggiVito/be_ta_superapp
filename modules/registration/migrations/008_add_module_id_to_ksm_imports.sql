-- Add module_id to ksm_imports to associate an import with a practicum module
ALTER TABLE ksm_imports
  ADD COLUMN IF NOT EXISTS module_id UUID NULL;

-- Add foreign key constraint to practicum_modules (if the table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'practicum_modules') THEN
    BEGIN
      ALTER TABLE ksm_imports
        ADD CONSTRAINT fk_ksm_import_module FOREIGN KEY (module_id) REFERENCES practicum_modules(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN
      -- constraint already exists, ignore
      NULL;
    END;
  END IF;
END$$;

-- Add index for faster lookups when checking assistants
CREATE INDEX IF NOT EXISTS idx_ksm_imports_module_id ON ksm_imports(module_id);
