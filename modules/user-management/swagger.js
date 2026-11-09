/**
 * @swagger
 * tags:
 *   - name: User Management
 *     description: API untuk mengelola data tambahan user dan role management
 *   - name: Profile
 *     description: API untuk mengelola profile user (TTD, no rekening)
 *   - name: Roles
 *     description: API untuk mengelola role user
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     UserProfile:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           description: Profile ID
 *         user_id:
 *           type: string
 *           format: uuid
 *           description: User ID dari AUTH GATEWAY (UUID)
 *         ttd:
 *           type: string
 *           nullable: true
 *           description: Deprecated - Base64 encoded signature image (tidak digunakan lagi)
 *           example: null
 *         ttd_file_path:
 *           type: string
 *           nullable: true
 *           description: Path ke file TTD di local storage
 *           example: "uploads/ttd/user-id-1234567890.png"
 *         ttd_url:
 *           type: string
 *           nullable: true
 *           description: URL untuk mengakses file TTD
 *           example: "/uploads/ttd/user-id-1234567890.png"
 *         no_rekening:
 *           type: string
 *           nullable: true
 *           description: No rekening khusus asisten praktikum
 *           example: "1234567890"
 *         bank_name:
 *           type: string
 *           nullable: true
 *           description: Nama bank
 *           example: "Bank ABC"
 *         account_name:
 *           type: string
 *           nullable: true
 *           description: Nama pemilik rekening
 *           example: "John Doe"
 *         name:
 *           type: string
 *           nullable: true
 *           description: User name (auto-synced from JWT)
 *           example: "John Doe"
 *         nipnim:
 *           type: string
 *           nullable: true
 *           description: NIM (for students) or NIP (for lecturers/staff)
 *           example: "D001"
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *         deleted_at:
 *           type: string
 *           format: date-time
 *           nullable: true
 *
 *     UserRole:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         user_id:
 *           type: string
 *           format: uuid
 *           description: User ID dari AUTH GATEWAY (UUID)
 *         role:
 *           type: string
 *           enum: [asisten_praktikum, asisten_praktikum_aktif, koordinator_praktikum, koordinator_asisten, kaur_lab, laboran]
 *           description: Role user
 *         is_active:
 *           type: boolean
 *           description: Status aktif role
 *         assigned_at:
 *           type: string
 *           format: date-time
 *         assigned_by:
 *           type: string
 *           format: uuid
 *           description: User ID yang assign role ini (UUID)
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *         deleted_at:
 *           type: string
 *           format: date-time
 *           nullable: true
 *
 *     UserData:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           description: User ID dari JWT (UUID dari AUTH GATEWAY)
 *         username:
 *           type: string
 *           example: "user123"
 *         email:
 *           type: string
 *           example: "user@example.com"
 *         full_name:
 *           type: string
 *           example: "John Doe"
 *         nipnim:
 *           type: string
 *           nullable: true
 *           description: NIM (for students) or NIP (for lecturers/staff)
 *           example: "D001"
 *         profile:
 *           $ref: '#/components/schemas/UserProfile'
 *
 *     UpdateProfileRequest:
 *       type: object
 *       properties:
 *         ttd:
 *           type: string
 *           nullable: true
 *           description: Base64 encoded signature image
 *           example: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."
 *         ttd_file_path:
 *           type: string
 *           nullable: true
 *           example: "/uploads/ttd/user123.png"
 *         no_rekening:
 *           type: string
 *           nullable: true
 *           minLength: 10
 *           pattern: '^\d{10,}$'
 *           example: "1234567890"
 *         bank_name:
 *           type: string
 *           nullable: true
 *           example: "Bank ABC"
 *         account_name:
 *           type: string
 *           nullable: true
 *           example: "John Doe"
 *         name:
 *           type: string
 *           nullable: true
 *           description: User name (auto-synced from JWT if not provided)
 *           example: "John Doe"
 *         nipnim:
 *           type: string
 *           nullable: true
 *           description: NIM (for students) or NIP (for lecturers/staff)
 *           example: "D001"
 *
 *     UploadTTDRequest:
 *       type: object
 *       required:
 *         - ttd
 *       properties:
 *         ttd:
 *           type: string
 *           format: binary
 *           description: File TTD (PNG, JPG, JPEG, PDF) - multipart/form-data
 *           example: "file"
 *
 *     UpdateRekeningRequest:
 *       type: object
 *       required:
 *         - no_rekening
 *       properties:
 *         no_rekening:
 *           type: string
 *           minLength: 10
 *           pattern: '^\d{10,}$'
 *           description: No rekening (minimal 10 digit angka)
 *           example: "1234567890"
 *         bank_name:
 *           type: string
 *           nullable: true
 *           example: "Bank ABC"
 *         account_name:
 *           type: string
 *           nullable: true
 *           example: "John Doe"
 *
 *     AssignRoleRequest:
 *       type: object
 *       required:
 *         - role
 *       properties:
 *         role:
 *           type: string
 *           enum: [asisten_praktikum, asisten_praktikum_aktif, koordinator_praktikum, koordinator_asisten, kaur_lab, laboran]
 *           description: Role yang akan di-assign
 *           example: "asisten_praktikum"
 *
 *     UpdateRoleStatusRequest:
 *       type: object
 *       required:
 *         - isActive
 *       properties:
 *         isActive:
 *           type: boolean
 *           description: Status aktif role
 *           example: true
 *
 *     SuccessResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         message:
 *           type: string
 *           example: "Operation successful"
 *         data:
 *           type: object
 *
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: false
 *         message:
 *           type: string
 *           example: "Error message"
 *
 *     UserListItem:
 *       type: object
 *       properties:
 *         user_id:
 *           type: string
 *           format: uuid
 *           description: User ID dari AUTH GATEWAY (UUID)
 *           example: "550e8400-e29b-41d4-a716-446655440000"
 *         name:
 *           type: string
 *           nullable: true
 *           description: User name
 *           example: "John Doe"
 *         nipnim:
 *           type: string
 *           nullable: true
 *           description: NIM (for students) or NIP (for lecturers/staff)
 *           example: "D001"
 */

/**
 * @swagger
 * /api/user-management/health:
 *   get:
 *     summary: Health check untuk modul user management
 *     tags: [User Management]
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
 *                   example: "user-management"
 *                 message:
 *                   type: string
 *                   example: "User Management module is running"
 */

/**
 * @swagger
 * /api/user-management/users/{userId}/profile:
 *   get:
 *     summary: Get user profile
 *     description: |
 *       Mendapatkan profile user dengan data dari JWT dan data tambahan (TTD, no rekening).
 *       Semua user dapat mengakses profile mereka sendiri. 
 *       User dengan role kaur_lab, laboran, asisten_praktikum, atau asisten_praktikum_aktif dapat mengakses profile user lain.
 *     tags: [Profile]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: User ID dari AUTH GATEWAY (UUID)
 *         example: "550e8400-e29b-41d4-a716-446655440000"
 *     responses:
 *       200:
 *         description: Profile berhasil diambil
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/UserData'
 *       401:
 *         description: Unauthorized - Token tidak valid
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden - Tidak memiliki akses. Hanya bisa akses profile sendiri atau dengan role kaur_lab, laboran, asisten_praktikum, atau asisten_praktikum_aktif
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *
 *   put:
 *     summary: Update user profile
 *     description: |
 *       Update profile user (TTD, no rekening, name, nipnim, dll).
 *       - No rekening hanya bisa diisi jika user punya role asisten praktikum atau lebih tinggi.
 *       - Name akan auto-sync dari JWT jika tidak diisi.
 *       - Nipnim (NIM/NIP) akan auto-sync dari JWT jika tidak diisi.
 *     tags: [Profile]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: User ID dari AUTH GATEWAY (UUID)
 *         example: "550e8400-e29b-41d4-a716-446655440000"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateProfileRequest'
 *           example:
 *             ttd: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."
 *             ttd_file_path: "/uploads/ttd/user123.png"
 *             no_rekening: "1234567890"
 *             bank_name: "Bank ABC"
 *             account_name: "John Doe"
 *             name: "John Doe"
 *             nipnim: "D001"
 *     responses:
 *       200:
 *         description: Profile berhasil diupdate
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
 *                   example: "Profile berhasil diupdate"
 *                 data:
 *                   $ref: '#/components/schemas/UserProfile'
 *       400:
 *         description: Bad request - Validasi gagal
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             examples:
 *               invalidNoRekening:
 *                 value:
 *                   success: false
 *                   message: "Format no rekening tidak valid. Harus berupa angka minimal 10 digit"
 *               roleRequired:
 *                 value:
 *                   success: false
 *                   message: "No rekening hanya dapat diisi untuk asisten praktikum atau koordinator"
 *       403:
 *         description: Forbidden - Tidak memiliki akses
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/user-management/users/{userId}/profile/ttd:
 *   post:
 *     summary: Upload TTD (Tanda Tangan)
 *     description: |
 *       Upload tanda tangan user sebagai file (multipart/form-data).
 *       Format yang didukung: PNG, JPG, JPEG, PDF. Maksimal 5MB.
 *     tags: [Profile]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         example: "550e8400-e29b-41d4-a716-446655440000"
 *     requestBody:
 *       required: true
 *       content:
 *         "multipart/form-data":
 *           schema:
 *             type: object
 *             required:
 *               - ttd
 *             properties:
 *               ttd:
 *                 type: string
 *                 format: binary
 *                 description: File TTD (PNG, JPG, JPEG, PDF)
 *     responses:
 *       200:
 *         description: TTD berhasil diupload
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
 *                   example: "TTD berhasil diupload"
 *                 data:
 *                   $ref: '#/components/schemas/UserProfile'
 *       400:
 *         description: Bad request - Format TTD tidak valid atau file terlalu besar
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             examples:
 *               invalidFormat:
 *                 value:
 *                   success: false
 *                   message: "File type tidak didukung. Format yang didukung: PNG, JPG, JPEG, PDF"
 *               fileTooLarge:
 *                 value:
 *                   success: false
 *                   message: "File terlalu besar. Maksimal 5MB"
 *               fileNotFound:
 *                 value:
 *                   success: false
 *                   message: "File TTD tidak ditemukan. Pastikan mengirim file dengan field name \"ttd\""
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Internal server error
 *
 *   delete:
 *     summary: Delete TTD
 *     description: Hapus tanda tangan user
 *     tags: [Profile]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         example: "550e8400-e29b-41d4-a716-446655440000"
 *     responses:
 *       200:
 *         description: TTD berhasil dihapus
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
 *                   example: "TTD berhasil dihapus"
 *                 data:
 *                   $ref: '#/components/schemas/UserProfile'
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/user-management/users/{userId}/profile/rekening:
 *   put:
 *     summary: Update no rekening
 *     description: Update no rekening user. Hanya bisa diisi jika user memiliki role asisten praktikum atau lebih tinggi.
 *     tags: [Profile]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         example: "550e8400-e29b-41d4-a716-446655440000"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateRekeningRequest'
 *           example:
 *             no_rekening: "1234567890"
 *             bank_name: "Bank ABC"
 *             account_name: "John Doe"
 *     responses:
 *       200:
 *         description: No rekening berhasil diupdate
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
 *                   example: "No rekening berhasil diupdate"
 *                 data:
 *                   $ref: '#/components/schemas/UserProfile'
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             examples:
 *               invalidFormat:
 *                 value:
 *                   success: false
 *                   message: "Format no rekening tidak valid. Harus berupa angka minimal 10 digit"
 *               roleRequired:
 *                 value:
 *                   success: false
 *                   message: "No rekening hanya dapat diisi untuk asisten praktikum atau koordinator"
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/user-management/users/with-access-cards:
 *   get:
 *     summary: List users with kartu akses on profile
 *     description: |
 *       Returns users who have saved kartu_akses_number on their profile.
 *       Used by RFID card assignment UI. Accessible by kaur_lab, laboran, and tpa.
 *     tags: [Profiles]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Filter by name, NIP/NIM, or user_id (case-insensitive)
 *     responses:
 *       200:
 *         description: List of users with access cards
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/user-management/users:
 *   get:
 *     summary: Get all users
 *     description: |
 *       Get all users with user_id, name, and nipnim.
 *       Accessible by kaur_lab, laboran, asisten_praktikum, and asisten_praktikum_aktif.
 *       Can be filtered by role using query parameter role (multiple values supported).
 *     tags: [Roles]
 *     parameters:
 *       - in: query
 *         name: role
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *             enum: [asisten_praktikum, asisten_praktikum_aktif, koordinator_praktikum, koordinator_asisten, kaur_lab, laboran]
 *         style: form
 *         explode: true
 *         description: |
 *           Filter berdasarkan role. Bisa multiple values.
 *           User yang memiliki salah satu dari role yang diberikan akan dikembalikan.
 *           Contoh: ?role=asisten_praktikum&role=koordinator_praktikum
 *         example: ["asisten_praktikum"]
 *     responses:
 *       200:
 *         description: List user berhasil diambil
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
 *                     $ref: '#/components/schemas/UserListItem'
 *             example:
 *               success: true
 *               data:
 *                 - user_id: "550e8400-e29b-41d4-a716-446655440000"
 *                   name: "John Doe"
 *                   nipnim: "D001"
 *                 - user_id: "660e8400-e29b-41d4-a716-446655440001"
 *                   name: "Jane Smith"
 *                   nipnim: "D002"
 *       400:
 *         description: Bad request - Role tidak valid
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               message: "Role tidak valid: invalid_role. Role yang valid: asisten_praktikum, asisten_praktikum_aktif, koordinator_praktikum, koordinator_asisten, kaur_lab, laboran"
 *       401:
 *         description: Unauthorized - Token tidak valid
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden - Hanya kaur_lab, laboran, asisten_praktikum, atau asisten_praktikum_aktif yang bisa mengakses endpoint ini
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               message: "Akses ditolak. Diperlukan salah satu role: kaur_lab, laboran, asisten_praktikum, asisten_praktikum_aktif"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

/**
 * @swagger
 * /api/user-management/users/{userId}/roles:
 *   get:
 *     summary: Get user roles
 *     description: Mendapatkan semua role yang dimiliki user
 *     tags: [Roles]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         example: "550e8400-e29b-41d4-a716-446655440000"
 *       - in: query
 *         name: includeInactive
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Include inactive roles
 *     responses:
 *       200:
 *         description: Roles berhasil diambil
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
 *                     $ref: '#/components/schemas/UserRole'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Internal server error
 *
 *   post:
 *     summary: Assign role to user
 *     description: Assign role ke user. Role asisten_praktikum_aktif harus punya role asisten_praktikum dulu.
 *     tags: [Roles]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         example: "550e8400-e29b-41d4-a716-446655440000"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AssignRoleRequest'
 *           example:
 *             role: "asisten_praktikum"
 *     responses:
 *       200:
 *         description: Role berhasil diassign
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
 *                   example: "Role berhasil diassign"
 *                 data:
 *                   $ref: '#/components/schemas/UserRole'
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             examples:
 *               invalidRole:
 *                 value:
 *                   success: false
 *                   message: "Role tidak valid. Role yang valid: asisten_praktikum, asisten_praktikum_aktif, koordinator_praktikum, koordinator_asisten, kaur_lab, laboran"
 *               hierarchyRequired:
 *                 value:
 *                   success: false
 *                   message: "User harus memiliki role asisten_praktikum terlebih dahulu sebelum menjadi asisten_praktikum_aktif"
 *       403:
 *         description: Forbidden - Hanya kaur_lab atau koordinator yang bisa assign role
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/user-management/roles/{roleId}:
 *   put:
 *     summary: Update role status
 *     description: Update status aktif/inaktif role
 *     tags: [Roles]
 *     parameters:
 *       - in: path
 *         name: roleId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         example: "550e8400-e29b-41d4-a716-446655440000"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateRoleStatusRequest'
 *           example:
 *             isActive: false
 *     responses:
 *       200:
 *         description: Status role berhasil diupdate
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
 *                   example: "Status role berhasil diupdate"
 *                 data:
 *                   $ref: '#/components/schemas/UserRole'
 *       404:
 *         description: Role tidak ditemukan
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Internal server error
 *
 *   delete:
 *     summary: Remove role from user
 *     description: Hapus role dari user (soft delete)
 *     tags: [Roles]
 *     parameters:
 *       - in: path
 *         name: roleId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         example: "550e8400-e29b-41d4-a716-446655440000"
 *     responses:
 *       200:
 *         description: Role berhasil dihapus
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
 *                   example: "Role berhasil dihapus"
 *                 data:
 *                   $ref: '#/components/schemas/UserRole'
 *       404:
 *         description: Role tidak ditemukan
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/user-management/roles/{role}/users:
 *   get:
 *     summary: Get all users with specific role
 *     description: Mendapatkan semua user yang memiliki role tertentu
 *     tags: [Roles]
 *     parameters:
 *       - in: path
 *         name: role
 *         required: true
 *         schema:
 *           type: string
 *           enum: [asisten_praktikum, asisten_praktikum_aktif, koordinator_praktikum, koordinator_asisten, kaur_lab, laboran]
 *         description: Role yang dicari
 *         example: "asisten_praktikum"
 *       - in: query
 *         name: includeInactive
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Include inactive roles
 *     responses:
 *       200:
 *         description: Users berhasil diambil
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
 *                     $ref: '#/components/schemas/UserRole'
 *       400:
 *         description: Bad request - Role tidak valid
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Internal server error
 */