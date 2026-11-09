# Room Management API Testing Guide

> **Panduan lengkap untuk testing API Room Management Module**  
> **Project:** be_practicum  
> **Module:** room-management  
> **Database:** PostgreSQL (room_management_db)  
> **Base URL:** `http://localhost:3000`

---

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [API Endpoints Reference](#api-endpoints-reference)
4. [Testing with cURL](#testing-with-curl)
5. [Testing with Postman](#testing-with-postman)
6. [Testing Scenarios](#testing-scenarios)
7. [Common Issues](#common-issues)

---

## 🔧 Prerequisites

### 1. Docker Containers Running

```powershell
# Check container status
docker compose ps

# Expected output:
# NAME                 STATUS
# fri-backend          Up (healthy)
# room_management_db   Up (healthy)
# fri-redis            Up (healthy)
```

### 2. Database Migrations Applied

```powershell
# Migration 1: Create rooms table
Get-Content modules/room-management/migrations/001_create_rooms_table.sql | docker exec -i room_management_db psql -U postgres -d room_management_db

# Migration 2: Create passcode_logs table
Get-Content modules/room-management/migrations/002_create_passcode_logs_table.sql | docker exec -i room_management_db psql -U postgres -d room_management_db
```

### 3. Verify Tables

```powershell
docker exec -it room_management_db psql -U postgres -d room_management_db -c "\dt"
```

Expected output:
```
 Schema |     Name      | Type  |  Owner
--------+---------------+-------+----------
 public | passcode_logs | table | postgres
 public | rooms         | table | postgres
```

### 4. JWT Token

Untuk testing, Anda perlu JWT token. Ada 2 opsi:

**Option A: Get from AUTH GATEWAY** (Production)
- Coordinate dengan team AUTH GATEWAY untuk mendapatkan valid JWT token

**Option B: Mock JWT Token** (Development/Testing)
- Untuk testing sementara, gunakan mock token (perlu disable JWT validation)

---

## 🚀 Quick Start

### Step 1: Health Check

```powershell
curl http://localhost:3000/health
```

Expected response:
```json
{
  "success": true,
  "message": "FRI Super App Backend is running",
  "timestamp": "2025-11-13T18:00:00.000Z"
}
```

### Step 2: Create a Room

```powershell
curl -X POST http://localhost:3000/api/room-management/rooms `
  -H "Authorization: Bearer YOUR_JWT_TOKEN" `
  -H "Content-Type: application/json" `
  -d '{
    "name": "Lab Informatika 1",
    "capacity": 40,
    "door_lock_id": "6989409"
  }'
```

### Step 3: Generate Passcode

```powershell
curl -X POST http://localhost:3000/api/room-management/rooms/{roomId}/passcodes/permanent `
  -H "Authorization: Bearer YOUR_JWT_TOKEN" `
  -H "Content-Type: application/json" `
  -d '{
    "name": "Master Key"
  }'
```

---

## 📚 API Endpoints Reference

### Base Information

- **Base URL:** `http://localhost:3000`
- **Module Path:** `/api/room-management`
- **Authentication:** Bearer Token (JWT)
- **Content-Type:** `application/json`

---

## 🏠 Room Endpoints

### 1. Get All Rooms

**Endpoint:** `GET /api/room-management/rooms`

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10)
- `is_occupied` (optional): Filter by occupancy status (true/false)

**Example Request:**

```bash
curl -X GET "http://localhost:3000/api/room-management/rooms?page=1&limit=10" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**PowerShell:**
```powershell
curl -X GET "http://localhost:3000/api/room-management/rooms?page=1&limit=10" `
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Example Response:**

```json
{
  "success": true,
  "message": "Rooms retrieved successfully",
  "data": {
    "rooms": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "name": "Lab Informatika 1",
        "capacity": 40,
        "is_occupied": false,
        "door_lock_id": "6989409",
        "created_at": "2025-11-13T10:00:00.000Z",
        "updated_at": "2025-11-13T10:00:00.000Z"
      }
    ],
    "pagination": {
      "total": 1,
      "page": 1,
      "limit": 10,
      "totalPages": 1
    }
  }
}
```

---

### 2. Get Room by ID

**Endpoint:** `GET /api/room-management/rooms/:roomId`

**Example Request:**

```bash
curl -X GET http://localhost:3000/api/room-management/rooms/550e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**PowerShell:**
```powershell
curl -X GET http://localhost:3000/api/room-management/rooms/550e8400-e29b-41d4-a716-446655440000 `
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Example Response:**

```json
{
  "success": true,
  "message": "Room retrieved successfully",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Lab Informatika 1",
    "capacity": 40,
    "is_occupied": false,
    "door_lock_id": "6989409",
    "created_at": "2025-11-13T10:00:00.000Z",
    "updated_at": "2025-11-13T10:00:00.000Z"
  }
}
```

---

### 3. Create Room

**Endpoint:** `POST /api/room-management/rooms`

**Request Body:**

```json
{
  "name": "Lab Informatika 1",
  "capacity": 40,
  "door_lock_id": "6989409"  // Optional, dari TTLock
}
```

**Validation Rules:**
- `name`: Required, string, max 120 characters
- `capacity`: Required, integer, > 0
- `door_lock_id`: Optional, string

**Example Request:**

```bash
curl -X POST http://localhost:3000/api/room-management/rooms \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Lab Informatika 1",
    "capacity": 40,
    "door_lock_id": "6989409"
  }'
```

**PowerShell:**
```powershell
$body = @{
    name = "Lab Informatika 1"
    capacity = 40
    door_lock_id = "6989409"
} | ConvertTo-Json

curl -X POST http://localhost:3000/api/room-management/rooms `
  -H "Authorization: Bearer YOUR_JWT_TOKEN" `
  -H "Content-Type: application/json" `
  -d $body
```

**Example Response:**

```json
{
  "success": true,
  "message": "Room created successfully",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Lab Informatika 1",
    "capacity": 40,
    "is_occupied": false,
    "door_lock_id": "6989409",
    "created_at": "2025-11-13T10:00:00.000Z",
    "updated_at": "2025-11-13T10:00:00.000Z"
  }
}
```

---

### 4. Update Room

**Endpoint:** `PUT /api/room-management/rooms/:roomId`

**Request Body:**

```json
{
  "name": "Lab Informatika 1 - Updated",
  "capacity": 45,
  "door_lock_id": "6989409"
}
```

**Example Request:**

```bash
curl -X PUT http://localhost:3000/api/room-management/rooms/550e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Lab Informatika 1 - Updated",
    "capacity": 45
  }'
```

**PowerShell:**
```powershell
$body = @{
    name = "Lab Informatika 1 - Updated"
    capacity = 45
} | ConvertTo-Json

curl -X PUT http://localhost:3000/api/room-management/rooms/550e8400-e29b-41d4-a716-446655440000 `
  -H "Authorization: Bearer YOUR_JWT_TOKEN" `
  -H "Content-Type: application/json" `
  -d $body
```

**Example Response:**

```json
{
  "success": true,
  "message": "Room updated successfully",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Lab Informatika 1 - Updated",
    "capacity": 45,
    "is_occupied": false,
    "door_lock_id": "6989409",
    "created_at": "2025-11-13T10:00:00.000Z",
    "updated_at": "2025-11-13T10:30:00.000Z"
  }
}
```

---

### 5. Delete Room

**Endpoint:** `DELETE /api/room-management/rooms/:roomId`

**Example Request:**

```bash
curl -X DELETE http://localhost:3000/api/room-management/rooms/550e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**PowerShell:**
```powershell
curl -X DELETE http://localhost:3000/api/room-management/rooms/550e8400-e29b-41d4-a716-446655440000 `
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Example Response:**

```json
{
  "success": true,
  "message": "Room deleted successfully"
}
```

---

### 6. Mark Room as Occupied

**Endpoint:** `PATCH /api/room-management/rooms/:roomId/occupy`

**Example Request:**

```bash
curl -X PATCH http://localhost:3000/api/room-management/rooms/550e8400-e29b-41d4-a716-446655440000/occupy \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**PowerShell:**
```powershell
curl -X PATCH http://localhost:3000/api/room-management/rooms/550e8400-e29b-41d4-a716-446655440000/occupy `
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Example Response:**

```json
{
  "success": true,
  "message": "Room marked as occupied",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "is_occupied": true
  }
}
```

---

### 7. Mark Room as Vacant

**Endpoint:** `PATCH /api/room-management/rooms/:roomId/vacate`

**Example Request:**

```bash
curl -X PATCH http://localhost:3000/api/room-management/rooms/550e8400-e29b-41d4-a716-446655440000/vacate \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**PowerShell:**
```powershell
curl -X PATCH http://localhost:3000/api/room-management/rooms/550e8400-e29b-41d4-a716-446655440000/vacate `
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Example Response:**

```json
{
  "success": true,
  "message": "Room marked as vacant",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "is_occupied": false
  }
}
```

---

## 🔐 Passcode Endpoints

### 1. Create Permanent Passcode

**Endpoint:** `POST /api/room-management/rooms/:roomId/passcodes/permanent`

**Request Body:**

```json
{
  "name": "Master Key Lab 1",
  "passcode": "123456"  // Optional, will auto-generate if not provided
}
```

**Validation Rules:**
- `name`: Required, string, max 100 characters
- `passcode`: Optional, string, 4-9 digits

**Example Request:**

```bash
curl -X POST http://localhost:3000/api/room-management/rooms/550e8400-e29b-41d4-a716-446655440000/passcodes/permanent \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Master Key Lab 1"
  }'
```

**PowerShell:**
```powershell
$body = @{
    name = "Master Key Lab 1"
} | ConvertTo-Json

curl -X POST http://localhost:3000/api/room-management/rooms/550e8400-e29b-41d4-a716-446655440000/passcodes/permanent `
  -H "Authorization: Bearer YOUR_JWT_TOKEN" `
  -H "Content-Type: application/json" `
  -d $body
```

**Example Response:**

```json
{
  "success": true,
  "message": "Permanent passcode created successfully",
  "data": {
    "id": "660e8400-e29b-41d4-a716-446655440001",
    "passcodeId": 12345678,
    "passcode": "234567",
    "name": "Master Key Lab 1",
    "type": "permanent",
    "roomId": "550e8400-e29b-41d4-a716-446655440000",
    "roomName": "Lab Informatika 1",
    "lockId": "6989409",
    "createdAt": "2025-11-13T10:00:00.000Z"
  }
}
```

---

### 2. Create Temporary Passcode

**Endpoint:** `POST /api/room-management/rooms/:roomId/passcodes/temporary`

**Request Body:**

```json
{
  "name": "Praktikum Senin",
  "startDate": "2025-11-14T08:00:00",  // WIB format
  "endDate": "2025-11-14T12:00:00",    // WIB format
  "passcode": "654321"  // Optional
}
```

**⚠️ Important:**
- Input date menggunakan **WIB timezone**
- Service akan otomatis convert ke **UTC** untuk TTLock API
- Format: `YYYY-MM-DDTHH:mm:ss` (tanpa timezone suffix)

**Validation Rules:**
- `name`: Required, string, max 100 characters
- `startDate`: Required, datetime string (WIB)
- `endDate`: Required, datetime string (WIB), must be after startDate
- `passcode`: Optional, string, 4-9 digits

**Example Request:**

```bash
curl -X POST http://localhost:3000/api/room-management/rooms/550e8400-e29b-41d4-a716-446655440000/passcodes/temporary \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Praktikum Senin",
    "startDate": "2025-11-14T08:00:00",
    "endDate": "2025-11-14T12:00:00"
  }'
```

**PowerShell:**
```powershell
$body = @{
    name = "Praktikum Senin"
    startDate = "2025-11-14T08:00:00"
    endDate = "2025-11-14T12:00:00"
} | ConvertTo-Json

curl -X POST http://localhost:3000/api/room-management/rooms/550e8400-e29b-41d4-a716-446655440000/passcodes/temporary `
  -H "Authorization: Bearer YOUR_JWT_TOKEN" `
  -H "Content-Type: application/json" `
  -d $body
```

**Example Response:**

```json
{
  "success": true,
  "message": "Temporary passcode created successfully",
  "data": {
    "id": "770e8400-e29b-41d4-a716-446655440002",
    "passcodeId": 87654321,
    "passcode": "654321",
    "name": "Praktikum Senin",
    "type": "temporary",
    "startDate": "2025-11-14T08:00:00",
    "endDate": "2025-11-14T12:00:00",
    "startTimestamp": 1731560400000,
    "endTimestamp": 1731574800000,
    "roomId": "550e8400-e29b-41d4-a716-446655440000",
    "roomName": "Lab Informatika 1",
    "lockId": "6989409",
    "createdAt": "2025-11-13T10:00:00.000Z"
  }
}
```

---

### 3. Create One-Time Passcode

**Endpoint:** `POST /api/room-management/rooms/:roomId/passcodes/onetime`

**Request Body:**

```json
{
  "name": "Guest Access",
  "validityHours": 4,  // Default: 4 jam dari sekarang
  "passcode": "111222"  // Optional
}
```

**Validation Rules:**
- `name`: Required, string, max 100 characters
- `validityHours`: Optional, integer, default: 4
- `passcode`: Optional, string, 4-9 digits

**Example Request:**

```bash
curl -X POST http://localhost:3000/api/room-management/rooms/550e8400-e29b-41d4-a716-446655440000/passcodes/onetime \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Guest Access",
    "validityHours": 4
  }'
```

**PowerShell:**
```powershell
$body = @{
    name = "Guest Access"
    validityHours = 4
} | ConvertTo-Json

curl -X POST http://localhost:3000/api/room-management/rooms/550e8400-e29b-41d4-a716-446655440000/passcodes/onetime `
  -H "Authorization: Bearer YOUR_JWT_TOKEN" `
  -H "Content-Type: application/json" `
  -d $body
```

**Example Response:**

```json
{
  "success": true,
  "message": "One-time passcode created successfully",
  "data": {
    "id": "880e8400-e29b-41d4-a716-446655440003",
    "passcodeId": 99887766,
    "passcode": "999888",
    "name": "Guest Access",
    "type": "onetime",
    "validityHours": 4,
    "startDate": "2025-11-13T10:00:00.000Z",
    "endDate": "2025-11-13T14:00:00.000Z",
    "roomId": "550e8400-e29b-41d4-a716-446655440000",
    "roomName": "Lab Informatika 1",
    "lockId": "6989409",
    "createdAt": "2025-11-13T10:00:00.000Z"
  }
}
```

---

### 4. Get Passcode List

**Endpoint:** `GET /api/room-management/rooms/:roomId/passcodes`

**Query Parameters:**
- `pageNo` (optional): Page number (default: 1)
- `pageSize` (optional): Items per page (default: 20)

**Example Request:**

```bash
curl -X GET "http://localhost:3000/api/room-management/rooms/550e8400-e29b-41d4-a716-446655440000/passcodes?pageNo=1&pageSize=20" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**PowerShell:**
```powershell
curl -X GET "http://localhost:3000/api/room-management/rooms/550e8400-e29b-41d4-a716-446655440000/passcodes?pageNo=1&pageSize=20" `
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Example Response:**

```json
{
  "success": true,
  "message": "Passcodes retrieved successfully",
  "data": {
    "passcodes": [
      {
        "id": "660e8400-e29b-41d4-a716-446655440001",
        "passcode_name": "Master Key Lab 1",
        "passcode_type": "permanent",
        "start_date": null,
        "end_date": null,
        "created_at": "2025-11-13T10:00:00.000Z"
      },
      {
        "id": "770e8400-e29b-41d4-a716-446655440002",
        "passcode_name": "Praktikum Senin",
        "passcode_type": "temporary",
        "start_date": "2025-11-14T08:00:00.000Z",
        "end_date": "2025-11-14T12:00:00.000Z",
        "created_at": "2025-11-13T10:00:00.000Z"
      }
    ],
    "pagination": {
      "pageNo": 1,
      "pageSize": 20,
      "total": 2
    }
  }
}
```

---

### 5. Delete Passcode

**Endpoint:** `DELETE /api/room-management/rooms/:roomId/passcodes/:passcodeId`

**Example Request:**

```bash
curl -X DELETE http://localhost:3000/api/room-management/rooms/550e8400-e29b-41d4-a716-446655440000/passcodes/12345678 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**PowerShell:**
```powershell
curl -X DELETE http://localhost:3000/api/room-management/rooms/550e8400-e29b-41d4-a716-446655440000/passcodes/12345678 `
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Example Response:**

```json
{
  "success": true,
  "message": "Passcode deleted successfully",
  "data": {
    "passcodeId": 12345678,
    "lockId": "6989409",
    "deletedAt": "2025-11-13T11:00:00.000Z"
  }
}
```

---

### 6. Update Passcode Name

**Endpoint:** `PATCH /api/room-management/rooms/:roomId/passcodes/:passcodeId/name`

**Request Body:**

```json
{
  "name": "New Passcode Name"
}
```

**Validation Rules:**
- `name`: Required, string, max 100 characters

**Example Request:**

```bash
curl -X PATCH http://localhost:3000/api/room-management/rooms/550e8400-e29b-41d4-a716-446655440000/passcodes/12345678/name \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Master Key - Updated"
  }'
```

**PowerShell:**
```powershell
$body = @{
    name = "Master Key - Updated"
} | ConvertTo-Json

curl -X PATCH http://localhost:3000/api/room-management/rooms/550e8400-e29b-41d4-a716-446655440000/passcodes/12345678/name `
  -H "Authorization: Bearer YOUR_JWT_TOKEN" `
  -H "Content-Type: application/json" `
  -d $body
```

**Example Response:**

```json
{
  "success": true,
  "message": "Passcode name updated successfully",
  "data": {
    "passcodeId": 12345678,
    "name": "Master Key - Updated",
    "lockId": "6989409"
  }
}
```

---

## 🧪 Testing Scenarios

### Scenario 1: Setup Lab untuk Praktikum

**Business Case:**  
Dosen ingin setup Lab Informatika 1 untuk praktikum hari Senin jam 08:00-12:00

**Steps:**

1. **Create Room** (jika belum ada)
```powershell
$createRoom = @{
    name = "Lab Informatika 1"
    capacity = 40
    door_lock_id = "6989409"
} | ConvertTo-Json

curl -X POST http://localhost:3000/api/room-management/rooms `
  -H "Authorization: Bearer YOUR_JWT_TOKEN" `
  -H "Content-Type: application/json" `
  -d $createRoom
```

2. **Generate Temporary Passcode**
```powershell
$createPasscode = @{
    name = "Praktikum Senin - Algoritma"
    startDate = "2025-11-18T08:00:00"
    endDate = "2025-11-18T12:00:00"
} | ConvertTo-Json

curl -X POST http://localhost:3000/api/room-management/rooms/{roomId}/passcodes/temporary `
  -H "Authorization: Bearer YOUR_JWT_TOKEN" `
  -H "Content-Type: application/json" `
  -d $createPasscode
```

3. **Share Passcode** dengan mahasiswa
   - Passcode otomatis akan expired setelah jam 12:00

---

### Scenario 2: Guest Access untuk Tamu

**Business Case:**  
Ada tamu yang perlu akses Lab untuk 2 jam

**Steps:**

1. **Generate One-Time Passcode**
```powershell
$guestPasscode = @{
    name = "Tamu - PT XYZ"
    validityHours = 2
} | ConvertTo-Json

curl -X POST http://localhost:3000/api/room-management/rooms/{roomId}/passcodes/onetime `
  -H "Authorization: Bearer YOUR_JWT_TOKEN" `
  -H "Content-Type: application/json" `
  -d $guestPasscode
```

2. **Share Passcode** dengan tamu
   - Passcode valid selama 2 jam dari waktu pembuatan

---

### Scenario 3: Permanent Access untuk Laboran

**Business Case:**  
Laboran perlu akses permanent ke semua lab

**Steps:**

1. **Get All Rooms**
```powershell
curl -X GET "http://localhost:3000/api/room-management/rooms" `
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

2. **Generate Permanent Passcode untuk setiap room**
```powershell
$laboranPasscode = @{
    name = "Laboran - Pak Budi"
} | ConvertTo-Json

# Ulangi untuk setiap roomId
curl -X POST http://localhost:3000/api/room-management/rooms/{roomId}/passcodes/permanent `
  -H "Authorization: Bearer YOUR_JWT_TOKEN" `
  -H "Content-Type: application/json" `
  -d $laboranPasscode
```

---

### Scenario 4: Update Room Information

**Business Case:**  
Kapasitas lab bertambah setelah renovasi

**Steps:**

1. **Get Room Details**
```powershell
curl -X GET http://localhost:3000/api/room-management/rooms/{roomId} `
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

2. **Update Room**
```powershell
$updateRoom = @{
    name = "Lab Informatika 1 - Renovated"
    capacity = 50
} | ConvertTo-Json

curl -X PUT http://localhost:3000/api/room-management/rooms/{roomId} `
  -H "Authorization: Bearer YOUR_JWT_TOKEN" `
  -H "Content-Type: application/json" `
  -d $updateRoom
```

---

### Scenario 5: Delete Expired Passcode

**Business Case:**  
Menghapus passcode yang sudah tidak digunakan

**Steps:**

1. **Get All Passcodes for Room**
```powershell
curl -X GET "http://localhost:3000/api/room-management/rooms/{roomId}/passcodes" `
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

2. **Delete Specific Passcode**
```powershell
curl -X DELETE http://localhost:3000/api/room-management/rooms/{roomId}/passcodes/{passcodeId} `
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## 🔍 Testing with Postman

### Import Collection

1. **Create New Collection** di Postman
2. **Set Collection Variables:**
   - `base_url`: `http://localhost:3000`
   - `jwt_token`: `YOUR_JWT_TOKEN_HERE`
   - `room_id`: `Will be set after creating room`

### Collection Structure

```
Room Management API
├── 1. Health Check
├── Rooms
│   ├── Get All Rooms
│   ├── Get Room by ID
│   ├── Create Room
│   ├── Update Room
│   ├── Delete Room
│   ├── Mark as Occupied
│   └── Mark as Vacant
└── Passcodes
    ├── Create Permanent Passcode
    ├── Create Temporary Passcode
    ├── Create One-Time Passcode
    ├── Get Passcode List
    ├── Delete Passcode
    └── Update Passcode Name
```

### Authorization Setup

**Collection Level Authorization:**
1. Klik collection → **Authorization** tab
2. Type: **Bearer Token**
3. Token: `{{jwt_token}}`

Semua request dalam collection akan inherit authorization ini.

### Environment Variables

```json
{
  "base_url": "http://localhost:3000",
  "jwt_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "room_id": "550e8400-e29b-41d4-a716-446655440000",
  "passcode_id": "12345678"
}
```

### Test Scripts

**After Creating Room (Auto-save room_id):**
```javascript
pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});

pm.test("Room created successfully", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.success).to.be.true;
    
    // Save room_id to environment
    pm.environment.set("room_id", jsonData.data.id);
});
```

**After Creating Passcode (Auto-save passcode_id):**
```javascript
pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});

pm.test("Passcode created successfully", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.success).to.be.true;
    
    // Save passcode_id to environment
    pm.environment.set("passcode_id", jsonData.data.passcodeId);
});
```

---

## 🛠️ Common Issues

### 1. JWT Token Error

**Error:**
```json
{
  "success": false,
  "message": "Unauthorized",
  "error": "No token provided"
}
```

**Solution:**
- Pastikan header `Authorization: Bearer YOUR_TOKEN` sudah benar
- Check JWT_SECRET di `.env` sama dengan AUTH GATEWAY

---

### 2. Database Connection Error

**Error:**
```
Database connection error: getaddrinfo ENOTFOUND room_management_db
```

**Solution:**
```powershell
# Check container status
docker compose ps

# Restart containers
docker compose restart

# Check logs
docker compose logs backend
```

---

### 3. Room Not Found

**Error:**
```json
{
  "success": false,
  "message": "Room not found"
}
```

**Solution:**
- Verify roomId is correct UUID
- Check room exists:
```powershell
docker exec -it room_management_db psql -U postgres -d room_management_db -c "SELECT * FROM rooms;"
```

---

### 4. TTLock API Error

**Error:**
```json
{
  "success": false,
  "message": "TTLock API error: Invalid lock_id"
}
```

**Solution:**
- Pastikan `door_lock_id` valid dari TTLock
- Check TTLock credentials di `.env`:
  ```
  TTLOCK_CLIENT_ID=...
  TTLOCK_CLIENT_SECRET=...
  TTLOCK_BASE_URL=https://euapi.ttlock.com
  ```

---

### 5. Migration Not Run

**Error:**
```
relation "rooms" does not exist
```

**Solution:**
```powershell
# Run migrations
Get-Content modules/room-management/migrations/001_create_rooms_table.sql | docker exec -i room_management_db psql -U postgres -d room_management_db
Get-Content modules/room-management/migrations/002_create_passcode_logs_table.sql | docker exec -i room_management_db psql -U postgres -d room_management_db
```

---

### 6. Port Already in Use

**Error:**
```
bind: Only one usage of each socket address (protocol/network address/port) is normally permitted
```

**Solution:**
```powershell
# Stop conflicting service
Stop-Service postgresql-x64-16  # If PostgreSQL running locally

# Or change port in docker-compose.yml
ports:
  - "5433:5432"  # Use different port
```

---

## 📊 Database Queries for Debugging

### Check Rooms
```sql
docker exec -it room_management_db psql -U postgres -d room_management_db -c "SELECT * FROM rooms;"
```

### Check Passcode Logs
```sql
docker exec -it room_management_db psql -U postgres -d room_management_db -c "SELECT * FROM passcode_logs ORDER BY created_at DESC LIMIT 10;"
```

### Count Active Passcodes
```sql
docker exec -it room_management_db psql -U postgres -d room_management_db -c "SELECT COUNT(*) FROM passcode_logs WHERE action = 'created';"
```

### Get Room with Passcode Count
```sql
docker exec -it room_management_db psql -U postgres -d room_management_db -c "
SELECT 
  r.name, 
  COUNT(pl.id) as passcode_count 
FROM rooms r 
LEFT JOIN passcode_logs pl ON r.id = pl.room_id 
GROUP BY r.id, r.name;
"
```

---

## 🎯 Quick Reference

### URLs
- **Backend:** http://localhost:3000
- **Health Check:** http://localhost:3000/health
- **API Docs:** http://localhost:3000/api-docs
- **Database:** localhost:5432

### Default Credentials
- **PostgreSQL User:** postgres
- **PostgreSQL Password:** postgres
- **Database Name:** room_management_db

### Docker Commands
```powershell
# Start all containers
docker compose up -d

# Stop all containers
docker compose down

# View logs
docker compose logs -f backend

# Restart backend
docker compose restart backend

# Access database
docker exec -it room_management_db psql -U postgres -d room_management_db
```

---

## 📞 Support

Jika menemui masalah:
1. Check container logs: `docker compose logs backend`
2. Check database connection: `docker exec -it room_management_db psql -U postgres -d room_management_db -c "SELECT 1;"`
3. Verify migrations: `docker exec -it room_management_db psql -U postgres -d room_management_db -c "\dt"`

---

**Happy Testing! 🚀**
