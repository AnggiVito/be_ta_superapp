# FRI Super App Backend

Backend untuk aplikasi super app terintegrasi dengan 1 Frontend (Flutter) dan multiple Backend services. Aplikasi ini menggunakan arsitektur **Modular Monolith** dengan multiple databases.

## Arsitektur

### Hybrid Architecture

- **AUTH GATEWAY**: Microservice terpisah yang berfungsi sebagai jembatan ke SSO Pusat
  - Handle authentication dengan SSO Pusat (external system)
  - Generate JWT dengan custom schema
  - Base URL: `https://dev-fri-gateway.virtualfri.id`

- **Business Modules**: Modular Monolith (1 codebase, struktur modular)
  - Multiple modul business logic
  - Database terpisah per modul
  - Validate JWT dari AUTH GATEWAY
  - Struktur modular dengan isolasi jelas per modul

### Database Strategy

- **Multiple Database**: Setiap modul memiliki database sendiri
- **Data Ownership**: Modul Registrasi sebagai source of truth untuk master data
- **Cross-Module Access**: Modul lain mengakses data dari modul lain melalui service layer (read-only untuk data master)

## Struktur Project

```
backend/
├── docker-compose.yml
├── Dockerfile
├── package.json
├── .env.example
│
├── config/
│   ├── databases.js          # Multiple DB connections
│   ├── redis.js              # Redis configuration
│   └── ttlock.js             # TTLOCK API config
│
├── core/
│   ├── auth/
│   │   └── jwt-validator.js  # JWT validation middleware
│   ├── middleware/
│   │   ├── errorHandler.js
│   │   └── logger.js
│   └── utils/
│
├── modules/
│   ├── registration/         # Source of truth untuk master data
│   │   ├── controllers/
│   │   ├── services/
│   │   ├── models/
│   │   └── routes.js
│   ├── conduct/              # Consumer + Writer
│   │   ├── controllers/
│   │   ├── services/
│   │   ├── models/
│   │   └── routes.js
│   └── [other modules]
│
├── services/
│   └── ttlock/               # TTLOCK API integration
│       ├── ttlockClient.js
│       └── ttlockService.js
│
└── app.js                     # Main entry point
```

## Technology Stack

- **Runtime**: Node.js 20+ LTS
- **Framework**: Express.js
- **Database**: PostgreSQL (multiple databases)
- **JWT**: jsonwebtoken (validation via AUTH GATEWAY)
- **HTTP Client**: axios
- **Validation**: joi
- **Logging**: winston
- **Cache**: Redis (optional)

## Prerequisites

- Docker & Docker Compose
- Node.js 20+ (untuk development lokal)

## Setup & Installation

### 1. Clone repository

```bash
git clone <repository-url>
cd be_practicum
```

### 2. Setup environment variables

Copy `env.example` ke `.env` dan sesuaikan nilai-nilainya:

```bash
cp env.example .env
```

Edit `.env` dengan konfigurasi yang sesuai.

### 3. Run dengan Docker

#### Production Mode

```bash
# Build dan start semua services
docker-compose up -d

# View logs
docker-compose logs -f backend

# Stop services
docker-compose down
```

#### Development Mode

**PENTING**: Untuk development, gunakan `docker-compose.dev.yml` dengan script wrapper untuk memastikan menggunakan `.env.dev` bukan `.env` (production).

```bash
# Setup .env.dev (jika belum ada)
cp env.example .env.dev
# Edit .env.dev dengan konfigurasi development

# Gunakan script wrapper (recommended)
./docker-compose-dev.sh up -d

# Atau gunakan langsung dengan --env-file
docker-compose --env-file .env.dev -f docker-compose.dev.yml up -d

# View logs
docker-compose --env-file .env.dev -f docker-compose.dev.yml logs -f backend

# Stop services
docker-compose --env-file .env.dev -f docker-compose.dev.yml down
```

**Catatan**: Script wrapper (`docker-compose-dev.sh`) memastikan Docker Compose menggunakan `.env.dev` untuk variable substitution, bukan `.env` (production). Ini penting karena Docker Compose secara default menggunakan `.env` untuk substitusi variabel seperti `${JWT_SECRET}`, `${AUTH_GATEWAY_URL}`, dll.

### 4. Development (tanpa Docker)

```bash
# Install dependencies
npm install

# Pastikan PostgreSQL dan Redis berjalan
# Update .env dengan connection details

# Run development server
npm run dev
```

### Puppeteer / PDF generation notes

- This project can generate PDF proposals using Puppeteer (headless Chromium). To enable PDF generation in local development, install Puppeteer:

```powershell
npm install puppeteer --save
```

- When running in Docker, the provided `Dockerfile` uses a Debian-slim base and installs required system libraries for Chromium. Puppeteer will download a compatible Chromium during `npm install` inside the image. The service launches Chromium with `--no-sandbox` which is appropriate for many containerized environments.

If you prefer to avoid shipping Chromium in the image, consider using `puppeteer-core` and a remote Chrome service.

## API Endpoints

### Health Check
- `GET /health` - Application health check
- `GET /api/registration/health` - Registration module health
- `GET /api/conduct/health` - Conduct module health

### Authentication
Semua endpoint (kecuali health check) memerlukan JWT token di header:
```
Authorization: Bearer <token>
```

Token divalidasi melalui AUTH GATEWAY.

## Modul

### Modul Registrasi
- **Database**: `registration_db`
- **Responsibilities**:
  - Master data: Lab, Prodi, Praktikum
  - Jadwal pelaksanaan praktikum
  - CRUD operations untuk semua master data

### Modul Conduct (Pelaksanaan)
- **Database**: `conduct_db`
- **Responsibilities**:
  - **Read**: Mengakses data dari `registration_db` untuk display
  - **Write**: Menyimpan data kehadiran berdasarkan jadwal dari modul registrasi
  - Validasi jadwal dari modul registrasi sebelum menulis kehadiran

## Performance

- **Concurrent Users**: Optimized untuk 4000 users dalam 1 waktu
- **Connection Pooling**: Setiap database menggunakan connection pool
- **Rate Limiting**: Implemented untuk API protection
- **Caching**: Redis untuk data master (optional)

## Database Migration

Untuk panduan lengkap database migration, lihat [documentation/MIGRATION.md](./documentation/MIGRATION.md)

**Quick commands:**
```bash
# Check status
node scripts/migrate-setup.js

# Run migration
npm run migrate:unified <module-name>

# Bootstrap (untuk production)
npm run migrate:bootstrap
```

## Development Guidelines

### Menambah Modul Baru

1. Buat folder baru di `modules/`
2. Buat struktur: `controllers/`, `services/`, `models/`, `routes.js`
3. Setup database connection di `config/databases.js` jika perlu database baru
4. Register routes di `app.js`
5. Setup migration: lihat [documentation/MIGRATION.md](./documentation/MIGRATION.md)

### Cross-Module Access

- Gunakan service layer untuk akses data cross-module
- Jangan akses database modul lain secara langsung
- Dokumentasikan dependencies antar modul

### Error Handling

- Gunakan error handler middleware yang sudah tersedia
- Log semua errors menggunakan winston logger
- Return consistent error response format

## Docker Services

- `backend`: Main application
- `registration_db`: PostgreSQL database untuk modul registrasi
- `conduct_db`: PostgreSQL database untuk modul pelaksanaan (conduct)
- `redis`: Redis cache server

## Logging

Logs tersimpan di:
- Console (development)
- `logs/combined.log` (all logs)
- `logs/error.log` (errors only)

## Troubleshooting

### Database connection error
- Pastikan database containers sudah running: `docker-compose ps`
- Check environment variables di `.env`
- Check database health: `docker-compose logs registration_db`

### Redis connection error
- Redis adalah optional, aplikasi tetap berjalan tanpa Redis
- Check Redis health: `docker-compose logs redis`

## License

ISC

