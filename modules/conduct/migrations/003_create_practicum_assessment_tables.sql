CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS practicum_assessment_tools (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    registration_schedule_id UUID NULL,
    practicum_name VARCHAR(255),
    module_name VARCHAR(255),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    source VARCHAR(50) NOT NULL DEFAULT 'conduct_temporary',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP NULL
);

CREATE TABLE IF NOT EXISTS practicum_assessment_components (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tool_id UUID NOT NULL REFERENCES practicum_assessment_tools(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    description TEXT,
    max_score NUMERIC(8,2) NOT NULL DEFAULT 100,
    weight NUMERIC(8,4) NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_required BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP NULL
);

CREATE TABLE IF NOT EXISTS practicum_student_grades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    operational_session_id UUID NOT NULL,
    student_user_id VARCHAR(255) NOT NULL,
    grader_user_id VARCHAR(255) NOT NULL,
    tool_id UUID NOT NULL REFERENCES practicum_assessment_tools(id),
    status VARCHAR(32) NOT NULL DEFAULT 'draft',
    total_score NUMERIC(8,2),
    submitted_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP NULL,
    CONSTRAINT unique_practicum_student_grade UNIQUE (operational_session_id, student_user_id, grader_user_id)
);

CREATE TABLE IF NOT EXISTS practicum_student_grade_components (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    grade_id UUID NOT NULL REFERENCES practicum_student_grades(id) ON DELETE CASCADE,
    component_id UUID NOT NULL REFERENCES practicum_assessment_components(id),
    score NUMERIC(8,2) NOT NULL,
    feedback TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_practicum_student_grade_component UNIQUE (grade_id, component_id)
);

CREATE INDEX IF NOT EXISTS idx_practicum_assessment_tools_schedule
ON practicum_assessment_tools(registration_schedule_id)
WHERE deleted_at IS NULL AND is_active = true;

CREATE INDEX IF NOT EXISTS idx_practicum_assessment_components_tool
ON practicum_assessment_components(tool_id, sort_order)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_practicum_student_grades_session
ON practicum_student_grades(operational_session_id)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_practicum_student_grades_student
ON practicum_student_grades(student_user_id)
WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS update_practicum_assessment_tools_updated_at ON practicum_assessment_tools;
CREATE TRIGGER update_practicum_assessment_tools_updated_at BEFORE UPDATE ON practicum_assessment_tools
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_practicum_assessment_components_updated_at ON practicum_assessment_components;
CREATE TRIGGER update_practicum_assessment_components_updated_at BEFORE UPDATE ON practicum_assessment_components
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_practicum_student_grades_updated_at ON practicum_student_grades;
CREATE TRIGGER update_practicum_student_grades_updated_at BEFORE UPDATE ON practicum_student_grades
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_practicum_student_grade_components_updated_at ON practicum_student_grade_components;
CREATE TRIGGER update_practicum_student_grade_components_updated_at BEFORE UPDATE ON practicum_student_grade_components
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
