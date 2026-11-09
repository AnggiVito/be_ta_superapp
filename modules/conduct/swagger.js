/**
 * Swagger Documentation untuk Modul Conduct (Pelaksanaan)
 */

/**
 * @swagger
 * tags:
 *   - name: Conduct
 *     description: API untuk modul Conduct (Pelaksanaan)
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     PracticumSimulation:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         simulation_name:
 *           type: string
 *         simulation_date:
 *           type: string
 *           format: date
 *         start_time:
 *           type: string
 *         end_time:
 *           type: string
 *         location:
 *           type: string
 *           nullable: true
 *         description:
 *           type: string
 *           nullable: true
 *         pic_user_id:
 *           type: string
 *         created_by:
 *           type: string
 *         status:
 *           type: string
 *           enum: [draft, open, closed, cancelled]
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *     PracticumOperationalSession:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         registration_schedule_id:
 *           type: string
 *           format: uuid
 *         session_status:
 *           type: string
 *           enum: [scheduled, ongoing, completed]
 *         approval_status:
 *           type: string
 *         pic_user_id:
 *           type: string
 *           nullable: true
 *         ongoing_at:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         completed_at:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         scheduled_start_at:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         session_start_context:
 *           $ref: '#/components/schemas/SessionStartContext'
 *     AttendanceContext:
 *       type: object
 *       properties:
 *         attendance_context_code:
 *           type: string
 *           example: assistant_late_session_on_time
 *         attendance_context_label:
 *           type: string
 *           example: Assistant arrived late, practicum session started on time
 *         assistant_on_time:
 *           type: boolean
 *           nullable: true
 *         session_started_on_time:
 *           type: boolean
 *           nullable: true
 *         scheduled_start_at:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         session_started_at:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         assistant_activated_at:
 *           type: string
 *           format: date-time
 *           nullable: true
 *     SessionStartContext:
 *       type: object
 *       properties:
 *         session_start_context_code:
 *           type: string
 *           example: session_started_on_time
 *         session_start_context_label:
 *           type: string
 *           example: Practicum session started on time
 *         session_started_on_time:
 *           type: boolean
 *           nullable: true
 *         scheduled_start_at:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         session_started_at:
 *           type: string
 *           format: date-time
 *           nullable: true
 *     OperationalSessionAttendance:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         operational_session_id:
 *           type: string
 *           format: uuid
 *         user_id:
 *           type: string
 *         attendance_time:
 *           type: string
 *           format: date-time
 *         attendance_status:
 *           type: string
 *           enum: [present, late]
 *     AssessmentComponent:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         name:
 *           type: string
 *           example: TP
 *         max_score:
 *           type: number
 *           example: 100
 *         weight:
 *           type: number
 *           example: 1
 *         is_required:
 *           type: boolean
 *     StudentGrade:
 *       type: object
 *       properties:
 *         operational_session_id:
 *           type: string
 *           format: uuid
 *         student_user_id:
 *           type: string
 *         grader_user_id:
 *           type: string
 *         total_score:
 *           type: number
 *         submitted_at:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/conduct/health:
 *   get:
 *     summary: Health check modul Conduct
 *     tags: [Conduct]
 *     security: []
 *     responses:
 *       200:
 *         description: Modul berjalan dengan baik
 */

/**
 * @swagger
 * /api/conduct/simulations:
 *   post:
 *     summary: Koordinator membuat simulasi praktikum baru
 *     tags: [Conduct]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [simulation_name, simulation_date, start_time, end_time, pic_user_id]
 *             properties:
 *               simulation_name:
 *                 type: string
 *               simulation_date:
 *                 type: string
 *                 format: date
 *               start_time:
 *                 type: string
 *               end_time:
 *                 type: string
 *               location:
 *                 type: string
 *                 nullable: true
 *               description:
 *                 type: string
 *                 nullable: true
 *               pic_user_id:
 *                 type: string
 *     responses:
 *       201:
 *         description: Simulasi berhasil dibuat
 *   get:
 *     summary: Ambil daftar simulasi praktikum
 *     tags: [Conduct]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: OK
 * /api/conduct/simulations/{simulationId}:
 *   get:
 *     summary: Ambil detail simulasi praktikum
 *     tags: [Conduct]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: simulationId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: OK
 */

/**
 * @swagger
 * /api/conduct/permits:
 *   post:
 *     summary: Praktikan mengajukan izin atau sakit tidak hadir
 *     tags: [Conduct]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Pengajuan izin berhasil dikirim
 * /api/conduct/permits/assistant:
 *   post:
 *     summary: Asisten mengajukan izin/sakit simulasi atau praktikum
 *     tags: [Conduct]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Pengajuan izin/sakit asisten berhasil dikirim
 * /api/conduct/permits/assistant/submissions:
 *   get:
 *     summary: Koordinator melihat daftar pengajuan izin/sakit asisten
 *     tags: [Conduct]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: OK
 * /api/conduct/permits/assistant/{permitId}/review:
 *   patch:
 *     summary: Koordinator menyetujui/menolak pengajuan asisten
 *     tags: [Conduct]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: permitId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: OK
 * /api/conduct/permits/my-permits:
 *   get:
 *     summary: Ambil daftar pengajuan izin user login
 *     tags: [Conduct]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: OK
 * /api/conduct/permits/pic/submissions:
 *   get:
 *     summary: PIC melihat daftar pengajuan izin praktikan
 *     tags: [Conduct]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: OK
 * /api/conduct/permits/{permitId}/review:
 *   patch:
 *     summary: PIC menyetujui/menolak pengajuan izin praktikan
 *     tags: [Conduct]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: permitId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: OK
 */

/**
 * @swagger
 * /api/conduct/registration/practicums:
 *   get:
 *     summary: List practicums dari Registration master data
 *     tags: [Conduct]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: OK
 * /api/conduct/registration/modules:
 *   get:
 *     summary: List practicum modules dari Registration master data
 *     tags: [Conduct]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: practicum_id
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: periode
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: OK
 * /api/conduct/registration/schedules:
 *   get:
 *     summary: List schedules dari Registration
 *     tags: [Conduct]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: module_id
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: mine
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: periode
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: OK
 * /api/conduct/permits/pic/submissions:
 *   get:
 *     summary: PIC melihat daftar pengajuan izin praktikan
 *     tags: [Conduct]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: OK
 * /api/conduct/permits/{permitId}/review:
 *   patch:
 *     summary: PIC menyetujui/menolak pengajuan izin praktikan
 *     tags: [Conduct]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: permitId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: OK
 */

/**
 * @swagger
 * /api/conduct/registration/practicums:
 *   get:
 *     summary: List practicums dari Registration master data
 *     tags: [Conduct]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: study_program_id
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: periode
 *         schema:
 *           type: string
 *         description: >
 *           Filter praktikum berdasarkan `practicums.periode`.
 *           Nilai `active` = periode dari GET /api/registration/periode/active. Default `active`.
 *     responses:
 *       200:
 *         description: OK
 *       400:
 *         description: Periode aktif belum dikonfigurasi
 * /api/conduct/registration/modules:
 *   get:
 *     summary: List practicum modules dari Registration master data
 *     tags: [Conduct]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: practicum_id
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: periode
 *         schema:
 *           type: string
 *         description: >
 *           Filter modul berdasarkan periode praktikum induk.
 *           Nilai `active` = periode aktif sistem. Default `active`.
 *     responses:
 *       200:
 *         description: OK
 *       400:
 *         description: Periode aktif belum dikonfigurasi
 * /api/conduct/registration/schedules:
 *   get:
 *     summary: List schedules dari Registration
 *     tags: [Conduct]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: module_id
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: mine
 *         schema:
 *           type: boolean
 *         description: Jika true, hanya jadwal di mana user adalah asisten
 *       - in: query
 *         name: periode
 *         schema:
 *           type: string
 *         description: >
 *           Filter jadwal berdasarkan `practicums.periode`.
 *           Nilai `active` = periode aktif sistem. Default `active`.
 *     responses:
 *       200:
 *         description: OK
 *       400:
 *         description: Periode aktif belum dikonfigurasi
 * /api/conduct/registration/plot-schedules:
 *   get:
 *     summary: List final practicum schedules dari Registration
 *     tags: [Conduct]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: mine
 *         schema:
 *           type: boolean
 *           default: false
 *       - in: query
 *         name: semester_code
 *         schema:
 *           type: string
 *         description: >
 *           Filter plot jadwal berdasarkan `practicums.periode`.
 *           Nilai `active` atau diabaikan = periode aktif sistem.
 *       - in: query
 *         name: grouped
 *         schema:
 *           type: boolean
 *           default: false
 *     responses:
 *       200:
 *         description: OK
 */

/**
 * @swagger
 * /api/conduct/practicum-operational-sessions:
 *   post:
 *     summary: Buka operational session dari jadwal Registration
 *     tags: [Conduct]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [registration_schedule_id]
 *             properties:
 *               registration_schedule_id:
 *                 type: string
 *                 format: uuid
 *               operational_notes:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       201:
 *         description: Created
 *   get:
 *     summary: List operational sessions
 *     tags: [Conduct]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: mine
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: registration_schedule_id
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: OK
 * /api/conduct/practicum-operational-sessions/{id}:
 *   get:
 *     summary: Detail operational session
 *     tags: [Conduct]
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
 *         description: OK
 * /api/conduct/practicum-operational-sessions/{id}/join:
 *   post:
 *     summary: Join operational session sebagai active assistant via QR PIC
 *     tags: [Conduct]
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
 *         description: OK
 * /api/conduct/practicum-operational-sessions/{id}/status:
 *   patch:
 *     summary: Update lifecycle operational session
 *     tags: [Conduct]
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
 *         description: OK
 * /api/conduct/practicum-operational-sessions/{id}/start:
 *   post:
 *     summary: Mulai operational session
 *     tags: [Conduct]
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
 *         description: OK
 * /api/conduct/practicum-operational-sessions/{id}/complete:
 *   post:
 *     summary: Selesaikan operational session
 *     tags: [Conduct]
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
 *         description: OK
 */

/**
 * @swagger
 * /api/conduct/practicum-operational-sessions/{id}/activation-qr:
 *   get:
 *     summary: Generate QR aktivasi asisten untuk operational session
 *     tags: [Conduct]
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
 *         description: OK
 * /api/conduct/practicum-operational-sessions/{id}/attendance-qr/generate:
 *   post:
 *     summary: Generate rolling QR absensi operational session
 *     tags: [Conduct]
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
 *       201:
 *         description: QR generated
 * /api/conduct/practicum-operational-sessions/{id}/attendance-qr/active:
 *   get:
 *     summary: Ambil rolling QR absensi aktif operational session
 *     tags: [Conduct]
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
 *         description: OK
 * /api/conduct/practicum-operational-sessions/{id}/attendance/check-in:
 *   post:
 *     summary: Praktikan check-in ke operational session via QR
 *     description: |
 *       Keanggotaan shift ditentukan saat scan QR berdasarkan enrollment praktikum
 *       (`practicum_enrollments`, role mahasiswa), bukan `schedule_bookings`.
 *     tags: [Conduct]
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
 *         description: Check-in berhasil
 * /api/conduct/practicum-operational-sessions/attendance/me:
 *   get:
 *     summary: Ambil attendance operational session milik user login
 *     tags: [Conduct]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: OK
 * /api/conduct/practicum-operational-sessions/{id}/attendance:
 *   get:
 *     summary: Ambil daftar attendance operational session
 *     description: |
 *       Daftar praktikan yang sudah check-in via scan QR pada sesi operasional ini.
 *       Mahasiswa terdaftar yang belum scan tidak disertakan; absent/izin/sakit
 *       direkonsiliasi saat BAP final setelah sesi selesai.
 *     tags: [Conduct]
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
 *         description: OK
 * /api/conduct/practicum-operational-sessions/{id}/attendance/{attendanceId}/plot/history:
 *   get:
 *     summary: Riwayat reassign plot praktikan
 *     description: Hanya PIC sesi yang dapat melihat riwayat perubahan plot mahasiswa.
 *     tags: [Conduct]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: attendanceId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Riwayat reassign plot
 * /api/conduct/practicum-operational-sessions/{id}/attendance/{attendanceId}/plot:
 *   patch:
 *     summary: Reassign plot praktikan ke asisten aktif lain
 *     description: |
 *       PIC memindahkan satu mahasiswa yang sudah check-in ke asisten/plot target.
 *       Hanya dapat dilakukan saat sesi `ongoing` dan sebelum nilai mahasiswa disubmit.
 *     tags: [Conduct]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: attendanceId
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
 *             required:
 *               - target_assistant_user_id
 *               - reason
 *             properties:
 *               target_assistant_user_id:
 *                 type: string
 *               reason:
 *                 type: string
 *                 minLength: 5
 *     responses:
 *       200:
 *         description: Plot praktikan berhasil diperbarui
 * /api/conduct/practicum-operational-sessions/{id}/attendance/plot/bulk:
 *   patch:
 *     summary: Bulk reassign plot praktikan
 *     description: |
 *       PIC memindahkan banyak mahasiswa sekaligus ke asisten/plot target.
 *       Mahasiswa yang sudah berada di plot target akan dilewati.
 *     tags: [Conduct]
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
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - attendance_ids
 *               - target_assistant_user_id
 *               - reason
 *             properties:
 *               attendance_ids:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *               target_assistant_user_id:
 *                 type: string
 *               reason:
 *                 type: string
 *                 minLength: 5
 *     responses:
 *       200:
 *         description: Plot praktikan berhasil diperbarui secara bulk
 */

/**
 * @swagger
 * /api/conduct/practicum-operational-sessions/grading/assistant:
 *   get:
 *     summary: List sesi completed yang dapat dinilai asisten
 *     tags: [Conduct]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: OK
 * /api/conduct/practicum-operational-sessions/{id}/grading/students:
 *   get:
 *     summary: List praktikan hadir dan status penilaian pada session
 *     tags: [Conduct]
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
 *         description: OK
 * /api/conduct/practicum-operational-sessions/{id}/bap:
 *   get:
 *     summary: Ambil BAP digital untuk operational session
 *     description: Jika sesi sudah completed dan BAP belum ada, sistem akan generate BAP draft otomatis dari data attendance real.
 *     tags: [Conduct]
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
 *         description: OK
 * /api/conduct/practicum-operational-sessions/{id}/bap/generate:
 *   post:
 *     summary: Generate ulang BAP digital untuk operational session completed
 *     tags: [Conduct]
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
 *         description: BAP berhasil digenerate
 * /api/conduct/practicum-baps:
 *   get:
 *     summary: List BAP digital praktikum
 *     tags: [Conduct]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: OK
 * /api/conduct/practicum-operational-sessions/{id}/bap/signature/generate-qr:
 *   post:
 *     summary: Generate QR tanda tangan dosen untuk BAP
 *     description: Hanya PIC sesi atau koordinator/laboran yang dapat generate. QR berlaku 5 menit dan sekali pakai.
 *     tags: [Conduct]
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
 *       201:
 *         description: QR tanda tangan dosen berhasil dibuat
 * /api/conduct/practicum-operational-sessions/{id}/bap/signature/active-qr:
 *   get:
 *     summary: Ambil QR tanda tangan dosen aktif untuk BAP
 *     tags: [Conduct]
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
 *         description: OK
 * /api/conduct/practicum-operational-sessions/{id}/bap/signature/scan:
 *   post:
 *     summary: Dosen scan QR untuk tanda tangan digital BAP
 *     description: Hanya role dosen. Token QR yang valid akan menandai BAP sebagai lecturer_signed dengan timestamp dan grader otomatis.
 *     tags: [Conduct]
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
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [qr_token]
 *             properties:
 *               qr_token:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: BAP berhasil ditandatangani secara digital
 * /api/conduct/practicum-operational-sessions/{id}/grading/students/{studentUserId}:
 *   get:
 *     summary: Ambil form penilaian praktikan
 *     tags: [Conduct]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: studentUserId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: OK
 *   post:
 *     summary: Submit atau update nilai praktikan
 *     description: total_score dihitung sebagai nilai akhir skala 0-100 dari normalisasi score/max_score dan bobot tiap komponen rubrikasi.
 *     tags: [Conduct]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: studentUserId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [components]
 *             properties:
 *               components:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [component_id, score]
 *                   properties:
 *                     component_id:
 *                       type: string
 *                       format: uuid
 *                     score:
 *                       type: number
 *                     feedback:
 *                       type: string
 *                       nullable: true
 *     responses:
 *       200:
 *         description: Nilai berhasil disimpan
 * /api/conduct/practicum-grades/reporting:
 *   get:
 *     summary: Ambil data nilai untuk Reporting
 *     description: Mengembalikan final_score/total_score dan breakdown komponen berisi score, max_score, weight, percentage, dan weighted_contribution.
 *     tags: [Conduct]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: operational_session_id
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: registration_schedule_id
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: student_user_id
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: OK
 */

export default {};
