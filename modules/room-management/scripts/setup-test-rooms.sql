-- ================================================
-- Setup Room untuk Testing TTLock Passcode API
-- ================================================

-- 1. Insert room baru dengan Lock ID dari TTLock
INSERT INTO rooms (id, name, capacity, door_lock_id, is_occupied, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'Lab Komputer 101',
  30,
  '12405430',  -- Lock ID dari TTLock account (nyobaajam)
  false,
  NOW(),
  NOW()
);

-- 2. Insert beberapa room untuk testing
INSERT INTO rooms (id, name, capacity, door_lock_id, is_occupied, created_at, updated_at)
VALUES 
  (gen_random_uuid(), 'Lab Jaringan 201', 25, '12405430', false, NOW(), NOW()),
  (gen_random_uuid(), 'Ruang Meeting A', 15, '12405430', false, NOW(), NOW()),
  (gen_random_uuid(), 'Lab Multimedia 301', 40, '12405430', false, NOW(), NOW());

-- 3. Check rooms yang sudah punya Lock ID
SELECT 
  id, 
  name, 
  capacity, 
  door_lock_id, 
  is_occupied,
  created_at
FROM rooms 
WHERE door_lock_id IS NOT NULL
ORDER BY created_at DESC;

-- 4. Update existing room dengan Lock ID (jika sudah ada room)
-- UPDATE rooms 
-- SET door_lock_id = '12405430', updated_at = NOW()
-- WHERE name = 'Nama Room yang Sudah Ada';

-- 5. Get specific room ID untuk testing (copy ID ini untuk Postman)
SELECT 
  id as room_id,
  name as room_name,
  door_lock_id
FROM rooms 
WHERE door_lock_id = '12405430'
LIMIT 1;

-- ================================================
-- Cleanup (jika perlu hapus test data)
-- ================================================

-- Hapus semua room testing
-- DELETE FROM rooms WHERE door_lock_id = '12405430';

-- Atau hapus room tertentu
-- DELETE FROM rooms WHERE name = 'Lab Komputer 101';
