# Room Management Testing

Folder ini berisi unit tests untuk module Room Management.

## Test Files

### 1. `ttlock-connection.test.js`
Unit test untuk koneksi TTLock API.

**Test Coverage:**
- ✅ OAuth Authentication (username/password dengan MD5)
- ✅ API Connection & Basic Requests
- ✅ Lock List Retrieval
- ✅ Error Handling (timeout, invalid endpoint, expired token)
- ✅ TTLock Service (token caching)
- ✅ Connection Health Check

**Cara Menjalankan:**
```bash
# Dari root project
npm run test:room:connection

# Watch mode
npm run test:room:connection:watch
```

### 2. `ttlock-passcode-temporary.test.js`
Unit test untuk generate temporary passcode dengan start/end date.

**Test Coverage:**
- ✅ Basic Temporary Passcode Generation (valid date range, custom/auto passcode)
- ✅ Date Range Validation (future start, current start, long/short validity)
- ✅ TTLock Service Integration (dengan token caching)
- ✅ Passcode Service with Database Logging
- ✅ Error Handling (invalid dates, invalid lock, invalid token)
- ✅ Passcode Format Validation (unique, 6-digit)
- ✅ Response Data Structure

**Prerequisites:**
- Database must be running: `docker compose up -d`
- Test room harus ada di database dengan lock_id configured

**Cara Menjalankan:**
```bash
# Start database dulu
docker compose up -d

# Dari root project
npm run test:room:passcode

# Watch mode
npm run test:room:passcode:watch
```

**Catatan:**
- Test ini akan create real passcodes di TTLock API
- Auto cleanup: semua passcode yang dibuat akan dihapus setelah test selesai
- Jika test gagal, passcode mungkin perlu dihapus manual
- TTLock API memiliki rate limiting - jangan run terlalu cepat berturut-turut

### 3. `ttlock-passcode-permanent.test.js`
Unit test untuk generate permanent passcode (keyboardPwdType=2).

**Test Coverage:**
- ✅ Create Permanent Passcode (auto-generated 8-digit code)
- ✅ Validation (name required, name length)
- ✅ TTLock Service Integration
- ✅ Database Logging
- ✅ Passcode Properties (8 digits, permanent type)
- ✅ Multiple Permanent Passcodes (uniqueness)
- ✅ Error Handling (invalid room, missing name)

**Prerequisites:**
- Database must be running: `docker compose up -d`
- Test room harus ada di database dengan lock_id configured

**Cara Menjalankan:**
```bash
# Start database dulu
docker compose up -d

# Dari root project
npm run test:room:permanent

# Watch mode
npm run test:room:permanent:watch
```

**Catatan:**
- Test ini akan create real passcodes di TTLock API
- Passcode yang dibuat adalah "Permanent Custom" (via API)
- Auto cleanup: semua passcode akan dihapus setelah test selesai
- ⚠️ **PENTING:** Passcode harus digunakan dalam 24 jam untuk menjadi permanent
- TTLock API memiliki rate limiting - delay 2-3 detik antar test

### 4. `ttlock-passcode-onetime.test.js`
Unit test untuk generate one-time passcode (keyboardPwdType=1).

**Test Coverage:**
- ✅ Create One-Time Passcode (8-digit auto-generated)
- ✅ Validation Hours Configuration (1-24 hours)
- ✅ TTLock Service Integration
- ✅ Database Logging
- ✅ Time Rounding (TTLock rounds to nearest hour)
- ✅ Error Handling

**Cara Menjalankan:**
```bash
# Start database dulu
docker compose up -d

# Dari root project
npm run test:room:onetime

# Watch mode
npm run test:room:onetime:watch
```

**Catatan:**
- Test ini akan create real passcodes di TTLock API
- One-time passcode hanya bisa digunakan 1 kali dalam periode validityHours
- Auto cleanup setelah test selesai

### 5. `ttlock-passcode-custom-temporary.test.js`
Unit test untuk generate custom temporary passcode (user-defined 4-9 digit).

**Test Coverage:**
- ✅ Create Custom Temporary Passcode (4-9 digit user-defined)
- ✅ Passcode Format Validation (4-9 digits)
- ✅ Time Period Validation (WIB to UTC conversion)
- ✅ TTLock Service Integration
- ✅ Database Logging
- ✅ Error Handling

**Cara Menjalankan:**
```bash
# Start database dulu
docker compose up -d

# Dari root project
npm run test:room:custom-temp

# Watch mode
npm run test:room:custom-temp:watch
```

**Catatan:**
- User menentukan passcode sendiri (4-9 digit)
- Test ini akan create real passcodes di TTLock API
- Auto cleanup setelah test selesai

### 6. `ttlock-passcode-custom-permanent.test.js`
Unit test untuk generate custom permanent passcode (user-defined 4-9 digit).

**Test Coverage:**
- ✅ Create Custom Permanent Passcode (4-9 digit user-defined)
- ✅ Passcode Format Validation (4-9 digits)
- ✅ TTLock Service Integration
- ✅ Database Logging
- ✅ Error Handling

**Cara Menjalankan:**
```bash
# Start database dulu
docker compose up -d

# Dari root project
npm run test:room:custom-perm

# Watch mode
npm run test:room:custom-perm:watch
```

**Catatan:**
- User menentukan passcode sendiri (4-9 digit)
- ⚠️ **PENTING:** Passcode harus digunakan dalam 24 jam untuk menjadi permanent
- Test ini akan create real passcodes di TTLock API
- Auto cleanup setelah test selesai

### 7. `ttlock-passcode-history.test.js`
Unit test untuk filter passcode history berdasarkan type, action, dan active status.

**Test Scenarios:**
- ✅ **Test 1:** Type: all, Action: all - Returns all passcode logs
- ✅ **Test 2:** Type: temporary, Action: all - Only temporary passcodes
- ✅ **Test 3:** Type: permanent, Action: all - Only permanent passcodes
- ✅ **Test 4:** Type: onetime, Action: all - Only onetime passcodes
- ✅ **Test 5:** Type: all, Action: deleted - Only deleted passcodes
- ✅ **Test 6:** Active: true - Only active passcodes (not deleted, not expired)
- ✅ **Test 7:** Active: false - Only inactive passcodes (deleted or expired)
- ✅ **Test 8:** Active: true with Type filter - Combined active + type filter
- ✅ **Bonus:** Combined filters + pagination tests

**Test Coverage:**
- ✅ Filter by passcode type (temporary, permanent, onetime)
- ✅ Filter by action (created, deleted)
- ✅ Filter by active status (true = active, false = inactive/expired)
- ✅ Combined filters (type + action, active + type)
- ✅ Pagination (pageNo, pageSize)
- ✅ Response structure validation
- ✅ Database query accuracy

**Active Status Logic:**
- **Active passcode:** Not deleted AND not expired
  - Permanent passcodes: Active unless deleted
  - Temporary/Onetime passcodes: Active if not deleted AND end_date > now
- **Inactive passcode:** Deleted OR expired
  - Deleted passcodes (action = 'deleted')
  - Expired passcodes (end_date < now)

**Prerequisites:**
- Database must be running: `docker compose up -d`
- Test room harus ada di database (Lab 101: `165b57e6-507b-40a0-92dc-05198e947b84`)

**Cara Menjalankan:**
```bash
# Start database dulu
docker compose up -d

# Dari root project
npm test modules/room-management/testing/ttlock-passcode-history.test.js

# Atau dengan npm script
npm run test:room:history
```

**Catatan:**
- Test ini akan create & delete real passcodes di TTLock API:
  - 1 Temporary passcode (dibuat lalu dihapus)
  - 1 Permanent passcode
  - 1 Onetime passcode
- Auto cleanup: semua passcode dan log entries akan dihapus setelah test selesai
- TTLock API calls memiliki delay 2-3 detik untuk menghindari rate limiting
- Total execution time: ~30-45 detik

**Expected Output:**
```
🔍 Setting up passcode history tests...
✓ Test room found: Lab 101
📝 Creating test passcodes...
✓ Test data created successfully

Test Suites: 1 passed, 1 total
Tests:       11 passed, 11 total

🧹 Cleaning up test data...
✓ Cleanup completed
```

### Future Test Files
- `ttlock-passcode-delete.test.js` - Test delete passcode
- `room-crud.test.js` - Test CRUD operations untuk room
- `api-endpoints.test.js` - Test API endpoints dengan JWT


## Prerequisites

Pastikan `.env` sudah dikonfigurasi dengan benar:
```env
TTLOCK_API_URL=https://euapi.ttlock.com
TTLOCK_CLIENT_ID=your_client_id
TTLOCK_CLIENT_SECRET=your_client_secret
TTLOCK_USERNAME=your_username
TTLOCK_PASSWORD=your_password
```

## Test Structure

```
modules/room-management/testing/
├── ttlock-connection.test.js    # TTLock API connection tests
└── README.md                     # This file
```

## Writing New Tests

Untuk menambahkan test baru:

1. Buat file dengan format `*.test.js`
2. Import dependencies dari `@jest/globals`
3. Gunakan `describe()` untuk grouping tests
4. Gunakan `test()` atau `it()` untuk individual test cases
5. Gunakan `expect()` untuk assertions

Contoh:
```javascript
import { describe, test, expect } from '@jest/globals';

describe('Feature Name', () => {
  test('should do something', () => {
    expect(true).toBe(true);
  });
});
```

## CI/CD Integration

Test ini dapat diintegrasikan dengan CI/CD pipeline dengan menjalankan:
```bash
# Test koneksi TTLock API
npm run test:room:connection

# Test semua unit test room-management
npm run test:room:all

# Generate coverage report
npm run test:room:all:coverage
```

Exit code 0 = semua test passed
Exit code 1 = ada test yang failed
