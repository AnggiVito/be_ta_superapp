/**
 * @swagger
 * /api/reporting/health:
 *   get:
 *     summary: Health check untuk modul reporting
 *     tags: [Reporting - Feedback]
 *     security: []
 *     responses:
 *       200:
 *         description: Modul berjalan dengan baik
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 module:
 *                   type: string
 *                   example: "reporting"
 *                 message:
 *                   type: string
 *                   example: "Reporting module is running"
 */

/**
 * @swagger
 * /api/reporting/feedback/upload:
 *   post:
 *     summary: Upload feedback Excel file
 *     description: |
 *       Upload file Excel berisi feedback mahasiswa untuk dianalisis sentimen. 
 *       Hanya kaur, koordinator_praktikum, dan admin yang dapat upload.
 *       
 *       **Data Prodi dan Praktikum:**
 *       - Sistem akan otomatis membaca data Prodi dan Praktikum dari kolom Excel
 *       - Kolom yang dibaca: "Prodi", "Program Studi", "Praktikum", "Mata Kuliah", dll
 *       - Hanya perlu input **file** dan **periode**
 *     tags: [Reporting - Feedback]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: File Excel (.xlsx atau .xls) berisi feedback
 *               periode:
 *                 type: string
 *                 example: "2024/2025 Ganjil"
 *                 description: Periode akademik (optional)
 *     responses:
 *       200:
 *         description: File berhasil diupload dan diproses
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "File uploaded and processed successfully"
 *                 data:
 *                   type: object
 *       400:
 *         description: File tidak valid atau tidak ada file
 *       403:
 *         description: Tidak memiliki akses (hanya kaur/koordinator/admin)
 *       500:
 *         description: Error saat memproses file
 */

/**
 * @swagger
 * /api/reporting/feedback/summaries:
 *   get:
 *     summary: Get all feedback summaries
 *     description: Mendapatkan semua summary feedback dengan filter. Kaprodi hanya dapat melihat data prodi-nya sendiri.
 *     tags: [Reporting - Feedback]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: periode
 *         schema:
 *           type: string
 *         description: Filter berdasarkan periode
 *         example: "2024/2025 Ganjil"
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Limit jumlah hasil
 *         example: 10
 *     responses:
 *       200:
 *         description: List summary feedback
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/FeedbackSummary'
 *                 count:
 *                   type: integer
 *                   example: 5
 *       403:
 *         description: Tidak memiliki akses
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/reporting/feedback/summaries/{uploadId}:
 *   get:
 *     summary: Get feedback summary by upload ID
 *     description: Mendapatkan detail summary feedback berdasarkan upload ID
 *     tags: [Reporting - Feedback]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: uploadId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Upload ID
 *     responses:
 *       200:
 *         description: Detail summary feedback
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/FeedbackSummary'
 *       404:
 *         description: Summary tidak ditemukan
 *       403:
 *         description: Tidak memiliki akses
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/reporting/feedback/statistics:
 *   get:
 *     summary: Get sentiment statistics (aggregated)
 *     description: |
 *       Mendapatkan statistik sentimen secara keseluruhan untuk seluruh fakultas.
 *       Data agregat mencakup semua feedback dari semua prodi dan praktikum.
 *     tags: [Reporting - Feedback]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: periode
 *         schema:
 *           type: string
 *         description: Filter berdasarkan periode akademik (optional)
 *         example: "2024/2025 Ganjil"
 *     responses:
 *       200:
 *         description: Statistik sentimen keseluruhan
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/SentimentStatistics'
 *       403:
 *         description: Tidak memiliki akses
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/reporting/feedback/items/{uploadId}:
 *   get:
 *     summary: Get detailed feedback items by upload ID
 *     description: Mendapatkan detail item feedback individual berdasarkan upload ID
 *     tags: [Reporting - Feedback]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: uploadId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Upload ID
 *       - in: query
 *         name: sentiment
 *         schema:
 *           type: string
 *           enum: [positive, negative, neutral]
 *         description: Filter berdasarkan sentimen
 *         example: "positive"
 *     responses:
 *       200:
 *         description: List feedback items
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/FeedbackItem'
 *                 count:
 *                   type: integer
 *                   example: 50
 *       403:
 *         description: Tidak memiliki akses
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/reporting/feedback/uploads:
 *   get:
 *     summary: Get all feedback uploads
 *     description: Mendapatkan list semua upload file feedback dengan filter. Kaprodi hanya dapat melihat data prodi-nya sendiri.
 *     tags: [Reporting - Feedback]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: periode
 *         schema:
 *           type: string
 *         description: Filter berdasarkan periode
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, processing, processed, failed]
 *         description: Filter berdasarkan status
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Limit jumlah hasil
 *     responses:
 *       200:
 *         description: List upload feedback
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/FeedbackUpload'
 *                 count:
 *                   type: integer
 *                   example: 5
 *       403:
 *         description: Tidak memiliki akses
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/reporting/feedback/uploads/{uploadId}:
 *   delete:
 *     summary: Delete feedback upload
 *     description: Hapus file upload feedback beserta semua data terkait (soft delete). Hanya kaur, koordinator_praktikum, dan admin yang dapat menghapus.
 *     tags: [Reporting - Feedback]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: uploadId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Upload ID yang akan dihapus
 *     responses:
 *       200:
 *         description: Upload berhasil dihapus
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Feedback upload deleted successfully"
 *       404:
 *         description: Upload tidak ditemukan
 *       403:
 *         description: Tidak memiliki akses
 *       500:
 *         description: Internal server error
 */

/**
