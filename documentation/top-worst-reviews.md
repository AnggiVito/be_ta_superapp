# Top & Worst Reviews Summary Feature

## Overview
Fitur ini menghasilkan **summary text gabungan** dari review terbaik (paling positif) dan terburuk (paling negatif) dari feedback mahasiswa. Summary ini **tidak menampilkan identitas mahasiswa** dan menggabungkan poin-poin utama dari multiple reviews menjadi satu ringkasan yang kohesif.

## Endpoint

### GET `/api/reporting/feedback/reviews/top-worst`

Mendapatkan summary gabungan (aggregated) dari review positif dan negatif tanpa identitas personal.

**Authentication:** Required (Bearer Token)

**Authorization:** 
- kaprodi
- kaur
- laboran
- koordinator_praktikum
- admin

**Query Parameters:**
- `upload_id` (optional, uuid): Filter berdasarkan upload ID tertentu
- `periode` (optional, string): Filter berdasarkan periode (contoh: "2024/2025 Ganjil")
- `limit` (optional, integer): Jumlah review yang dianalisis untuk generate summary (default: 10, max: 50)

**Example Request:**
```bash
GET /api/reporting/feedback/reviews/top-worst?periode=2024/2025 Ganjil&limit=15
Authorization: Bearer <your-jwt-token>
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "top_review_summary": {
      "text": "Berdasarkan 15 feedback positif terbaik, asisten praktikum dinilai mampu menjelaskan materi dengan baik dan mudah dipahami. Mahasiswa mengapresiasi sikap asisten yang ramah, sabar, dan sopan dalam membimbing. Asisten juga dinilai responsif dan cepat tanggap dalam membantu mahasiswa. Kompetensi dan penguasaan materi asisten mendapat apresiasi tinggi.",
      "count": 15,
      "average_score": 0.856,
      "key_points": [
        {
          "theme": "mengajar/menjelaskan",
          "frequency": 12,
          "examples": ["jelas", "mudah dipahami", "detail"]
        },
        {
          "theme": "sikap",
          "frequency": 10,
          "examples": ["ramah", "sabar", "sopan"]
        },
        {
          "theme": "responsif",
          "frequency": 8,
          "examples": ["cepat tanggap", "responsif", "membantu"]
        }
      ]
    },
    "worst_review_summary": {
      "text": "Berdasarkan 15 feedback yang perlu perhatian, mahasiswa mengidentifikasi beberapa area yang perlu perbaikan seperti: penjelasan materi yang kurang jelas, respons yang lambat terhadap pertanyaan mahasiswa, sikap yang kurang ramah atau kurang sabar.",
      "count": 15,
      "average_score": -0.723,
      "key_points": [
        {
          "theme": "kurang jelas",
          "frequency": 9,
          "examples": ["tidak jelas", "kurang jelas", "sulit dipahami"]
        },
        {
          "theme": "tidak responsif",
          "frequency": 6,
          "examples": ["lambat", "lama", "susah dihubungi"]
        },
        {
          "theme": "sikap",
          "frequency": 5,
          "examples": ["galak", "tidak ramah", "tidak sabar"]
        }
      ]
    },
    "metadata": {
      "periode": "2024/2025 Ganjil",
      "total_reviews_analyzed": 30,
      "sentiment_gap": 1.579
    }
  }
}
```

## Features

### 1. Aggregated Summary Text
- **Tidak menampilkan identitas mahasiswa** (NIM, nama, dll)
- **Menggabungkan poin-poin utama** dari multiple reviews
- **Teks yang kohesif dan mudah dibaca** untuk kaprodi/koordinator

### 2. Key Points Extraction
- Mengidentifikasi **tema-tema utama** dari feedback
- Menghitung **frekuensi kemunculan** setiap tema
- Menyediakan **contoh kata kunci** yang sering muncul

### 3. Positive Themes Detected
- **Mengajar/menjelaskan**: Kualitas penyampaian materi
- **Sikap**: Attitude dan perilaku asisten
- **Responsif**: Kecepatan tanggap dan bantuan
- **Kompetensi**: Penguasaan materi dan profesionalisme

### 4. Negative Themes Detected
- **Kurang jelas**: Masalah dalam penyampaian materi
- **Sikap**: Attitude yang perlu diperbaiki
- **Tidak responsif**: Lambat dalam merespon
- **Kurang kompeten**: Penguasaan materi yang perlu ditingkatkan

## Use Cases

### 1. Executive Dashboard
Menampilkan ringkasan feedback untuk kaprodi:
```
"Berdasarkan 20 feedback positif terbaik, asisten praktikum dinilai 
mampu menjelaskan materi dengan baik dan mudah dipahami..."
```

### 2. Performance Report
Untuk laporan evaluasi asisten tanpa expose identitas mahasiswa:
- Summary poin kuat (strengths)
- Summary area improvement (weaknesses)
- Gap analysis (perbedaan sentiment)

### 3. Action Items
Mengidentifikasi prioritas perbaikan:
- Tema dengan frekuensi tertinggi = prioritas utama
- Contoh kata kunci = detail spesifik untuk ditangani

## Privacy & Anonymity

✅ **Tidak menampilkan:**
- NIM mahasiswa
- Nama mahasiswa
- Nama asisten spesifik
- Feedback text individual

✅ **Hanya menampilkan:**
- Summary text gabungan
- Tema-tema utama
- Statistik agregat
- Kata kunci umum

## Algorithm

### Text Aggregation Process:

1. **Fetch Reviews**: Ambil top N positive dan worst N negative reviews
2. **Theme Extraction**: Identifikasi tema dari keyword matching
3. **Frequency Counting**: Hitung frekuensi kemunculan setiap tema
4. **Summary Generation**: Generate teks kohesif berdasarkan tema yang terdeteksi
5. **Key Points**: Sort tema berdasarkan frequency (top 3)

### Sentiment Themes:

**Positive Keywords:**
```javascript
{
  'mengajar/menjelaskan': ['jelas', 'baik', 'mudah dipahami', 'detail', 'terstruktur'],
  'sikap': ['ramah', 'sabar', 'baik hati', 'sopan', 'humble', 'friendly'],
  'responsif': ['cepat tanggap', 'responsif', 'membantu', 'komunikatif'],
  'kompetensi': ['pintar', 'kompeten', 'profesional', 'menguasai', 'ahli']
}
```

**Negative Keywords:**
```javascript
{
  'kurang jelas': ['tidak jelas', 'kurang jelas', 'bingung', 'sulit dipahami'],
  'sikap': ['galak', 'kasar', 'tidak ramah', 'judes', 'tidak sabar'],
  'tidak responsif': ['lambat', 'tidak responsif', 'lama', 'susah dihubungi'],
  'kurang kompeten': ['tidak paham', 'kurang menguasai', 'tidak profesional']
}
```

## Access via Swagger UI

1. Buka browser: http://localhost:3000/api-docs
2. Login dengan JWT token
3. Cari endpoint: **GET /api/reporting/feedback/reviews/top-worst**
4. Click "Try it out"
5. Masukkan parameter (optional):
   - periode: "2024/2025 Ganjil"
   - limit: 15
6. Click "Execute"

## Response Interpretation

### Sentiment Gap
```
sentiment_gap = top_avg_score - worst_avg_score
```

- **High gap (> 1.5)**: Perbedaan besar antara best dan worst performance
- **Medium gap (0.8 - 1.5)**: Variasi normal
- **Low gap (< 0.8)**: Performance relatif konsisten

### Key Points Priority
Key points diurutkan berdasarkan frequency:
- **High frequency**: Tema yang sangat sering muncul = prioritas tinggi
- **Medium frequency**: Tema yang cukup sering = perlu perhatian
- **Low frequency**: Tema yang jarang = monitor

## Example Usage in Frontend

```javascript
// Fetch summary
const response = await fetch(
  '/api/reporting/feedback/reviews/top-worst?periode=2024/2025 Ganjil',
  {
    headers: { 'Authorization': `Bearer ${token}` }
  }
);

const { data } = await response.json();

// Display in dashboard
console.log('Top Review Summary:', data.top_review_summary.text);
console.log('Areas for Improvement:', data.worst_review_summary.text);

// Show key strengths
data.top_review_summary.key_points.forEach(point => {
  console.log(`✓ ${point.theme}: mentioned ${point.frequency} times`);
});

// Show areas to improve
data.worst_review_summary.key_points.forEach(point => {
  console.log(`⚠ ${point.theme}: mentioned ${point.frequency} times`);
});
```

## Notes

- Default limit adalah 10 review untuk analisis yang akurat
- Maximum limit adalah 50 untuk menghindari processing yang terlalu lama
- Summary text di-generate otomatis berdasarkan theme detection
- Filter berdasarkan role user (kaprodi hanya melihat feedback di fakultasnya)
- Privacy-first: Tidak ada data personal yang di-expose
