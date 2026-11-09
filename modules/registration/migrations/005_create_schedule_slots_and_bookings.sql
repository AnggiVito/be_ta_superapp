-- Migration: 005_create_schedule_slots_and_bookings.sql
-- Membuat tabel schedule_slots dan schedule_bookings untuk sistem booking slot mentoring individu

-- Enable pgcrypto for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Table: schedule_slots
-- Menyimpan slot-slot yang tersedia per schedule
CREATE TABLE IF NOT EXISTS schedule_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  slot_number INT NOT NULL, -- Urutan slot (1, 2, 3, ...)
  start_time TIMESTAMP WITH TIME ZONE NOT NULL, -- Waktu mulai slot
  end_time TIMESTAMP WITH TIME ZONE NOT NULL, -- Waktu akhir slot
  status VARCHAR(32) DEFAULT 'available', -- available, not_available
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  CONSTRAINT unique_schedule_slot_number UNIQUE (schedule_id, slot_number),
  CONSTRAINT check_slot_number CHECK (slot_number > 0),
  CONSTRAINT check_slot_times CHECK (end_time > start_time)
);

-- Table: schedule_bookings
-- Menyimpan booking mahasiswa ke slot
CREATE TABLE IF NOT EXISTS schedule_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id UUID NOT NULL REFERENCES schedule_slots(id) ON DELETE CASCADE,
  user_id VARCHAR(255) NOT NULL, -- Reference ke user_id dari AUTH GATEWAY (mahasiswa)
  booking_date DATE NOT NULL, -- Tanggal saat booking (untuk validasi 1 slot per hari)
  status VARCHAR(32) DEFAULT 'active', -- active, cancelled
  cancelled_by VARCHAR(255), -- user_id yang cancel (bisa mahasiswa atau asisten)
  cancelled_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  CONSTRAINT unique_slot_booking UNIQUE (slot_id),
  CONSTRAINT unique_user_booking_per_day UNIQUE (user_id, booking_date)
);

-- Indexes untuk performa query
CREATE INDEX IF NOT EXISTS idx_schedule_slots_schedule_id ON schedule_slots(schedule_id);
CREATE INDEX IF NOT EXISTS idx_schedule_slots_status ON schedule_slots(status);
CREATE INDEX IF NOT EXISTS idx_schedule_slots_start_time ON schedule_slots(start_time);
CREATE INDEX IF NOT EXISTS idx_schedule_bookings_slot_id ON schedule_bookings(slot_id);
CREATE INDEX IF NOT EXISTS idx_schedule_bookings_user_id ON schedule_bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_schedule_bookings_booking_date ON schedule_bookings(booking_date);
CREATE INDEX IF NOT EXISTS idx_schedule_bookings_status ON schedule_bookings(status);

-- Function untuk update updated_at automatically
CREATE OR REPLACE FUNCTION update_schedule_slots_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE OR REPLACE FUNCTION update_schedule_bookings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers untuk update updated_at
DROP TRIGGER IF EXISTS update_schedule_slots_updated_at ON schedule_slots;
CREATE TRIGGER update_schedule_slots_updated_at 
BEFORE UPDATE ON schedule_slots
FOR EACH ROW EXECUTE FUNCTION update_schedule_slots_updated_at();

DROP TRIGGER IF EXISTS update_schedule_bookings_updated_at ON schedule_bookings;
CREATE TRIGGER update_schedule_bookings_updated_at 
BEFORE UPDATE ON schedule_bookings
FOR EACH ROW EXECUTE FUNCTION update_schedule_bookings_updated_at();

-- Trigger untuk update slot status saat booking dibuat/dibatalkan
CREATE OR REPLACE FUNCTION update_slot_status_on_booking()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Set slot status menjadi not_available saat booking dibuat
        UPDATE schedule_slots 
        SET status = 'not_available', updated_at = NOW()
        WHERE id = NEW.slot_id;
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        -- Jika booking di-cancel, set slot status menjadi available
        IF NEW.status = 'cancelled' AND OLD.status = 'active' THEN
            UPDATE schedule_slots 
            SET status = 'available', updated_at = NOW()
            WHERE id = NEW.slot_id;
        END IF;
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS trigger_update_slot_status_on_booking ON schedule_bookings;
CREATE TRIGGER trigger_update_slot_status_on_booking
AFTER INSERT OR UPDATE ON schedule_bookings
FOR EACH ROW EXECUTE FUNCTION update_slot_status_on_booking();

