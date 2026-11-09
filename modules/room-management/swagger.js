/**
 * @swagger
 * tags:
 *   - name: Room Management
 *     description: API untuk mengelola ruangan laboratorium
 *   - name: Passcode Management
 *     description: API untuk mengelola passcode smart lock (TTLock)
 *   - name: Fingerprint Management
 *     description: API untuk mengelola fingerprint smart lock (TTLock)
 *   - name: IC Card Management
 *     description: API untuk mengelola IC card (RFID) smart lock (TTLock)
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Room:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           description: Room ID
 *           example: "131deb03-6c33-4505-9a73-630bc740c419"
 *         name:
 *           type: string
 *           description: Nama ruangan
 *           example: "Room 1"
 *         capacity:
 *           type: integer
 *           description: Kapasitas ruangan
 *           example: 50
 *         door_lock_id:
 *           type: string
 *           nullable: true
 *           description: TTLock lock ID (string)
 *           example: "12405430"
 *         is_occupied:
 *           type: boolean
 *           description: Status okupansi ruangan
 *           example: false
 *         category:
 *           type: string
 *           nullable: true
 *           enum: [class_lab, computer_lab, exam_lab]
 *           description: Lab category (Class Lab, Computer Lab, Exam Lab)
 *           example: "computer_lab"
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *
 *     RoomBooking:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           description: Booking ID
 *         room_id:
 *           type: string
 *           format: uuid
 *           description: Room ID
 *         room_name:
 *           type: string
 *           nullable: true
 *           description: Room name, included in admin booking queue responses
 *         door_lock_id:
 *           type: string
 *           nullable: true
 *           description: TTLock door lock ID, included in admin booking queue responses
 *         capacity:
 *           type: integer
 *           nullable: true
 *           description: Room capacity, included in admin booking queue responses
 *         start_time:
 *           type: string
 *           format: date-time
 *           description: Start time
 *         end_time:
 *           type: string
 *           format: date-time
 *           description: End time
 *         description:
 *           type: string
 *           nullable: true
 *           description: User-provided booking purpose or description
 *         status:
 *           type: string
 *           enum: [pending, active, rejected, canceled]
 *           description: Booking status. Active means booked/approved.
 *         created_by:
 *           type: string
 *           format: uuid
 *           description: User ID who created booking
 *         requester_label:
 *           type: string
 *           nullable: true
 *           description: Human-readable requester name when available
 *         approved_by:
 *           type: string
 *           format: uuid
 *           nullable: true
 *           description: User ID who approved booking
 *         approved_at:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: Approval timestamp
 *         rejected_by:
 *           type: string
 *           format: uuid
 *           nullable: true
 *           description: User ID who rejected booking
 *         rejected_at:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: Rejection timestamp
 *         rejection_note:
 *           type: string
 *           nullable: true
 *           description: Admin-provided rejection reason shown to requester
 *         canceled_by:
 *           type: string
 *           format: uuid
 *           nullable: true
 *           description: User ID who canceled booking
 *         canceled_at:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: Cancellation timestamp
 *         passcode_log_id:
 *           type: string
 *           format: uuid
 *           nullable: true
 *           description: Linked passcode log ID generated for this booking
 *         passcode:
 *           type: string
 *           nullable: true
 *           description: Generated passcode, visible only to booking owner or admin
 *         passcode_id:
 *           type: integer
 *           nullable: true
 *           description: TTLock passcode ID
 *         passcode_name:
 *           type: string
 *           nullable: true
 *           description: Generated passcode name
 *         passcode_type:
 *           type: string
 *           nullable: true
 *           description: Generated passcode type
 *         passcode_start_date:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: Passcode start date
 *         passcode_end_date:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: Passcode end date
 *         passcode_generated_at:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: Passcode generation timestamp
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *
 *     CreateRoomBookingRequest:
 *       type: object
 *       required:
 *         - start_time
 *         - end_time
 *       properties:
 *         start_time:
 *           type: string
 *           format: date-time
 *           description: Start time (ISO 8601)
 *           example: "2026-03-13T08:00:00.000Z"
 *         end_time:
 *           type: string
 *           format: date-time
 *           description: End time (ISO 8601)
 *           example: "2026-03-13T10:00:00.000Z"
 *         description:
 *           type: string
 *           nullable: true
 *           maxLength: 1000
 *           description: Booking purpose or description
 *           example: "Thesis discussion with lab team"
 *
 *     CreatePublicRoomBookingRequest:
 *       type: object
 *       required:
 *         - start_time
 *         - end_time
 *         - created_by
 *       properties:
 *         start_time:
 *           type: string
 *           format: date-time
 *           description: Start time (ISO 8601)
 *           example: "2026-03-13T08:00:00.000Z"
 *         end_time:
 *           type: string
 *           format: date-time
 *           description: End time (ISO 8601)
 *           example: "2026-03-13T10:00:00.000Z"
 *         created_by:
 *           type: string
 *           format: uuid
 *           description: Requester user ID. Required because this endpoint does not use JWT.
 *           example: "fd1a3f21-fec8-4310-bd7a-52665c2ab6d0"
 *         description:
 *           type: string
 *           nullable: true
 *           maxLength: 1000
 *           description: Booking purpose or description
 *           example: "Thesis discussion with lab team"
 *
 *     BookingConflictResponse:
 *       type: object
 *       properties:
 *         conflict:
 *           type: boolean
 *           description: Whether conflict exists
 *           example: true
 *         booking:
 *           nullable: true
 *           $ref: '#/components/schemas/RoomBooking'
 *
 *     PasscodeLog:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           description: Log ID
 *         room_id:
 *           type: string
 *           format: uuid
 *           description: Room ID
 *         lock_id:
 *           type: integer
 *           description: TTLock ID
 *         passcode_id:
 *           type: integer
 *           description: Passcode ID dari TTLock
 *         passcode_name:
 *           type: string
 *           description: Nama passcode
 *           example: "Passcode Praktikum Basis Data"
 *         passcode_type:
 *           type: string
 *           enum: [permanent, temporary, onetime]
 *           description: Jenis passcode
 *         start_date:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: Tanggal mulai (untuk temporary/onetime)
 *         end_date:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: Tanggal berakhir (untuk temporary/onetime)
 *         action:
 *           type: string
 *           enum: [created, deleted, updated]
 *           description: Aksi yang dilakukan
 *         created_by:
 *           type: string
 *           nullable: true
 *           description: User ID yang membuat passcode
 *         deleted_by:
 *           type: string
 *           nullable: true
 *           description: User ID yang menghapus passcode
 *         metadata:
 *           type: object
 *           nullable: true
 *           description: Data tambahan (termasuk kode passcode 6 digit)
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *
 *     CreateRoomRequest:
 *       type: object
 *       required:
 *         - name
 *         - capacity
 *       properties:
 *         name:
 *           type: string
 *           description: Nama ruangan (1-120 karakter)
 *           example: "Lab 102"
 *         capacity:
 *           type: integer
 *           minimum: 1
 *           description: Kapasitas ruangan
 *           example: 40
 *         is_occupied:
 *           type: boolean
 *           default: false
 *           description: Status okupansi awal (default false)
 *         door_lock_id:
 *           type: string
 *           nullable: true
 *           description: TTLock lock ID (optional)
 *           example: "12405430"
 *         category:
 *           type: string
 *           nullable: true
 *           enum: [class_lab, computer_lab, exam_lab]
 *           description: Lab category
 *           example: "class_lab"
 *
 *     UpdateRoomRequest:
 *       type: object
 *       description: Minimal satu field harus diisi.
 *       properties:
 *         name:
 *           type: string
 *           description: Nama ruangan
 *           example: "Lab 102 Updated"
 *         capacity:
 *           type: integer
 *           minimum: 1
 *           description: Kapasitas ruangan
 *           example: 45
 *         door_lock_id:
 *           type: string
 *           nullable: true
 *           description: TTLock lock ID
 *           example: "12405430"
 *         is_occupied:
 *           type: boolean
 *           description: Status okupansi
 *         category:
 *           type: string
 *           nullable: true
 *           enum: [class_lab, computer_lab, exam_lab]
 *           description: Lab category
 *           example: "exam_lab"
 *
 *     SyncTtlockAccountRequest:
 *       type: object
 *       properties:
 *         defaultCapacity:
 *           type: integer
 *           minimum: 1
 *           default: 45
 *           description: Kapasitas default untuk room yang dibuat dari lock TTLock baru
 *           example: 45
 *
 *     SyncTtlockAccountResponse:
 *       type: object
 *       properties:
 *         locksDetected:
 *           type: integer
 *           description: Jumlah lock yang ditemukan dari akun TTLock
 *           example: 12
 *         roomsCreated:
 *           type: integer
 *           description: Jumlah room baru yang dibuat
 *           example: 2
 *         roomsAlreadyPresent:
 *           type: integer
 *           description: Jumlah room yang sudah ada berdasarkan door_lock_id
 *           example: 10
 *         passcodesDetected:
 *           type: integer
 *           description: Jumlah passcode yang ditemukan dari seluruh lock
 *           example: 30
 *         passcodesInserted:
 *           type: integer
 *           description: Jumlah passcode baru yang dimasukkan ke passcode_logs
 *           example: 8
 *         passcodesAlreadyPresent:
 *           type: integer
 *           description: Jumlah passcode yang sudah pernah tersimpan
 *           example: 22
 *         lockFailures:
 *           type: array
 *           description: Daftar lock yang gagal disinkronkan passcode-nya
 *           items:
 *             type: object
 *             properties:
 *               lockId:
 *                 type: string
 *                 example: "12405430"
 *               lockName:
 *                 type: string
 *                 example: "Lab 102"
 *               error:
 *                 type: string
 *                 example: "TTLock API Error (10003): Invalid token"
 *         skippedPasscodes:
 *           type: array
 *           description: Passcode yang dilewati karena data TTLock tidak lengkap atau tipe tidak didukung
 *           items:
 *             type: object
 *             properties:
 *               lockId:
 *                 type: string
 *                 example: "12405430"
 *               reason:
 *                 type: string
 *                 example: "unsupported_passcode_type"
 *               ttlockResponse:
 *                 type: object
 *                 additionalProperties: true
 *         insertedRooms:
 *           type: array
 *           description: Room baru yang dibuat saat proses sync
 *           items:
 *             $ref: '#/components/schemas/Room'
 *
 *     CreatePermanentPasscodeRequest:
 *       type: object
 *       description: |
 *         Request untuk membuat passcode permanent (keyboardPwdType=2).
 *         Passcode akan di-generate otomatis dengan 8 digit angka acak.
 *         PENTING: Passcode harus digunakan minimal 1x dalam 24 jam pertama, jika tidak akan otomatis invalid/terhapus.
 *         Setelah digunakan dalam 24 jam pertama, passcode akan permanent selamanya.
 *       required:
 *         - name
 *       properties:
 *         name:
 *           type: string
 *           description: Nama passcode permanent
 *           example: "Passcode Laboran Utama"
 *
 *     CreateTemporaryPasscodeRequest:
 *       type: object
 *       required:
 *         - name
 *         - startDate
 *         - endDate
 *       properties:
 *         name:
 *           type: string
 *           description: Nama passcode
 *           example: "Passcode Praktikum Senin Pagi"
 *         startDate:
 *           type: string
 *           format: date-time
 *           description: Tanggal dan waktu mulai berlaku (ISO 8601 format UTC)
 *           example: "2025-11-20T08:00:00.000Z"
 *         endDate:
 *           type: string
 *           format: date-time
 *           description: Tanggal dan waktu berakhir (ISO 8601 format UTC)
 *           example: "2025-11-20T12:00:00.000Z"
 *         passcode:
 *           type: string
 *           pattern: '^\d{6}$'
 *           description: Kode 6 digit (optional, akan di-generate otomatis jika tidak diisi)
 *           example: "654321"
 *
 *     CreateOneTimePasscodeRequest:
 *       type: object
 *       required:
 *         - name
 *       properties:
 *         name:
 *           type: string
 *           maxLength: 100
 *           description: Nama passcode
 *           example: "Passcode Tamu Satu Kali"
 *         validityHours:
 *           type: integer
 *           minimum: 1
 *           maximum: 24
 *           default: 6
 *           description: Durasi validitas passcode dalam jam (default 6 jam)
 *           example: 6
 *       description: |
 *         Request untuk membuat one-time passcode (keyboardPwdType: 1).
 *         Passcode akan auto-generated 8 digit dan hanya bisa digunakan SATU KALI
 *         dalam periode validityHours (default 6 jam).
 *         Setelah digunakan pertama kali atau melewati batas waktu, passcode invalid.
 *
 *     UpdatePasscodeNameRequest:
 *       type: object
 *       required:
 *         - name
 *       properties:
 *         name:
 *           type: string
 *           description: Nama passcode baru
 *           example: "Passcode Praktikum Updated"
 *
 *     CreateCustomTemporaryPasscodeRequest:
 *       type: object
 *       required:
 *         - name
 *         - passcode
 *         - startDate
 *         - endDate
 *       properties:
 *         name:
 *           type: string
 *           maxLength: 100
 *           description: Nama passcode
 *           example: "Passcode Custom Praktikum"
 *         passcode:
 *           type: string
 *           pattern: '^\d{4,9}$'
 *           description: Kode 4-9 digit yang ditentukan user
 *           example: "123456"
 *         startDate:
 *           type: string
 *           format: date-time
 *           description: |
 *             Tanggal dan waktu mulai berlaku dalam format WIB (UTC+7).
 *             Format: YYYY-MM-DDTHH:mm:ss.sssZ
 *             Contoh untuk 4 Desember 2025 jam 08:00 WIB: "2025-12-04 08:00:00.000"
 *           example: "2025-12-04 08:00:00.000"
 *         endDate:
 *           type: string
 *           format: date-time
 *           description: |
 *             Tanggal dan waktu berakhir dalam format WIB (UTC+7).
 *             Format: YYYY-MM-DDTHH:mm:ss.sssZ
 *             Contoh untuk 4 Desember 2025 jam 17:00 WIB: "2025-12-04 17:00:00.000"
 *           example: "2025-12-04 17:00:00.000"
 *       description: |
 *         Request untuk membuat custom temporary passcode (keyboardPwdType: 3).
 *         User menentukan passcode sendiri (4-9 digit) dan periode waktu.
 *         Passcode valid untuk multiple use dalam periode startDate - endDate.
 *
 *     CreateCustomPermanentPasscodeRequest:
 *       type: object
 *       required:
 *         - name
 *         - passcode
 *       properties:
 *         name:
 *           type: string
 *           maxLength: 100
 *           description: Nama passcode
 *           example: "Passcode Custom Permanent Laboran"
 *         passcode:
 *           type: string
 *           pattern: '^\d{4,9}$'
 *           description: Kode 4-9 digit yang ditentukan user
 *           example: "1234"
 *       description: |
 *         Request untuk membuat custom permanent passcode (keyboardPwdType: 2).
 *         User menentukan passcode sendiri (4-9 digit).
 *         Passcode harus digunakan minimal 1x dalam 24 jam pertama untuk aktivasi.
 *         Setelah aktivasi, passcode permanent selamanya.
 */

/**
 * @swagger
 * /api/room-management/health:
 *   get:
 *     tags:
 *       - Room Management
 *     summary: Health check endpoint
 *     description: Mengecek status module room-management
 *     responses:
 *       200:
 *         description: Module berjalan dengan baik
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
 *                   example: "room-management"
 *                 message:
 *                   type: string
 *                   example: "Room Management module is running"
 */

/**
 * @swagger
 * /api/room-management/rooms:
 *   get:
 *     tags:
 *       - Room Management
 *     summary: Get all rooms
 *     description: |
 *       Mendapatkan daftar semua ruangan.
 *       **Akses:** Semua role yang terautentikasi (Laboran, Kaur Lab, Mahasiswa, dll)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Daftar ruangan berhasil diambil
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
 *                     $ref: '#/components/schemas/Room'
 *       401:
 *         description: Unauthorized - JWT token tidak valid
 *       500:
 *         description: Internal server error
 *
 *   post:
 *     tags:
 *       - Room Management
 *     summary: Create a new room
 *     description: |
 *       Membuat ruangan baru.
 *       **Akses:** Hanya Kaur Lab, Laboran, dan TPA
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateRoomRequest'
 *     responses:
 *       201:
 *         description: Ruangan berhasil dibuat
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
 *                   example: "Room created successfully"
 *                 data:
 *                   $ref: '#/components/schemas/Room'
 *       400:
 *         description: Bad request - Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Hanya Kaur Lab, Laboran, atau TPA yang dapat membuat ruangan
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/room-management/rooms/sync-ttlock-account:
 *   post:
 *     tags:
 *       - Room Management
 *     summary: Sync rooms and passcodes from TTLock account
 *     description: |
 *       Mengambil semua lock dari akun TTLock, membuat room yang belum ada berdasarkan `door_lock_id`,
 *       lalu mengambil daftar passcode tiap lock dan menyimpan passcode baru ke `passcode_logs`.
 *
 *       **Akses:** Hanya Kaur Lab, Laboran, dan TPA.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SyncTtlockAccountRequest'
 *           examples:
 *             default:
 *               summary: Default capacity
 *               value:
 *                 defaultCapacity: 45
 *     responses:
 *       200:
 *         description: TTLock account berhasil disinkronkan
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
 *                   example: "TTLock account synced successfully"
 *                 data:
 *                   $ref: '#/components/schemas/SyncTtlockAccountResponse'
 *       401:
 *         description: Unauthorized - JWT token tidak valid
 *       403:
 *         description: Forbidden - Hanya Kaur Lab, Laboran, atau TPA yang dapat sync TTLock
 *       500:
 *         description: Internal server error atau error dari TTLock API
 */

/**
 * @swagger
 * /api/room-management/practicum-schedules/sync:
 *   post:
 *     tags:
 *       - Room Management
 *     summary: Sync practicum schedules to room bookings
 *     description: |
 *       Publishes assigned registration schedules (with venue) into `room_bookings`
 *       and provisions TTLock access automatically.
 *
 *       - **Passcode**: when no assistant NIM matches a profile, or matched assistant lacks kartu akses
 *       - **RFID**: when at least one assistant NIM matches profile and all matched assistants have kartu akses
 *
 *       **Akses:** Hanya Kaur Lab, Laboran, dan TPA.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - semesterCode
 *             properties:
 *               semesterCode:
 *                 type: string
 *                 example: "2026-genap"
 *               dryRun:
 *                 type: boolean
 *                 default: false
 *               forceResync:
 *                 type: boolean
 *                 default: false
 *                 description: Re-process already-synced schedules and re-provision RFID/passcode
 *     responses:
 *       200:
 *         description: Sync completed or preview generated
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - admin role required
 */

/**
 * @swagger
 * /api/room-management/rooms/{id}:
 *   get:
 *     tags:
 *       - Room Management
 *     summary: Get room by ID
 *     description: |
 *       Mendapatkan detail ruangan berdasarkan ID.
 *       **Akses:** Semua role yang terautentikasi (Laboran, Kaur Lab, Mahasiswa, dll)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Room ID
 *     responses:
 *       200:
 *         description: Detail ruangan berhasil diambil
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Room'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Room not found
 *       500:
 *         description: Internal server error
 *
 *   put:
 *     tags:
 *       - Room Management
 *     summary: Update a room
 *     description: |
 *       Mengupdate data ruangan (nama, kapasitas, door_lock_id, status okupansi).
 *       **Akses:** Hanya Kaur Lab, Laboran, dan TPA
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Room ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateRoomRequest'
 *     responses:
 *       200:
 *         description: Ruangan berhasil diupdate
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
 *                   example: "Room updated successfully"
 *                 data:
 *                   $ref: '#/components/schemas/Room'
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Hanya Kaur Lab, Laboran, atau TPA yang dapat mengubah ruangan
 *       404:
 *         description: Room not found
 *       500:
 *         description: Internal server error
 *
 *   delete:
 *     tags:
 *       - Room Management
 *     summary: Delete a room
 *     description: |
 *       Menghapus ruangan.
 *       **Akses:** Hanya Kaur Lab, Laboran, dan TPA
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Room ID
 *     responses:
 *       200:
 *         description: Ruangan berhasil dihapus
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
 *                   example: "Room deleted successfully"
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Hanya Kaur Lab, Laboran, atau TPA yang dapat menghapus ruangan
 *       404:
 *         description: Room not found
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/room-management/bookings/schedule:
 *   get:
 *     tags:
 *       - Room Management
 *     summary: List active and pending room bookings for calendar schedule
 *     description: |
 *       Mengambil booking ruangan berstatus active/booked dan pending untuk
 *       tampilan kalender. Frontend menampilkan active sebagai booked dan pending
 *       sebagai request terpisah. Response menyertakan info room dan requester
 *       label, tetapi tidak menyertakan passcode.
 *       **Akses:** Semua authenticated user.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date/time range, inclusive
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: End date/time range, exclusive
 *       - in: query
 *         name: roomId
 *         required: false
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Optional room filter
 *     responses:
 *       200:
 *         description: Schedule bookings loaded successfully
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
 *                     $ref: '#/components/schemas/RoomBooking'
 *       400:
 *         description: Invalid date range
 *       401:
 *         description: Unauthorized
 */

// ==================== Telegram Direct Notification Endpoints ====================

/**
 * @swagger
 * /api/room-management/telegram/status:
 *   get:
 *     tags:
 *       - Room Booking Telegram
 *     summary: Get current user's Telegram link status
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Telegram link status
 *       401:
 *         description: Unauthorized
 *
 * /api/room-management/telegram/link-code:
 *   post:
 *     tags:
 *       - Room Booking Telegram
 *     summary: Create a one-time Telegram link code
 *     description: Code expires after 15 minutes and can be used with /start in the configured Telegram bot.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Link code and bot deep link created
 *       401:
 *         description: Unauthorized
 *
 * /api/room-management/telegram/link:
 *   delete:
 *     tags:
 *       - Room Booking Telegram
 *     summary: Unlink current user's Telegram account
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Telegram account unlinked
 *       401:
 *         description: Unauthorized
 *
 * /api/room-management/telegram/webhook:
 *   post:
 *     tags:
 *       - Room Booking Telegram
 *     summary: Telegram webhook for /start link-code messages
 *     description: |
 *       Telegram calls this endpoint when a user starts the bot with a one-time code.
 *       If TELEGRAM_WEBHOOK_SECRET_TOKEN is set, Telegram must send it in
 *       x-telegram-bot-api-secret-token.
 *     responses:
 *       200:
 *         description: Webhook processed
 *       401:
 *         description: Invalid Telegram webhook secret
 *
 * /api/room-management/telegram/webhook/register:
 *   post:
 *     tags:
 *       - Room Booking Telegram
 *     summary: Register Telegram webhook for the configured bot
 *     description: |
 *       Admin maintenance endpoint. Registers Telegram Bot API webhook to the
 *       configured backend URL. URL priority: request body `webhookUrl`,
 *       `TELEGRAM_WEBHOOK_URL`, then current request host.
 *       **Akses:** Hanya Kaur Lab, Laboran, dan TPA.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               webhookUrl:
 *                 type: string
 *                 example: https://dev-be-praktikum.virtualfri.id/api/room-management/telegram/webhook
 *     responses:
 *       200:
 *         description: Telegram webhook registered
 *       400:
 *         description: Telegram registration failed
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */

/**
 * @swagger
 * /api/room-management/bookings:
 *   get:
 *     tags:
 *       - Room Management
 *     summary: List all room bookings for admin queue
 *     description: |
 *       Mengambil daftar booking dari semua ruangan untuk queue admin.
 *       Admin dapat memakai endpoint ini untuk melihat pending request tanpa
 *       membuka detail ruangan satu per satu. Response menyertakan info room
 *       seperti `room_name`, `door_lock_id`, dan `capacity`.
 *       **Akses:** Hanya Kaur Lab, Laboran, dan TPA.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         required: false
 *         schema:
 *           type: string
 *           enum: [pending, active, rejected, canceled]
 *         description: Optional booking status filter
 *     responses:
 *       200:
 *         description: Bookings loaded successfully
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
 *                     $ref: '#/components/schemas/RoomBooking'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Hanya Kaur Lab, Laboran, atau TPA yang dapat melihat queue booking
 */

/**
 * @swagger
 * /api/room-management/bookings/me:
 *   get:
 *     tags:
 *       - Room Management
 *     summary: List current user's room booking history
 *     description: |
 *       Mengambil daftar booking ruangan milik user yang sedang login.
 *       Data selalu difilter dengan `created_by = current user`, sehingga user
 *       hanya melihat booking miliknya sendiri. Response menyertakan info room
 *       seperti `room_name`, `door_lock_id`, dan `capacity`.
 *       Jika passcode sudah dibuat, passcode hanya ditampilkan kepada owner
 *       booking atau admin sesuai aturan visibility booking.
 *       **Akses:** Semua authenticated user.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         required: false
 *         schema:
 *           type: string
 *           enum: [pending, active, rejected, canceled]
 *         description: Optional booking status filter
 *     responses:
 *       200:
 *         description: Booking history loaded successfully
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
 *                     $ref: '#/components/schemas/RoomBooking'
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /api/room-management/public/rooms/{roomId}/bookings:
 *   post:
 *     tags:
 *       - Room Management
 *     summary: Create a public room booking request without JWT
 *     description: |
 *       Membuat booking request pending tanpa token JWT. Endpoint ini disediakan
 *       sebagai fallback sementara ketika auth gateway tidak tersedia.
 *       Request tetap membutuhkan `created_by` UUID agar booking memiliki owner.
 *       Jika Telegram notification aktif, booking pending akan mengirim
 *       notifikasi best-effort ke grup Telegram admin.
 *       **Akses:** Public/no token
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Room ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreatePublicRoomBookingRequest'
 *     responses:
 *       201:
 *         description: Booking request submitted
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
 *                   example: "Booking request submitted"
 *                 data:
 *                   $ref: '#/components/schemas/RoomBooking'
 *       400:
 *         description: Bad request - Validation error
 *       404:
 *         description: Room not found
 */

/**
 * @swagger
 * /api/room-management/rooms/{roomId}/bookings:
 *   get:
 *     tags:
 *       - Room Management
 *     summary: List room bookings
 *     description: |
 *       Melihat daftar booking untuk ruangan tertentu.
 *       **Akses:** Laboran dan Mahasiswa
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Room ID
 *       - in: query
 *         name: status
 *         required: false
 *         schema:
 *           type: string
 *           enum: [pending, active, rejected, canceled]
 *         description: Filter by booking status
 *     responses:
 *       200:
 *         description: Daftar booking berhasil diambil
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
 *                     $ref: '#/components/schemas/RoomBooking'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Room not found
 *       500:
 *         description: Internal server error
 *
 *   post:
 *     tags:
 *       - Room Management
 *     summary: Create a room booking
 *     description: |
 *       Membuat booking ruangan. Member membuat request dengan status pending,
 *       sedangkan Kaur Lab/Laboran/TPA langsung membuat booking active.
 *       Jika Telegram notification aktif, booking pending dari member akan mengirim
 *       notifikasi best-effort ke grup Telegram admin. Kegagalan Telegram tidak
 *       membuat request booking gagal.
 *       **Akses:** User terautentikasi
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Room ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateRoomBookingRequest'
 *     responses:
 *       201:
 *         description: Booking berhasil dibuat
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
 *                   example: "Booking request submitted"
 *                 data:
 *                   $ref: '#/components/schemas/RoomBooking'
 *       400:
 *         description: Bad request - Validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Room not found
 *       409:
 *         description: Booking conflict
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/room-management/rooms/{roomId}/bookings/conflicts:
 *   post:
 *     tags:
 *       - Room Management
 *     summary: Check booking conflict
 *     description: |
 *       Mengecek conflict booking berdasarkan overlap waktu dengan booking active.
 *       **Akses:** Laboran dan Mahasiswa
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Room ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateRoomBookingRequest'
 *     responses:
 *       200:
 *         description: Conflict check result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/BookingConflictResponse'
 *       400:
 *         description: Bad request - Validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Room not found
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/room-management/rooms/{roomId}/bookings/{bookingId}/approve:
 *   patch:
 *     tags:
 *       - Room Management
 *     summary: Approve a pending room booking
 *     description: |
 *       Menyetujui booking pending dan mengubah status menjadi active/booked.
 *       Approval akan mengecek ulang conflict dengan booking active yang overlap.
 *       Jika Telegram notification aktif, approval akan mengirim notifikasi
 *       best-effort ke grup Telegram admin, termasuk nama admin yang melakukan
 *       approval. Kegagalan Telegram tidak mengubah status response endpoint ini.
 *       **Akses:** Hanya Kaur Lab, Laboran, dan TPA.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Room ID
 *       - in: path
 *         name: bookingId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Booking ID
 *     responses:
 *       200:
 *         description: Booking approved successfully
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
 *                   example: "Booking approved successfully"
 *                 data:
 *                   $ref: '#/components/schemas/RoomBooking'
 *       400:
 *         description: Booking is not pending
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Booking not found
 *       409:
 *         description: Booking conflict
 */

/**
 * @swagger
 * /api/room-management/rooms/{roomId}/bookings/{bookingId}/reject:
 *   patch:
 *     tags:
 *       - Room Management
 *     summary: Reject a pending room booking
 *     description: |
 *       Menolak booking pending dan mengubah status menjadi rejected.
 *       Admin wajib mengirim `rejection_note` supaya requester tahu alasan penolakan.
 *       Jika Telegram notification aktif, rejection akan mengirim notifikasi
 *       best-effort ke grup Telegram admin, termasuk nama admin yang melakukan
 *       rejection dan alasan penolakan. Kegagalan Telegram tidak mengubah status response endpoint ini.
 *       **Akses:** Hanya Kaur Lab, Laboran, dan TPA.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Room ID
 *       - in: path
 *         name: bookingId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Booking ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - rejection_note
 *             properties:
 *               rejection_note:
 *                 type: string
 *                 maxLength: 1000
 *                 example: "Ruangan sudah diprioritaskan untuk kegiatan praktikum pada waktu tersebut."
 *     responses:
 *       200:
 *         description: Booking rejected successfully
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
 *                   example: "Booking rejected successfully"
 *                 data:
 *                   $ref: '#/components/schemas/RoomBooking'
 *       400:
 *         description: Booking is not pending
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Booking not found
 */

/**
 * @swagger
 * /api/room-management/rooms/{roomId}/bookings/{bookingId}/passcode:
 *   post:
 *     tags:
 *       - Room Management
 *     summary: Generate passcode for an approved booking
 *     description: |
 *       Membuat passcode TTLock untuk booking yang sudah approved/active dan menghubungkannya ke booking.
 *       Satu booking hanya dapat memiliki satu generated passcode.
 *       Jika Telegram notification aktif, generated passcode akan dikirim
 *       best-effort ke grup Telegram admin bersama nama admin yang generate.
 *       Kegagalan Telegram tidak mengubah status response endpoint ini.
 *       **Akses:** Hanya Kaur Lab, Laboran, dan TPA.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Room ID
 *       - in: path
 *         name: bookingId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Booking ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [temporary, onetime, permanent, custom_temporary, custom_permanent]
 *                 example: "temporary"
 *               name:
 *                 type: string
 *                 example: "Booking passcode"
 *               customPasscode:
 *                 type: string
 *                 nullable: true
 *                 example: "123456"
 *               validityHours:
 *                 type: integer
 *                 example: 6
 *     responses:
 *       201:
 *         description: Booking passcode generated successfully
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
 *                   example: "Booking passcode generated successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     booking:
 *                       $ref: '#/components/schemas/RoomBooking'
 *                     passcode:
 *                       type: object
 *       400:
 *         description: Booking is not active or request is invalid
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Booking not found
 *       409:
 *         description: Passcode already generated for this booking
 */

/**
 * @swagger
 * /api/room-management/rooms/{roomId}/bookings/{bookingId}:
 *   delete:
 *     tags:
 *       - Room Management
 *     summary: Cancel a room booking
 *     description: |
 *       Membatalkan booking ruangan.
 *       **Akses:** User terautentikasi (owner atau Kaur Lab/Laboran/TPA untuk aksi admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Room ID
 *       - in: path
 *         name: bookingId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Booking ID
 *     responses:
 *       200:
 *         description: Booking canceled successfully
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
 *                   example: "Booking canceled successfully"
 *                 data:
 *                   $ref: '#/components/schemas/RoomBooking'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Booking not found
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/room-management/rooms/{id}/occupy:
 *   patch:
 *     tags:
 *       - Room Management
 *     summary: Mark room as occupied
 *     description: Menandai ruangan sebagai terisi/sedang digunakan
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Room ID
 *     responses:
 *       200:
 *         description: Status ruangan berhasil diupdate
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
 *                   example: "Room marked as occupied"
 *                 data:
 *                   $ref: '#/components/schemas/Room'
 *       404:
 *         description: Room not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/room-management/rooms/{id}/vacate:
 *   patch:
 *     tags:
 *       - Room Management
 *     summary: Mark room as vacant
 *     description: Menandai ruangan sebagai kosong/tidak digunakan
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Room ID
 *     responses:
 *       200:
 *         description: Status ruangan berhasil diupdate
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
 *                   example: "Room marked as vacant"
 *                 data:
 *                   $ref: '#/components/schemas/Room'
 *       404:
 *         description: Room not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/room-management/rooms/{roomId}/passcodes:
 *   get:
 *     tags:
 *       - Passcode Management
 *     summary: Get list of passcodes for a room
 *     description: Mendapatkan daftar semua passcode untuk ruangan tertentu dengan filter opsional
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Room ID
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [temporary, permanent, onetime, custom-temporary, custom-permanent]
 *         description: Filter berdasarkan tipe passcode
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *           enum: [created, deleted, updated]
 *         description: Filter berdasarkan aksi
 *       - in: query
 *         name: active
 *         schema:
 *           type: boolean
 *         description: Filter berdasarkan status aktif (true = aktif, false = tidak aktif/expired). Passcode aktif = belum dihapus dan belum expired.
 *       - in: query
 *         name: pageNo
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Nomor halaman
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Jumlah data per halaman
 *     responses:
 *       200:
 *         description: Daftar passcode berhasil diambil
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
 *                   example: Passcode list retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     pageNo:
 *                       type: integer
 *                       example: 1
 *                     pageSize:
 *                       type: integer
 *                       example: 20
 *                     total:
 *                       type: integer
 *                       example: 100
 *                     totalPages:
 *                       type: integer
 *                       example: 5
 *                     list:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/PasscodeLog'
 *       404:
 *         description: Room not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/room-management/rooms/{roomId}/passcodes/permanent:
 *   post:
 *     tags:
 *       - Passcode Management
 *     summary: Create permanent passcode
 *     description: |
 *       Membuat passcode permanen menggunakan TTLock keyboardPwdType=2.
 *       PENTING: Passcode harus digunakan minimal 1x dalam 24 jam pertama setelah dibuat.
 *       Jika tidak digunakan dalam 24 jam, passcode akan otomatis invalid/terhapus.
 *       Setelah digunakan dalam 24 jam pertama, passcode akan menjadi permanent selamanya.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Room ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreatePermanentPasscodeRequest'
 *     responses:
 *       201:
 *         description: Passcode permanen berhasil dibuat
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
 *                   example: "Permanent passcode created successfully"
 *                 reminder:
 *                   type: string
 *                   example: "Passcode must be used within 24 hours to become permanent, otherwise it will be invalidated."
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                       description: Log ID
 *                     passcodeId:
 *                       type: integer
 *                       description: TTLock passcode ID
 *                     passcode:
 *                       type: string
 *                       description: 8-digit passcode (auto-generated)
 *                       example: "12345678"
 *                     name:
 *                       type: string
 *                       example: "Passcode Laboran Utama"
 *                     type:
 *                       type: string
 *                       example: "permanent"
 *                     roomId:
 *                       type: string
 *                       format: uuid
 *                     roomName:
 *                       type: string
 *                       example: "Lab 101"
 *                     lockId:
 *                       type: integer
 *                       example: 12405430
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Bad request - Validation error
 *       404:
 *         description: Room not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error (TTLock API error)
 */

/**
 * @swagger
 * /api/room-management/rooms/{roomId}/passcodes/temporary:
 *   post:
 *     tags:
 *       - Passcode Management
 *     summary: Create temporary passcode
 *     description: Membuat passcode sementara dengan tanggal mulai dan berakhir
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Room ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateTemporaryPasscodeRequest'
 *           examples:
 *             sameDay:
 *               summary: Passcode untuk praktikum hari yang sama
 *               value:
 *                 name: "Passcode Praktikum Senin Pagi"
 *                 startDate: "2025-11-20T08:00:00.000Z"
 *                 endDate: "2025-11-20T12:00:00.000Z"
 *             multiDay:
 *               summary: Passcode untuk beberapa hari
 *               value:
 *                 name: "Passcode Praktikum Minggu Ini"
 *                 startDate: "2025-11-20T08:00:00.000Z"
 *                 endDate: "2025-11-27T17:00:00.000Z"
 *     responses:
 *       201:
 *         description: Passcode temporary berhasil dibuat
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
 *                   example: "Temporary passcode created successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     passcodeId:
 *                       type: integer
 *                     passcode:
 *                       type: string
 *                       example: "654321"
 *                     name:
 *                       type: string
 *                       example: "Passcode Praktikum Senin Pagi"
 *                     type:
 *                       type: string
 *                       example: "temporary"
 *                     startDate:
 *                       type: string
 *                       format: date-time
 *                     endDate:
 *                       type: string
 *                       format: date-time
 *                     startTimestamp:
 *                       type: integer
 *                       description: Unix timestamp (milliseconds)
 *                     endTimestamp:
 *                       type: integer
 *                       description: Unix timestamp (milliseconds)
 *                     roomId:
 *                       type: string
 *                       format: uuid
 *                     roomName:
 *                       type: string
 *                     lockId:
 *                       type: integer
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Bad request - Validation error
 *       404:
 *         description: Room not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/room-management/test/rooms/{roomId}/passcodes/temporary:
 *   post:
 *     tags:
 *       - Passcode Management
 *     summary: '[TESTING ONLY] Create temporary passcode without JWT'
 *     description: Endpoint untuk testing tanpa JWT authentication (TIDAK UNTUK PRODUCTION!)
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Room ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateTemporaryPasscodeRequest'
 *     responses:
 *       201:
 *         description: Passcode temporary berhasil dibuat
 *       400:
 *         description: Bad request
 *       404:
 *         description: Room not found
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/room-management/rooms/{roomId}/passcodes/onetime:
 *   post:
 *     tags:
 *       - Passcode Management
 *     summary: Create one-time passcode
 *     description: |
 *       Membuat passcode yang hanya bisa digunakan SATU KALI (keyboardPwdType: 1).
 *       Passcode akan auto-generated 8 digit dan valid dalam periode waktu tertentu (default 6 jam).
 *       Setelah digunakan pertama kali ATAU melewati batas waktu, passcode langsung invalid.
 *       Kombinasi: sekali pakai + time-limited.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Room ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateOneTimePasscodeRequest'
 *     responses:
 *       201:
 *         description: Passcode one-time berhasil dibuat
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
 *                   example: "One-time passcode created successfully"
 *                 reminder:
 *                   type: string
 *                   example: "This passcode can only be used once. After first use, it will be invalidated."
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     passcodeId:
 *                       type: integer
 *                     passcode:
 *                       type: string
 *                       example: "789012"
 *                     name:
 *                       type: string
 *                       example: "Passcode Tamu Satu Kali"
 *                     type:
 *                       type: string
 *                       example: "onetime"
 *                     roomId:
 *                       type: string
 *                       format: uuid
 *                     roomName:
 *                       type: string
 *                     lockId:
 *                       type: integer
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Bad request
 *       404:
 *         description: Room not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/room-management/rooms/{roomId}/passcodes/{passcodeId}:
 *   delete:
 *     tags:
 *       - Passcode Management
 *     summary: Delete a passcode
 *     description: Menghapus passcode dari TTLock dan mencatat di database
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Room ID
 *       - in: path
 *         name: passcodeId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Passcode ID dari TTLock
 *     responses:
 *       200:
 *         description: Passcode berhasil dihapus
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
 *                   example: "Passcode deleted successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     passcodeId:
 *                       type: integer
 *                     action:
 *                       type: string
 *                       example: "deleted"
 *                     deletedAt:
 *                       type: string
 *                       format: date-time
 *       404:
 *         description: Room or passcode not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/room-management/rooms/{roomId}/passcodes/{passcodeId}/name:
 *   patch:
 *     tags:
 *       - Passcode Management
 *     summary: Update passcode name
 *     description: Mengupdate nama passcode di TTLock dan database
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Room ID
 *       - in: path
 *         name: passcodeId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Passcode ID dari TTLock
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdatePasscodeNameRequest'
 *     responses:
 *       200:
 *         description: Nama passcode berhasil diupdate
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
 *                   example: "Passcode name updated successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     passcodeId:
 *                       type: integer
 *                     newName:
 *                       type: string
 *                       example: "Passcode Praktikum Updated"
 *                     action:
 *                       type: string
 *                       example: "updated"
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Bad request
 *       404:
 *         description: Room or passcode not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/room-management/rooms/{roomId}/passcodes/custom/temporary:
 *   post:
 *     tags:
 *       - Passcode Management
 *     summary: Create custom temporary passcode
 *     description: |
 *       Membuat passcode temporary dengan kode yang ditentukan sendiri (4-9 digit).
 *       Passcode valid untuk multiple use dalam periode waktu yang ditentukan.
 *       Menggunakan keyboardPwdType: 3 (Period/Temporary).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Room ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateCustomTemporaryPasscodeRequest'
 *     responses:
 *       201:
 *         description: Custom temporary passcode berhasil dibuat
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
 *                   example: "Custom temporary passcode created successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     passcodeId:
 *                       type: integer
 *                       example: 38124590
 *                     passcode:
 *                       type: string
 *                       example: "123456"
 *                     name:
 *                       type: string
 *                       example: "Passcode Custom Praktikum"
 *                     type:
 *                       type: string
 *                       example: "custom-temporary"
 *                     startDate:
 *                       type: string
 *                       format: date-time
 *                     endDate:
 *                       type: string
 *                       format: date-time
 *                     roomId:
 *                       type: string
 *                       format: uuid
 *                     roomName:
 *                       type: string
 *                       example: "Lab 101"
 *                     lockId:
 *                       type: integer
 *                       example: 12405430
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Bad request - invalid passcode format or dates
 *       404:
 *         description: Room not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 *
 * /api/room-management/rooms/{roomId}/passcodes/custom/permanent:
 *   post:
 *     tags:
 *       - Passcode Management
 *     summary: Create custom permanent passcode
 *     description: |
 *       Membuat passcode permanent dengan kode yang ditentukan sendiri (4-9 digit).
 *       Passcode HARUS digunakan minimal 1x dalam 24 jam pertama untuk aktivasi.
 *       Setelah aktivasi, passcode permanent selamanya.
 *       Menggunakan keyboardPwdType: 2 (Permanent).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Room ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateCustomPermanentPasscodeRequest'
 *     responses:
 *       201:
 *         description: Custom permanent passcode berhasil dibuat
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
 *                   example: "Custom permanent passcode created successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     passcodeId:
 *                       type: integer
 *                       example: 38124591
 *                     passcode:
 *                       type: string
 *                       example: "1234"
 *                     name:
 *                       type: string
 *                       example: "Passcode Custom Permanent Laboran"
 *                     type:
 *                       type: string
 *                       example: "custom-permanent"
 *                     roomId:
 *                       type: string
 *                       format: uuid
 *                     roomName:
 *                       type: string
 *                       example: "Lab 101"
 *                     lockId:
 *                       type: integer
 *                       example: 12405430
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     note:
 *                       type: string
 *                       example: "Must be used within 24 hours to activate, then permanent forever"
 *       400:
 *         description: Bad request - invalid passcode format
 *       404:
 *         description: Room not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */

// ==================== Fingerprint Management Swagger ====================

/**
 * @swagger
 * /api/room-management/rooms/{roomId}/fingerprints:
 *   get:
 *     tags:
 *       - Fingerprint Management
 *     summary: Get fingerprint list
 *     description: Mendapatkan daftar fingerprint yang terdaftar pada smart lock ruangan dari TTLock API
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Room ID
 *       - in: query
 *         name: pageNo
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Nomor halaman
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Jumlah data per halaman
 *     responses:
 *       200:
 *         description: Daftar fingerprint berhasil diambil
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
 *                   example: "Fingerprint list retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     pageNo:
 *                       type: integer
 *                       example: 1
 *                     pageSize:
 *                       type: integer
 *                       example: 20
 *                     roomId:
 *                       type: string
 *                       format: uuid
 *                     roomName:
 *                       type: string
 *                       example: "Lab 101"
 *                     lockId:
 *                       type: integer
 *                       example: 12405430
 *                     list:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           fingerprintId:
 *                             type: integer
 *                             example: 98765432
 *                           fingerprintName:
 *                             type: string
 *                             example: "Fingerprint Laboran"
 *                           fingerprintNumber:
 *                             type: string
 *                           fingerprintType:
 *                             type: integer
 *                             description: "1=normal, 4=cyclic"
 *                           startDate:
 *                             type: integer
 *                             description: Timestamp milidetik
 *                           endDate:
 *                             type: integer
 *                             description: Timestamp milidetik
 *                           createDate:
 *                             type: integer
 *                             description: Timestamp pembuatan
 *       404:
 *         description: Room not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/room-management/rooms/{roomId}/fingerprints/{fingerprintId}:
 *   delete:
 *     tags:
 *       - Fingerprint Management
 *     summary: Delete fingerprint
 *     description: |
 *       Menghapus fingerprint dari smart lock ruangan.
 *       Default menggunakan WiFi gateway (deleteType=2).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Room ID
 *       - in: path
 *         name: fingerprintId
 *         required: true
 *         schema:
 *           type: integer
 *         description: TTLock Fingerprint ID
 *       - in: query
 *         name: deleteType
 *         schema:
 *           type: integer
 *           enum: [1, 2, 3]
 *           default: 2
 *         description: |
 *           Metode penghapusan:
 *           - 1 = Bluetooth
 *           - 2 = WiFi Gateway (default)
 *           - 3 = NB-IoT
 *     responses:
 *       200:
 *         description: Fingerprint berhasil dihapus
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
 *                   example: "Fingerprint deleted successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     fingerprintId:
 *                       type: integer
 *                       example: 98765432
 *       404:
 *         description: Room not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */

// ==================== Fingerprint Session Swagger ====================

/**
 * @swagger
 * tags:
 *   - name: Fingerprint Session
 *     description: API untuk batch registration fingerprint ke multiple smart lock
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     CreateSessionRequest:
 *       type: object
 *       required:
 *         - personName
 *         - roomIds
 *       properties:
 *         personName:
 *           type: string
 *           description: Nama orang yang akan mendaftarkan fingerprint
 *           example: "Ahmad Laboran"
 *         roomIds:
 *           type: array
 *           description: Array UUID ruangan yang akan didaftarkan
 *           items:
 *             type: string
 *             format: uuid
 *           example: ["550e8400-e29b-41d4-a716-446655440000"]
 *
 *     SessionProgress:
 *       type: object
 *       properties:
 *         total:
 *           type: integer
 *           example: 3
 *         completed:
 *           type: integer
 *           example: 1
 *         pending:
 *           type: integer
 *           example: 2
 *         percentage:
 *           type: integer
 *           example: 33
 *
 *     SessionRoom:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         roomId:
 *           type: string
 *           format: uuid
 *         roomName:
 *           type: string
 *           example: "Lab 101"
 *         lockId:
 *           type: integer
 *           example: 12405430
 *         status:
 *           type: string
 *           enum: [pending, done, failed]
 *           example: "pending"
 *         fingerprintId:
 *           type: integer
 *           nullable: true
 *           example: null
 *         detectedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *
 *     SessionResponse:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         personName:
 *           type: string
 *           example: "Ahmad Laboran"
 *         status:
 *           type: string
 *           enum: [ongoing, completed, cancelled]
 *           example: "ongoing"
 *         createdBy:
 *           type: string
 *           nullable: true
 *         createdAt:
 *           type: string
 *           format: date-time
 *         completedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         rooms:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/SessionRoom'
 *         progress:
 *           $ref: '#/components/schemas/SessionProgress'
 */

/**
 * @swagger
 * /api/room-management/fingerprint-sessions:
 *   post:
 *     tags:
 *       - Fingerprint Session
 *     summary: Create fingerprint registration session
 *     description: |
 *       Membuat sesi registrasi fingerprint untuk satu orang pada satu atau lebih ruangan.
 *       Sistem akan mengambil snapshot fingerprint yang ada saat ini sebagai baseline.
 *       Setelah sesi dibuat, arahkan orang tersebut untuk menempelkan jari di sensor lock.
 *       Gunakan endpoint /check untuk mendeteksi fingerprint baru.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateSessionRequest'
 *     responses:
 *       201:
 *         description: Session berhasil dibuat
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
 *                   example: "Fingerprint registration session created. Guide the person to tap their finger on each lock."
 *                 data:
 *                   $ref: '#/components/schemas/SessionResponse'
 *       400:
 *         description: Validation error atau room tidak memiliki lock
 *       404:
 *         description: Room not found
 *       401:
 *         description: Unauthorized
 *
 *   get:
 *     tags:
 *       - Fingerprint Session
 *     summary: Get all sessions
 *     description: Mendapatkan daftar semua sesi registrasi fingerprint beserta ringkasan progress
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Daftar session berhasil diambil
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
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         format: uuid
 *                       personName:
 *                         type: string
 *                       status:
 *                         type: string
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       progress:
 *                         $ref: '#/components/schemas/SessionProgress'
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /api/room-management/fingerprint-sessions/{sessionId}:
 *   get:
 *     tags:
 *       - Fingerprint Session
 *     summary: Get session by ID
 *     description: Mendapatkan detail sesi registrasi termasuk status per-ruangan dan progress
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Session ID
 *     responses:
 *       200:
 *         description: Detail session berhasil diambil
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/SessionResponse'
 *       404:
 *         description: Session not found
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /api/room-management/fingerprint-sessions/{sessionId}/check:
 *   post:
 *     tags:
 *       - Fingerprint Session
 *     summary: Check session for new fingerprints
 *     description: |
 *       Memeriksa apakah ada fingerprint baru yang terdaftar pada lock dalam sesi ini.
 *       Membandingkan daftar fingerprint saat ini dengan baseline snapshot yang diambil saat sesi dibuat.
 *       Jika ditemukan fingerprint baru, room tersebut otomatis ditandai 'done'.
 *       Jika semua room sudah 'done', sesi otomatis ditandai 'completed'.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Session ID
 *     responses:
 *       200:
 *         description: Check selesai dengan hasil deteksi
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
 *                   example: "Session check completed"
 *                 data:
 *                   allOf:
 *                     - $ref: '#/components/schemas/SessionResponse'
 *                     - type: object
 *                       properties:
 *                         detectionResults:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               roomId:
 *                                 type: string
 *                                 format: uuid
 *                               roomName:
 *                                 type: string
 *                               status:
 *                                 type: string
 *                                 enum: [done, pending, error]
 *                               fingerprintId:
 *                                 type: integer
 *                                 nullable: true
 *                               message:
 *                                 type: string
 *       400:
 *         description: Session sudah completed atau cancelled
 *       404:
 *         description: Session not found
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /api/room-management/fingerprint-sessions/{sessionId}/cancel:
 *   patch:
 *     tags:
 *       - Fingerprint Session
 *     summary: Cancel a session
 *     description: Membatalkan sesi registrasi fingerprint yang sedang berjalan
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Session ID
 *     responses:
 *       200:
 *         description: Session berhasil dibatalkan
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
 *                   example: "Session cancelled successfully"
 *       400:
 *         description: Session sudah completed atau cancelled
 *       404:
 *         description: Session not found
 *       401:
 *         description: Unauthorized
 */

// ==================== IC Card Schemas ====================

/**
 * @swagger
 * components:
 *   schemas:
 *     AddCardRequest:
 *       type: object
 *       required:
 *         - cardNumber
 *       properties:
 *         cardNumber:
 *           type: string
 *           description: |
 *             Card number from USB RFID reader (decimal format).
 *             The system automatically converts to TTLock reversed byte format.
 *           example: "2672633271"
 *         cardName:
 *           type: string
 *           maxLength: 255
 *           description: Nama kartu (optional)
 *           example: "Kartu Lab Praktikan A"
 *         startDate:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: Tanggal mulai berlaku (optional, format ISO 8601)
 *           example: "2025-12-01T00:00:00.000Z"
 *         endDate:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: Tanggal expired (optional, format ISO 8601)
 *           example: "2026-06-01T00:00:00.000Z"
 *     BulkAddCardRequest:
 *       allOf:
 *         - $ref: '#/components/schemas/AddCardRequest'
 *         - type: object
 *           properties:
 *             roomIds:
 *               type: array
 *               description: Room IDs to assign when allRooms is false
 *               items:
 *                 type: string
 *                 format: uuid
 *             allRooms:
 *               type: boolean
 *               description: Assign to every room with a configured smart lock
 *               default: false
 */

// ==================== IC Card Endpoints ====================

/**
 * @swagger
 * /api/room-management/cards/bulk:
 *   post:
 *     tags:
 *       - IC Card Management
 *     summary: Add IC card to multiple rooms
 *     description: |
 *       Registers the same physical RFID card number to multiple TTLock room locks.
 *       Each lock creates its own TTLock cardId. The endpoint allows partial success:
 *       successful room registrations are kept, and failed rooms are returned in `failures`.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BulkAddCardRequest'
 *           examples:
 *             selectedRooms:
 *               value:
 *                 roomIds:
 *                   - "f47ac10b-58cc-4372-a567-0e02b2c3d479"
 *                 allRooms: false
 *                 cardNumber: "2672633271"
 *                 cardName: "Student Card - Ahmad"
 *                 startDate: null
 *                 endDate: null
 *             allRooms:
 *               value:
 *                 roomIds: []
 *                 allRooms: true
 *                 cardNumber: "2672633271"
 *                 cardName: "Lab Access Card"
 *     responses:
 *       200:
 *         description: Bulk assignment completed, possibly with partial failures
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
 *                   example: "IC card assignment completed with some failures"
 *                 data:
 *                   type: object
 *                   properties:
 *                     requestedRooms:
 *                       type: integer
 *                     successCount:
 *                       type: integer
 *                     failureCount:
 *                       type: integer
 *                     successes:
 *                       type: array
 *                       items:
 *                         type: object
 *                     failures:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           roomId:
 *                             type: string
 *                           roomName:
 *                             type: string
 *                           lockId:
 *                             type: string
 *                           message:
 *                             type: string
 *       400:
 *         description: Validation error or no smart-lock rooms selected
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - admin role required
 */

/**
 * @swagger
 * /api/room-management/rooms/{roomId}/cards:
 *   get:
 *     tags:
 *       - IC Card Management
 *     summary: Get IC card list
 *     description: |
 *       Mendapatkan daftar IC card (RFID) yang terdaftar pada smart lock di ruangan tertentu.
 *       Data diambil langsung dari TTLock API.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Room ID
 *       - in: query
 *         name: pageNo
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Nomor halaman
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *         description: Jumlah item per halaman
 *     responses:
 *       200:
 *         description: IC card list berhasil diambil
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
 *                   example: "IC card list retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     pageNo:
 *                       type: integer
 *                     pageSize:
 *                       type: integer
 *                     roomId:
 *                       type: string
 *                     roomName:
 *                       type: string
 *                     lockId:
 *                       type: integer
 *                     list:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           cardId:
 *                             type: integer
 *                             description: IC card ID
 *                           lockId:
 *                             type: integer
 *                           cardNumber:
 *                             type: string
 *                             description: IC card number
 *                           cardName:
 *                             type: string
 *                           startDate:
 *                             type: integer
 *                             description: Start timestamp (ms)
 *                           endDate:
 *                             type: integer
 *                             description: End timestamp (ms)
 *                           createDate:
 *                             type: integer
 *                             description: Create timestamp (ms)
 *                           status:
 *                             type: integer
 *                             description: "1=normal, 2=invalid/expired, 3=pending, 4=adding, 5=add failed"
 *       404:
 *         description: Room not found
 *       401:
 *         description: Unauthorized
 *
 *   post:
 *     tags:
 *       - IC Card Management
 *     summary: Add IC card
 *     description: |
 *       Menambahkan IC card (RFID) ke smart lock menggunakan WiFi gateway.
 *
 *       **Input**: Nomor kartu dari USB RFID reader (format desimal).
 *       Sistem otomatis mengkonversi ke format TTLock (reversed byte order).
 *
 *       **Contoh konversi**:
 *       - USB Reader: 2672633271
 *       - Hex: 9F4B19B7 → Reversed: B7194B9F
 *       - TTLock format: 3072675231
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Room ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AddCardRequest'
 *     responses:
 *       201:
 *         description: IC card berhasil ditambahkan
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
 *                   example: "IC card added successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                       description: Log ID
 *                     cardId:
 *                       type: integer
 *                       description: TTLock card ID
 *                     cardNumber:
 *                       type: string
 *                       description: Card number (TTLock reversed format)
 *                     usbReaderNumber:
 *                       type: string
 *                       description: Original number from USB reader
 *                     cardName:
 *                       type: string
 *                       nullable: true
 *                     roomId:
 *                       type: string
 *                     roomName:
 *                       type: string
 *                     lockId:
 *                       type: integer
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Bad request - Validation error
 *       404:
 *         description: Room not found
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /api/room-management/rooms/{roomId}/card-logs:
 *   get:
 *     tags:
 *       - IC Card Management
 *     summary: Get IC card audit logs
 *     description: |
 *       Mengambil riwayat operasi IC card (created/deleted) dari tabel card_logs.
 *       Mendukung filter action dan active (kartu aktif = created, belum deleted, belum expired).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Room ID
 *       - in: query
 *         name: pageNo
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *           enum: [created, deleted]
 *       - in: query
 *         name: active
 *         schema:
 *           type: string
 *           enum: [true, false]
 *     responses:
 *       200:
 *         description: Card logs retrieved successfully
 *       404:
 *         description: Room not found
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /api/room-management/rooms/{roomId}/cards/{cardId}:
 *   delete:
 *     tags:
 *       - IC Card Management
 *     summary: Delete IC card
 *     description: |
 *       Menghapus IC card dari smart lock via WiFi gateway (deleteType=2).
 *       Membutuhkan role admin (kaur_lab, laboran, atau tpa).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Room ID
 *       - in: path
 *         name: cardId
 *         required: true
 *         schema:
 *           type: integer
 *         description: TTLock IC card ID
 *       - in: query
 *         name: deleteType
 *         schema:
 *           type: integer
 *           enum: [1, 2, 3]
 *           default: 2
 *         description: "Metode hapus: 1=Bluetooth, 2=WiFi gateway (default), 3=NB-IoT"
 *     responses:
 *       200:
 *         description: IC card berhasil dihapus
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
 *                   example: "IC card deleted successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     cardId:
 *                       type: integer
 *       404:
 *         description: Room not found
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - admin role required
 *       409:
 *         description: Card has already been deleted
 */

// ==================== Battery / Lock Info Endpoints ====================

/**
 * @swagger
 * /api/room-management/rooms/{roomId}/battery:
 *   get:
 *     tags:
 *       - Room Management
 *     summary: Get battery level of smart lock
 *     description: |
 *       Mengambil level baterai (electric quantity) smart lock pada ruangan tertentu.
 *       Nilai yang dikembalikan berupa persentase (0-100%).
 *       Membutuhkan WiFi gateway yang terhubung ke lock.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Room ID
 *     responses:
 *       200:
 *         description: Battery level berhasil diambil
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
 *                   example: "Battery level retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     roomId:
 *                       type: string
 *                       format: uuid
 *                     roomName:
 *                       type: string
 *                       example: "Lab 101"
 *                     lockId:
 *                       type: integer
 *                       example: 12405430
 *                     electricQuantity:
 *                       type: integer
 *                       description: "Battery level percentage (0-100)"
 *                       example: 85
 *                     batteryLevel:
 *                       type: integer
 *                       description: "Alias for electricQuantity"
 *                       example: 85
 *       400:
 *         description: Room does not have a smart lock
 *       404:
 *         description: Room not found
 *       401:
 *         description: Unauthorized
 */
