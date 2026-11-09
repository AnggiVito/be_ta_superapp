/**
 * OpenAPI — Reporting Keuangan KPA (upload Excel, periode, anggaran prodi).
 */

/**
 * @swagger
 * tags:
 *   - name: Reporting - Keuangan KPA
 *     description: Laporan keuangan KPA — periode, upload Excel, anggaran & transaksi per prodi
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     KpaPeriod:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         tahun:
 *           type: integer
 *           example: 2025
 *         status:
 *           type: string
 *           example: active
 *     KpaProdiBudget:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         kode_pp:
 *           type: string
 *         nama_pp:
 *           type: string
 *         anggaran_tw1:
 *           type: integer
 *         anggaran_tw2:
 *           type: integer
 *         anggaran_tw3:
 *           type: integer
 *         anggaran_tw4:
 *           type: integer
 */

/**
 * @swagger
 * /api/reporting/keuangan/periods:
 *   get:
 *     summary: Daftar periode KPA
 *     tags: [Reporting - Keuangan KPA]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Daftar periode
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/KpaPeriod'
 *                 count:
 *                   type: integer
 *       401:
 *         description: JWT tidak valid
 *       403:
 *         description: Tidak memiliki akses keuangan
 *   post:
 *     summary: Buat periode KPA baru
 *     description: Hanya kaur, koordinator, admin (manage reporting).
 *     tags: [Reporting - Keuangan KPA]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tahun]
 *             properties:
 *               tahun:
 *                 type: integer
 *                 example: 2025
 *               status:
 *                 type: string
 *                 example: active
 *     responses:
 *       200:
 *         description: Periode dibuat
 *       400:
 *         description: tahun wajib diisi
 */

/**
 * @swagger
 * /api/reporting/keuangan/upload:
 *   post:
 *     summary: Upload berkas Excel KPA (year-replace)
 *     description: |
 *       Mengganti seluruh data KPA untuk tahun tertentu dalam satu transaksi.
 *       Parameter `tahun` harus sama dengan tahun di metadata berkas.
 *     tags: [Reporting - Keuangan KPA]
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
 *                 description: File Excel (.xlsx / .xls)
 *               tahun:
 *                 type: integer
 *                 example: 2025
 *     responses:
 *       200:
 *         description: Berkas berhasil diproses
 *       400:
 *         description: File atau tahun tidak valid
 *       403:
 *         description: Tidak memiliki akses manage
 */

/**
 * @swagger
 * /api/reporting/keuangan/uploads:
 *   get:
 *     summary: Riwayat semua upload KPA
 *     description: Dipakai picker / riwayat upload. Scope KAPRODI difilter otomatis.
 *     tags: [Reporting - Keuangan KPA]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 200
 *     responses:
 *       200:
 *         description: Daftar upload KPA
 */

/**
 * @swagger
 * /api/reporting/keuangan/uploads/{id}:
 *   delete:
 *     summary: Hapus upload KPA dan data terkait
 *     description: Soft-delete DB + hapus file fisik. Akses KAUR / TPA.
 *     tags: [Reporting - Keuangan KPA]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Upload dihapus
 *       404:
 *         description: Upload tidak ditemukan
 *       403:
 *         description: Tidak memiliki akses hapus
 */

/**
 * @swagger
 * /api/reporting/keuangan/reprocess:
 *   post:
 *     summary: Parse ulang berkas KPA yang sudah diunggah
 *     tags: [Reporting - Keuangan KPA]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               upload_id:
 *                 type: string
 *                 format: uuid
 *     parameters:
 *       - in: query
 *         name: upload_id
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Reprocess berhasil
 *       400:
 *         description: upload_id wajib diisi
 */

/**
 * @swagger
 * /api/reporting/keuangan/periods/{id}/summary:
 *   get:
 *     summary: Ringkasan laporan periode KPA
 *     tags: [Reporting - Keuangan KPA]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Ringkasan periode + metrik anggaran
 *       404:
 *         description: Periode tidak ditemukan
 */

/**
 * @swagger
 * /api/reporting/keuangan/periods/{id}/prodi:
 *   get:
 *     summary: Daftar anggaran per prodi pada periode
 *     tags: [Reporting - Keuangan KPA]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Daftar prodi budget
 *       404:
 *         description: Periode tidak ditemukan
 */

/**
 * @swagger
 * /api/reporting/keuangan/periods/{id}/transactions:
 *   get:
 *     summary: Daftar transaksi KPA per periode
 *     tags: [Reporting - Keuangan KPA]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: triwulan
 *         schema:
 *           type: integer
 *           enum: [1, 2, 3, 4]
 *       - in: query
 *         name: kode_pp
 *         schema:
 *           type: string
 *       - in: query
 *         name: prodi_budget_id
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Daftar transaksi
 */

/**
 * @swagger
 * /api/reporting/keuangan/periods/{id}/uploads:
 *   get:
 *     summary: Riwayat upload KPA pada periode tertentu
 *     tags: [Reporting - Keuangan KPA]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Daftar upload periode
 */

/**
 * @swagger
 * /api/reporting/keuangan/prodi-budgets:
 *   post:
 *     summary: Buat atau upsert anggaran prodi
 *     tags: [Reporting - Keuangan KPA]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [period_id, nama_pp]
 *             properties:
 *               period_id:
 *                 type: string
 *                 format: uuid
 *               kode_pp:
 *                 type: string
 *               nama_pp:
 *                 type: string
 *               kode_akun:
 *                 type: string
 *               nama_akun:
 *                 type: string
 *               no_drk:
 *                 type: string
 *               kegiatan:
 *                 type: string
 *               anggaran_tw1:
 *                 type: integer
 *               anggaran_tw2:
 *                 type: integer
 *               anggaran_tw3:
 *                 type: integer
 *               anggaran_tw4:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Budget disimpan
 */

/**
 * @swagger
 * /api/reporting/keuangan/prodi-budgets/{id}:
 *   get:
 *     summary: Detail satu baris anggaran prodi
 *     tags: [Reporting - Keuangan KPA]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Detail budget
 *       403:
 *         description: Di luar scope KAPRODI
 *       404:
 *         description: Budget tidak ditemukan
 *   put:
 *     summary: Perbarui anggaran prodi
 *     tags: [Reporting - Keuangan KPA]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/KpaProdiBudget'
 *     responses:
 *       200:
 *         description: Budget diperbarui
 *       404:
 *         description: Budget tidak ditemukan
 */

/**
 * @swagger
 * /api/reporting/keuangan/prodi-budgets/{id}/summary:
 *   get:
 *     summary: Ringkasan laporan satu prodi / satu file PP
 *     tags: [Reporting - Keuangan KPA]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Ringkasan anggaran & realisasi prodi
 *       403:
 *         description: Di luar scope KAPRODI
 *       404:
 *         description: Budget tidak ditemukan
 */
