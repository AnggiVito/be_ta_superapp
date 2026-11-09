-- Seed default study programs (idempotent on code)
INSERT INTO study_programs (code, name)
VALUES
  ('22', 'S1 Sistem Informasi'),
  ('60', 'S1 Teknik Logistik'),
  ('21', 'S1 Teknik Industri'),
  ('139', 'S1 Manajemen Rekayasa'),
  ('10', 'S2 Sistem Informasi'),
  ('80', 'S2 Teknik Industri')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  updated_at = now();
