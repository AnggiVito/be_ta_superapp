-- Enable pgcrypto for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Study programs
CREATE TABLE IF NOT EXISTS study_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(32) UNIQUE,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Laboratories
CREATE TABLE IF NOT EXISTS laboratories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  study_program_id UUID NOT NULL,
  code VARCHAR(32),
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  CONSTRAINT fk_lab_study_program FOREIGN KEY (study_program_id) REFERENCES study_programs(id) ON DELETE CASCADE
);

-- Practicums
CREATE TABLE IF NOT EXISTS practicums (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL,
  code VARCHAR(32),
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  CONSTRAINT fk_practicum_lab FOREIGN KEY (laboratory_id) REFERENCES laboratories(id) ON DELETE CASCADE
);

-- Practicum modules
CREATE TABLE IF NOT EXISTS practicum_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practicum_id UUID NOT NULL,
  code VARCHAR(32),
  name TEXT NOT NULL,
  sequence INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  CONSTRAINT fk_module_practicum FOREIGN KEY (practicum_id) REFERENCES practicums(id) ON DELETE CASCADE
);

-- Students
CREATE TABLE IF NOT EXISTS students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  student_number VARCHAR(64) UNIQUE,
  name TEXT NOT NULL,
  study_program_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enrollments
CREATE TABLE IF NOT EXISTS practicum_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practicum_id UUID NOT NULL,
  student_id UUID NOT NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'student',
  status VARCHAR(32) DEFAULT 'enrolled',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  CONSTRAINT fk_enroll_practicum FOREIGN KEY (practicum_id) REFERENCES practicums(id) ON DELETE CASCADE
);

-- Note: Schedules table is created in migration 002 with module_id instead of enrollment_id
