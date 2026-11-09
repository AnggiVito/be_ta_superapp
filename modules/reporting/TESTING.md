# 🎯 Testing Guide - Reporting Module

## Prerequisites

1. ✅ Docker & Docker Compose installed
2. ✅ JWT Token dari AUTH GATEWAY
3. ✅ Excel file dengan format yang benar (lihat TEMPLATE.md)

## Step-by-Step Testing

### 1. Start Services

```bash
# Build dan start
docker-compose up -d --build

# Wait for services to be healthy (30-60 seconds)
docker-compose ps

# Check logs
docker-compose logs -f backend
```

### 2. Verify Health

```bash
# Test health endpoint
curl http://localhost:3000/api/reporting/health

# Expected output:
# {"success":true,"module":"reporting","message":"Reporting module is running"}
```

### 3. Check Swagger Documentation

Open browser: **http://localhost:3000/api-docs**

Navigate to:
- **Reporting** tag - Health check
- **Feedback Upload** tag - Upload & management endpoints
- **Feedback Summary** tag - View & statistics endpoints

### 4. Get JWT Token

**Option A: Dari AUTH GATEWAY**
```bash
curl -X POST https://dev-fri-gateway.virtualfri.id/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"your_username","password":"your_password"}'
```

**Option B: For Testing (if you have access to user-management)**
Create a test user dengan role kaur atau admin.

### 5. Prepare Excel File

Create file `test_feedback.xlsx` dengan kolom:

| NIM | Nama Mahasiswa | Nama Asisten | Feedback |
|-----|----------------|--------------|----------|
| 1234567890 | John Doe | Jane Smith | Asisten sangat membantu dan sabar dalam menjelaskan materi |
| 0987654321 | Alice Johnson | Jane Smith | Penjelasan kurang jelas dan terlalu cepat |
| 1122334455 | Bob Wilson | John Davis | Sangat baik, responsif, dan detail |
| 9988776655 | Charlie Brown | John Davis | Asistennya ramah dan profesional |
| 5544332211 | Diana Prince | Jane Smith | Kurang sabar dalam merespon pertanyaan |

Save as Excel file (.xlsx)

### 6. Upload Feedback

**Using cURL:**
```bash
curl -X POST http://localhost:3000/api/reporting/feedback/upload \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "file=@test_feedback.xlsx" \
  -F "periode=2024/2025 Ganjil" \
  -F "prodi_id=S1-IF" \
  -F "prodi_nama=S1 Informatika" \
  -F "praktikum_id=PRAK-001" \
  -F "praktikum_nama=Praktikum Pemrograman Web"
```

**Using Postman:**
1. Method: POST
2. URL: http://localhost:3000/api/reporting/feedback/upload
3. Headers: 
   - Authorization: Bearer YOUR_JWT_TOKEN
4. Body (form-data):
   - file: [Select Excel file]
   - periode: 2024/2025 Ganjil
   - prodi_id: S1-IF
   - prodi_nama: S1 Informatika
   - praktikum_id: PRAK-001
   - praktikum_nama: Praktikum Pemrograman Web

**Expected Response:**
```json
{
  "success": true,
  "message": "File uploaded and processed successfully",
  "data": {
    "upload": {
      "id": "uuid-here",
      "file_name": "test_feedback.xlsx",
      "status": "processed",
      ...
    },
    "processing_result": {
      "success": true,
      "items_processed": 5,
      "summary": {
        "total_feedback": 5,
        "positive_count": 3,
        "negative_count": 2,
        "neutral_count": 0,
        ...
      }
    }
  }
}
```

### 7. View Statistics

```bash
curl "http://localhost:3000/api/reporting/feedback/statistics?periode=2024/2025%20Ganjil" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "total_feedback": 5,
    "total_uploads": 1,
    "overall_positive_percentage": 60.0,
    "overall_negative_percentage": 40.0,
    "overall_neutral_percentage": 0.0,
    "average_sentiment_score": 0.25,
    "by_praktikum": [...]
  }
}
```

### 8. View Summaries

```bash
curl http://localhost:3000/api/reporting/feedback/summaries \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 9. View Detailed Items

```bash
# Get upload_id from step 6 or 8
curl http://localhost:3000/api/reporting/feedback/items/YOUR_UPLOAD_ID \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Filter by sentiment
curl "http://localhost:3000/api/reporting/feedback/items/YOUR_UPLOAD_ID?sentiment=positive" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 10. View Uploads List

```bash
curl http://localhost:3000/api/reporting/feedback/uploads \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 🧪 Test Cases

### Test Case 1: Upload Valid Excel
- ✅ File format .xlsx
- ✅ Has "Feedback" column
- ✅ File size < 10MB
- ✅ User has role kaur/admin
- **Expected**: Success, status 200

### Test Case 2: Upload Invalid File
- ❌ File format .pdf or .doc
- **Expected**: Error 400, "Invalid file type"

### Test Case 3: Upload Without Auth
- ❌ No Authorization header
- **Expected**: Error 401, "No token provided"

### Test Case 4: View as Kaprodi
- ✅ User role: kaprodi
- ✅ Has prodi_id in JWT
- **Expected**: Only see data for their prodi

### Test Case 5: View as Kaur
- ✅ User role: kaur
- **Expected**: See all data

### Test Case 6: Delete Upload
- ✅ User role: kaur/admin
- ✅ Upload exists
- **Expected**: Success, file deleted

### Test Case 7: Sentiment Analysis
- ✅ Feedback contains positive keywords
- **Expected**: sentiment = "positive", score > 0

## 🐛 Debugging

### Check Database

```bash
# Connect to database
docker exec -it fri-reporting-db psql -U postgres -d reporting_db

# Check tables
\dt

# Check uploads
SELECT id, file_name, status, uploaded_at FROM feedback_uploads;

# Check summaries
SELECT id, total_feedback, positive_count, negative_count FROM feedback_summaries;

# Exit
\q
```

### Check Logs

```bash
# Backend logs
docker-compose logs backend | grep "reporting"

# Database logs
docker logs fri-reporting-db

# All logs
docker-compose logs -f
```

### Check Files

```bash
# Check uploaded files
ls -la uploads/feedback/

# Check migrations
docker exec fri-reporting-db psql -U postgres -d reporting_db -c "\dt"
```

## 📊 Expected Results

After uploading test file with 5 feedbacks (3 positive, 2 negative):

- ✅ `total_feedback`: 5
- ✅ `positive_count`: 3
- ✅ `negative_count`: 2
- ✅ `neutral_count`: 0
- ✅ `positive_percentage`: 60.00
- ✅ `negative_percentage`: 40.00
- ✅ `average_sentiment_score`: ~0.20 to 0.30
- ✅ `top_positive_keywords`: ["membantu", "sabar", "baik", "responsif", ...]
- ✅ `top_negative_keywords`: ["kurang", "tidak", ...]

## ✅ Success Criteria

- [x] Health endpoint returns 200
- [x] Upload endpoint accepts Excel file
- [x] Sentiment analysis works correctly
- [x] Summary generated with correct percentages
- [x] Keywords extracted properly
- [x] RBAC works (kaprodi filtered, kaur sees all)
- [x] Swagger docs accessible
- [x] Database tables created via migration
- [x] Soft delete works

## 🎯 Next Steps

1. Create more test Excel files dengan various sentiments
2. Test dengan large files (near 10MB)
3. Test concurrent uploads
4. Integrate dengan frontend dashboard
5. Add more keywords untuk better accuracy
6. Consider ML-based sentiment analysis untuk production

---

**Happy Testing! 🚀**
