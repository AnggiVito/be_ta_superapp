-- Activity Log Database Schema
-- Migration: 001_create_activity_logs_table.sql

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table: activity_logs
-- Menyimpan log seluruh aktivitas di aplikasi untuk tracking dan audit
CREATE TABLE IF NOT EXISTS activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR(255), -- User ID dari JWT (bisa null untuk unauthenticated requests)
    action VARCHAR(100) NOT NULL, -- HTTP method + endpoint (e.g., 'GET /api/users')
    method VARCHAR(10) NOT NULL, -- HTTP method (GET, POST, PUT, DELETE, PATCH)
    endpoint VARCHAR(500) NOT NULL, -- Endpoint path
    ip_address VARCHAR(45), -- IPv4 atau IPv6
    user_agent TEXT, -- User agent string
    request_body JSONB, -- Request body (jika ada, sanitized untuk sensitive data)
    response_status INTEGER, -- HTTP response status code
    response_body JSONB, -- Response body (jika ada, bisa di-limit untuk size)
    error_message TEXT, -- Error message jika terjadi error
    error_stack TEXT, -- Error stack trace jika terjadi error
    execution_time_ms INTEGER, -- Waktu eksekusi dalam milliseconds
    affected_table VARCHAR(100), -- Nama table yang terpengaruh (jika bisa di-detect)
    affected_record_id VARCHAR(255), -- ID record yang terpengaruh (jika bisa di-detect)
    metadata JSONB, -- Additional metadata (roles, query params, dll)
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Index untuk query yang sering digunakan
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs(action);
CREATE INDEX IF NOT EXISTS idx_activity_logs_method ON activity_logs(method);
CREATE INDEX IF NOT EXISTS idx_activity_logs_endpoint ON activity_logs(endpoint);
CREATE INDEX IF NOT EXISTS idx_activity_logs_response_status ON activity_logs(response_status);
CREATE INDEX IF NOT EXISTS idx_activity_logs_affected_table ON activity_logs(affected_table) WHERE affected_table IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_ip_address ON activity_logs(ip_address) WHERE ip_address IS NOT NULL;

-- Composite index untuk query berdasarkan user dan waktu
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_created ON activity_logs(user_id, created_at DESC) WHERE user_id IS NOT NULL;

-- Composite index untuk query berdasarkan endpoint dan waktu
CREATE INDEX IF NOT EXISTS idx_activity_logs_endpoint_created ON activity_logs(endpoint, created_at DESC);

-- Index untuk query error logs
CREATE INDEX IF NOT EXISTS idx_activity_logs_error ON activity_logs(created_at DESC) WHERE error_message IS NOT NULL;

