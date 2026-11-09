# Modul Room Management

Modul untuk mengelola ruangan laboratorium dan smart lock integration menggunakan TTLock API.

## 📋 Daftar Isi

- [Overview](#overview)
- [Arsitektur & Design Principles](#arsitektur--design-principles)
- [Struktur Modul](#struktur-modul)
- [Database Schema](#database-schema)
- [API Endpoints](#api-endpoints)
- [Business Rules](#business-rules)
- [TTLock Integration](#ttlock-integration)
- [Setup & Migration](#setup--migration)
- [Contoh Penggunaan](#contoh-penggunaan)
- [Troubleshooting](#troubleshooting)

## 🎯 Overview

Modul Room Management bertanggung jawab untuk:

1. **Room Management**: CRUD operations untuk ruangan laboratorium
2. **Passcode Management**: Generate dan manage passcode untuk smart lock TTLock
3. **Occupancy Tracking**: Tracking status okupansi ruangan
4. **Audit Trail**: Logging semua aktivitas passcode untuk keamanan

**Catatan Penting:**
- Modul ini terintegrasi dengan **TTLock API** untuk smart lock management
- Semua passcode operations dicatat untuk audit trail
- Timezone handling: Input WIB, konversi ke UTC untuk TTLock API

## 🏗️ Arsitektur & Design Principles

### Design Principles

1. **Modular Design**: Independen dengan database sendiri (`room_management_db`)
2. **Service Layer**: Business logic terpisah dari HTTP handlers
3. **Audit Trail**: Semua passcode operations di-log ke database
4. **Timezone Conversion**: WIB → UTC untuk TTLock API integration
5. **Security**: JWT authentication dari AUTH GATEWAY

### Database

- **Database**: `room_management_db` (PostgreSQL)
- **Connection Pool**: Dikonfigurasi di `config/databases.js` sebagai `roomManagementDb`

## 📁 Struktur Modul

```
modules/room-management/
├── controllers/
│   ├── roomController.js         # HTTP handlers untuk rooms
│   └── passcodeController.js     # HTTP handlers untuk passcodes
├── services/
│   ├── roomService.js            # Business logic untuk rooms
│   ├── passcodeService.js        # Business logic + TTLock integration
│   └── timezoneUtil.js           # WIB/UTC conversion utility
├── models/
│   ├── roomModel.js              # Data access layer untuk rooms
│   └── passcodeModel.js          # Data access layer untuk passcodes
├── middleware/
│   ├── roomValidator.js          # Joi validation untuk rooms
│   └── passcodeValidator.js      # Joi validation untuk passcodes
├── migrations/
│   ├── 001_create_rooms_table.sql
│   └── 002_create_passcode_logs_table.sql
└── routes.js                     # Route definitions
```

## 🗄️ Database Schema

### Table: `rooms`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `name` | VARCHAR(120) | Nama ruangan |
| `capacity` | INTEGER | Kapasitas ruangan |
| `is_occupied` | BOOLEAN | Status okupansi |
| `door_lock_id` | VARCHAR(255) | TTLock lock ID |
| `created_at` | TIMESTAMP | Timestamp created |
| `updated_at` | TIMESTAMP | Timestamp updated |

### Table: `passcode_logs`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `room_id` | UUID | Foreign key to rooms |
| `lock_id` | BIGINT | TTLock lock ID |
| `passcode_id` | BIGINT | TTLock passcode ID |
| `passcode_name` | VARCHAR(100) | Nama passcode |
| `passcode_type` | ENUM | Type: permanent/temporary/onetime |
| `start_date` | TIMESTAMP | Start date (untuk temporary) |
| `end_date` | TIMESTAMP | End date (untuk temporary) |
| `action` | ENUM | Action: created/deleted/updated |
| `created_by` | VARCHAR(100) | User yang create |
| `deleted_by` | VARCHAR(100) | User yang delete |
| `metadata` | JSONB | Additional metadata |
| `created_at` | TIMESTAMP | Timestamp created |
| `updated_at` | TIMESTAMP | Timestamp updated |

## 📡 API Endpoints

### Room Management Endpoints

#### 1. Get All Rooms
**Endpoint:** `GET /api/room-management/rooms`  
**Auth:** Required (JWT)  
**Role:** All authenticated users

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Lab Komputer 1",
      "capacity": 40,
      "is_occupied": false,
      "door_lock_id": "123456",
      "created_at": "2025-11-13T10:00:00Z",
      "updated_at": "2025-11-13T10:00:00Z"
    }
  ]
}
```

#### 2. Get Room by ID
**Endpoint:** `GET /api/room-management/rooms/:id`  
**Auth:** Required (JWT)  
**Role:** All authenticated users

#### 3. Create Room
**Endpoint:** `POST /api/room-management/rooms`  
**Auth:** Required (JWT)  
**Role:** Admin only (TODO: implement role check)

**Request Body:**
```json
{
  "name": "Lab Komputer 1",
  "capacity": 40,
  "door_lock_id": "123456" // Optional
}
```

**Validation Rules:**
- `name`: Required, 1-120 characters
- `capacity`: Required, integer > 0
- `door_lock_id`: Optional, string

#### 4. Update Room
**Endpoint:** `PUT /api/room-management/rooms/:id`  
**Auth:** Required (JWT)  
**Role:** Admin only (TODO)

**Request Body:**
```json
{
  "name": "Lab Komputer 1 (Updated)", // Optional
  "capacity": 45,                      // Optional
  "door_lock_id": "123456"            // Optional
}
```

#### 5. Delete Room
**Endpoint:** `DELETE /api/room-management/rooms/:id`  
**Auth:** Required (JWT)  
**Role:** Admin only (TODO)

#### 6. Mark Room as Occupied
**Endpoint:** `PATCH /api/room-management/rooms/:id/occupy`  
**Auth:** Required (JWT)  
**Role:** All authenticated users

#### 7. Mark Room as Vacant
**Endpoint:** `PATCH /api/room-management/rooms/:id/vacate`  
**Auth:** Required (JWT)  
**Role:** All authenticated users

---

### Passcode Management Endpoints

#### 1. Get Passcode List
**Endpoint:** `GET /api/room-management/rooms/:roomId/passcodes`  
**Auth:** Required (JWT)  
**Query Params:**
- `pageNo`: Integer, default: 1
- `pageSize`: Integer, default: 20, max: 100

#### 1. Get Passcode List
**Endpoint:** `GET /api/room-management/rooms/:roomId/passcodes`  
**Auth:** Required (JWT)  
**Query Params:**
- `pageNo`: Integer, default: 1
- `pageSize`: Integer, default: 20, max: 100

**Response:**
```json
{
  "success": true,
  "message": "Passcode list retrieved successfully",
  "data": {
    "pageNo": 1,
    "pageSize": 20,
    "total": 5,
    "totalPages": 1,
    "list": [
      {
        "id": "uuid",
        "passcodeId": 123456,
        "name": "Kelas Pagi",
        "type": "temporary",
        "startDate": "2025-11-13T08:00:00",
        "endDate": "2025-11-13T12:00:00",
        "createdAt": "2025-11-13T07:00:00Z",
        "createdBy": "user-id",
        "metadata": {}
      }
    ]
  }
}
```

#### 2. Create Permanent Passcode
**Endpoint:** `POST /api/room-management/rooms/:roomId/passcodes/permanent`  
**Auth:** Required (JWT)  
**Role:** Admin/Laboran (TODO: implement role check)

**Request Body:**
```json
{
  "name": "Master Key",
  "passcode": "123456" // Optional, will auto-generate if not provided (6 digits)
}
```

**Validation Rules:**
- `name`: Required, 1-100 characters
- `passcode`: Optional, 6-10 digits

**Response:**
```json
{
  "success": true,
  "message": "Permanent passcode created successfully",
  "data": {
    "id": "uuid",
    "passcodeId": 789012,
    "passcode": "123456",
    "name": "Master Key",
    "type": "permanent",
    "roomId": "room-uuid",
    "roomName": "Lab Komputer 1",
    "lockId": "123456",
    "createdAt": "2025-11-13T10:00:00Z"
  }
}
```

#### 3. Create Temporary Passcode
**Endpoint:** `POST /api/room-management/rooms/:roomId/passcodes/temporary`  
**Auth:** Required (JWT)  
**Role:** Admin/Laboran (TODO)

**Request Body:**
```json
{
  "name": "Kelas Pagi",
  "startDate": "2025-11-13T08:00:00",  // WIB timezone
  "endDate": "2025-11-13T12:00:00",    // WIB timezone
  "passcode": "654321"                 // Optional
}
```

**Validation Rules:**
- `name`: Required, 1-100 characters
- `startDate`: Required, ISO 8601 format, treated as WIB
- `endDate`: Required, must be after startDate
- `passcode`: Optional, 6-10 digits

**Important Notes:**
- Input dates dalam **WIB timezone** (Asia/Jakarta)
- Format: ISO 8601 (`YYYY-MM-DDTHH:mm:ss`)
- Backend akan convert ke UTC timestamp untuk TTLock API
- StartDate harus di masa depan atau baru lewat (toleransi 1 jam)

#### 4. Create One-Time Passcode
**Endpoint:** `POST /api/room-management/rooms/:roomId/passcodes/onetime`  
**Auth:** Required (JWT)  
**Role:** Admin/Laboran (TODO)

**Request Body:**
```json
{
  "name": "Guest Access",
  "validityHours": 4,    // Optional, default: 4, max: 24
  "passcode": "111222"   // Optional
}
```

**Validation Rules:**
- `name`: Required, 1-100 characters
- `validityHours`: Optional, 1-24 hours, default: 4
- `passcode`: Optional, 6-10 digits

#### 5. Delete Passcode
**Endpoint:** `DELETE /api/room-management/rooms/:roomId/passcodes/:passcodeId`  
**Auth:** Required (JWT)  
**Role:** Admin/Laboran (TODO)

**Response:**
```json
{
  "success": true,
  "message": "Passcode deleted successfully",
  "passcodeId": 123456
}
```

#### 6. Update Passcode Name
**Endpoint:** `PATCH /api/room-management/rooms/:roomId/passcodes/:passcodeId/name`  
**Auth:** Required (JWT)  
**Role:** Admin/Laboran (TODO)

**Request Body:**
```json
{
  "name": "New Name"
}
```

**Validation Rules:**
- `name`: Required, 1-100 characters

---

## 📐 Business Rules

### Room Management Rules

1. **Room Name**: Unique per database (enforced by application)
2. **Capacity**: Harus lebih besar dari 0
3. **Door Lock ID**: Optional, diisi jika room memiliki smart lock
4. **Occupancy**: Default `false` saat room dibuat

### Passcode Management Rules

1. **Passcode Types**:
   - **Permanent**: Tidak ada expiry date
   - **Temporary**: Dengan start dan end date (input WIB, convert ke UTC)
   - **One-time**: Valid untuk X hours dari waktu creation

2. **Auto-generate Passcode**:
   - Jika tidak di-provide, akan generate random 6 digit
   - Format: 6-10 numeric digits

3. **Timezone Conversion**:
   - User input: **WIB timezone** (Asia/Jakarta)
   - TTLock API: **UTC timestamp** (milliseconds)
   - Backend handle conversion otomatis

4. **Audit Trail**:
   - Semua passcode operations (create, delete, update) di-log
   - Log includes: room_id, lock_id, passcode_id, action, metadata
   - Soft delete: Passcode tidak dihapus dari log, hanya di-mark sebagai deleted

5. **Validation**:
   - Temporary passcode: endDate harus > startDate
   - StartDate tidak boleh terlalu jauh di masa lalu (toleransi 1 jam)
   - Room harus memiliki door_lock_id untuk create passcode

---

## 🔌 TTLock Integration

### Features
- **Auto-generate passcode**: Jika tidak di-provide, akan auto-generate 6 digit
- **Timezone conversion**: WIB → UTC untuk TTLock API
- **Audit trail**: Semua passcode operations di-log ke database
- **Type support**: Permanent, Temporary, One-time passcodes

### Current Status
⚠️ **TTLock API integration saat ini masih simulated**

Alasan:
- Service sudah siap untuk TTLock API integration
- Perlu credentials TTLock yang valid untuk testing
- Code sudah disiapkan, tinggal uncomment

### Enable TTLock API Integration

**Step 1: Set Environment Variables**
```env
TTLOCK_CLIENT_ID=your-real-client-id
TTLOCK_CLIENT_SECRET=your-real-client-secret
TTLOCK_API_URL=https://euapi.ttlock.com
TTLOCK_USERNAME=your-username
TTLOCK_PASSWORD=your-password
```

**Step 2: Update TTLock Service**
Uncomment actual API calls di:
- `modules/room-management/services/passcodeService.js`
- `services/ttlock/ttlockService.js`

**Step 3: Test Integration**
```bash
# Create a test passcode
curl -X POST http://localhost:3000/api/room-management/rooms/:roomId/passcodes/permanent \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Passcode"}'
```

---

## 🛠️ Setup & Migration

### Prerequisites
- PostgreSQL 12+
- Node.js 18+
- JWT secret dari AUTH GATEWAY team

### Database Setup

**1. Create Database**
```bash
createdb -U postgres room_management_db
```

**2. Run Migrations**
```bash
# From be_practicum root directory
psql -U postgres -d room_management_db -f modules/room-management/migrations/001_create_rooms_table.sql
psql -U postgres -d room_management_db -f modules/room-management/migrations/002_create_passcode_logs_table.sql
```

**Or using Docker:**
```bash
docker exec -i be_practicum_db psql -U postgres -d room_management_db < modules/room-management/migrations/001_create_rooms_table.sql
docker exec -i be_practicum_db psql -U postgres -d room_management_db < modules/room-management/migrations/002_create_passcode_logs_table.sql
```

### Environment Configuration

Add to `.env`:
```env
# Room Management Database
ROOM_MANAGEMENT_DB_HOST=localhost
ROOM_MANAGEMENT_DB_PORT=5432
ROOM_MANAGEMENT_DB_USER=postgres
ROOM_MANAGEMENT_DB_PASSWORD=postgres
ROOM_MANAGEMENT_DB_NAME=room_management_db

# TTLock API (optional for now)
TTLOCK_CLIENT_ID=your-client-id
TTLOCK_CLIENT_SECRET=your-client-secret
TTLOCK_API_URL=https://euapi.ttlock.com
```

### Start Application

```bash
npm install
npm start
# or
npm run dev
```

**Verify:**
```bash
# Health check
curl http://localhost:3000/api/room-management/health
```

---

## 💡 Contoh Penggunaan

### Scenario 1: Setup Lab Baru dengan Smart Lock

**Step 1: Create Room**
```bash
curl -X POST http://localhost:3000/api/room-management/rooms \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Lab Komputer 1",
    "capacity": 40,
    "door_lock_id": "6824710"
  }'
```

**Step 2: Create Permanent Passcode (Master Key)**
```bash
curl -X POST http://localhost:3000/api/room-management/rooms/:roomId/passcodes/permanent \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Master Key Lab 1",
    "passcode": "123456"
  }'
```

**Step 3: Create Temporary Passcode untuk Kelas**
```bash
curl -X POST http://localhost:3000/api/room-management/rooms/:roomId/passcodes/temporary \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Kelas Algoritma Pagi",
    "startDate": "2025-11-14T08:00:00",
    "endDate": "2025-11-14T12:00:00"
  }'
```

### Scenario 2: Guest Access dengan One-Time Passcode

```bash
curl -X POST http://localhost:3000/api/room-management/rooms/:roomId/passcodes/onetime \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Guest - Dr. John",
    "validityHours": 2
  }'
```

### Scenario 3: Update Room Occupancy

**Mark as Occupied:**
```bash
curl -X PATCH http://localhost:3000/api/room-management/rooms/:roomId/occupy \
  -H "Authorization: Bearer <jwt-token>"
```

**Mark as Vacant:**
```bash
curl -X PATCH http://localhost:3000/api/room-management/rooms/:roomId/vacate \
  -H "Authorization: Bearer <jwt-token>"
```

### Scenario 4: View Passcode Audit Trail

```bash
curl -X GET "http://localhost:3000/api/room-management/rooms/:roomId/passcodes?pageNo=1&pageSize=20" \
  -H "Authorization: Bearer <jwt-token>"
```

---

## 🐛 Troubleshooting

### Database Connection Error
```bash
# Check database exists
psql -U postgres -l | grep room_management_db

# Create database if not exists
createdb -U postgres room_management_db

# Test connection
psql -U postgres -d room_management_db -c "SELECT 1"
```

### Migration Error: UUID Extension
```bash
# Check if UUID extension exists
psql -U postgres -d room_management_db -c "SELECT * FROM pg_extension WHERE extname = 'uuid-ossp';"

# Create extension if not exists
psql -U postgres -d room_management_db -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";"
```

### JWT Token Invalid
- Pastikan JWT_SECRET sama dengan AUTH GATEWAY
- Check token expiry
- Verify token format: `Bearer <token>`

### TTLock API Error
- Check credentials (CLIENT_ID, CLIENT_SECRET)
- Verify API URL (EU region vs US region)
- Check network connectivity
- Validate door_lock_id

### Room Not Found Error
- Verify room ID (UUID format)
- Check if room exists: `SELECT * FROM rooms WHERE id = '<uuid>';`

### Passcode Creation Failed
- Ensure room has `door_lock_id` configured
- Check startDate < endDate (untuk temporary)
- Verify passcode format (6-10 digits)
- Check TTLock credentials

---

## 🔒 Security Considerations

1. **JWT Authentication**: Semua endpoints protected dengan JWT
2. **Input Validation**: Joi validation untuk semua input
3. **SQL Injection Prevention**: Parameterized queries
4. **Audit Trail**: Semua passcode operations logged
5. **Error Handling**: Tidak expose sensitive information di error messages

---

## 📝 TODO / Future Enhancements

- [ ] Implement actual TTLock API integration (remove simulation)
- [ ] Add role-based authorization middleware (Admin, Laboran, User)
- [ ] Add Swagger documentation untuk module ini
- [ ] Add unit tests (services, models)
- [ ] Add integration tests (TTLock API)
- [ ] Add caching untuk frequently accessed rooms (Redis)
- [ ] Add WebSocket untuk real-time occupancy updates
- [ ] Add booking/reservation system integration
- [ ] Add notification system (email/SMS) untuk passcode creation
- [ ] Add dashboard untuk monitoring room usage statistics

---

## 🤝 Cross-Module Integration

Module ini dapat diintegrasikan dengan module lain:

### Integration dengan Registration Module
- Room dapat di-link dengan Jadwal Praktikum
- Auto-generate passcode saat jadwal dibuat
- Auto-cleanup expired passcodes

### Integration dengan Execution Module
- Track kehadiran berdasarkan room occupancy
- Validate kehadiran hanya jika room occupied

### Integration dengan User Management Module
- Track siapa yang create/delete passcode (audit trail)
- Role-based access untuk passcode management

---

## 📄 License

ISC

---

**Developed as part of FRI Super App Backend - Room Management Module**
        "passcodeId": 123456,
        "name": "Kelas Pagi",
        "type": "temporary",
        "startDate": "2025-11-13T08:00:00",
        "endDate": "2025-11-13T12:00:00",
        "createdAt": "2025-11-13T07:00:00Z",
        "createdBy": "user-id",
        "metadata": {}
      }
    ]
  }
}
```

#### Create Permanent Passcode
```http
POST /api/room-management/rooms/:roomId/passcodes/permanent
Authorization: Bearer <jwt-token>
Content-Type: application/json

{
  "name": "Master Key",
  "passcode": "123456" // Optional, will auto-generate if not provided
}
```

**Response:**
```json
{
  "success": true,
  "message": "Permanent passcode created successfully",
  "data": {
    "id": "uuid",
    "passcodeId": 789012,
    "passcode": "123456",
    "name": "Master Key",
    "type": "permanent",
    "roomId": "room-uuid",
    "roomName": "Lab Komputer 1",
    "lockId": "123456",
    "createdAt": "2025-11-13T10:00:00Z"
  }
}
```

#### Create Temporary Passcode
```http
POST /api/room-management/rooms/:roomId/passcodes/temporary
Authorization: Bearer <jwt-token>
Content-Type: application/json

{
  "name": "Kelas Pagi",
  "startDate": "2025-11-13T08:00:00",
  "endDate": "2025-11-13T12:00:00",
  "passcode": "654321" // Optional
}
```

**Notes:**
- Dates are in **WIB timezone** (Asia/Jakarta)
- Format: ISO 8601 (`YYYY-MM-DDTHH:mm:ss`)
- Will be converted to UTC timestamp for TTLock API

#### Create One-Time Passcode
```http
POST /api/room-management/rooms/:roomId/passcodes/onetime
Authorization: Bearer <jwt-token>
Content-Type: application/json

{
  "name": "Guest Access",
  "validityHours": 4, // Optional, default: 4
  "passcode": "111222" // Optional
}
```

#### Delete Passcode
```http
DELETE /api/room-management/rooms/:roomId/passcodes/:passcodeId
Authorization: Bearer <jwt-token>
```

#### Update Passcode Name
```http
PATCH /api/room-management/rooms/:roomId/passcodes/:passcodeId/name
Authorization: Bearer <jwt-token>
Content-Type: application/json

{
  "name": "New Name"
}
```

## 🔐 Authentication & Authorization

### JWT Validation
- Semua endpoint memerlukan **JWT token** dari AUTH GATEWAY
- Token harus di-include di header: `Authorization: Bearer <token>`

### Role-Based Access Control (RBAC)
- **Admin**: Full access (CRUD rooms, passcodes)
- **Laboran/Staff**: Create/manage passcodes
- **User**: View rooms, view passcodes

*Note: Role checking masih TODO, untuk sekarang semua authenticated user bisa akses*

## 🔧 Environment Variables

Tambahkan ke `.env`:

```env
# Room Management Database
ROOM_MANAGEMENT_DB_HOST=localhost
ROOM_MANAGEMENT_DB_PORT=5432
ROOM_MANAGEMENT_DB_USER=postgres
ROOM_MANAGEMENT_DB_PASSWORD=postgres
ROOM_MANAGEMENT_DB_NAME=room_management_db

# TTLock API (shared dengan services/ttlock/)
TTLOCK_CLIENT_ID=your-client-id
TTLOCK_CLIENT_SECRET=your-client-secret
TTLOCK_API_URL=https://euapi.ttlock.com
```

## 📦 Database Migrations

Jalankan migrations untuk membuat tables:

```bash
# From be_practicum root directory
psql -U postgres -d room_management_db -f modules/room-management/migrations/001_create_rooms_table.sql
psql -U postgres -d room_management_db -f modules/room-management/migrations/002_create_passcode_logs_table.sql
```

Atau menggunakan Docker:

```bash
docker exec -i be_practicum_db psql -U postgres -d room_management_db < modules/room-management/migrations/001_create_rooms_table.sql
docker exec -i be_practicum_db psql -U postgres -d room_management_db < modules/room-management/migrations/002_create_passcode_logs_table.sql
```

## 🏗️ Architecture

### Struktur Folder

```
modules/room-management/
├── controllers/
│   ├── roomController.js       # HTTP handlers untuk rooms
│   └── passcodeController.js   # HTTP handlers untuk passcodes
├── services/
│   ├── roomService.js          # Business logic untuk rooms
│   ├── passcodeService.js      # Business logic untuk passcodes
│   └── timezoneUtil.js         # WIB/UTC conversion utility
├── models/
│   ├── roomModel.js            # Data access layer untuk rooms
│   └── passcodeModel.js        # Data access layer untuk passcodes
├── middleware/
│   ├── roomValidator.js        # Validasi input rooms
│   └── passcodeValidator.js    # Validasi input passcodes
├── migrations/
│   ├── 001_create_rooms_table.sql
│   └── 002_create_passcode_logs_table.sql
├── routes.js                   # Route definitions
└── README.md                   # Documentation
```

### Design Principles

1. **Modular Design**: Independen dengan database sendiri
2. **Service Layer**: Business logic terpisah dari HTTP handlers
3. **Data Access Layer**: Models handle database operations
4. **Validation**: Joi validation di middleware layer
5. **Error Handling**: Consistent error responses
6. **Logging**: Winston logger untuk audit trail

## 🔌 TTLock Integration

### Features
- **Auto-generate passcode**: Jika tidak di-provide, akan auto-generate 6 digit
- **Timezone conversion**: WIB → UTC untuk TTLock API
- **Audit trail**: Semua passcode operations di-log ke database
- **Type support**: Permanent, Temporary, One-time passcodes

### Current Status
⚠️ **TTLock API integration masih simulated**
- Service sudah siap untuk TTLock API
- Perlu kredensial TTLock yang valid
- Uncomment code di `passcodeService.js` untuk enable actual API calls

### Enable TTLock API

1. Update `services/ttlock/ttlockService.js` dengan implementasi lengkap
2. Uncomment TTLock API calls di `modules/room-management/services/passcodeService.js`
3. Set environment variables untuk TTLock credentials

## 🐛 Troubleshooting

### Database Connection Error
```bash
# Check database exists
psql -U postgres -l | grep room_management_db

# Create database if not exists
createdb -U postgres room_management_db
```

### Migration Error
```bash
# Check if UUID extension exists
psql -U postgres -d room_management_db -c "SELECT * FROM pg_extension WHERE extname = 'uuid-ossp';"

# Create extension if not exists
psql -U postgres -d room_management_db -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";"
```

### TTLock API Error
- Pastikan credentials benar
- Check API URL (EU vs US region)
- Validate token expiry

## 📝 TODO

- [ ] Implement actual TTLock API integration (remove simulation)
- [ ] Add role-based authorization middleware
- [ ] Add Swagger documentation
- [ ] Add unit tests
- [ ] Add integration tests for TTLock API
- [ ] Add caching for frequently accessed rooms
- [ ] Add WebSocket for real-time occupancy updates
- [ ] Add booking/reservation system integration

## 🤝 Contributing

Developed as part of FRI Super App Backend - Room Management Module

## 📄 License

ISC
