-- Migration: 006_fix_booking_unique_constraints.sql
-- Memperbaiki unique constraints pada schedule_bookings agar hanya berlaku untuk booking aktif
-- Ini memungkinkan user untuk booking lagi setelah membatalkan booking sebelumnya

-- Drop existing unique constraints
ALTER TABLE schedule_bookings 
DROP CONSTRAINT IF EXISTS unique_slot_booking;

ALTER TABLE schedule_bookings 
DROP CONSTRAINT IF EXISTS unique_user_booking_per_day;

-- Create partial unique indexes that only apply to active bookings
-- Index untuk memastikan satu slot hanya bisa dibooking oleh satu user aktif
CREATE UNIQUE INDEX IF NOT EXISTS unique_slot_booking_active 
ON schedule_bookings(slot_id) 
WHERE status = 'active';

-- Index untuk memastikan satu user hanya bisa booking 1 slot per hari (hanya untuk booking aktif)
CREATE UNIQUE INDEX IF NOT EXISTS unique_user_booking_per_day_active 
ON schedule_bookings(user_id, booking_date) 
WHERE status = 'active';

