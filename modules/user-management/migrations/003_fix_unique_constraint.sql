-- Migration: 003_fix_unique_constraint.sql
-- Fix unique constraint untuk user_roles agar tidak ada duplikasi
-- Constraint lama menggunakan (user_id, role, deleted_at) yang tidak efektif karena NULL handling
-- Constraint baru menggunakan partial unique index yang hanya apply pada rows yang tidak deleted

-- Drop constraint lama jika ada
ALTER TABLE user_roles DROP CONSTRAINT IF EXISTS unique_user_role;

-- Buat partial unique index yang hanya apply pada rows yang tidak deleted
-- Ini akan mencegah duplikasi user_id + role untuk rows yang aktif
CREATE UNIQUE INDEX IF NOT EXISTS unique_user_role_active 
ON user_roles (user_id, role) 
WHERE deleted_at IS NULL;

-- Clean up duplikasi yang mungkin sudah ada
-- Hapus duplikasi, keep yang paling baru
DELETE FROM user_roles 
WHERE id IN (
  SELECT id 
  FROM (
    SELECT id, 
           ROW_NUMBER() OVER (PARTITION BY user_id, role ORDER BY created_at DESC) as rn 
    FROM user_roles 
    WHERE deleted_at IS NULL
  ) t 
  WHERE rn > 1
);

