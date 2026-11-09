-- Komponen penilaian per modul praktikum (bobot % per jenis komponen)
-- Tabel nilai transaksional: jika sudah ada baris untuk suatu module_id, konfigurasi bobot tidak boleh diubah (dicek di aplikasi).

CREATE TABLE IF NOT EXISTS practicum_module_assessment_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL REFERENCES practicum_modules(id) ON DELETE CASCADE,
  component_type VARCHAR(32) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  weight_percent SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  CONSTRAINT uq_module_assessment_component UNIQUE (module_id, component_type),
  CONSTRAINT chk_weight_percent_range CHECK (weight_percent >= 0 AND weight_percent <= 100),
  CONSTRAINT chk_component_type_known CHECK (component_type IN (
    'tugas_pendahuluan',
    'tes_awal',
    'jurnal',
    'tes_akhir',
    'audit'
  ))
);

CREATE INDEX IF NOT EXISTS idx_practicum_module_assessment_components_module_id
  ON practicum_module_assessment_components(module_id);

-- Nilai per mahasiswa (enrollment) per modul per komponen — dipakai untuk kunci konfigurasi bila sudah ada data
CREATE TABLE IF NOT EXISTS practicum_module_assessment_grades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL REFERENCES practicum_modules(id) ON DELETE CASCADE,
  practicum_enrollment_id UUID NOT NULL REFERENCES practicum_enrollments(id) ON DELETE CASCADE,
  component_type VARCHAR(32) NOT NULL,
  score NUMERIC(8, 2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  CONSTRAINT uq_enrollment_module_component UNIQUE (practicum_enrollment_id, component_type),
  CONSTRAINT chk_grade_component_type_known CHECK (component_type IN (
    'tugas_pendahuluan',
    'tes_awal',
    'jurnal',
    'tes_akhir',
    'audit'
  ))
);

CREATE INDEX IF NOT EXISTS idx_practicum_module_assessment_grades_module_id
  ON practicum_module_assessment_grades(module_id);
