# Quick Start - Reporting Module

## 🚀 Deployment Steps

### 1. Install Dependencies

```bash
npm install
```

### 2. Update Environment Variables

Pastikan `.env` memiliki konfigurasi reporting database:

```env
# Reporting Database
REPORTING_DB_HOST=reporting_db
REPORTING_DB_PORT=5432
REPORTING_DB_USER=postgres
REPORTING_DB_PASSWORD=postgres
REPORTING_DB_NAME=reporting_db
```

### 3. Start Docker Containers

```bash
# Build dan start semua services
docker-compose up -d --build

# Check logs
docker-compose logs -f backend
```

### 4. Verify Setup

```bash
# Check health endpoint
curl http://localhost:3000/api/reporting/health

# Expected response:
# {"success":true,"module":"reporting","message":"Reporting module is running"}
```

### 5. Access Swagger Documentation

Open browser: http://localhost:3000/api-docs

Cari section **"Reporting"** dan **"Feedback Upload"** untuk melihat semua endpoint.

## 📝 Testing Endpoints

### Upload Feedback (Postman/cURL)

```bash
curl -X POST http://localhost:3000/api/reporting/feedback/upload \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "file=@path/to/feedback.xlsx" \
  -F "periode=2024/2025 Ganjil" \
  -F "prodi_id=S1-IF" \
  -F "prodi_nama=S1 Informatika" \
  -F "praktikum_id=PRAK-001" \
  -F "praktikum_nama=Praktikum Pemrograman Web"
```

### Get Statistics

```bash
curl http://localhost:3000/api/reporting/feedback/statistics \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Get Summaries

```bash
curl "http://localhost:3000/api/reporting/feedback/summaries?periode=2024/2025%20Ganjil" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 🔑 Role Requirements

### Upload & Manage (POST/DELETE)
- kaur
- koordinator_praktikum
- admin

### View Reports (GET)
- kaprodi (filtered by prodi_id)
- kaur
- laboran
- koordinator_praktikum
- admin

## 📊 Excel Template

File Excel harus memiliki kolom:
- **Feedback** (Required)
- NIM (Optional)
- Nama Mahasiswa (Optional)
- Nama Asisten (Optional)

Lihat `modules/reporting/TEMPLATE.md` untuk detail lengkap.

## 🐛 Common Issues

### Database Connection Error

```bash
# Check if reporting_db container is running
docker ps | grep reporting-db

# Check database logs
docker logs fri-reporting-db

# Test connection manually
docker exec -it fri-reporting-db psql -U postgres -d reporting_db -c "SELECT 1;"
```

### Migration Not Running

```bash
# Check migration logs
docker-compose logs backend | grep "reporting"

# Run migration manually
docker exec -i fri-reporting-db psql -U postgres -d reporting_db < modules/reporting/migrations/001_create_feedback_tables.sql
```

### File Upload Error

```bash
# Check uploads directory
ls -la uploads/feedback/

# Create directory if not exists
mkdir -p uploads/feedback

# Check file permissions
chmod 755 uploads/feedback
```

## 📚 Documentation

- Full Module Docs: `modules/reporting/README.md`
- Excel Template: `modules/reporting/TEMPLATE.md`
- Swagger API: http://localhost:3000/api-docs

## 🎯 Next Steps

1. Create test Excel file dengan format yang benar
2. Get JWT token dari AUTH GATEWAY
3. Upload feedback via API
4. View results di endpoint statistics/summaries
5. Integrate dengan frontend dashboard

---

Module created: November 2025
