/**
 * OpenAPI — Reporting Keuangan Laboran upload & compare vs KPA (procurement).
 */

/**
 * @swagger
 * tags:
 *   - name: Reporting - Keuangan Laboran & Compare
 *     description: Upload laporan Excel laboran dan compare transaksi vs procurement (KPA sistem)
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     KeuanganCompareMatchStatus:
 *       type: string
 *       enum: [matched, missing_in_laboran, missing_in_kpa, amount_mismatch]
 *     KeuanganCompareSummary:
 *       type: object
 *       properties:
 *         matched_count:
 *           type: integer
 *         missing_laboran_count:
 *           type: integer
 *         missing_kpa_count:
 *           type: integer
 *         mismatch_count:
 *           type: integer
 *         is_fully_matched:
 *           type: boolean
 *     KeuanganCompareResult:
 *       type: object
 *       properties:
 *         run:
 *           type: object
 *           description: Metadata run compare
 *         summary:
 *           $ref: '#/components/schemas/KeuanganCompareSummary'
 *         upload:
 *           type: object
 *           description: Upload laboran yang dibandingkan
 */

/**
 * @swagger
 * /api/reporting/keuangan/laboran/upload:
 *   post:
 *     summary: Upload laporan keuangan laboran (multi-sheet Excel)
 *     description: |
 *       Setiap sheet = satu prodi. Setelah upload, compare dapat dijalankan manual
 *       atau via `GET /keuangan/compare/latest`.
 *     tags: [Reporting - Keuangan Laboran & Compare]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file, tahun]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: File Excel (.xlsx / .xls) multi-sheet
 *               tahun:
 *                 type: integer
 *                 example: 2025
 *     responses:
 *       201:
 *         description: Upload berhasil diproses
 *       400:
 *         description: File atau tahun tidak valid
 *       403:
 *         description: Tidak memiliki akses manage
 */

/**
 * @swagger
 * /api/reporting/keuangan/laboran/uploads:
 *   get:
 *     summary: Riwayat upload laporan laboran
 *     tags: [Reporting - Keuangan Laboran & Compare]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: tahun
 *         schema:
 *           type: integer
 *         description: Filter tahun periode
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: Daftar upload laboran
 */

/**
 * @swagger
 * /api/reporting/keuangan/laboran/uploads/{uploadId}:
 *   get:
 *     summary: Detail upload laboran + compare terakhir
 *     tags: [Reporting - Keuangan Laboran & Compare]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: uploadId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Detail upload beserta latest_compare_run jika ada
 *       404:
 *         description: Upload tidak ditemukan
 */

/**
 * @swagger
 * /api/reporting/keuangan/compare:
 *   post:
 *     summary: Jalankan compare laboran vs KPA (procurement)
 *     description: Body `upload_id` wajib — bandingkan transaksi upload laboran dengan item procurement.
 *     tags: [Reporting - Keuangan Laboran & Compare]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [upload_id]
 *             properties:
 *               upload_id:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: Compare selesai
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/KeuanganCompareResult'
 *       400:
 *         description: upload_id wajib diisi
 */

/**
 * @swagger
 * /api/reporting/keuangan/laboran/uploads/{uploadId}/compare:
 *   post:
 *     summary: Jalankan compare untuk upload laboran tertentu
 *     description: Alias path-based dari POST `/keuangan/compare` dengan uploadId di URL.
 *     tags: [Reporting - Keuangan Laboran & Compare]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: uploadId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Compare selesai
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/KeuanganCompareResult'
 */

/**
 * @swagger
 * /api/reporting/keuangan/compare/latest:
 *   get:
 *     summary: Compare upload laboran terbaru (auto-run)
 *     description: |
 *       Mengambil upload laboran terbaru (opsional filter `tahun`) dan menjalankan
 *       compare jika belum ada run. Gunakan `refresh=true` untuk paksa ulang compare.
 *     tags: [Reporting - Keuangan Laboran & Compare]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: tahun
 *         schema:
 *           type: integer
 *         description: Filter tahun upload laboran
 *       - in: query
 *         name: refresh
 *         schema:
 *           type: boolean
 *         description: Paksa jalankan compare ulang
 *     responses:
 *       200:
 *         description: Hasil compare terbaru
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/KeuanganCompareResult'
 *       404:
 *         description: Belum ada upload laboran
 */

/**
 * @swagger
 * /api/reporting/keuangan/compare/{runId}/overview:
 *   get:
 *     summary: Ringkasan compare + breakdown per prodi
 *     tags: [Reporting - Keuangan Laboran & Compare]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: runId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Overview compare run
 *       404:
 *         description: Run tidak ditemukan
 */

/**
 * @swagger
 * /api/reporting/keuangan/compare/{runId}/prodi/{kodePP}:
 *   get:
 *     summary: Detail transaksi compare per prodi
 *     tags: [Reporting - Keuangan Laboran & Compare]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: runId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: kodePP
 *         required: true
 *         schema:
 *           type: string
 *         description: Kode program studi (URL-encoded)
 *       - in: query
 *         name: status
 *         schema:
 *           $ref: '#/components/schemas/KeuanganCompareMatchStatus'
 *         description: Filter status match
 *     responses:
 *       200:
 *         description: Daftar baris compare per prodi
 *       404:
 *         description: Run atau prodi tidak ditemukan
 */
