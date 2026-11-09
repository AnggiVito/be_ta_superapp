-- Supervised procurement lab UUID (references registration laboratories.id; not FK across DB)
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS procurement_supervised_lab_id UUID;

CREATE INDEX IF NOT EXISTS idx_user_profiles_procurement_supervised_lab
  ON user_profiles (procurement_supervised_lab_id)
  WHERE deleted_at IS NULL AND procurement_supervised_lab_id IS NOT NULL;
