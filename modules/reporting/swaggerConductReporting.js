/**
 * OpenAPI — Reporting conduct (feedback exit survey, kehadiran, nilai).
 * Legacy Excel feedback docs remain in swagger.js.
 */

/**
 * @swagger
 * tags:
 *   - name: Reporting - Feedback Member
 *     description: Exit survey — respons pribadi mahasiswa (read-only)
 *   - name: Reporting - Feedback Conduct
 *     description: Agregat feedback dari exit survey conduct (staf)
 *   - name: Reporting - Kehadiran
 *     description: Laporan kehadiran / BAP (read-only dari conduct)
 *   - name: Reporting - Nilai
 *     description: Laporan nilai praktikum per modul (read-only dari conduct)
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     ReportingPeriod:
 *       type: object
 *       properties:
 *         semester_code:
 *           type: string
 *           nullable: true
 *           example: "2025/2026-Ganjil"
 *         label:
 *           type: string
 *           example: "Semester 2025/2026-Ganjil"
 *     FeedbackMemberSummary:
 *       type: object
 *       properties:
 *         eligible_count:
 *           type: integer
 *           description: Sesi completed yang dihadiri mahasiswa
 *         submitted_count:
 *           type: integer
 *         pending_count:
 *           type: integer
 *         active_survey:
 *           type: object
 *           nullable: true
 *         period:
 *           $ref: '#/components/schemas/ReportingPeriod'
 *     FeedbackMemberResponseItem:
 *       type: object
 *       properties:
 *         operational_session_id:
 *           type: string
 *           format: uuid
 *         practicum_name:
 *           type: string
 *         module_name:
 *           type: string
 *         status:
 *           type: string
 *           enum: [pending, submitted]
 *         submitted_at:
 *           type: string
 *           format: date-time
 *           nullable: true
 *     NilaiModuleListResponse:
 *       type: object
 *       properties:
 *         display_mode:
 *           type: string
 *           enum: [module, session]
 *         items:
 *           type: array
 *           items:
 *             type: object
 *         period:
 *           $ref: '#/components/schemas/ReportingPeriod'
 */

/**
 * @swagger
 * /api/reporting/feedback/my-summary:
 *   get:
 *     summary: Ringkasan exit survey mahasiswa
 *     description: Jumlah sesi eligible, sudah/belum mengisi exit survey pada semester terpilih.
 *     tags: [Reporting - Feedback Member]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: semester_code
 *         schema:
 *           type: string
 *         description: Kode semester atau `active` untuk periode aktif
 *         example: active
 *     responses:
 *       200:
 *         description: Ringkasan berhasil diambil
 *       401:
 *         description: JWT tidak valid
 */

/**
 * @swagger
 * /api/reporting/feedback/my-responses:
 *   get:
 *     summary: Daftar sesi & status exit survey mahasiswa
 *     tags: [Reporting - Feedback Member]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: semester_code
 *         schema:
 *           type: string
 *         example: active
 *     responses:
 *       200:
 *         description: Daftar sesi dengan status pending/submitted
 */

/**
 * @swagger
 * /api/reporting/feedback/my-responses/{operationalSessionId}:
 *   get:
 *     summary: Detail jawaban exit survey mahasiswa per sesi
 *     tags: [Reporting - Feedback Member]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: operationalSessionId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: semester_code
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Detail respons (read-only)
 *       400:
 *         description: Sesi tidak ditemukan atau akses ditolak
 */

/**
 * @swagger
 * /api/reporting/feedback/praktikum-stats:
 *   get:
 *     summary: Statistik feedback per praktikum (staf)
 *     description: Agregat dari exit survey conduct — selaras format PraktikumStats.
 *     tags: [Reporting - Feedback Conduct]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: semester_code
 *         schema:
 *           type: string
 *         example: active
 *       - in: query
 *         name: practicum_name
 *         schema:
 *           type: string
 *       - in: query
 *         name: module_id
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Statistik per praktikum
 */

/**
 * @swagger
 * /api/reporting/feedback/modules:
 *   get:
 *     summary: Daftar modul untuk drill-down feedback praktikum
 *     tags: [Reporting - Feedback Conduct]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: practicum_name
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: semester_code
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Daftar modul
 *       400:
 *         description: practicum_name wajib diisi
 */

/**
 * @swagger
 * /api/reporting/kehadiran/summary:
 *   get:
 *     summary: Ringkasan kehadiran
 *     tags: [Reporting - Kehadiran]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: semester_code
 *         schema:
 *           type: string
 *         example: active
 *       - in: query
 *         name: view_mode
 *         schema:
 *           type: string
 *           enum: [mine, handled]
 *         description: Scope mahasiswa/asisten (mine = saya, handled = sesi yang di-handle)
 *     responses:
 *       200:
 *         description: Ringkasan kehadiran
 */

/**
 * @swagger
 * /api/reporting/kehadiran/sessions:
 *   get:
 *     summary: Daftar sesi kehadiran / BAP
 *     tags: [Reporting - Kehadiran]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: semester_code
 *         schema:
 *           type: string
 *       - in: query
 *         name: view_mode
 *         schema:
 *           type: string
 *           enum: [mine, handled]
 *       - in: query
 *         name: practicum_name
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Daftar sesi
 */

/**
 * @swagger
 * /api/reporting/kehadiran/sessions/{operationalSessionId}:
 *   get:
 *     summary: Detail kehadiran satu sesi
 *     tags: [Reporting - Kehadiran]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: operationalSessionId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: view_mode
 *         schema:
 *           type: string
 *           enum: [mine, handled]
 *     responses:
 *       200:
 *         description: Detail sesi
 */

/**
 * @swagger
 * /api/reporting/nilai/summary:
 *   get:
 *     summary: Ringkasan nilai (modul atau sesi)
 *     tags: [Reporting - Nilai]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: semester_code
 *         schema:
 *           type: string
 *       - in: query
 *         name: view_mode
 *         schema:
 *           type: string
 *           enum: [mine, handled]
 *     responses:
 *       200:
 *         description: Ringkasan dengan display_mode module atau session
 */

/**
 * @swagger
 * /api/reporting/nilai/modules:
 *   get:
 *     summary: Daftar nilai per modul
 *     description: Agregasi nilai conduct + rubrik registrasi. Member mendapat satu baris per modul; staf mendapat ringkasan per modul.
 *     tags: [Reporting - Nilai]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: semester_code
 *         schema:
 *           type: string
 *       - in: query
 *         name: view_mode
 *         schema:
 *           type: string
 *           enum: [mine, handled]
 *       - in: query
 *         name: practicum_name
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Daftar modul
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/NilaiModuleListResponse'
 */

/**
 * @swagger
 * /api/reporting/nilai/modules/{moduleId}:
 *   get:
 *     summary: Detail nilai modul (breakdown komponen)
 *     tags: [Reporting - Nilai]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: moduleId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: semester_code
 *         schema:
 *           type: string
 *       - in: query
 *         name: student_user_id
 *         schema:
 *           type: string
 *         description: Filter satu mahasiswa (staf)
 *     responses:
 *       200:
 *         description: Breakdown komponen & daftar mahasiswa
 */

/**
 * @swagger
 * /api/reporting/nilai/grades:
 *   get:
 *     summary: Daftar nilai per sesi (conduct)
 *     description: Fallback bila rubrik modul belum siap; juga dipakai untuk detail sesi.
 *     tags: [Reporting - Nilai]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: semester_code
 *         schema:
 *           type: string
 *       - in: query
 *         name: view_mode
 *         schema:
 *           type: string
 *           enum: [mine, handled]
 *       - in: query
 *         name: practicum_name
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Daftar grade headers
 */

/**
 * @swagger
 * /api/reporting/nilai/grades/{gradeId}:
 *   get:
 *     summary: Detail nilai satu sesi
 *     tags: [Reporting - Nilai]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: gradeId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: view_mode
 *         schema:
 *           type: string
 *           enum: [mine, handled]
 *     responses:
 *       200:
 *         description: Detail nilai sesi
 */
