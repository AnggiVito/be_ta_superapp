// KSM swagger moved into Registration section per request
/**
 * @openapi
 * tags:
 *   - name: Registration
 *     description: Registration master data (study programs, laboratories, practicums)
 */

/**
 * @openapi
 * (KSM upload moved to bottom of registration docs)
 */

/**
 * @openapi
 * /api/registration/required-room-categories:
 *   get:
 *     tags: [Registration]
 *     summary: Opsi dropdown kategori ruangan untuk modul praktikum
 *     description: |
 *       Mengembalikan daftar kategori dari tabel room_categories (field value = slug).
 *       Gunakan value sebagai required_room_category saat POST/PUT modul praktikum.
 *       Sumber data sama dengan GET /api/registration/room-categories, format disederhanakan untuk dropdown.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: OK
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
 *                     $ref: '#/components/schemas/RequiredRoomCategoryOption'
 */

/**
 * @openapi
 * /api/registration/room-categories:
 *   get:
 *     tags: [Registration]
 *     summary: Daftar kategori ruangan (halaman konfigurasi)
 *     description: |
 *       Master kategori dari tabel room_categories. Field slug dipakai sebagai
 *       required_room_category pada modul praktikum.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RoomCategoryListResponse'
 *   post:
 *     tags: [Registration]
 *     summary: Tambah kategori ruangan
 *     description: |
 *       Menambah kategori baru ke room_categories. Hanya **kaur_lab** dan **laboran**.
 *       Slug tidak dapat diubah setelah dibuat (gunakan label untuk teks tampilan).
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RoomCategoryCreateRequest'
 *     responses:
 *       201:
 *         description: Kategori berhasil dibuat
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RoomCategoryItemResponse'
 *       400:
 *         description: Validasi gagal (slug/label tidak valid)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Forbidden - hanya kaur_lab dan laboran
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       409:
 *         description: Slug sudah ada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @openapi
 * /api/registration/room-categories/{slug}:
 *   get:
 *     tags: [Registration]
 *     summary: Detail satu kategori ruangan
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *         description: Kode kategori (snake_case)
 *         example: lab_komputer
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RoomCategoryItemResponse'
 *       404:
 *         description: Kategori tidak ditemukan
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *   put:
 *     tags: [Registration]
 *     summary: Ubah kategori ruangan
 *     description: |
 *       Mengubah **label** dan/atau **sort_order**. Slug path tidak dapat diubah.
 *       Hanya **kaur_lab** dan **laboran**.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *         example: lab_komputer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RoomCategoryUpdateRequest'
 *     responses:
 *       200:
 *         description: Kategori berhasil diperbarui
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RoomCategoryItemResponse'
 *       400:
 *         description: Validasi gagal atau body kosong
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Forbidden - hanya kaur_lab dan laboran
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Kategori tidak ditemukan
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *   delete:
 *     tags: [Registration]
 *     summary: Hapus kategori ruangan
 *     description: |
 *       Menghapus kategori dari room_categories. Hanya **kaur_lab** dan **laboran**.
 *       Gagal (409) jika slug masih dipakai pada practicum_modules.required_room_category.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *         example: lab_custom
 *     responses:
 *       200:
 *         description: Kategori berhasil dihapus
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
 *                   example: Kategori ruangan dihapus
 *       403:
 *         description: Forbidden - hanya kaur_lab dan laboran
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Kategori tidak ditemukan
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       409:
 *         description: Masih dipakai modul praktikum
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @openapi
 * /api/registration/study-programs:
 *   get:
 *     tags: [Registration]
 *     summary: List study programs
 *     responses:
 *       200:
 *         description: OK
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
 *                     $ref: '#/components/schemas/StudyProgram'
 *
 *   post:
 *     tags: [Registration]
 *     summary: Create a study program
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               code:
 *                 type: string
 *               name:
 *                 type: string
 *     responses:
 *       201:
 *         description: Created
 */


/**
 * @openapi
 * /api/registration/enrollments:
 *   post:
 *     tags: [Registration]
 *     summary: Enroll current user to a practicum
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - practicum_id
 *             properties:
 *               practicum_id:
 *                 type: string
 *                 format: uuid
 *             
 *             # Note: `role` is not accepted from the client. The server will
 *             # determine the enrollment role from the user's assigned roles
 *             # (e.g. `asisten_praktikum_aktif`, `asisten_praktikum`, or `mahasiswa`).
 *     responses:
 *       201:
 *         description: Enrollment created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/PracticumEnrollment'
 *   get:
 *     tags: [Registration]
 *     summary: List current user's enrollments
 *     description: >
 *       Hanya menampilkan enrollment milik user yang sedang login (JWT).
 *       Untuk melihat daftar praktikan yang di-assign via Excel ke suatu praktikum,
 *       gunakan GET /api/registration/practicums/{practicumId}/enrollments.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: OK
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
 *                     $ref: '#/components/schemas/PracticumEnrollment'
 */
/**
 * @openapi
 * /api/registration/enrollments/{id}:
 *   delete:
 *     tags: [Registration]
 *     summary: Cancel enrollment (only owner can cancel)
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
 *         description: Enrollment cancelled
 *       400:
 *         description: Bad request / no permission
 */
/**
 * @openapi
 * /api/registration/practicums/{practicumId}/enroll:
 *   post:
 *     tags: [Registration]
 *     summary: Enroll current user to the practicum specified by path
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: practicumId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       201:
 *         description: Enrollment created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/PracticumEnrollment'
 */
/**
 * @openapi
 * /api/registration/practicums/{practicumId}/enrollments:
 *   get:
 *     tags: [Registration]
 *     summary: List enrollments untuk suatu praktikum
 *     description: >
 *       Daftar semua mahasiswa/praktikan yang di-assign ke praktikum (termasuk hasil import Excel).
 *       Berbeda dengan GET /enrollments yang hanya menampilkan enrollment user yang sedang login.
 *       Role yang diizinkan: kaur_lab, laboran, koordinator_praktikum.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: practicumId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: role
 *         required: false
 *         schema:
 *           type: string
 *           example: mahasiswa
 *         description: Filter by enrollment role (mis. mahasiswa, asisten_praktikum_aktif)
 *     responses:
 *       200:
 *         description: OK
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
 *                     $ref: '#/components/schemas/PracticumEnrollment'
 *       404:
 *         description: Praktikum tidak ditemukan
 *       403:
 *         description: Forbidden
 */
/**
 * @openapi
 * /api/registration/practicums/enrollments/template/download:
 *   get:
 *     tags: [Registration]
 *     summary: Download template Excel assign praktikan ke praktikum
 *     description: >
 *       Download file template Excel (.xlsx) untuk assign mahasiswa/praktikan ke suatu praktikum.
 *       Sheet "Praktikan" berisi kolom NIM dan Kelas (kelas akademik, mis. SI-46-01).
 *       Satu baris = satu mahasiswa yang di-assign ke praktikum target saat import.
 *       Role yang diizinkan: kaur_lab, laboran, koordinator_praktikum.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: File Excel template berhasil diunduh
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 *       403:
 *         description: Forbidden (role tidak diizinkan)
 *       500:
 *         description: Gagal mengunduh template
 */
/**
 * @openapi
 * /api/registration/practicums/{practicumId}/enrollments/import:
 *   post:
 *     tags: [Registration]
 *     summary: Import assign praktikan ke praktikum dari file Excel
 *     description: >
 *       Upload file Excel yang telah diisi sesuai template assign praktikan.
 *       NIM dicocokkan ke user_profiles di user management (wajib sudah terdaftar).
 *       Re-import menghapus enrollment mahasiswa (role mahasiswa) lama di praktikum tersebut,
 *       lalu mengisi ulang dari Excel — tidak menggandakan data.
 *       Enrollment asisten (role selain mahasiswa) tidak dihapus.
 *       Jika ada error pada salah satu baris, seluruh import di-rollback.
 *       Role yang diizinkan: kaur_lab, laboran, koordinator_praktikum.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: practicumId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID praktikum target
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - enrollment_file
 *             properties:
 *               enrollment_file:
 *                 type: string
 *                 format: binary
 *                 description: File Excel (.xlsx) berisi kolom NIM dan Kelas
 *     responses:
 *       200:
 *         description: Import berhasil
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
 *                   example: "25 mahasiswa berhasil di-assign ke praktikum"
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/PracticumEnrollmentImportRow'
 *       400:
 *         description: Validasi gagal (ada error pada baris, atau praktikum tidak valid)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       sheet:
 *                         type: string
 *                       row:
 *                         type: integer
 *                       column:
 *                         type: string
 *                         nullable: true
 *                       error:
 *                         type: string
 *                 preview:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/PracticumEnrollmentImportRow'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (role tidak diizinkan)
 *       500:
 *         description: Internal server error
 */
/**
 * @openapi
 * /api/registration/study-programs/{id}:
 *   get:
 *     tags: [Registration]
 *     summary: Get study program by id
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: OK
 *       404:
 *         description: Not found
 *
 *   put:
 *     tags: [Registration]
 *     summary: Update study program
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               code:
 *                 type: string
 *               name:
 *                 type: string
 *     responses:
 *       200:
 *         description: Updated
 *       404:
 *         description: Not found
 *
 *   delete:
 *     tags: [Registration]
 *     summary: Delete study program (only if it has no laboratories)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Deleted
 *       400:
 *         description: Cannot delete because child resources exist
 *       404:
 *         description: Not found
 */

/**
 * @openapi
 * /api/registration/practicums/{practicumId}/modules:
 *   get:
 *     tags: [Registration]
 *     summary: List practicum modules for a practicum
 *     parameters:
 *       - in: path
 *         name: practicumId
 *         required: false
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: practicum_id
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: OK
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
 *                     $ref: '#/components/schemas/PracticumModule'
 *
 *   post:
 *     tags: [Registration]
 *     summary: Create a practicum module for a practicum
 *     parameters:
 *       - in: path
 *         name: practicumId
 *         required: false
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PracticumModuleCreateRequest'
 *     responses:
 *       201:
 *         description: Created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/PracticumModule'
 *       400:
 *         description: |
 *           Validasi gagal. `required_room_category` harus slug dari
 *           `GET /required-room-categories` atau `GET /room-categories`.
 *
 * /api/registration/practicums/{practicumId}/modules/{id}:
 *   get:
 *     tags: [Registration]
 *     summary: Get practicum module by id
 *     parameters:
 *       - in: path
 *         name: practicumId
 *         required: false
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/PracticumModule'
 *       404:
 *         description: Not found
 *
 *   put:
 *     tags: [Registration]
 *     summary: Update practicum module
 *     description: |
 *       Memperbarui data modul praktikum per ID. Semua field pada body bersifat opsional (partial update).
 *       Field `required_room_category` wajib dikirim jika modul tersebut belum memiliki kategori ruangan (nilai null di database).
 *       Field `week_number` dapat diubah kapan saja (bilangan bulat positif). Wajib dikirim jika modul belum pernah memiliki week_number.
 *     parameters:
 *       - in: path
 *         name: practicumId
 *         required: false
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PracticumModuleUpdateRequest'
 *           examples:
 *             updateRoomCategory:
 *               summary: Ubah kategori ruangan modul
 *               value:
 *                 required_room_category: lab_komputer
 *             updateWeekNumber:
 *               summary: Ubah minggu pelaksanaan modul
 *               value:
 *                 week_number: 8
 *             updateFull:
 *               summary: Perbarui beberapa field sekaligus
 *               value:
 *                 code: MOD-02
 *                 name: Modul Praktikum Lanjut
 *                 description: Sesi praktikum di lab komputer
 *                 required_room_category: lab_komputer
 *                 week_number: 8
 *                 is_individual_mentoring: false
 *     responses:
 *       200:
 *         description: Updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/PracticumModule'
 *       400:
 *         description: Validasi gagal (mis. required_room_category tidak valid atau wajib untuk modul lama)
 *       404:
 *         description: Not found
 *
 *   delete:
 *     tags: [Registration]
 *     summary: Delete practicum module
 *     parameters:
 *       - in: path
 *         name: practicumId
 *         required: false
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Deleted
 *       404:
 *         description: Not found
 */

/**
 *
 */

/** */

/**
 * @openapi
 * components:
 *   schemas:
 *     RoomCategory:
 *       type: object
 *       description: Master kategori ruangan (tabel room_categories)
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         slug:
 *           type: string
 *           description: Kode kategori; dipakai sebagai required_room_category pada modul
 *           example: lab_komputer
 *         label:
 *           type: string
 *           example: Lab Komputer
 *         sort_order:
 *           type: integer
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *
 *     RoomCategoryListResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         data:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/RoomCategory'
 *
 *     RoomCategoryItemResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         data:
 *           $ref: '#/components/schemas/RoomCategory'
 *
 *     RoomCategoryCreateRequest:
 *       type: object
 *       required:
 *         - slug
 *         - label
 *       properties:
 *         slug:
 *           type: string
 *           description: snake_case, huruf kecil, diawali huruf
 *           example: lab_komputer
 *         label:
 *           type: string
 *           example: Lab Komputer
 *         sort_order:
 *           type: integer
 *           minimum: 0
 *           example: 3
 *
 *     RoomCategoryUpdateRequest:
 *       type: object
 *       description: Kirim minimal satu field. Slug tidak dapat diubah lewat API ini.
 *       properties:
 *         label:
 *           type: string
 *           example: Lab Komputer (Updated)
 *         sort_order:
 *           type: integer
 *           minimum: 0
 *           example: 2
 *
 *     PracticumRoomCategory:
 *       type: string
 *       enum:
 *         - classroom
 *         - lab_kelas
 *         - lab_komputer
 *         - lab_exam
 *         - lab_online
 *         - lab_workshop
 *       description: |
 *         Slug kategori ruangan modul praktikum. Harus ada di master
 *         `GET /api/registration/room-categories`. Validasi create/update modul
 *         membaca slug dari database.
 *
 *     RequiredRoomCategoryOption:
 *       type: object
 *       description: Opsi dropdown; value = slug kategori dari room_categories
 *       properties:
 *         value:
 *           $ref: '#/components/schemas/PracticumRoomCategory'
 *         label:
 *           type: string
 *           example: Lab Komputer
 *
 *     PracticumModule:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         practicum_id:
 *           type: string
 *         code:
 *           type: string
 *         name:
 *           type: string
 *         description:
 *           type: string
 *         required_room_category:
 *           $ref: '#/components/schemas/PracticumRoomCategory'
 *           nullable: true
 *           description: |
 *             Slug kategori dari master room_categories (lihat GET /room-categories).
 *             Null pada modul lama sebelum diisi.
 *         week_number:
 *           type: integer
 *           nullable: true
 *           minimum: 1
 *           description: Minggu pelaksanaan modul dalam semester (mis. 7 = minggu ke-7)
 *         is_individual_mentoring:
 *           type: boolean
 *           description: Flag untuk menandakan apakah module menggunakan metode mentoring individu
 *         mentoring_duration_minutes:
 *           type: integer
 *           description: Durasi mentoring per individu dalam menit (hanya diisi jika is_individual_mentoring = true)
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *
 *     PracticumModuleCreateRequest:
 *       type: object
 *       required:
 *         - code
 *         - name
 *         - required_room_category
 *         - week_number
 *       properties:
 *         practicum_id:
 *           type: string
 *           format: uuid
 *           description: Diisi otomatis dari path `{practicumId}` jika endpoint nested
 *         code:
 *           type: string
 *         name:
 *           type: string
 *         description:
 *           type: string
 *         required_room_category:
 *           $ref: '#/components/schemas/PracticumRoomCategory'
 *           description: |
 *             Wajib. Ambil `value` dari GET /required-room-categories
 *             (contoh lab_komputer, classroom).
 *         week_number:
 *           type: integer
 *           minimum: 1
 *           description: Minggu pelaksanaan modul dalam semester
 *         is_individual_mentoring:
 *           type: boolean
 *           description: Flag untuk menandakan apakah module menggunakan metode mentoring individu
 *         mentoring_duration_minutes:
 *           type: integer
 *           description: Durasi mentoring per individu dalam menit (hanya diisi jika is_individual_mentoring = true)
 *
 *     PracticumModuleUpdateRequest:
 *       type: object
 *       description: Body partial update per modul. Kirim hanya field yang ingin diubah.
 *       properties:
 *         practicum_id:
 *           type: string
 *           format: uuid
 *         code:
 *           type: string
 *         name:
 *           type: string
 *         description:
 *           type: string
 *         required_room_category:
 *           $ref: '#/components/schemas/PracticumRoomCategory'
 *           description: |
 *             Slug dari GET /required-room-categories. Wajib dikirim saat update
 *             jika modul belum pernah memiliki kategori (kolom masih null).
 *         week_number:
 *           type: integer
 *           minimum: 1
 *           description: |
 *             Minggu pelaksanaan modul.
 *             Wajib dikirim saat update jika modul belum pernah memiliki week_number (kolom masih null).
 *         is_individual_mentoring:
 *           type: boolean
 *           description: Flag untuk menandakan apakah module menggunakan metode mentoring individu
 *         mentoring_duration_minutes:
 *           type: integer
 *           description: Durasi mentoring per individu dalam menit (hanya diisi jika is_individual_mentoring = true)
 *
 *     KsmImport:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         uploaded_by:
 *           type: string
 *           format: uuid
 *         filename:
 *           type: string
 *         original_filename:
 *           type: string
 *         status:
 *           type: string
 *           enum: [pending, processing, completed, failed]
 *         note:
 *           type: string
 *           nullable: true
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *
 *     KsmEntry:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         ksm_import_id:
 *           type: string
 *           format: uuid
 *         nim:
 *           type: string
 *         course_code:
 *           type: string
 *         course_name:
 *           type: string
 *         day:
 *           type: string
 *         time_range:
 *           type: string
 *         location:
 *           type: string
 *         mapped:
 *           type: boolean
 */

/**
 * @openapi
 * components:
 *   schemas:
 *     PracticumEnrollment:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         practicum_id:
 *           type: string
 *         student_id:
 *           type: string
 *           description: User ID of the student (from JWT)
 *         student_name:
 *           type: string
 *           nullable: true
 *           description: Nama mahasiswa (hanya pada GET practicum enrollments)
 *         student_nim:
 *           type: string
 *           nullable: true
 *           description: NIM mahasiswa (hanya pada GET practicum enrollments)
 *         role:
 *           type: string
 *           description: Role in the practicum (e.g., mahasiswa, asisten_praktikum)
 *         status:
 *           type: string
 *         class_group:
 *           type: string
 *           nullable: true
 *           description: Kelas akademik mahasiswa, mis. SI-46-01
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *
 *     PracticumEnrollmentImportRow:
 *       type: object
 *       properties:
 *         sheet:
 *           type: string
 *         row:
 *           type: integer
 *         enrollmentId:
 *           type: string
 *           format: uuid
 *         nim:
 *           type: string
 *         classGroup:
 *           type: string
 *         studentUserId:
 *           type: string
 *         studentName:
 *           type: string
 *           nullable: true
 */

/**
 * @openapi
 * /api/registration/laboratories:
 *   get:
 *     tags: [Registration]
 *     summary: List laboratories
 *     parameters:
 *       - in: query
 *         name: study_program_id
 *         schema:
 *           type: string
 *         description: Filter by study program id
 *     responses:
 *       200:
 *         description: OK
 *
 *   post:
 *     tags: [Registration]
 *     summary: Create a laboratory
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               study_program_id:
 *                 type: string
 *               code:
 *                 type: string
 *               name:
 *                 type: string
 *     responses:
 *       201:
 *         description: Created
 */

/**
 * @openapi
 * /api/registration/laboratories/{id}:
 *   get:
 *     tags: [Registration]
 *     summary: Get laboratory by id
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: OK
 *       404:
 *         description: Not found
 *
 *   put:
 *     tags: [Registration]
 *     summary: Update laboratory
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               study_program_id:
 *                 type: string
 *               code:
 *                 type: string
 *               name:
 *                 type: string
 *     responses:
 *       200:
 *         description: Updated
 *       404:
 *         description: Not found
 *
 *   delete:
 *     tags: [Registration]
 *     summary: Delete laboratory (only if it has no practicums)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Deleted
 *       400:
 *         description: Cannot delete because child resources exist
 *       404:
 *         description: Not found
 */

/**
 * @openapi
 * /api/registration/practicums:
 *   get:
 *     tags: [Registration]
 *     summary: List practicums
 *     parameters:
 *       - in: query
 *         name: laboratory_id
 *         schema:
 *           type: string
 *         description: Filter by laboratory id
 *       - in: query
 *         name: periode
 *         schema:
 *           type: string
 *         description: |
 *           Filter periode (mis. `2526-2`). Tanpa parameter = semua periode.
 *           Nilai `active` = periode dari GET /periode/active.
 *     responses:
 *       200:
 *         description: OK
 *
 *   post:
 *     tags: [Registration]
 *     summary: Create a practicum
 *     description: |
 *       Field `periode` opsional; jika tidak dikirim, memakai periode aktif (GET/PUT /periode/active).
 *       Jika periode aktif belum dikonfigurasi dan `periode` tidak dikirim, request ditolak (400).
 *       Field `code` opsional (auto dari nama jika kosong).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - laboratory_id
 *               - name
 *             properties:
 *               laboratory_id:
 *                 type: string
 *               code:
 *                 type: string
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               periode:
 *                 type: string
 *                 description: Label periode (mis. 2526-2); opsional jika periode aktif sudah diset
 *     responses:
 *       201:
 *         description: Created
 *       400:
 *         description: Periode aktif belum dikonfigurasi atau validasi gagal
 *       409:
 *         description: Duplikat (laboratory_id, name, periode)
 */

/**
 * @openapi
 * /api/registration/practicums/{id}:
 *   get:
 *     tags: [Registration]
 *     summary: Get practicum by id
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: OK
 *       404:
 *         description: Not found
 *
 *   put:
 *     tags: [Registration]
 *     summary: Update practicum
 *     description: |
 *       Ubah `periode` hanya diizinkan jika praktikum belum punya modul atau enrollment.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               laboratory_id:
 *                 type: string
 *               code:
 *                 type: string
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               periode:
 *                 type: string
 *     responses:
 *       200:
 *         description: Updated
 *       400:
 *         description: Periode tidak dapat diubah atau validasi gagal
 *       404:
 *         description: Not found
 *       409:
 *         description: Duplikat (laboratory_id, name, periode)
 *
 *   delete:
 *     tags: [Registration]
 *     summary: Delete practicum (only if it has no modules or enrollments)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Deleted
 *       400:
 *         description: Cannot delete because child resources exist
 *       404:
 *         description: Not found
 */

/**
 */

/** */

/**
 * @openapi
 * components:
 *   schemas:
 *     StudyProgram:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         code:
 *           type: string
 *         name:
 *           type: string
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 */

/** */

/**
 * @openapi
 * components:
 *   schemas:
 *     Laboratory:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         study_program_id:
 *           type: string
 *         code:
 *           type: string
 *         name:
 *           type: string
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *
 *     Practicum:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         laboratory_id:
 *           type: string
 *         code:
 *           type: string
 *         name:
 *           type: string
 *         description:
 *           type: string
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 */

/**
 * @openapi
 * /api/registration/schedules:
 *   get:
 *     tags: [Registration]
 *     summary: List schedules
 *     parameters:
 *       - in: query
 *         name: module_id
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by module id
 *       - in: query
 *         name: periode
 *         schema:
 *           type: string
 *         description: >
 *           Filter jadwal berdasarkan `practicums.periode` (via relasi module).
 *           Nilai `active` = periode dari GET /periode/active.
 *           Jika tidak dikirim, default ke `active`.
 *       - in: query
 *         name: filter_by_me
 *         schema:
 *           type: boolean
 *         description: >
 *           Jika true, hanya jadwal di mana user adalah asisten atau punya booking aktif.
 *     responses:
 *       200:
 *         description: OK
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
 *                     $ref: '#/components/schemas/Schedule'
 *       400:
 *         description: Periode aktif belum dikonfigurasi (saat `periode=active` atau default active)
 *
 *   post:
 *     tags: [Registration]
 *     summary: Create a schedule
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - module_id
 *               - start_time
 *               - end_time
 *             properties:
 *               module_id:
 *                 type: string
 *                 format: uuid
 *               start_time:
 *                 type: string
 *                 format: date-time
 *                 description: Waktu mulai jadwal asisten
 *               end_time:
 *                 type: string
 *                 format: date-time
 *                 description: Waktu akhir jadwal asisten
 *               venue:
 *                 type: string
 *               assistants:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of user_id with role asisten_praktikum_aktif
 *     responses:
 *       201:
 *         description: Created
 *       400:
 *         description: Bad request (invalid module_id or assistants)
 */

/**
 * @openapi
 * /api/registration/schedules/assistants:
 *   get:
 *     tags: [Registration]
 *     summary: Get available assistants
 *     description: >
 *       Daftar asisten aktif terdaftar untuk praktikum terpilih pada periode berjalan (registry import Excel).
 *       Query `practicum_id` wajib. Role UM sudah di-assign saat import registry.
 *     parameters:
 *       - in: query
 *         name: practicum_id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID praktikum yang dipilih
 *     responses:
 *       200:
 *         description: OK
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
 *                     type: object
 *                     properties:
 *                       user_id:
 *                         type: string
 *                       name:
 *                         type: string
 *                         nullable: true
 *                       nipnim:
 *                         type: string
 *                         nullable: true
 *                         description: "NIM/NIP dari profil (referensi; template import pakai kolom NIM Asisten)"
 */

/**
 * @openapi
 * /api/registration/schedules/template/download:
 *   get:
 *     tags: [Registration]
 *     summary: Download template Excel jadwal praktikum
 *     description: >
 *       Download file template Excel (.xlsx) untuk mengisi jadwal praktikum.
 *       Header Content-Disposition memakai nama file tetap: template penjadwalan.xlsx
 *       (bukan UUID atau nama dinamis lain dari server).
 *       Template berisi N sheet (default 1) dengan nama "Modul 1", "Modul 2", dst.
 *       Setiap sheet akan dipetakan ke practicum_module berdasarkan urutan sequence
 *       saat di-import (Sheet "Modul 1" -> module dengan sequence terendah, dst).
 *       Setiap sheet berisi kolom: Hari, Detail Kegiatan, Tanggal, Jam Mulai, Jam Berakhir,
 *       Hitungan Jam (auto), NIM Asisten (1-15 digit per asisten; pisahkan dengan koma atau titik koma), Kelas (reguler/inter).
 *       File lama dengan header "Kode Asisten" masih dibaca sebagai kolom NIM (nilai harus angka valid).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: count
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 1
 *         description: Jumlah sheet/module yang ingin di-generate di template (default 1, max 50)
 *     responses:
 *       200:
 *         description: File Excel template berhasil diunduh
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 *       500:
 *         description: Gagal mengunduh template
 */

/**
 * @openapi
 * /api/registration/schedules/import:
 *   post:
 *     tags: [Registration]
 *     summary: Import jadwal dari file Excel
 *     description: >
 *       Upload file Excel multi-sheet yang telah diisi sesuai template.
 *       Mapping: Sheet "Modul 1" -> practicum_module dengan sequence terendah,
 *       Sheet "Modul 2" -> sequence berikutnya, dst.
 *       Jika jumlah sheet < jumlah module: sisa module akan di-skip (OK).
 *       Jika jumlah sheet > jumlah module: ERROR, import dibatalkan.
 *       Jika ada error pada salah satu baris, seluruh import di-rollback (tidak ada data yang tersimpan).
 *       Tiap sheet: jadwal lama untuk module terkait dihapus dulu lalu diisi ulang dari Excel (re-import tidak dobel).
 *       Kolom Hitungan Jam otomatis dihitung dari Jam Berakhir - Jam Mulai.
 *       Kolom Hari otomatis dihitung dari Tanggal jika dikosongkan.
 *       Asisten per baris disimpan ke schedule_assistants sebagai NIM (1-15 digit) tanpa lookup user_management.
 *       Baris dengan user_id dari API create/update tetap memakai user_id.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - schedule_file
 *               - study_program_id
 *               - laboratory_id
 *               - practicum_id
 *             properties:
 *               schedule_file:
 *                 type: string
 *                 format: binary
 *                 description: File Excel (.xlsx) yang telah diisi sesuai template
 *               study_program_id:
 *                 type: string
 *                 format: uuid
 *                 description: ID program studi
 *               laboratory_id:
 *                 type: string
 *                 format: uuid
 *                 description: ID laboratorium (harus milik study_program_id)
 *               practicum_id:
 *                 type: string
 *                 format: uuid
 *                 description: ID praktikum (harus milik laboratory_id)
 *     responses:
 *       200:
 *         description: Import berhasil
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
 *                   example: "5 jadwal berhasil diimport"
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ScheduleImportRow'
 *       400:
 *         description: Validasi gagal (ada error pada baris/sheet, atau praktikum tidak valid)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       sheet:
 *                         type: string
 *                         description: Nama sheet yang error
 *                       row:
 *                         type: integer
 *                         description: Nomor baris di Excel yang error
 *                       column:
 *                         type: string
 *                         nullable: true
 *                         description: Nama kolom terkait (mis. NIM Asisten), jika ada
 *                       error:
 *                         type: string
 *                         description: Pesan error
 *                 preview:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ScheduleImportRow'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (role tidak diizinkan)
 *       500:
 *         description: Internal server error
 */

/**
 * @openapi
 * /api/registration/schedules/{id}:
 *   get:
 *     tags: [Registration]
 *     summary: Get schedule by id
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Schedule'
 *       404:
 *         description: Not found
 *
 *   put:
 *     tags: [Registration]
 *     summary: Update schedule
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               module_id:
 *                 type: string
 *                 format: uuid
 *               start_time:
 *                 type: string
 *                 format: date-time
 *                 description: Waktu mulai jadwal asisten
 *               end_time:
 *                 type: string
 *                 format: date-time
 *                 description: Waktu akhir jadwal asisten
 *               venue:
 *                 type: string
 *                 nullable: true
 *               week_number:
 *                 type: integer
 *                 minimum: 1
 *                 description: |
 *                   Minggu pelaksanaan modul terkait (di-update pada practicum_modules, bukan kolom schedules).
 *               assistants:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of user_id with role asisten_praktikum_aktif
 *     responses:
 *       200:
 *         description: Updated
 *       400:
 *         description: Bad request (invalid module_id, assistants, week_number, or schedule has active bookings)
 *       404:
 *         description: Not found
 *
 *   delete:
 *     tags: [Registration]
 *     summary: Delete schedule
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Deleted
 *       400:
 *         description: Cannot delete because schedule has active bookings
 *       404:
 *         description: Not found
 */

/**
 * @openapi
 * /api/registration/schedules/{scheduleId}/slots:
 *   get:
 *     tags: [Registration]
 *     summary: Get schedule with slots and bookings
 *     parameters:
 *       - in: path
 *         name: scheduleId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/ScheduleWithSlots'
 *       404:
 *         description: Schedule not found
 *
 * /api/registration/schedules/{scheduleId}/slots/available:
 *   get:
 *     tags: [Registration]
 *     summary: Get available slots for a schedule
 *     parameters:
 *       - in: path
 *         name: scheduleId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: OK
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
 *                     $ref: '#/components/schemas/ScheduleSlot'
 *
 * /api/registration/schedules/{scheduleId}/slots/{slotId}/book:
 *   post:
 *     tags: [Registration]
 *     summary: Book a slot
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: scheduleId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: slotId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       201:
 *         description: Slot booked successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/ScheduleBooking'
 *                 message:
 *                   type: string
 *       400:
 *         description: Bad request (slot not available, already booked today, etc.)
 *       401:
 *         description: Unauthorized
 *
 * /api/registration/schedules/bookings/my-bookings:
 *   get:
 *     tags: [Registration]
 *     summary: Get my bookings
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, cancelled]
 *       - in: query
 *         name: periode
 *         schema:
 *           type: string
 *         description: >
 *           Filter booking berdasarkan periode praktikum jadwal terkait.
 *           Nilai `active` = periode dari GET /periode/active. Default `active`.
 *     responses:
 *       200:
 *         description: OK
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
 *                     $ref: '#/components/schemas/ScheduleBooking'
 *       400:
 *         description: Periode aktif belum dikonfigurasi
 *       401:
 *         description: Unauthorized
 *
 * /api/registration/schedules/bookings/my-assigned-schedules:
 *   get:
 *     tags: [Registration]
 *     summary: Get bookings assigned to me (asisten praktikum aktif)
 *     description: Returns all bookings in schedules where the user is assigned as assistant. Only accessible by users with role asisten_praktikum_aktif.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, cancelled]
 *         description: Filter bookings by status
 *       - in: query
 *         name: periode
 *         schema:
 *           type: string
 *         description: >
 *           Filter booking di jadwal asisten berdasarkan periode praktikum.
 *           Nilai `active` = periode dari GET /periode/active. Default `active`.
 *     responses:
 *       200:
 *         description: OK
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
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         format: uuid
 *                       slot_id:
 *                         type: string
 *                         format: uuid
 *                       user_id:
 *                         type: string
 *                         description: User ID dari mahasiswa yang booking
 *                       booking_date:
 *                         type: string
 *                         format: date
 *                       status:
 *                         type: string
 *                         enum: [active, cancelled]
 *                       slot_number:
 *                         type: integer
 *                       slot_start_time:
 *                         type: string
 *                         format: date-time
 *                       slot_end_time:
 *                         type: string
 *                         format: date-time
 *                       schedule_id:
 *                         type: string
 *                         format: uuid
 *                       module_id:
 *                         type: string
 *                         format: uuid
 *                       schedule_start_time:
 *                         type: string
 *                         format: date-time
 *                       schedule_end_time:
 *                         type: string
 *                         format: date-time
 *                       venue:
 *                         type: string
 *                 message:
 *                   type: string
 *       400:
 *         description: Periode aktif belum dikonfigurasi
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (user does not have role asisten_praktikum_aktif)
 *
 * /api/registration/schedules/bookings/{bookingId}:
 *   get:
 *     tags: [Registration]
 *     summary: Get booking by id
 *     parameters:
 *       - in: path
 *         name: bookingId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/ScheduleBooking'
 *       404:
 *         description: Booking not found
 *
 *   delete:
 *     tags: [Registration]
 *     summary: Cancel booking
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: bookingId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Booking cancelled successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       400:
 *         description: Bad request (booking not found, already cancelled, no permission)
 *       401:
 *         description: Unauthorized
 */

/**
 * @openapi
 * /api/registration/ksm/upload:
 *   post:
 *     tags: [Registration]
 *     summary: Upload file KSM (PDF)
 *     description: Upload file KSM untuk pemrosesan background dan mapping ke jadwal.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               ksm_file:
 *                 type: string
 *                 format: binary
 *                 description: File KSM (PDF)
 *     responses:
 *       200:
 *         description: Upload diterima dan diproses secara background
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 importId:
 *                   type: string
 *                   format: uuid
 *       400:
 *         description: Bad request (file tidak ditemukan atau salah)
 *       401:
 *         description: Unauthorized - token invalid or missing
 */

/**
 * @openapi
 * /api/registration/ksm/imports/{id}:
 *   get:
 *     tags: [Registration]
 *     summary: Get a single KSM import metadata
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
 *         description: KSM import retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 import:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     uploaded_by:
 *                       type: string
 *                     filename:
 *                       type: string
 *                     original_filename:
 *                       type: string
 *                     status:
 *                       type: string
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Import not found
 *
 * /api/registration/ksm/imports/me:
 *   get:
 *     tags: [Registration]
 *     summary: Get my latest KSM import metadata (no id required)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: KSM import for current user
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 import:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     uploaded_by:
 *                       type: string
 *                     filename:
 *                       type: string
 *                     original_filename:
 *                       type: string
 *                     status:
 *                       type: string
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Import not found

* /api/registration/ksm/imports/module/{moduleId}:
*   get:
*     tags: [Registration]
*     summary: Get all KSM imports for a module (assistants only)
*     description: Returns enriched list of KSM imports for the given module. Accessible to users with assistant roles or assistants assigned to the module schedules.
*     security:
*       - bearerAuth: []
*     parameters:
*       - name: moduleId
*         in: path
*         required: true
*         schema:
*           type: string
*         description: Module identifier (module id or code)
*     responses:
*       200:
*         description: List of imports for module
*         content:
*           application/json:
*             schema:
*               type: object
*               properties:
*                 success:
*                   type: boolean
*                 imports:
*                   type: array
*                   items:
*                     type: object
*                     properties:
*                       id:
*                         type: string
*                       uploaded_by:
*                         type: string
*                       uploader_name:
*                         type: string
*                       uploader_email:
*                         type: string
*                       original_filename:
*                         type: string
*                       status:
*                         type: string
*                       created_at:
*                         type: string
*       400:
*         description: moduleId required
*       401:
*         description: Unauthorized
*       403:
*         description: Access denied

* /api/registration/ksm/imports/all:
*   get:
*     tags: [Registration]
*     summary: Get all KSM imports across modules (assistants only)
*     description: Returns all KSM imports in the system. Restricted to assistant roles to avoid exposing all student documents to general users. Consider adding paging in production.
*     security:
*       - bearerAuth: []
*     responses:
*       200:
*         description: List of all imports
*         content:
*           application/json:
*             schema:
*               type: object
*               properties:
*                 success:
*                   type: boolean
*                 imports:
*                   type: array
*                   items:
*                     type: object
*                     properties:
*                       id:
*                         type: string
*                       uploaded_by:
*                         type: string
*                       uploader_name:
*                         type: string
*                       uploader_email:
*                         type: string
*                       module_id:
*                         type: string
*                       original_filename:
*                         type: string
*                       status:
*                         type: string
*                       created_at:
*                         type: string
*       401:
*         description: Unauthorized
*       403:
*         description: Access denied

 *   put:
 *     tags: [Registration]
 *     summary: Replace current user's KSM import file
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               ksm_file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Import updated for current user
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (not uploader)
 *
 *   delete:
 *     tags: [Registration]
 *     summary: Delete current user's KSM import and its file
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Import deleted
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (not uploader)
 *       404:
 *         description: Import not found
 */

/**
 * @openapi
 * components:
 *   schemas:
 *     Schedule:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         module_id:
 *           type: string
 *           format: uuid
 *         week_number:
 *           type: integer
 *           nullable: true
 *           minimum: 1
 *           description: Minggu pelaksanaan dari modul terkait (join practicum_modules)
 *         module_sequence:
 *           type: integer
 *           nullable: true
 *           description: Urutan modul dalam praktikum (join practicum_modules)
 *         start_time:
 *           type: string
 *           format: date-time
 *           description: Waktu mulai jadwal asisten
 *         end_time:
 *           type: string
 *           format: date-time
 *           description: Waktu akhir jadwal asisten
 *         venue:
 *           type: string
 *           nullable: true
 *           description: Venue/lokasi jadwal (null sampai penugasan laboran)
 *         ttlock_sync_status:
 *           type: string
 *           enum: [not_sync, sync]
 *           description: Status sinkronisasi jadwal ke TTLock (default not_sync)
 *         detail_kegiatan:
 *           type: string
 *           nullable: true
 *           description: Detail/deskripsi kegiatan praktikum
 *         tanggal:
 *           type: string
 *           format: date
 *           nullable: true
 *           description: Tanggal pelaksanaan (DATE only)
 *         jam_mulai:
 *           type: string
 *           nullable: true
 *           description: "Jam mulai kegiatan (format: HH:MM)"
 *         jam_berakhir:
 *           type: string
 *           nullable: true
 *           description: "Jam berakhir kegiatan (format: HH:MM)"
 *         hitungan_jam:
 *           type: number
 *           nullable: true
 *           description: Durasi jam (auto-calculated dari jam_berakhir - jam_mulai)
 *         kelas:
 *           type: string
 *           nullable: true
 *           enum: [reguler, inter]
 *           description: "Tipe kelas: reguler atau inter"
 *         assistants:
 *           type: array
 *           description: >
 *             Daftar asisten. Dari API manual: item berisi user_id saja (string).
 *             Dari DB lengkap: objek dengan user_id (nullable), nim (nullable);
 *             tepat satu dari user_id atau nim wajib sesuai aturan per baris.
 *           items:
 *             oneOf:
 *               - type: string
 *                 description: user_id (payload create/update schedule)
 *               - type: object
 *                 properties:
 *                   user_id:
 *                     type: string
 *                     nullable: true
 *                   nim:
 *                     type: string
 *                     nullable: true
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *
 *     ScheduleImportRow:
 *       type: object
 *       properties:
 *         sheet:
 *           type: string
 *           description: Nama sheet sumber data (misal "Modul 1")
 *         row:
 *           type: integer
 *           description: Nomor baris di Excel
 *         scheduleId:
 *           type: string
 *           format: uuid
 *         moduleId:
 *           type: string
 *           format: uuid
 *           description: ID practicum_module tujuan import
 *         hari:
 *           type: string
 *           description: Hari (auto-derived dari tanggal)
 *         detailKegiatan:
 *           type: string
 *         tanggal:
 *           type: string
 *           format: date
 *         jamMulai:
 *           type: string
 *         jamBerakhir:
 *           type: string
 *         hitunganJam:
 *           type: number
 *         kelas:
 *           type: string
 *           enum: [reguler, inter]
 *         assistants:
 *           type: array
 *           description: Daftar NIM asisten yang diimport untuk baris tersebut
 *           items:
 *             type: object
 *             properties:
 *               nim:
 *                 type: string
 *         warnings:
 *           type: array
 *           items:
 *             type: string
 *           description: Peringatan (jika ada)
 *
 *     ScheduleWithSlots:
 *       type: object
 *       allOf:
 *         - $ref: '#/components/schemas/Schedule'
 *         - type: object
 *           properties:
 *             slots:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ScheduleSlotWithBooking'
 *             available_slots:
 *               type: integer
 *               description: Jumlah slot yang masih tersedia
 *             booked_slots:
 *               type: integer
 *               description: Jumlah slot yang sudah dibooking
 *
 *     ScheduleSlot:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         schedule_id:
 *           type: string
 *           format: uuid
 *         slot_number:
 *           type: integer
 *           description: Urutan slot (1, 2, 3, ...)
 *         start_time:
 *           type: string
 *           format: date-time
 *           description: Waktu mulai slot
 *         end_time:
 *           type: string
 *           format: date-time
 *           description: Waktu akhir slot
 *         status:
 *           type: string
 *           enum: [available, not_available]
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *
 *     ScheduleSlotWithBooking:
 *       type: object
 *       allOf:
 *         - $ref: '#/components/schemas/ScheduleSlot'
 *         - type: object
 *           properties:
 *             booking:
 *               oneOf:
 *                 - $ref: '#/components/schemas/ScheduleBooking'
 *                 - type: "null"
 *               nullable: true
 *
 *     ScheduleBooking:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         slot_id:
 *           type: string
 *           format: uuid
 *         user_id:
 *           type: string
 *           description: User ID dari mahasiswa yang booking
 *         booking_date:
 *           type: string
 *           format: date
 *           description: Tanggal saat booking (untuk validasi 1 slot per hari)
 *         status:
 *           type: string
 *           enum: [active, cancelled]
 *         cancelled_by:
 *           type: string
 *           nullable: true
 *           description: User ID yang cancel booking (bisa mahasiswa atau asisten)
 *         cancelled_at:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *
 *     ModuleAssessmentComponent:
 *       type: object
 *       required: [type, enabled, weight_percent]
 *       properties:
 *         type:
 *           type: string
 *           enum: [tugas_pendahuluan, tes_awal, jurnal, tes_akhir, audit]
 *         enabled:
 *           type: boolean
 *         weight_percent:
 *           type: integer
 *           minimum: 0
 *           maximum: 100
 *           description: Untuk komponen non-aktif harus 0; jumlah pada yang aktif harus 100
 *
 *     ModuleAssessmentModuleRow:
 *       type: object
 *       properties:
 *         module_id:
 *           type: string
 *           format: uuid
 *         practicum_id:
 *           type: string
 *           format: uuid
 *         code:
 *           type: string
 *           nullable: true
 *         name:
 *           type: string
 *         description:
 *           type: string
 *           nullable: true
 *         is_individual_mentoring:
 *           type: boolean
 *         mentoring_duration_minutes:
 *           type: integer
 *           nullable: true
 *         locked:
 *           type: boolean
 *           description: true jika sudah ada nilai di practicum_module_assessment_grades untuk modul ini
 *         editable:
 *           type: boolean
 *         has_stored_config:
 *           type: boolean
 *           description: false sampai pertama kali disimpan via PUT
 *         components:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/ModuleAssessmentComponent'
 *
 *     ModuleAssessmentConfigResponse:
 *       type: object
 *       properties:
 *         practicum_id:
 *           type: string
 *           format: uuid
 *         modules:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/ModuleAssessmentModuleRow'
 */

/**
 * @openapi
 * /api/registration/practicums/{practicumId}/module-assessment-config:
 *   get:
 *     tags: [Registration]
 *     summary: Konfigurasi komponen penilaian per modul (sinkron dengan modul praktikum)
 *     description: |
 *       **Hanya pengguna dengan role `koordinator_praktikum`** (cek `user_roles` di user-management; fallback klaim JWT yang memuat slug tersebut).
 *       Mengembalikan satu baris per practicum_modules pada praktikum tersebut.
 *       Modul baru otomatis muncul di response (belum has_stored_config).
 *       Jika sudah ada data di practicum_module_assessment_grades untuk modul tersebut, locked menjadi true dan PUT ditolak.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: practicumId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/ModuleAssessmentConfigResponse'
 *       403:
 *         description: Bukan koordinator praktikum
 *       404:
 *         description: Praktikum tidak ditemukan
 *   put:
 *     tags: [Registration]
 *     summary: Simpan bobot komponen penilaian (bulk per modul)
 *     description: |
 *       **Hanya `koordinator_praktikum`** (sama seperti GET; bukan kaur_lab/laboran).
 *       Per modul pada payload harus memuat tepat lima komponen; minimal satu enabled;
 *       jumlah weight_percent pada komponen yang enabled harus tepat 100.
 *       Modul yang locked menyebabkan seluruh permintaan gagal dengan 409.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: practicumId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [modules]
 *             properties:
 *               practicum_id:
 *                 type: string
 *                 format: uuid
 *                 description: Opsional; jika diisi harus sama dengan practicumId di path
 *               modules:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [module_id, components]
 *                   properties:
 *                     module_id:
 *                       type: string
 *                       format: uuid
 *                     components:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/ModuleAssessmentComponent'
 *     responses:
 *       200:
 *         description: Tersimpan; body mengikuti bentuk GET
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/ModuleAssessmentConfigResponse'
 *       400:
 *         description: Validasi gagal
 *       403:
 *         description: Bukan koordinator praktikum / tidak terautentikasi
 *       404:
 *         description: Praktikum tidak ditemukan
 *       409:
 *         description: Konfigurasi terkunci karena nilai sudah masuk untuk salah satu modul pada payload
 */

/**
 * @openapi
 * /api/registration/operational-settings:
 *   get:
 *     tags: [Registration]
 *     summary: Bundle pengaturan operasional (key-value + hari libur)
 *     description: |
 *       Key-value (cutoff, dll.) diubah lewat PUT `/operational-settings/settings/{key}`.
 *       Hari libur ditambah lewat POST `/operational-settings/holidays` (bukan POST di path settings).
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     settings:
 *                       type: object
 *                       additionalProperties:
 *                         type: object
 *                         properties:
 *                           value: {}
 *                           description:
 *                             type: string
 *                             nullable: true
 *                           updated_at:
 *                             type: string
 *                             format: date-time
 *                     holidays:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/RegistrationHoliday'
 *
 * /api/registration/operational-settings/settings/{key}:
 *   put:
 *     tags: [Registration]
 *     summary: Upsert satu key pengaturan (idempotent; bukan POST)
 *     description: |
 *       Membuat atau memperbarui nilai untuk `setting_key` tertentu. OpenAPI memakai PUT untuk upsert per key.
 *       Untuk menambah **tanggal libur**, gunakan **POST** `/api/registration/operational-settings/holidays`.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *           example: enrollment_cutoff_date
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - value
 *             properties:
 *               value:
 *                 description: Nilai JSON (string/number/object). Tanggal disarankan ISO `YYYY-MM-DD`.
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: OK
 *       400:
 *         description: Bad request
 *   delete:
 *     tags: [Registration]
 *     summary: Hapus satu key pengaturan
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Deleted
 *       404:
 *         description: Not found
 *
 * /api/registration/operational-settings/holidays:
 *   get:
 *     tags: [Registration]
 *     summary: Daftar hari libur
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: OK
 *   post:
 *     tags: [Registration]
 *     summary: Tambah hari libur
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - holiday_date
 *             properties:
 *               holiday_date:
 *                 type: string
 *                 format: date
 *                 example: "2026-12-25"
 *               label:
 *                 type: string
 *                 example: Natal
 *     responses:
 *       201:
 *         description: Created
 *       409:
 *         description: Tanggal sudah ada
 *
 * /api/registration/operational-settings/holidays/{id}:
 *   delete:
 *     tags: [Registration]
 *     summary: Hapus hari libur
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
 *         description: Deleted
 *       404:
 *         description: Not found
 *
 * /api/registration/periode/active:
 *   get:
 *     tags: [Registration]
 *     summary: Ambil periode akademik yang sedang aktif
 *     description: |
 *       Nilai disimpan di backend (`registration_settings.active_periode`).
 *       Daftar opsi dropdown diambil FE dari Auth FRI Gateway `GET /periodes` (JWT).
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     active_periode:
 *                       nullable: true
 *                       oneOf:
 *                         - type: string
 *                         - type: object
 *                           properties:
 *                             id:
 *                               type: string
 *                             label:
 *                               type: string
 *                     updated_at:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *   put:
 *     tags: [Registration]
 *     summary: Set periode akademik aktif
 *     description: |
 *       Hanya kaur_lab, laboran, atau koordinator_praktikum.
 *       Simpan id/label dari item yang dipilih di dropdown gateway.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - active_periode
 *             properties:
 *               active_periode:
 *                 description: String label atau object { id, label } dari gateway
 *                 oneOf:
 *                   - type: string
 *                     example: "2024/2025 Ganjil"
 *                   - type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       label:
 *                         type: string
 *     responses:
 *       200:
 *         description: Periode aktif diperbarui
 *       400:
 *         description: Bad request
 *       403:
 *         description: Forbidden
 *
 * /api/registration/active-assistants/template/download:
 *   get:
 *     tags: [Registration]
 *     summary: Download template Excel asisten praktikum aktif
 *     description: |
 *       Template berisi kolom NIM (1 baris = 1 mahasiswa asisten aktif).
 *       Sheet default: "Asisten Aktif".
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: File Excel template berhasil diunduh
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 *       403:
 *         description: Forbidden (hanya kaur_lab atau laboran)
 *
 * /api/registration/active-assistants:
 *   get:
 *     tags: [Registration]
 *     summary: Daftar asisten praktikum aktif per praktikum (periode berjalan)
 *     description: |
 *       Mengembalikan daftar yang diimport untuk praktikum terpilih pada periode aktif saat ini
 *       (GET /api/registration/periode/active). Query `practicum_id` wajib.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: practicum_id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID praktikum yang dipilih
 *     responses:
 *       200:
 *         description: OK
 *       400:
 *         description: practicum_id kosong, periode aktif belum dikonfigurasi, atau praktikum tidak valid
 *       403:
 *         description: Forbidden
 *
 * /api/registration/active-assistants/import:
 *   post:
 *     tags: [Registration]
 *     summary: Import asisten praktikum aktif dari Excel
 *     description: |
 *       Laboran atau kaur lab memilih praktikum terlebih dahulu, lalu mengunggah Excel berisi NIM
 *       mahasiswa yang menjadi asisten praktikum aktif untuk praktikum tersebut pada periode aktif.
 *
 *       Perilaku:
 *       - Re-import hanya mengganti daftar praktikum terpilih (praktikum lain tidak terpengaruh).
 *       - Role `asisten_praktikum` + `asisten_praktikum_aktif` di-assign segera setelah import berhasil.
 *       - NIM harus terdaftar di user management (`user_profiles.nipnim`).
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - assistant_file
 *               - practicum_id
 *             properties:
 *               assistant_file:
 *                 type: string
 *                 format: binary
 *                 description: File Excel (.xlsx) dengan kolom NIM
 *               practicum_id:
 *                 type: string
 *                 format: uuid
 *                 description: Praktikum yang dipilih sebelum import
 *     responses:
 *       200:
 *         description: Import berhasil; role asisten sudah di-assign
 *       400:
 *         description: Validasi gagal, practicum_id kosong, atau periode aktif belum dikonfigurasi
 *       403:
 *         description: Forbidden
 *
 * components:
 *   schemas:
 *     RegistrationHoliday:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         holiday_date:
 *           type: string
 *           format: date
 *         label:
 *           type: string
 *           nullable: true
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 */
