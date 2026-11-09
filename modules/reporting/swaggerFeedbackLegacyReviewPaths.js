 * @swagger
 * /api/reporting/feedback/reviews/top-worst:
 *   get:
 *     summary: Get aggregated top and worst review summaries
 *     description: Mendapatkan summary gabungan dari review terbaik (paling positif) dan terburuk (paling negatif) tanpa menampilkan identitas mahasiswa. Hasil berupa teks ringkasan dan poin-poin kunci yang diekstrak dari multiple reviews.
 *     tags: [Reporting - Feedback]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: upload_id
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter berdasarkan upload ID tertentu
 *       - in: query
 *         name: periode
 *         schema:
 *           type: string
 *         description: Filter berdasarkan periode (contoh - 2024/2025 Ganjil)
 *         example: "2024/2025 Ganjil"
 *     responses:
 *       200:
 *         description: Berhasil mendapatkan summary top dan worst reviews
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     top_review_summary:
 *                       type: object
 *                       description: Summary gabungan dari review positif terbaik
 *                       properties:
 *                         text:
 *                           type: string
 *                           description: Teks ringkasan yang menggabungkan poin-poin utama dari review positif
 *                           example: "Berdasarkan 10 feedback positif terbaik, asisten praktikum dinilai mampu menjelaskan materi dengan baik dan mudah dipahami. Mahasiswa mengapresiasi sikap asisten yang ramah, sabar, dan sopan dalam membimbing. Asisten juga dinilai responsif dan cepat tanggap dalam membantu mahasiswa."
 *                         count:
 *                           type: integer
 *                           description: Jumlah review yang dianalisis
 *                           example: 10
 *                         average_score:
 *                           type: number
 *                           format: float
 *                           description: Rata-rata sentiment score dari review yang dianalisis
 *                           example: 0.823
 *                         key_points:
 *                           type: array
 *                           description: Poin-poin kunci yang diekstrak dari reviews
 *                           items:
 *                             type: object
 *                             properties:
 *                               theme:
 *                                 type: string
 *                                 description: Tema utama
 *                                 example: "sikap"
 *                               frequency:
 *                                 type: integer
 *                                 description: Frekuensi kemunculan tema
 *                                 example: 8
 *                               examples:
 *                                 type: array
 *                                 description: Contoh kata kunci yang muncul
 *                                 items:
 *                                   type: string
 *                                 example: ["ramah", "sabar", "baik hati"]
 *                     worst_review_summary:
 *                       type: object
 *                       description: Summary gabungan dari review negatif yang perlu perhatian
 *                       properties:
 *                         text:
 *                           type: string
 *                           description: Teks ringkasan yang menggabungkan area-area yang perlu perbaikan
 *                           example: "Berdasarkan 20 feedback yang perlu perhatian, mahasiswa mengidentifikasi beberapa area yang perlu perbaikan seperti: penjelasan materi yang kurang jelas, respons yang lambat terhadap pertanyaan mahasiswa."
 *                         count:
 *                           type: integer
 *                           description: Jumlah review yang dianalisis
 *                           example: 20
 *                         average_score:
 *                           type: number
 *                           format: float
 *                           description: Rata-rata sentiment score dari review yang dianalisis
 *                           example: -0.712
 *                         key_points:
 *                           type: array
 *                           description: Poin-poin masalah yang diekstrak dari reviews
 *                           items:
 *                             type: object
 *                             properties:
 *                               theme:
 *                                 type: string
 *                                 description: Tema masalah
 *                                 example: "kurang jelas"
 *                               frequency:
 *                                 type: integer
 *                                 description: Frekuensi kemunculan tema
 *                                 example: 6
 *                               examples:
 *                                 type: array
 *                                 description: Contoh kata kunci yang muncul
 *                                 items:
 *                                   type: string
 *                                 example: ["tidak jelas", "kurang jelas", "sulit dipahami"]
 *                     metadata:
 *                       type: object
 *                       properties:
 *                         periode:
 *                           type: string
 *                           example: "2024/2025 Ganjil"
 *                         total_reviews_analyzed:
 *                           type: integer
 *                           description: Total review yang dianalisis (top + worst)
 *                           example: 40
 *                         sentiment_gap:
 *                           type: number
 *                           format: float
 *                           description: Selisih antara average top score dan worst score
 *                           example: 1.535
 *       403:
 *         description: Tidak memiliki akses
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/reporting/feedback/category-satisfaction:
 *   get:
 *     summary: Get category satisfaction summary based on ratings (1-5 scale)
 *     description: Mendapatkan ringkasan kepuasan mahasiswa berdasarkan kategori dengan skala rating 1-5. Menampilkan rata-rata rating, level kepuasan, dan area yang perlu ditingkatkan.
 *     tags: [Reporting - Feedback]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: upload_id
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter berdasarkan upload ID tertentu
 *       - in: query
 *         name: periode
 *         schema:
 *           type: string
 *         description: Filter berdasarkan periode (contoh - 2024/2025 Ganjil)
 *         example: "2024/2025 Ganjil"
 *     responses:
 *       200:
 *         description: Berhasil mendapatkan summary kepuasan per kategori
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     overall_satisfaction:
 *                       type: object
 *                       properties:
 *                         average_rating:
 *                           type: number
 *                           format: float
 *                           description: Rata-rata rating keseluruhan (1-5)
 *                           example: 4.23
 *                         satisfaction_level:
 *                           type: string
 *                           description: Level kepuasan (Sangat Puas, Puas, Cukup Puas, Kurang Puas, Tidak Puas)
 *                           example: "Puas"
 *                         satisfaction_percentage:
 *                           type: number
 *                           format: float
 *                           description: Persentase kepuasan (0-100%)
 *                           example: 84.6
 *                         total_responses:
 *                           type: integer
 *                           description: Total jumlah responden
 *                           example: 150
 *                         summary_text:
 *                           type: string
 *                           description: Ringkasan tekstual keseluruhan
 *                           example: "Secara keseluruhan, tingkat kepuasan mahasiswa terhadap praktikum berada pada level \"Puas\". Aspek yang mendapat penilaian terbaik adalah: Kemampuan Asisten (4.5/5.0), Interaksi Asisten dan Mahasiswa (4.3/5.0)."
 *                     category_details:
 *                       type: array
 *                       description: Detail kepuasan per kategori
 *                       items:
 *                         type: object
 *                         properties:
 *                           category:
 *                             type: string
 *                             example: "Kepuasan terhadap Kondisi Ruangan Praktikum"
 *                           category_key:
 *                             type: string
 *                             example: "kepuasan_ruangan"
 *                           average_rating:
 *                             type: string
 *                             example: "3.85"
 *                           satisfaction_level:
 *                             type: string
 *                             example: "Cukup Puas"
 *                           satisfaction_percentage:
 *                             type: number
 *                             example: 77.0
 *                           total_responses:
 *                             type: integer
 *                             example: 145
 *                           interpretation:
 *                             type: string
 *                             example: "Kinerja cukup baik namun masih ada ruang untuk peningkatan"
 *                           summary:
 *                             type: string
 *                             description: Ringkasan tekstual untuk kategori ini
 *                             example: "Berdasarkan 145 responden, Kondisi Ruangan Praktikum mendapat rating rata-rata 3.85/5.0 (77.0%). Penilaian mahasiswa terhadap aspek ini cukup baik namun masih ada ruang untuk peningkatan."
 *                     top_performing_categories:
 *                       type: array
 *                       description: Top 3 kategori dengan rating tertinggi
 *                       items:
 *                         type: object
 *                         properties:
 *                           category:
 *                             type: string
 *                             example: "Kemampuan Asisten Praktikum Menyampaikan dan Menjelaskan Materi"
 *                           average_rating:
 *                             type: string
 *                             example: "4.52"
 *                           satisfaction_level:
 *                             type: string
 *                             example: "Sangat Puas"
 *                     areas_for_improvement:
 *                       type: array
 *                       description: Area yang perlu perhatian dan peningkatan
 *                       items:
 *                         type: object
 *                         properties:
 *                           category:
 *                             type: string
 *                             example: "Kepuasan terhadap Kondisi Ruangan Praktikum"
 *                           average_rating:
 *                             type: string
 *                             example: "3.65"
 *                           satisfaction_level:
 *                             type: string
 *                             example: "Cukup Puas"
 *                     metadata:
 *                       type: object
 *                       properties:
 *                         periode:
 *                           type: string
 *                           example: "2024/2025 Ganjil"
 *                         total_categories_analyzed:
 *                           type: integer
 *                           example: 7
 *                         analysis_date:
 *                           type: string
 *                           format: date-time
 *       403:
 *         description: Tidak memiliki akses
 *       500:
 *         description: Internal server error
 */
