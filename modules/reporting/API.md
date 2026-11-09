# Reporting API — Conduct (Current)

Dokumentasi endpoint **aktif** untuk laporan Feedback (exit survey), Kehadiran (BAP), dan Nilai praktikum. Semua endpoint **read-only** dari modul **conduct** (+ registrasi untuk rubrik nilai).

Base path: `/api/reporting`  
Auth: **JWT Bearer** (header `Authorization: Bearer <token>`)

Swagger UI: `/api-docs` (tag `Reporting - Feedback Member`, `Feedback Conduct`, `Kehadiran`, `Nilai`, `Keuangan KPA`, `Keuangan Laboran & Compare`)

---

## Query parameters umum

| Parameter | Dipakai di | Keterangan |
|-----------|------------|------------|
| `semester_code` | Semua | Kode semester atau `active` (periode aktif dari konfigurasi) |
| `view_mode` | Kehadiran, Nilai | `mine` (data saya) atau `handled` (sesi yang saya handle — asisten) |
| `practicum_name` | Feedback, Nilai | Filter nama praktikum |
| `module_id` | Feedback stats | Filter modul (UUID) |
| `student_user_id` | Nilai module detail | Filter satu mahasiswa (staf) |

---

## Feedback

### Member (mahasiswa) — exit survey pribadi

| Method | Path | Deskripsi |
|--------|------|-----------|
| GET | `/feedback/my-summary` | Ringkasan: eligible / submitted / pending count |
| GET | `/feedback/my-responses` | Daftar sesi completed + status `pending` \| `submitted` |
| GET | `/feedback/my-responses/:operationalSessionId` | Detail jawaban read-only |

**Sumber data:** `exit_survey_responses`, attendances, sesi `completed`.

**Contoh:**

```http
GET /api/reporting/feedback/my-summary?semester_code=active
Authorization: Bearer <token>
```

```json
{
  "success": true,
  "data": {
    "eligible_count": 3,
    "submitted_count": 2,
    "pending_count": 1,
    "active_survey": { "id": "...", "title": "Exit Survey 2025" },
    "period": { "semester_code": "2025/2026-Ganjil", "label": "Semester 2025/2026-Ganjil" }
  }
}
```

### Staff — agregat exit survey

| Method | Path | Deskripsi |
|--------|------|-----------|
| GET | `/feedback/praktikum-stats` | Statistik per praktikum (sentimen, rating) |
| GET | `/feedback/modules` | Modul per praktikum (`practicum_name` wajib) |
| GET | `/feedback/reviews/top-worst` | Ringkasan review terbaik/terburuk |

---

## Kehadiran

| Method | Path | Deskripsi |
|--------|------|-----------|
| GET | `/kehadiran/summary` | Ringkasan sesi & inbox counts |
| GET | `/kehadiran/sessions` | Daftar sesi BAP (scoped by persona) |
| GET | `/kehadiran/sessions/:operationalSessionId` | Detail satu sesi |

**Sumber data:** modul conduct (`practicumBapService`).

**Persona:** staf agregat (executive/lab_ops/dosen), praktikan (sesi sendiri), asisten (handled).

---

## Nilai

| Method | Path | Deskripsi |
|--------|------|-----------|
| GET | `/nilai/summary` | Ringkasan; `display_mode`: `module` atau `session` |
| GET | `/nilai/modules` | Daftar modul + breakdown komponen |
| GET | `/nilai/modules/:moduleId` | Detail modul + mahasiswa |
| GET | `/nilai/grades` | Daftar nilai per sesi conduct |
| GET | `/nilai/grades/:gradeId` | Detail satu grade sesi |

**Sumber data:** `practicum_student_grades` (conduct) + `practicum_module_assessment_components` (registrasi).

**Nilai akhir modul:** Σ (percentage × bobot%) untuk komponen enabled (bobot total = 100%). Jika rubrik belum siap → `display_mode: session` (fallback per sesi).

---

## RBAC (middleware)

| Endpoint group | Middleware |
|----------------|------------|
| Feedback (semua) | `requireViewReportAccess` |
| Kehadiran | `requireKehadiranReportAccess` |
| Nilai | `requireNilaiReportAccess` |

Role yang diizinkan mencakup staf (kaprodi, kaur, laboran, koordinator, …), mahasiswa, dan asisten praktikum. Scope data difilter di service layer.

---

## Health check

```http
GET /api/reporting/health
```

Tidak memerlukan JWT.

---

## Legacy (Excel upload)

Endpoint upload Excel feedback (`/feedback/upload`, `/feedback/summaries`, …) didokumentasikan di Swagger tag **Reporting - Feedback** (legacy). Implementasi aktif di production saat ini menggunakan **exit survey conduct** seperti di atas.

---

## Keuangan KPA

Upload berkas Excel KPA (year-replace per tahun). Scope KAPRODI difilter otomatis via middleware `attachKeuanganAccessScope`.

| Method | Path | Deskripsi |
|--------|------|-----------|
| GET | `/keuangan/periods` | Daftar periode KPA |
| POST | `/keuangan/periods` | Buat periode baru (manage) |
| POST | `/keuangan/upload` | Upload Excel KPA (`file`, `tahun`) |
| GET | `/keuangan/uploads` | Riwayat semua upload |
| DELETE | `/keuangan/uploads/:id` | Hapus upload (KAUR/TPA) |
| POST | `/keuangan/reprocess` | Parse ulang berkas (`upload_id`) |
| GET | `/keuangan/periods/:id/summary` | Ringkasan periode |
| GET | `/keuangan/periods/:id/prodi` | Anggaran per prodi |
| GET | `/keuangan/periods/:id/transactions` | Transaksi (`triwulan`, `kode_pp`, `search`) |
| GET | `/keuangan/periods/:id/uploads` | Upload per periode |
| POST | `/keuangan/prodi-budgets` | Buat/upsert anggaran prodi |
| PUT | `/keuangan/prodi-budgets/:id` | Update anggaran |
| GET | `/keuangan/prodi-budgets/:id` | Detail budget |
| GET | `/keuangan/prodi-budgets/:id/summary` | Ringkasan satu prodi |

---

## Compare Keuangan Laboran vs KPA (Procurement)

Upload laporan Excel laboran (multi-sheet per prodi) via endpoint upload. Fitur **Compare** otomatis memakai upload laboran terbaru dan membandingkan transaksi dengan item procurement (`completed`/`closed`, `program_fund`).

| Method | Path | Deskripsi |
|--------|------|-----------|
| POST | `/keuangan/laboran/upload` | Upload Excel laboran (multipart: `file`, `tahun`) |
| GET | `/keuangan/laboran/uploads` | Riwayat upload (`?tahun=` opsional) |
| GET | `/keuangan/laboran/uploads/:uploadId` | Detail upload + compare terakhir |
| POST | `/keuangan/compare` | Jalankan compare (`body.upload_id`) |
| GET | `/keuangan/compare/latest` | Compare upload terbaru (`?tahun=`, `?refresh=true`) |
| POST | `/keuangan/laboran/uploads/:uploadId/compare` | Jalankan compare untuk upload tertentu |
| GET | `/keuangan/compare/:runId/overview` | Ringkasan + per prodi |
| GET | `/keuangan/compare/:runId/prodi/:kodePP` | Detail transaksi per prodi |

Status hasil: `matched`, `missing_in_laboran`, `missing_in_kpa`, `amount_mismatch`.

Migration: `008_laboran_compare_tables.sql`

Lihat juga: [README.md](./README.md) untuk arsitektur modul dan setup migration.

---

## Testing

```bash
cd be_practicum
npm run test:reporting
```

Route wiring tests: `modules/reporting/tests/reportingRoutes.test.js`

Unit tests service layer:

- `modules/reporting/tests/feedbackMemberReportService.test.js`
- `modules/reporting/tests/nilaiModuleService.test.js`
- `modules/reporting/tests/keuanganCompareService.test.js`
