# Modul User Management

Modul untuk mengelola data tambahan user dan role management khusus untuk praktikum. Modul ini **tidak mereplikasi data user** dari AUTH GATEWAY, melainkan hanya menyimpan data tambahan yang diperlukan untuk keperluan praktikum.

## 📋 Daftar Isi

- [Overview](#overview)
- [Arsitektur & Design Principles](#arsitektur--design-principles)
- [Struktur Modul](#struktur-modul)
- [Database Schema](#database-schema)
- [API Endpoints](#api-endpoints)
- [Business Rules](#business-rules)
- [RBAC & Permissions](#rbac--permissions)
- [Setup & Migration](#setup--migration)
- [Contoh Penggunaan](#contoh-penggunaan)
- [Cross-Module Integration](#cross-module-integration)

## 🎯 Overview

Modul User Management bertanggung jawab untuk:

1. **Profile Management**: Mengelola data tambahan user (TTD, no rekening)
2. **Role Management**: Mengelola role user untuk praktikum (asisten_praktikum, koordinator_praktikum, dll)

**Catatan Penting:**
- User data utama (username, email, full_name, dll) tetap di **AUTH GATEWAY**
- Modul ini hanya menyimpan data tambahan yang tidak ada di AUTH GATEWAY
- Assignment asisten ke praktikum akan dikerjakan di **modul registration**

## 🏗️ Arsitektur & Design Principles

### Design Principles

1. **No Data Replication**: Tidak mereplikasi data user dari AUTH GATEWAY
2. **Reference Pattern**: Menggunakan `user_id` sebagai reference ke AUTH GATEWAY
3. **Single Source of Truth**: AUTH GATEWAY adalah source of truth untuk user data
4. **Soft Delete**: Semua tabel menggunakan soft delete (`deleted_at`)

### Database

- **Database**: `user_management_db` (PostgreSQL)
- **Connection Pool**: Dikonfigurasi di `config/databases.js` sebagai `userManagementDb`

## 📁 Struktur Modul

```
modules/user-management/
├── controllers/
│   ├── profileController.js      # HTTP handlers untuk profile
│   └── roleController.js          # HTTP handlers untuk role
├── services/
│   ├── profileService.js          # Business logic untuk profile
│   └── roleService.js             # Business logic untuk role
├── models/
│   ├── profileModel.js            # Database operations untuk profile
│   └── roleModel.js               # Database operations untuk role
├── middleware/
│   └── roleValidator.js           # RBAC middleware
├── migrations/
│   └── 001_create_tables.sql      # Database schema
├── routes.js                      # API routes
└── README.md                      # Dokumentasi ini
```

## 🗄️ Database Schema

### Tabel `user_profiles`

Menyimpan data tambahan user yang tidak ada di AUTH GATEWAY.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | VARCHAR(255) | Reference ke user_id dari AUTH GATEWAY (UNIQUE) |
| `ttd` | TEXT | Base64 encoded signature image |
| `ttd_file_path` | VARCHAR(500) | Path ke file jika disimpan di storage |
| `no_rekening` | VARCHAR(50) | No rekening khusus asisten praktikum |
| `bank_name` | VARCHAR(100) | Nama bank |
| `account_name` | VARCHAR(255) | Nama pemilik rekening |
| `created_at` | TIMESTAMP | Timestamp creation |
| `updated_at` | TIMESTAMP | Timestamp update |
| `deleted_at` | TIMESTAMP | Soft delete timestamp |

**Index:**
- `idx_user_profiles_user_id` pada `user_id` (WHERE deleted_at IS NULL)

### Tabel `user_roles`

Mengelola role user untuk praktikum.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | VARCHAR(255) | Reference ke user_id dari AUTH GATEWAY |
| `role` | VARCHAR(50) | Role: `asisten_praktikum`, `asisten_praktikum_aktif`, `koordinator_praktikum`, `admin` |
| `is_active` | BOOLEAN | Status aktif role |
| `assigned_at` | TIMESTAMP | Waktu assignment |
| `assigned_by` | VARCHAR(255) | user_id yang assign role ini |
| `created_at` | TIMESTAMP | Timestamp creation |
| `updated_at` | TIMESTAMP | Timestamp update |
| `deleted_at` | TIMESTAMP | Soft delete timestamp |

**Constraints:**
- `unique_user_role`: UNIQUE (user_id, role, deleted_at)

**Index:**
- `idx_user_roles_user_id` pada `user_id`
- `idx_user_roles_role` pada `role` (WHERE is_active = true)
- `idx_user_roles_user_role` pada (user_id, role)

## 🔌 API Endpoints

Semua endpoint memerlukan JWT authentication via header:
```
Authorization: Bearer <token>
```

### Profile Management

#### Get User Profile
```http
GET /api/user-management/users/:userId/profile
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "user-id-from-jwt",
    "username": "user123",
    "email": "user@example.com",
    "full_name": "John Doe",
    "profile": {
      "id": "uuid",
      "user_id": "user-id-from-jwt",
      "ttd": "data:image/png;base64,...",
      "ttd_file_path": null,
      "no_rekening": "1234567890",
      "bank_name": "Bank ABC",
      "account_name": "John Doe"
    }
  }
}
```

#### Update User Profile
```http
PUT /api/user-management/users/:userId/profile
```

**Request Body:**
```json
{
  "ttd": "data:image/png;base64,...",
  "ttd_file_path": "/uploads/ttd/user123.png",
  "no_rekening": "1234567890",
  "bank_name": "Bank ABC",
  "account_name": "John Doe"
}
```

#### Upload TTD
```http
POST /api/user-management/users/:userId/profile/ttd
```

**Request Body:**
```json
{
  "ttd": "data:image/png;base64,...",
  "ttd_file_path": "/uploads/ttd/user123.png"
}
```

#### Delete TTD
```http
DELETE /api/user-management/users/:userId/profile/ttd
```

#### Update No Rekening
```http
PUT /api/user-management/users/:userId/profile/rekening
```

**Request Body:**
```json
{
  "no_rekening": "1234567890",
  "bank_name": "Bank ABC",
  "account_name": "John Doe"
}
```

### Role Management

#### Get User Roles
```http
GET /api/user-management/users/:userId/roles?includeInactive=false
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "user_id": "user-id",
      "role": "asisten_praktikum",
      "is_active": true,
      "assigned_at": "2024-01-01T00:00:00Z",
      "assigned_by": "admin-user-id"
    }
  ]
}
```

#### Assign Role to User
```http
POST /api/user-management/users/:userId/roles
```

**Request Body:**
```json
{
  "role": "asisten_praktikum"
}
```

**Valid Roles:**
- `asisten_praktikum`
- `asisten_praktikum_aktif`
- `koordinator_praktikum`
- `admin`

#### Update Role Status
```http
PUT /api/user-management/roles/:roleId
```

**Request Body:**
```json
{
  "isActive": false
}
```

#### Remove Role from User
```http
DELETE /api/user-management/roles/:roleId
```

#### Get Users by Role
```http
GET /api/user-management/roles/:role/users?includeInactive=false
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "user_id": "user-id-1",
      "role": "asisten_praktikum",
      "is_active": true
    },
    {
      "id": "uuid",
      "user_id": "user-id-2",
      "role": "asisten_praktikum",
      "is_active": true
    }
  ]
}
```

## 📐 Business Rules

### Profile Management

1. **No Rekening Validation:**
   - Hanya bisa diisi jika user memiliki role `asisten_praktikum` atau lebih tinggi
   - Format: numeric, minimal 10 digit
   - Validasi dilakukan di `profileService.updateUserProfile()`

2. **TTD Validation:**
   - Format: base64 encoded image (PNG, JPG, JPEG) atau PDF
   - Pattern: `data:image/(png|jpg|jpeg|pdf);base64,`
   - Validasi dilakukan di `profileService.uploadTTD()`

### Role Management

1. **Role Hierarchy:**
   - `asisten_praktikum_aktif` harus memiliki role `asisten_praktikum` terlebih dahulu
   - Validasi dilakukan di `roleService.assignRole()`

2. **Role Values:**
   - Valid roles: `asisten_praktikum`, `asisten_praktikum_aktif`, `koordinator_praktikum`, `admin`
   - Case sensitive

3. **Role Assignment:**
   - Jika role sudah ada dan inactive, akan di-reactivate
   - Jika role sudah ada dan active, akan return existing role
   - Jika role belum ada, akan create new role

## 🔐 RBAC & Permissions

### Middleware

#### `requireRole(...allowedRoles)`

Require user memiliki salah satu role dari `allowedRoles`.

**Contoh:**
```javascript
router.post('/users/:userId/roles', 
  validateJWT,
  requireRole('admin', 'koordinator_praktikum'),
  roleController.assignRole
);
```

#### `requireOwnerOrRole(...allowedRoles)`

Allow access jika:
- User mengakses data sendiri, ATAU
- User memiliki salah satu role dari `allowedRoles`

**Contoh:**
```javascript
router.get('/users/:userId/profile',
  validateJWT,
  requireOwnerOrRole('admin', 'koordinator_praktikum'),
  profileController.getUserProfile
);
```

### Permission Matrix

| Action | Owner | Asisten Praktikum | Asisten Aktif | Koordinator | Admin |
|--------|-------|-----------------|---------------|-------------|-------|
| View own profile | ✅ | ✅ | ✅ | ✅ | ✅ |
| Update own profile | ✅ | ✅ | ✅ | ✅ | ✅ |
| View other profile | ❌ | ❌ | ❌ | ✅ | ✅ |
| Update other profile | ❌ | ❌ | ❌ | ✅ | ✅ |
| Assign role | ❌ | ❌ | ❌ | ✅ | ✅ |
| Remove role | ❌ | ❌ | ❌ | ✅ | ✅ |

## 🚀 Setup & Migration

### 1. Environment Variables

Pastikan file `.env` memiliki konfigurasi database:

```env
# User Management Database
USER_MANAGEMENT_DB_HOST=user_management_db
USER_MANAGEMENT_DB_PORT=5432
USER_MANAGEMENT_DB_USER=postgres
USER_MANAGEMENT_DB_PASSWORD=postgres
USER_MANAGEMENT_DB_NAME=user_management_db
```

### 2. Run Migration

Jalankan migration SQL untuk membuat tabel:

```bash
# Via Docker
docker exec -i fri-user-management-db psql -U postgres -d user_management_db < modules/user-management/migrations/001_create_tables.sql

# Atau via psql langsung
psql -U postgres -d user_management_db -f modules/user-management/migrations/001_create_tables.sql
```

### 3. Verify Setup

Test health check endpoint:

```bash
curl http://localhost:3000/api/user-management/health
```

Expected response:
```json
{
  "success": true,
  "module": "user-management",
  "message": "User Management module is running"
}
```

## 💡 Contoh Penggunaan

### 1. Get User Profile dengan Data dari JWT

```javascript
// Controller akan otomatis combine data dari JWT dengan profile
const userData = {
  ...req.user,  // Data dari AUTH GATEWAY (username, email, full_name, dll)
  profile: profile || null  // Data tambahan (TTD, no rekening)
};
```

### 2. Check User Role (untuk Cross-Module)

```javascript
import * as roleService from '../user-management/services/roleService.js';

// Check if user has role
const hasRole = await roleService.userHasRole(userId, 'asisten_praktikum');

// Get active roles
const roles = await roleService.getActiveUserRoles(userId);
```

### 3. Validasi Role sebelum Assignment

```javascript
// Di modul registration (contoh)
import * as roleService from '../user-management/services/roleService.js';

// Validasi user punya role asisten sebelum assign ke praktikum
const hasAsistenRole = await roleService.userHasRole(
  userId, 
  'asisten_praktikum'
) || await roleService.userHasRole(userId, 'asisten_praktikum_aktif');

if (!hasAsistenRole) {
  throw new Error('User harus memiliki role asisten praktikum');
}
```

## 🔗 Cross-Module Integration

### Mengakses User Management dari Modul Lain

#### 1. Check User Role

```javascript
// Di modul registration atau conduct
import * as roleService from '../user-management/services/roleService.js';

// Check role
const isKoordinator = await roleService.userHasRole(
  userId, 
  'koordinator_praktikum'
);
```

#### 2. Get User Profile

```javascript
import * as profileService from '../user-management/services/profileService.js';

// Get profile
const profile = await profileService.getUserProfile(userId);

// Combine dengan JWT data jika perlu
const userData = profileService.combineUserData(jwtUserData, profile);
```

#### 3. Get All Asisten

```javascript
import * as roleService from '../user-management/services/roleService.js';

// Get all users with asisten role
const asisten = await roleService.getUsersByRole('asisten_praktikum');
```

### Best Practices

1. **Jangan Akses Database Langsung**: Gunakan service layer, jangan akses `userManagementDb` langsung dari modul lain
2. **Cache jika Perlu**: Untuk performa, pertimbangkan cache untuk role checks
3. **Error Handling**: Handle error dengan baik saat cross-module calls

## 📝 Catatan Penting

1. **User Data**: User data utama (username, email, full_name) tetap di AUTH GATEWAY, tidak disimpan di modul ini
2. **Assignment**: Assignment asisten ke praktikum akan dikerjakan di modul registration
3. **Soft Delete**: Semua operasi delete menggunakan soft delete (`deleted_at`)
4. **Validation**: Validasi input dilakukan di service layer
5. **RBAC**: Semua endpoint menggunakan RBAC middleware untuk authorization

## 🐛 Troubleshooting

### Database Connection Error

```bash
# Check database container
docker ps | grep user-management-db

# Check logs
docker logs fri-user-management-db

# Test connection
docker exec -it fri-user-management-db psql -U postgres -d user_management_db -c "SELECT 1;"
```

### Migration Error

```bash
# Check if tables exist
docker exec -it fri-user-management-db psql -U postgres -d user_management_db -c "\dt"

# Re-run migration
docker exec -i fri-user-management-db psql -U postgres -d user_management_db < modules/user-management/migrations/001_create_tables.sql
```

### Role Check Not Working

- Pastikan user sudah memiliki role di tabel `user_roles`
- Pastikan `is_active = true`
- Pastikan `deleted_at IS NULL`

## 📚 Related Documentation

- [Main README](../../README.md) - Dokumentasi utama project
- [Registration Module](../registration/README.md) - Modul registration (assignment akan di sini)
- [Conduct Module](../conduct/README.md) - Modul conduct (pelaksanaan)

## 👥 Kontributor

Modul ini dikembangkan untuk keperluan praktikum FRI Super App.

---

**Last Updated**: 2024
**Version**: 1.0.0

