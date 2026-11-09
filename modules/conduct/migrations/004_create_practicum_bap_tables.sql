CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS practicum_baps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    operational_session_id UUID NOT NULL UNIQUE,
    registration_schedule_id UUID NOT NULL,
    bap_number VARCHAR(100),
    status VARCHAR(32) NOT NULL DEFAULT 'draft_generated',
    practicum_name VARCHAR(255),
    module_name VARCHAR(255),
    class_shift VARCHAR(255),
    activity_type VARCHAR(100) NOT NULL DEFAULT 'Hands-On',
    scheduled_date DATE,
    start_time TIME,
    end_time TIME,
    venue TEXT,
    present_count INTEGER NOT NULL DEFAULT 0,
    sick_count INTEGER NOT NULL DEFAULT 0,
    permission_count INTEGER NOT NULL DEFAULT 0,
    absent_count INTEGER NOT NULL DEFAULT 0,
    student_count INTEGER NOT NULL DEFAULT 0,
    assistant_count INTEGER NOT NULL DEFAULT 0,
    incident_notes TEXT,
    lecturer_signed_at TIMESTAMP NULL,
    lecturer_signed_by VARCHAR(255),
    laboran_review_status VARCHAR(32) NOT NULL DEFAULT 'pending',
    laboran_reviewed_at TIMESTAMP NULL,
    laboran_reviewed_by VARCHAR(255),
    laboran_review_note TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    generated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS practicum_bap_attendance_rows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bap_id UUID NOT NULL REFERENCES practicum_baps(id) ON DELETE CASCADE,
    row_number INTEGER NOT NULL,
    student_user_id VARCHAR(255) NOT NULL,
    student_identifier VARCHAR(100),
    student_name VARCHAR(255),
    assistant_code VARCHAR(100),
    attendance_status VARCHAR(32) NOT NULL DEFAULT 'absent',
    attendance_time TIMESTAMP NULL,
    student_signature_status VARCHAR(32) NOT NULL DEFAULT 'not_signed',
    assistant_signature_status VARCHAR(32),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_practicum_bap_student UNIQUE (bap_id, student_user_id)
);

CREATE INDEX IF NOT EXISTS idx_practicum_baps_session
ON practicum_baps(operational_session_id);

CREATE INDEX IF NOT EXISTS idx_practicum_baps_schedule
ON practicum_baps(registration_schedule_id);

CREATE INDEX IF NOT EXISTS idx_practicum_baps_status
ON practicum_baps(status);

CREATE INDEX IF NOT EXISTS idx_practicum_bap_rows_bap
ON practicum_bap_attendance_rows(bap_id, row_number);

DROP TRIGGER IF EXISTS update_practicum_baps_updated_at ON practicum_baps;
CREATE TRIGGER update_practicum_baps_updated_at BEFORE UPDATE ON practicum_baps
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_practicum_bap_attendance_rows_updated_at ON practicum_bap_attendance_rows;
CREATE TRIGGER update_practicum_bap_attendance_rows_updated_at BEFORE UPDATE ON practicum_bap_attendance_rows
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
