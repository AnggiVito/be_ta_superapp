-- Periode akademik pada entitas praktikum (bukan modul).
-- Opsi A: satu baris per (laboratory_id, name, periode).

ALTER TABLE practicums
  ADD COLUMN IF NOT EXISTS periode VARCHAR(64);

COMMENT ON COLUMN practicums.periode IS
  'Label periode akademik (mis. 2526-2); selaras dengan registration_settings.active_periode.label';

-- Backfill dari periode aktif jika sudah dikonfigurasi
UPDATE practicums p
SET periode = TRIM(s.value->>'label')
FROM registration_settings s
WHERE s.setting_key = 'active_periode'
  AND p.periode IS NULL
  AND s.value->>'label' IS NOT NULL
  AND TRIM(s.value->>'label') <> '';

UPDATE practicums p
SET periode = TRIM(s.value->>'id')
FROM registration_settings s
WHERE s.setting_key = 'active_periode'
  AND p.periode IS NULL
  AND s.value->>'id' IS NOT NULL
  AND TRIM(s.value->>'id') <> '';

-- Satu nama praktikum per lab per periode (hanya baris dengan periode terisi)
CREATE UNIQUE INDEX IF NOT EXISTS uq_practicums_lab_name_periode
  ON practicums (laboratory_id, name, periode)
  WHERE periode IS NOT NULL;
