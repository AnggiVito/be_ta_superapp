# 🔐 Passcode API - Postman Testing Guide

Panduan lengkap untuk testing TTLock Passcode API menggunakan Postman.

## 📋 Prerequisites

### 1. Setup Database - Insert Room dengan Lock ID

Jalankan SQL berikut untuk membuat room dengan TTLock integration:

```sql
-- Insert room dengan Lock ID dari TTLock
INSERT INTO rooms (id, name, capacity, door_lock_id, is_occupied, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'Lab Komputer 101',
  30,
  '12405430',  -- Lock ID dari TTLock account
  false,
  NOW(),
  NOW()
);

-- Atau update room yang sudah ada
UPDATE rooms 
SET door_lock_id = '12405430' 
WHERE name = 'Your Room Name';

-- Check rooms yang punya lock ID
SELECT id, name, capacity, door_lock_id, is_occupied 
FROM rooms 
WHERE door_lock_id IS NOT NULL;
```

### 2. Get JWT Token

**Endpoint:** `POST https://dev-fri-gateway.virtualfri.id/api/auth/login`

**Request Body:**
```json
{
  "email": "your-email@example.com",
  "password": "your-password"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": { ... }
  }
}
```

Copy token untuk digunakan di header Authorization.

---

## 🔑 API Endpoints

### Base URL
```
http://localhost:3000/api/room-management
```

---

## 1️⃣ Create Permanent Passcode

Passcode yang tidak pernah expired (berlaku selamanya).

**Endpoint:**
```
POST /rooms/:roomId/passcodes/permanent
```

**Headers:**
```
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "Permanent Access - Laboran",
  "passcode": "123456"
}
```

**Notes:**
- `passcode` optional. Jika tidak diisi, TTLock akan generate random 6 digit.
- Passcode harus 6-10 digit angka

**Response Success (201):**
```json
{
  "success": true,
  "message": "Permanent passcode created successfully",
  "data": {
    "roomId": "abc-123-def",
    "roomName": "Lab Komputer 101",
    "passcodeId": 34297300,
    "passcode": "123456",
    "name": "Permanent Access - Laboran",
    "type": "permanent",
    "createdAt": "2025-11-15T05:45:52.000Z"
  }
}
```

---

## 2️⃣ Create Temporary Passcode (RECOMMENDED FOR TESTING)

Passcode dengan waktu mulai dan berakhir tertentu.

**Endpoint:**
```
POST /rooms/:roomId/passcodes/temporary
```

**Headers:**
```
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "Guest Access - Meeting Room",
  "startDate": "2025-11-15T08:00:00.000Z",
  "endDate": "2025-11-22T17:00:00.000Z",
  "passcode": "654321"
}
```

**Request Body (Auto-calculate 7 days from now):**
```json
{
  "name": "Tamu Seminar - Prof. Budi",
  "validityDays": 7
}
```

**Notes:**
- `startDate` dan `endDate` dalam format ISO 8601
- Atau gunakan `validityDays` untuk auto-calculate dari sekarang
- `passcode` optional (auto-generate jika kosong)
- Timezone: UTC (backend akan convert)

**Response Success (201):**
```json
{
  "success": true,
  "message": "Temporary passcode created successfully",
  "data": {
    "roomId": "abc-123-def",
    "roomName": "Lab Komputer 101",
    "passcodeId": 34297308,
    "passcode": "654321",
    "name": "Guest Access - Meeting Room",
    "type": "temporary",
    "startDate": "2025-11-15T08:00:00.000Z",
    "endDate": "2025-11-22T17:00:00.000Z",
    "createdAt": "2025-11-15T05:45:52.000Z"
  }
}
```

---

## 3️⃣ Create One-Time Passcode

Passcode yang valid untuk beberapa jam saja (default: 4 jam).

**Endpoint:**
```
POST /rooms/:roomId/passcodes/onetime
```

**Headers:**
```
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "Delivery - Package XYZ",
  "validityHours": 4,
  "passcode": "999888"
}
```

**Request Body (Minimal):**
```json
{
  "name": "Quick Access - Maintenance"
}
```

**Notes:**
- `validityHours` default: 4 hours
- Start dari sekarang, end = sekarang + validityHours
- `passcode` optional

**Response Success (201):**
```json
{
  "success": true,
  "message": "One-time passcode created successfully",
  "data": {
    "roomId": "abc-123-def",
    "roomName": "Lab Komputer 101",
    "passcodeId": 34297310,
    "passcode": "999888",
    "name": "Delivery - Package XYZ",
    "type": "onetime",
    "startDate": "2025-11-15T05:45:52.000Z",
    "endDate": "2025-11-15T09:45:52.000Z",
    "validityHours": 4,
    "createdAt": "2025-11-15T05:45:52.000Z"
  }
}
```

---

## 4️⃣ Get Passcode List

Ambil semua passcode untuk room tertentu.

**Endpoint:**
```
GET /rooms/:roomId/passcodes?pageNo=1&pageSize=20
```

**Headers:**
```
Authorization: Bearer YOUR_JWT_TOKEN
```

**Query Parameters:**
- `pageNo` (optional, default: 1)
- `pageSize` (optional, default: 20)

**Response Success (200):**
```json
{
  "success": true,
  "message": "Passcodes retrieved successfully",
  "data": {
    "roomId": "abc-123-def",
    "roomName": "Lab Komputer 101",
    "pageNo": 1,
    "pageSize": 20,
    "total": 17,
    "passcodes": [
      {
        "keyboardPwdId": 34297308,
        "keyboardPwdName": "Guest Access - Meeting Room",
        "keyboardPwd": "654321",
        "startDate": 1731657600000,
        "endDate": 1732262400000
      },
      {
        "keyboardPwdId": 34297300,
        "keyboardPwdName": "Permanent Access - Laboran",
        "keyboardPwd": "123456"
      }
    ]
  }
}
```

---

## 5️⃣ Delete Passcode

Hapus passcode dari TTLock.

**Endpoint:**
```
DELETE /rooms/:roomId/passcodes/:passcodeId
```

**Headers:**
```
Authorization: Bearer YOUR_JWT_TOKEN
```

**Response Success (200):**
```json
{
  "success": true,
  "message": "Passcode deleted successfully",
  "data": {
    "roomId": "abc-123-def",
    "passcodeId": 34297300,
    "deletedAt": "2025-11-15T05:50:00.000Z"
  }
}
```

---

## 6️⃣ Update Passcode Name

Ubah nama/deskripsi passcode.

**Endpoint:**
```
PATCH /rooms/:roomId/passcodes/:passcodeId/name
```

**Headers:**
```
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "newName": "Updated Name - Laboran Utama"
}
```

**Response Success (200):**
```json
{
  "success": true,
  "message": "Passcode name updated successfully",
  "data": {
    "roomId": "abc-123-def",
    "passcodeId": 34297300,
    "newName": "Updated Name - Laboran Utama",
    "updatedAt": "2025-11-15T05:55:00.000Z"
  }
}
```

---

## 📝 Testing Workflow

### Step 1: Setup Room
```sql
-- Insert room dengan Lock ID
INSERT INTO rooms (id, name, capacity, door_lock_id, is_occupied)
VALUES (gen_random_uuid(), 'Lab Testing', 30, '12405430', false);

-- Get room ID
SELECT id, name, door_lock_id FROM rooms WHERE name = 'Lab Testing';
```

### Step 2: Get JWT Token
Login ke AUTH Gateway untuk dapat token.

### Step 3: Create Temporary Passcode (Easiest to Test)
```
POST http://localhost:3000/api/room-management/rooms/{ROOM_ID}/passcodes/temporary

Body:
{
  "name": "Test Access",
  "validityDays": 7
}
```

### Step 4: Verify in TTLock App
- Buka TTLock mobile app
- Pilih lock "nyobaajam"
- Lihat passcode list
- Passcode baru "Test Access" harusnya muncul!

### Step 5: Test the Passcode
Coba gunakan passcode di smart lock fisik atau di TTLock app.

---

## ⚠️ Error Responses

### Room Not Found (404)
```json
{
  "success": false,
  "error": "Room not found"
}
```

### Room Has No Lock (400)
```json
{
  "success": false,
  "error": "Room does not have a smart lock configured"
}
```

### Invalid JWT (401)
```json
{
  "success": false,
  "error": "Invalid or expired token"
}
```

### TTLock API Error (500)
```json
{
  "success": false,
  "error": "Failed to create passcode",
  "details": "TTLock API Error: ..."
}
```

---

## 🎯 Quick Test Examples

### Example 1: Create 7-day Temporary Access
```bash
curl -X POST http://localhost:3000/api/room-management/rooms/{ROOM_ID}/passcodes/temporary \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Weekly Access - Student",
    "validityDays": 7
  }'
```

### Example 2: Create 4-hour One-Time Access
```bash
curl -X POST http://localhost:3000/api/room-management/rooms/{ROOM_ID}/passcodes/onetime \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Maintenance - Quick Fix"
  }'
```

### Example 3: Create Permanent Access with Custom Code
```bash
curl -X POST http://localhost:3000/api/room-management/rooms/{ROOM_ID}/passcodes/permanent \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Permanent - Laboran",
    "passcode": "123456"
  }'
```

---

## 🔍 Debugging Tips

### Check if room has lock ID:
```sql
SELECT id, name, door_lock_id FROM rooms WHERE id = 'YOUR_ROOM_ID';
```

### View backend logs:
```bash
docker logs -f fri-backend
```

### Test TTLock connection:
```bash
docker exec -it fri-backend node scripts/test-connections.js
```

### Get all locks in your account:
```bash
docker exec -it fri-backend node scripts/get-locks.js
```

---

## 📱 Lock Information

**Your TTLock Details:**
- **Lock ID**: `12405430`
- **Lock Name**: nyobaajam
- **Battery**: 65%
- **Status**: Online

Gunakan Lock ID ini di field `door_lock_id` pada tabel rooms.
