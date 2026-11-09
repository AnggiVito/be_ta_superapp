# Modul Reporting

Modul laporan FRI Super App: **Feedback** (exit survey), **Kehadiran** (BAP), **Nilai** praktikum, dan **Keuangan** (KPA).

> **API aktif (conduct):** lihat **[API.md](./API.md)** untuk daftar endpoint Feedback / Kehadiran / Nilai yang digunakan frontend saat ini.  
> Dokumentasi di bawah ini mencakup sejarah modul **Feedback Excel** (upload & sentiment) dan setup database.

## 📋 Daftar Isi

- [API Conduct (current)](./API.md)
- [Overview](#overview)
- [Fitur Utama](#fitur-utama)
- [Arsitektur](#arsitektur)
- [Database Schema](#database-schema)
- [API Endpoints](#api-endpoints)
- [Sentiment Analysis](#sentiment-analysis)
- [Format Excel](#format-excel)
- [RBAC & Permissions](#rbac--permissions)
- [Setup & Migration](#setup--migration)
- [Contoh Penggunaan](#contoh-penggunaan)

## 🎯 Overview

Modul Reporting menyediakan:

1. **Feedback (conduct)** — agregat exit survey untuk staf; respons pribadi & status survey untuk mahasiswa
2. **Kehadiran** — laporan BAP read-only dengan filter semester & scope persona
3. **Nilai** — agregasi per modul (+ rubrik registrasi) dengan fallback per sesi
4. **Keuangan (KPA)** — upload Excel, periode, anggaran prodi
5. **Feedback Excel (legacy)** — upload & sentiment analysis dari file Excel

**Role Access (conduct reporting):**
- **Staf** (kaprodi, kaur, laboran, koordinator, …): agregat prodi/lab/praktikum
- **Mahasiswa / asisten (member)**: data ter-scope (`view_mode`: mine / handled)

**Role Access (legacy Excel):**
- **Kaprodi**: View data prodi-nya sendiri
- **Kaur**: View & manage semua data
- **Laboran**: View semua data
- **Koordinator Praktikum**: View & manage semua data
- **Admin**: Full access

## ✨ Fitur Utama

### 1. Upload & Processing
- Upload file Excel (.xlsx, .xls)
- Parsing otomatis dengan validasi
- Processing async dengan status tracking
- Max file size: 10MB

### 2. Sentiment Analysis
- Analisis berbasis keyword (Indonesian & English)
- Sentiment score: -1.0 (negative) to 1.0 (positive)
- Kategori: positive, negative, neutral
- Real-time processing

### 3. Summary & Statistics
- Total feedback per praktikum/prodi/periode
- Percentage breakdown (positive/negative/neutral)
- Average sentiment score
- Top positive & negative keywords
- Aggregated statistics

### 4. Role-Based Filtering
- Kaprodi: Auto-filter by prodi_id
- Kaur/Laboran/Admin: View all data
- Fine-grained access control

## 🏗️ Arsitektur

### Database

- **Database**: `reporting_db` (PostgreSQL)
- **Connection Pool**: Dikonfigurasi di `config/databases.js` sebagai `reportingDb`
- **Tables**: `feedback_uploads`, `feedback_items`, `feedback_summaries`

### Flow

```
Upload Excel → Parse → Sentiment Analysis → Bulk Insert → Generate Summary → Response
```

## 🗄️ Database Schema

### Tabel `feedback_uploads`

Menyimpan informasi file Excel yang diupload.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `file_name` | VARCHAR(255) | Nama file asli |
| `file_path` | VARCHAR(500) | Path file di server |
| `file_size` | INTEGER | Ukuran file (bytes) |
| `uploaded_by` | VARCHAR(255) | User ID dari AUTH GATEWAY |
| `uploaded_at` | TIMESTAMP | Waktu upload |
| `periode` | VARCHAR(50) | Contoh: "2024/2025 Ganjil" |
| `prodi_id` | VARCHAR(100) | Reference ke prodi |
| `praktikum_id` | VARCHAR(100) | Reference ke praktikum |
| `status` | VARCHAR(50) | pending, processing, processed, failed |
| `processed_at` | TIMESTAMP | Waktu selesai processing |

### Tabel `feedback_items`

Menyimpan data feedback individual dari Excel.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `upload_id` | UUID | Foreign key ke feedback_uploads |
| `row_number` | INTEGER | Nomor baris di Excel |
| `mahasiswa_nim` | VARCHAR(50) | NIM mahasiswa |
| `mahasiswa_nama` | VARCHAR(255) | Nama mahasiswa |
| `asisten_nama` | VARCHAR(255) | Nama asisten |
| `feedback_text` | TEXT | Teks feedback |
| `sentiment` | VARCHAR(20) | positive, negative, neutral |
| `sentiment_score` | DECIMAL(5,4) | -1.0 to 1.0 |

### Tabel `feedback_summaries`

Menyimpan hasil aggregasi/summary feedback.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `upload_id` | UUID | Foreign key ke feedback_uploads |
| `periode` | VARCHAR(50) | Periode akademik |
| `prodi_id` | VARCHAR(100) | ID Prodi |
| `prodi_nama` | VARCHAR(255) | Nama Prodi |
| `praktikum_id` | VARCHAR(100) | ID Praktikum |
| `praktikum_nama` | VARCHAR(255) | Nama Praktikum |
| `total_feedback` | INTEGER | Total feedback |
| `positive_count` | INTEGER | Jumlah feedback positif |
| `negative_count` | INTEGER | Jumlah feedback negatif |
| `neutral_count` | INTEGER | Jumlah feedback netral |
| `positive_percentage` | DECIMAL(5,2) | Persentase positif |
| `negative_percentage` | DECIMAL(5,2) | Persentase negatif |
| `neutral_percentage` | DECIMAL(5,2) | Persentase netral |
| `average_sentiment_score` | DECIMAL(5,4) | Average score |
| `top_positive_keywords` | TEXT[] | Array keyword positif |
| `top_negative_keywords` | TEXT[] | Array keyword negatif |

## 🔌 API Endpoints

### Upload Feedback

```http
POST /api/reporting/feedback/upload
Content-Type: multipart/form-data
Authorization: Bearer <token>

file: [Excel file]
periode: "2024/2025 Ganjil"
prodi_id: "S1-IF"
prodi_nama: "S1 Informatika"
praktikum_id: "PRAK-001"
praktikum_nama: "Praktikum Pemrograman Web"
```

**Access**: kaur, koordinator_praktikum, admin

### Get Summaries

```http
GET /api/reporting/feedback/summaries?periode=2024/2025 Ganjil&limit=10
Authorization: Bearer <token>
```

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "upload_id": "uuid",
      "periode": "2024/2025 Ganjil",
      "total_feedback": 150,
      "positive_count": 100,
      "negative_count": 30,
      "neutral_count": 20,
      "positive_percentage": 66.67,
      "negative_percentage": 20.0,
      "neutral_percentage": 13.33,
      "average_sentiment_score": 0.45,
      "overall_sentiment": "positive",
      "top_positive_keywords": ["membantu", "sabar", "jelas"],
      "top_negative_keywords": ["lambat", "kurang"],
      "generated_at": "2024-11-15T08:00:00Z"
    }
  ]
}
```

**Field `overall_sentiment`** adalah **sentimen keseluruhan** dari semua feedback dalam file Excel yang di-upload:
- `"positive"`: Feedback keseluruhan cenderung positif (average_score > 0.15 atau positive_percentage > 60%)
- `"negative"`: Feedback keseluruhan cenderung negatif (average_score < -0.15 atau negative_percentage > 60%)
- `"neutral"`: Feedback keseluruhan netral (antara -0.15 hingga 0.15)

**Catatan**: Data ini adalah untuk **keseluruhan fakultas**, tidak difilter per prodi.

**Access**: kaprodi, kaur, laboran, koordinator_praktikum, admin

### Get Statistics

```http
GET /api/reporting/feedback/statistics?periode=2024/2025 Ganjil
Authorization: Bearer <token>
```

**Response**:
```json
{
  "success": true,
  "data": {
    "total_feedback": 500,
    "total_uploads": 5,
    "overall_positive_percentage": 65.5,
    "overall_negative_percentage": 22.3,
    "overall_neutral_percentage": 12.2,
    "average_sentiment_score": 0.42
  }
}
```

**Catatan**: Statistik untuk **keseluruhan fakultas**.

### Get Feedback Items

```http
GET /api/reporting/feedback/items/:uploadId?sentiment=positive
Authorization: Bearer <token>
```

**Access**: kaprodi, kaur, laboran, koordinator_praktikum, admin

### Delete Upload

```http
DELETE /api/reporting/feedback/uploads/:uploadId
Authorization: Bearer <token>
```

**Access**: kaur, koordinator_praktikum, admin

## 🧠 Sentiment Analysis

### Algoritma

Menggunakan keyword-based sentiment analysis dengan:

1. **Positive Keywords** (Indonesian & English):
   - baik, bagus, hebat, luar biasa, sempurna, memuaskan
   - membantu, ramah, sabar, pintar, profesional, responsif
   - good, great, excellent, amazing, helpful, friendly

2. **Negative Keywords** (Indonesian & English):
   - buruk, jelek, tidak baik, kurang, lambat, tidak jelas
   - tidak membantu, kecewa, tidak puas, susah, ribet
   - bad, poor, terrible, awful, unclear, slow

### Scoring

- **Score Range**: -1.0 (most negative) to 1.0 (most positive)
- **Formula**: `(positive_count - negative_count) / total_keywords`
- **Classification**:
  - `score > 0.2` → **positive**
  - `score < -0.2` → **negative**
  - `-0.2 ≤ score ≤ 0.2` → **neutral**

### Keyword Extraction

- Extract kata dengan panjang > 3 karakter
- Sort by frequency
- Return top 10 keywords

## 📊 Format Excel

File Excel harus memiliki kolom berikut (case-insensitive):

### Kolom Data Mahasiswa (Optional)

| Kolom | Alias | Required | Description |
|-------|-------|----------|-------------|
| NIM | nim, Nim | Optional | NIM mahasiswa |
| Nama Mahasiswa | nama mahasiswa, Nama, nama | Optional | Nama mahasiswa |
| Nama Asisten | nama asisten, Asisten, asisten | Optional | Nama asisten |

**Catatan**: Data ini adalah untuk **keseluruhan fakultas**, tidak dipecah per prodi atau praktikum.

### Kolom Feedback (Minimal Salah Satu Harus Ada)

| Kolom | Alias | Description |
|-------|-------|-------------|
| Kritik dan Saran terhadap kondisi ruangan praktikum | kritik ruangan | Feedback tentang kondisi ruangan |
| Kritik dan Saran terhadap kondisi alat/perangkat praktikum | kritik alat | Feedback tentang alat/perangkat |
| Kritik dan Saran terhadap praktikum | kritik praktikum | Feedback tentang praktikum secara umum |
| Feedback | feedback, Komentar, komentar | Feedback generik (fallback) |

**Catatan**:
- Sistem akan membaca **semua kolom feedback** yang tersedia
- Setiap kolom feedback akan menjadi entry terpisah dengan kategori masing-masing
- Jika mahasiswa memberikan feedback di 3 kolom, akan ada 3 entry feedback
- Kategori otomatis: `[Ruangan]`, `[Alat/Perangkat]`, `[Praktikum]`, atau `[Umum]`

### Contoh Format 1: Multiple Feedback Columns

| NIM | Nama Mahasiswa | Nama Asisten | Kritik dan Saran terhadap kondisi ruangan praktikum | Kritik dan Saran terhadap kondisi alat/perangkat praktikum | Kritik dan Saran terhadap praktikum |
|-----|----------------|--------------|------------------------------------------------------|-------------------------------------------------------------|--------------------------------------|
| 1234567890 | John Doe | Jane Smith | Ruangan terlalu panas dan kurang AC | Komputer sering hang, perlu upgrade | Waktu praktikum terlalu singkat |
| 0987654321 | Alice Bob | Jane Smith | Ruangan bersih dan nyaman | Alat lengkap dan berfungsi baik | Materi praktikum sangat membantu |

**Hasil parsing**: 6 feedback entries (3 per mahasiswa)

### Contoh Format 2: Generic Feedback Column

| NIM | Nama Mahasiswa | Nama Asisten | Feedback |
|-----|----------------|--------------|----------|
| 1234567890 | John Doe | Jane Smith | Asisten sangat membantu dan sabar |
| 0987654321 | Alice Bob | Jane Smith | Penjelasan kurang jelas |

**Hasil parsing**: 2 feedback entries

## 🔐 RBAC & Permissions

### Permission Matrix

| Action | Kaprodi | Kaur | Laboran | Koordinator | Admin |
|--------|---------|------|---------|-------------|-------|
| Upload feedback | ❌ | ✅ | ❌ | ✅ | ✅ |
| View summaries | ✅ (own prodi) | ✅ | ✅ | ✅ | ✅ |
| View statistics | ✅ (own prodi) | ✅ | ✅ | ✅ | ✅ |
| View items | ✅ (own prodi) | ✅ | ✅ | ✅ | ✅ |
| Delete upload | ❌ | ✅ | ❌ | ✅ | ✅ |

### Auto-Filtering

- **Kaprodi**: Otomatis di-filter berdasarkan `prodi_id` mereka
- **Others**: Dapat melihat semua data (tidak di-filter)

## 🚀 Setup & Migration

### 1. Environment Variables

Pastikan `.env` memiliki konfigurasi:

```env
# Reporting Database
REPORTING_DB_HOST=reporting_db
REPORTING_DB_PORT=5432
REPORTING_DB_USER=postgres
REPORTING_DB_PASSWORD=postgres
REPORTING_DB_NAME=reporting_db
```

### 2. Docker Setup

```bash
# Start services
docker-compose up -d

# Check logs
docker-compose logs -f backend
```

### 3. Migration

Migration akan berjalan otomatis saat startup. Untuk manual migration:

```bash
# Via Docker
docker exec -i fri-reporting-db psql -U postgres -d reporting_db < modules/reporting/migrations/001_create_feedback_tables.sql

# Via psql langsung
psql -U postgres -d reporting_db -f modules/reporting/migrations/001_create_feedback_tables.sql
```

### 4. Verify Setup

```bash
curl http://localhost:3000/api/reporting/health
```

Expected response:
```json
{
  "success": true,
  "module": "reporting",
  "message": "Reporting module is running"
}
```

## 💡 Contoh Penggunaan

### 1. Upload Feedback

```bash
curl -X POST http://localhost:3000/api/reporting/feedback/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@feedback.xlsx" \
  -F "periode=2024/2025 Ganjil" \
  -F "prodi_id=S1-IF" \
  -F "prodi_nama=S1 Informatika" \
  -F "praktikum_id=PRAK-001" \
  -F "praktikum_nama=Praktikum Pemrograman Web"
```

### 2. View Statistics

```bash
curl http://localhost:3000/api/reporting/feedback/statistics?periode=2024/2025%20Ganjil \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 3. Export to Frontend

```javascript
// Fetch statistics
const response = await fetch('/api/reporting/feedback/statistics?periode=2024/2025 Ganjil', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const data = await response.json();

// Display in chart
const chartData = {
  labels: ['Positive', 'Negative', 'Neutral'],
  datasets: [{
    data: [
      data.data.overall_positive_percentage,
      data.data.overall_negative_percentage,
      data.data.overall_neutral_percentage
    ]
  }]
};
```

## 📝 Catatan Penting

1. **File Size**: Max 10MB per upload
2. **File Format**: Hanya .xlsx dan .xls
3. **Processing**: Async processing, check status via `feedback_uploads`
4. **Soft Delete**: Semua operasi delete menggunakan soft delete
5. **Auto-Migration**: Migration berjalan otomatis saat startup
6. **Role Filtering**: Kaprodi otomatis di-filter by prodi_id
7. **Keywords**: Mendukung Indonesian & English keywords

## 🐛 Troubleshooting

### Upload Failed

```bash
# Check file format
file feedback.xlsx

# Check file size
ls -lh feedback.xlsx

# Check logs
docker-compose logs backend | grep "reporting"
```

### Database Error

```bash
# Check database
docker exec -it fri-reporting-db psql -U postgres -d reporting_db -c "\dt"

# Check migrations
docker-compose logs backend | grep "migration"
```

### Sentiment Analysis Not Working

- Pastikan feedback text tidak kosong
- Check keyword list di `services/feedbackService.js`
- Review processing logs

## 🧪 Testing

Route wiring tests untuk endpoint conduct reporting (feedback member/staf, kehadiran, nilai):

```bash
cd be_practicum
npm run test:reporting
```

| File | Cakupan |
|------|---------|
| `tests/reportingRoutes.test.js` | Route wiring + auth 401 |
| `tests/feedbackMemberReportService.test.js` | Summary, list, detail exit survey member |
| `tests/nilaiModuleService.test.js` | Agregasi nilai modul, rubrik, final score |

Lihat [API.md](./API.md) untuk daftar endpoint.

## 📚 Related Documentation

- [API Conduct (current)](./API.md)
- [Main README](../../README.md)
- [User Management Module](../user-management/README.md)
- [Swagger API Docs](http://localhost:3000/api-docs) — tag `Reporting - Feedback Member`, `Kehadiran`, `Nilai`

---

**Last Updated**: June 2026
**Version**: 1.0.0
