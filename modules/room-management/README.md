# Room Management Module

> Smart lock (TTLock) integration module for FRI Super App — managing lab rooms, passcodes, fingerprints, IC cards (RFID), and battery monitoring.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js (ESM modules, `"type": "module"`) |
| Framework | Express.js |
| Database | PostgreSQL 16 (`room_management_db`, port 5436 external) |
| Cache | Redis 7 (TTLock token caching) |
| Auth | JWT (shared secret with AUTH GATEWAY) |
| Smart Lock | TTLock / Sciener Cloud API |
| Docs | Swagger (swagger-jsdoc) |
| Validation | Joi |
| Testing | Jest (ESM mode) |

---

## Module Structure

```
modules/room-management/
├── controllers/
│   ├── roomController.js              # CRUD rooms + battery level
│   ├── passcodeController.js          # All passcode operations
│   ├── fingerprintController.js       # Fingerprint list/delete
│   ├── fingerprintSessionController.js # Batch fingerprint registration sessions
│   └── cardController.js              # IC card (RFID) management
├── services/
│   ├── roomService.js                 # Room business logic
│   ├── passcodeService.js             # Passcode business logic
│   ├── fingerprintService.js          # Fingerprint business logic
│   ├── fingerprintSessionService.js   # Session-based fingerprint registration
│   ├── cardService.js                 # IC card logic + reverseCardNumber()
│   └── timezoneUtil.js                # WIB timezone helpers
├── models/
│   ├── roomModel.js                   # rooms table
│   ├── passcodeModel.js               # passcode_logs table
│   ├── fingerprintModel.js            # fingerprint_logs table
│   ├── fingerprintSessionModel.js     # fingerprint_sessions + session_rooms
│   └── cardModel.js                   # card_logs table
├── middleware/
│   ├── roomValidator.js               # Room input validation (Joi)
│   ├── passcodeValidator.js           # Passcode validation
│   ├── fingerprintValidator.js        # Fingerprint validation
│   └── cardValidator.js               # IC card validation
├── migrations/
│   ├── 001_create_rooms_table.sql
│   ├── 002_create_passcode_logs_table.sql
│   ├── 005_add_custom_passcode_types.sql
│   ├── 006_create_fingerprint_logs_table.sql
│   ├── 007_create_fingerprint_sessions_tables.sql
│   └── 008_create_card_logs_table.sql
├── routes.js                          # All route definitions
├── swagger.js                         # Swagger docs (~2100 lines)
└── testing/                           # Integration tests (Jest)
```

### Layered Architecture

```
Route (routes.js)
  → Validator Middleware (middleware/*.js)  — Joi schema validation
    → Controller (controllers/*.js)        — HTTP req/res handling
      → Service (services/*.js)            — Business logic
        → Model (models/*.js)              — Database queries
        → TTLock Service                   — External API calls
```

---

## TTLock Service Layer

Located at `services/ttlock/` (project root level), this is a shared service used by the room-management module.

```
services/ttlock/
├── ttlockClient.js    # Low-level HTTP client — calls TTLock REST API
└── ttlockService.js   # High-level service — adds Redis token caching
```

### Token Flow

```
ttlockService.method()
  → getValidToken()
      → Check Redis for cached token
          → Hit?  Return cached token
          → Miss? Call ttlockClient.getAccessToken()
              → Cache new token in Redis
              → Return new token
  → ttlockClient.method(..., token)
      → HTTP POST to TTLock API
      → Return response
```

### TTLock Client Methods

| Method | TTLock API Endpoint | Description |
|--------|-------------------|-------------|
| `getAccessToken()` | `/oauth2/token` | OAuth2 token exchange |
| `createPermanentPasscode()` | `/v3/keyboardPwd/add` | Type 2 permanent |
| `createTemporaryPasscode()` | `/v3/keyboardPwd/add` | Type 3 temporary |
| `createOnetimePasscode()` | `/v3/keyboardPwd/add` | Type 1 one-time |
| `createOneTimePasscode()` | `/v3/keyboardPwd/add` | One-time with custom dates |
| `createCustomTemporaryPasscode()` | `/v3/keyboardPwd/add` | Type 3 with custom code |
| `createCustomPermanentPasscode()` | `/v3/keyboardPwd/add` | Type 2 with custom code |
| `getPasscodeList()` | `/v3/lock/listKeyboardPwd` | List passcodes |
| `deletePasscode()` | `/v3/keyboardPwd/delete` | Delete passcode |
| `modifyPasscodeName()` | `/v3/keyboardPwd/changeName` | Rename passcode |
| `addFingerprint()` | `/v3/fingerprint/add` | Register fingerprint |
| `getFingerprintList()` | `/v3/fingerprint/list` | List fingerprints |
| `deleteFingerprint()` | `/v3/fingerprint/delete` | Delete fingerprint |
| `getICCardList()` | `/v3/identityCard/list` | List IC cards |
| `addICCard()` | `/v3/identityCard/addForReversedCardNumber` | Add IC card |
| `deleteICCard()` | `/v3/identityCard/delete` | Delete IC card |
| `queryElectricQuantity()` | `/v3/lock/queryElectricQuantity` | Battery level |

> **Important**: `ttlockClient.js` uses `this.request('POST', endpoint, params, accessToken)` for all API calls. All TTLock API calls use POST with `application/x-www-form-urlencoded` body.

---

## API Endpoints

Base path: `/api/room-management`

### Room CRUD

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/rooms` | JWT | List all rooms |
| `GET` | `/rooms/:id` | JWT | Get room by ID |
| `POST` | `/rooms` | JWT | Create room |
| `PUT` | `/rooms/:id` | JWT | Update room |
| `DELETE` | `/rooms/:id` | JWT | Delete room |
| `PATCH` | `/rooms/:id/occupy` | JWT | Mark room occupied |
| `PATCH` | `/rooms/:id/vacate` | JWT | Mark room vacant |
| `GET` | `/rooms/:roomId/battery` | JWT | Get smart lock battery level (0-100%) |

### Passcode Management

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/rooms/:roomId/passcodes` | JWT | List passcodes |
| `POST` | `/rooms/:roomId/passcodes/temporary` | JWT | Create temporary (timed) passcode |
| `POST` | `/rooms/:roomId/passcodes/permanent` | JWT | Create permanent passcode (random 8-digit) |
| `POST` | `/rooms/:roomId/passcodes/onetime` | JWT | Create one-time passcode |
| `POST` | `/rooms/:roomId/passcodes/custom/temporary` | JWT | Custom temporary (user picks 4-9 digits) |
| `POST` | `/rooms/:roomId/passcodes/custom/permanent` | JWT | Custom permanent (user picks 4-9 digits) |
| `DELETE` | `/rooms/:roomId/passcodes/:passcodeId` | JWT | Delete passcode |

### Fingerprint Management

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/rooms/:roomId/fingerprints` | JWT | List fingerprints on lock |
| `DELETE` | `/rooms/:roomId/fingerprints/:fingerprintId` | JWT | Delete fingerprint |

### Fingerprint Registration Sessions

Batch fingerprint registration across multiple rooms. The lock must be physically present for enrollment.

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/fingerprint-sessions` | JWT | Create session (snapshot baseline) |
| `GET` | `/fingerprint-sessions` | JWT | List all sessions |
| `GET` | `/fingerprint-sessions/:sessionId` | JWT | Get session with room statuses |
| `POST` | `/fingerprint-sessions/:sessionId/check` | JWT | Poll for newly detected fingerprints |
| `PATCH` | `/fingerprint-sessions/:sessionId/cancel` | JWT | Cancel session |

**Session Flow:**
1. **Create session** → Snapshots current fingerprints on each selected lock (baseline)
2. **User physically places finger** on the lock hardware
3. **Poll `/check`** → API compares current fingerprint list vs. baseline → detects new fingerprint
4. **Auto-completes** when all rooms have new fingerprints detected

### IC Card (RFID) Management

Remote card registration via WiFi gateway — no physical lock visit needed.

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/rooms/:roomId/cards` | JWT | List IC cards on lock |
| `POST` | `/rooms/:roomId/cards` | JWT | Add card (USB reader number) |
| `DELETE` | `/rooms/:roomId/cards/:cardId` | JWT | Delete card |

**Card Number Format:**
- USB RFID reader outputs a decimal number (e.g., `2672633271`)
- Pass this number **directly** to the API as `cardNumber`
- The TTLock API endpoint `addForReversedCardNumber` handles byte-reversal internally
- Do **NOT** reverse the number in our code

**Permanent vs Timed Cards:**
- **Permanent**: Omit `startDate` / `endDate` in request body
- **Timed**: Include both `startDate` and `endDate` (ISO 8601)

---

## Database Schema

Database: `room_management_db` (PostgreSQL 16, Docker port `5436`)

### `rooms`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | Auto-generated |
| `name` | VARCHAR | Room name (e.g., "Lab 101") |
| `description` | TEXT | Room description |
| `door_lock_id` | INTEGER | TTLock lock ID (nullable) |
| `is_occupied` | BOOLEAN | Occupancy status |
| `capacity` | INTEGER | Room capacity |

### `passcode_logs`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | Auto-generated |
| `room_id` | UUID (FK) | → rooms |
| `lock_id` | VARCHAR | TTLock lock ID |
| `passcode_id` | INTEGER | TTLock passcode ID |
| `passcode` | VARCHAR | Actual passcode value |
| `passcode_type` | VARCHAR | permanent / temporary / onetime / custom_temporary / custom_permanent |
| `action` | VARCHAR | created / deleted |
| `start_date` | TIMESTAMP | Validity start |
| `end_date` | TIMESTAMP | Validity end |
| `metadata` | JSONB | TTLock response and extra data |

### `fingerprint_logs`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | Auto-generated |
| `room_id` | UUID (FK) | → rooms |
| `lock_id` | VARCHAR | TTLock lock ID |
| `fingerprint_id` | INTEGER | TTLock fingerprint ID |
| `action` | VARCHAR | created / deleted |
| `metadata` | JSONB | Extra data |

### `fingerprint_sessions` + `fingerprint_session_rooms`

| Table | Key Columns |
|-------|-------------|
| `fingerprint_sessions` | `id` (UUID), `person_name`, `status` (ongoing/completed/cancelled), `created_by` |
| `fingerprint_session_rooms` | `session_id` (FK), `room_id` (FK), `lock_id`, `status` (pending/done), `known_fingerprint_ids` (JSONB baseline), `fingerprint_id` (detected result) |

### `card_logs`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | Auto-generated |
| `room_id` | UUID (FK) | → rooms |
| `lock_id` | VARCHAR | TTLock lock ID |
| `card_id` | INTEGER | TTLock card ID |
| `card_number` | VARCHAR | Card number (USB reader decimal format) |
| `card_name` | VARCHAR | Card label |
| `action` | VARCHAR | created / deleted |
| `start_date` | TIMESTAMP | Validity start (nullable = permanent) |
| `end_date` | TIMESTAMP | Validity end (nullable = permanent) |
| `metadata` | JSONB | TTLock response data |

### Running Migrations

Migrations are run manually via Docker:

```bash
# Example: run card_logs migration
Get-Content modules/room-management/migrations/008_create_card_logs_table.sql | docker exec -i room_management_db psql -U postgres -d room_management_db
```

---

## Testing

Tests are integration tests that call the **real TTLock API** (not mocked). They require Docker services running.

### Prerequisites
- `docker compose up -d` (from project root)
- Test DB accessible at `localhost:5436`
- TTLock API credentials in `.env`
- WiFi gateway online (for lock communication)

### Test Scripts

```bash
cd modules/room-management

npm run test:connection                  # TTLock API connectivity
npm run test:passcode:temporary          # Temporary passcode CRUD
npm run test:passcode:permanent          # Permanent passcode CRUD
npm run test:passcode:onetime            # One-time passcode CRUD
npm run test:passcode:custom-temporary   # Custom temporary passcode
npm run test:passcode:custom-permanent   # Custom permanent passcode
npm run test:passcode:history            # Passcode history/logging
npm run test:fingerprint:session         # Fingerprint session flow
npm run test:card                        # IC card CRUD + logging
npm run test:battery                     # Battery level query

npm run test:all                         # Run everything
npm run test:all:coverage                # With coverage report
```

### Test Database Config

Tests use `testing/testDatabaseConfig.js` which connects to `localhost:5436` (the external-mapped port of the `room_management_db` Docker container).

### Test Pattern

Each test file follows this pattern:
1. **beforeAll**: Connect to test DB, find test room (Lab 101, lock ID `12405430`)
2. **Test groups**: Create resource → Verify → Cleanup (delete)
3. **afterAll**: Close DB connection, cleanup any leftover test data
4. **Rate limiting**: 1-second delays between TTLock API calls

---

## Environment Variables (Room Management Specific)

| Variable | Description |
|----------|-------------|
| `ROOM_MANAGEMENT_DB_HOST` | DB host (Docker: `room_management_db`, test: `localhost`) |
| `ROOM_MANAGEMENT_DB_PORT` | DB port (Docker: `5432`, external: `5436`) |
| `ROOM_MANAGEMENT_DB_USER` | DB user (default: `postgres`) |
| `ROOM_MANAGEMENT_DB_PASSWORD` | DB password |
| `ROOM_MANAGEMENT_DB_NAME` | DB name (`room_management_db`) |
| `TTLOCK_API_URL` | `https://api.ttlock.com` |
| `TTLOCK_CLIENT_ID` | From TTLock developer portal |
| `TTLOCK_CLIENT_SECRET` | From TTLock developer portal |
| `REDIS_HOST` | Redis host for token caching |
| `REDIS_PORT` | Redis port (default: `6379`) |

---

## Important Design Decisions

1. **Card numbers are NOT reversed by our code.** The TTLock API endpoint `addForReversedCardNumber` accepts the USB reader's decimal output directly and handles byte-reversal internally. The `reverseCardNumber()` function in `cardService.js` exists as a utility but is NOT called in the `addCard` flow.

2. **IC cards and passcodes use WiFi gateway** (`addType=2`, `deleteType=2`) for remote management — no physical lock visit needed.

3. **Fingerprints require physical enrollment.** The session-based approach (snapshot baseline → poll for new) handles multi-room registration.

4. **All operations are audit-logged** in `*_logs` tables with JSONB `metadata` columns containing full TTLock API responses.

5. **Token caching in Redis** — TTLock access tokens are cached with TTL. This avoids hitting the OAuth2 endpoint on every request.

6. **All TTLock API calls use POST** with `application/x-www-form-urlencoded` content type, even for read operations like listing and querying.

7. **Swagger documentation** is in `swagger.js` (~2100 lines) using JSDoc annotations. Tags: `Room Management`, `Passcode Management`, `Fingerprint Management`, `IC Card Management`.
