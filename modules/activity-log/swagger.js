/**
 * @swagger
 * tags:
 *   - name: Activity Log
 *     description: API untuk melihat activity logs (audit trail) - Hanya bisa diakses oleh admin
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     ActivityLog:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           description: Activity log ID
 *         user_id:
 *           type: string
 *           nullable: true
 *           description: User ID dari JWT (null untuk unauthenticated requests)
 *         action:
 *           type: string
 *           description: HTTP method + endpoint (e.g., 'GET /api/users')
 *           example: "GET /api/user-management/users"
 *         method:
 *           type: string
 *           enum: [GET, POST, PUT, DELETE, PATCH]
 *           description: HTTP method
 *         endpoint:
 *           type: string
 *           description: Endpoint path
 *           example: "/api/user-management/users"
 *         ip_address:
 *           type: string
 *           nullable: true
 *           description: IP address (IPv4 atau IPv6)
 *         user_agent:
 *           type: string
 *           nullable: true
 *           description: User agent string
 *         request_body:
 *           type: object
 *           nullable: true
 *           description: Request body (sanitized untuk sensitive data)
 *         response_status:
 *           type: integer
 *           nullable: true
 *           description: HTTP response status code
 *           example: 200
 *         response_body:
 *           type: object
 *           nullable: true
 *           description: Response body (truncated jika terlalu besar)
 *         error_message:
 *           type: string
 *           nullable: true
 *           description: Error message jika terjadi error
 *         error_stack:
 *           type: string
 *           nullable: true
 *           description: Error stack trace jika terjadi error
 *         execution_time_ms:
 *           type: integer
 *           nullable: true
 *           description: Waktu eksekusi dalam milliseconds
 *         affected_table:
 *           type: string
 *           nullable: true
 *           description: Nama table yang terpengaruh
 *           example: "user_profiles"
 *         affected_record_id:
 *           type: string
 *           nullable: true
 *           description: ID record yang terpengaruh
 *         metadata:
 *           type: object
 *           nullable: true
 *           description: Additional metadata (roles, query params, dll)
 *         created_at:
 *           type: string
 *           format: date-time
 *           description: Timestamp ketika log dibuat
 *
 *     ActivityLogPagination:
 *       type: object
 *       properties:
 *         total:
 *           type: integer
 *           description: Total jumlah logs
 *         limit:
 *           type: integer
 *           description: Limit per page
 *         offset:
 *           type: integer
 *           description: Offset untuk pagination
 *         has_more:
 *           type: boolean
 *           description: Apakah masih ada data lebih lanjut
 *
 *     ActivityStatistics:
 *       type: object
 *       properties:
 *         total_requests:
 *           type: integer
 *           description: Total jumlah requests
 *         unique_users:
 *           type: integer
 *           description: Jumlah unique users
 *         error_count:
 *           type: integer
 *           description: Jumlah error
 *         avg_execution_time:
 *           type: number
 *           format: float
 *           description: Rata-rata waktu eksekusi (ms)
 *         max_execution_time:
 *           type: integer
 *           description: Maksimal waktu eksekusi (ms)
 *         error_4xx_count:
 *           type: integer
 *           description: Jumlah error 4xx
 *         error_5xx_count:
 *           type: integer
 *           description: Jumlah error 5xx
 *
 *     TopEndpoint:
 *       type: object
 *       properties:
 *         endpoint:
 *           type: string
 *           description: Endpoint path
 *         method:
 *           type: string
 *           description: HTTP method
 *         request_count:
 *           type: integer
 *           description: Jumlah requests
 *         avg_execution_time:
 *           type: number
 *           format: float
 *           description: Rata-rata waktu eksekusi (ms)
 *         error_count:
 *           type: integer
 *           description: Jumlah error
 */

/**
 * @swagger
 * /api/activity-log/health:
 *   get:
 *     summary: Health check untuk modul activity log
 *     tags: [Activity Log]
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
 *                   example: "activity-log"
 *                 message:
 *                   type: string
 *                   example: "Activity Log module is running"
 */

/**
 * @swagger
 * /api/activity-log/logs:
 *   get:
 *     summary: Get activity logs
 *     description: |
 *       Mendapatkan activity logs dengan berbagai filter.
 *       Hanya bisa diakses oleh kaur_lab dan laboran.
 *     tags: [Activity Log]
 *     parameters:
 *       - in: query
 *         name: user_id
 *         schema:
 *           type: string
 *         description: Filter berdasarkan user ID
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *         description: Filter berdasarkan action (e.g., 'GET /api/users')
 *       - in: query
 *         name: method
 *         schema:
 *           type: string
 *           enum: [GET, POST, PUT, DELETE, PATCH]
 *         description: Filter berdasarkan HTTP method
 *       - in: query
 *         name: endpoint
 *         schema:
 *           type: string
 *         description: Filter berdasarkan endpoint (partial match)
 *       - in: query
 *         name: response_status
 *         schema:
 *           type: integer
 *         description: Filter berdasarkan response status code
 *       - in: query
 *         name: affected_table
 *         schema:
 *           type: string
 *         description: Filter berdasarkan affected table
 *       - in: query
 *         name: has_error
 *         schema:
 *           type: boolean
 *         description: Filter hanya error logs
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter mulai dari tanggal
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter sampai tanggal
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *           minimum: 1
 *           maximum: 1000
 *         description: Limit jumlah results
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *           minimum: 0
 *         description: Offset untuk pagination
 *       - in: query
 *         name: order_by
 *         schema:
 *           type: string
 *           enum: [created_at, execution_time_ms, response_status, method, endpoint]
 *           default: created_at
 *         description: Field untuk sorting
 *       - in: query
 *         name: order_direction
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *           default: DESC
 *         description: Direction untuk sorting
 *     responses:
 *       200:
 *         description: Activity logs berhasil diambil
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
 *                     $ref: '#/components/schemas/ActivityLog'
 *                 pagination:
 *                   $ref: '#/components/schemas/ActivityLogPagination'
 *       401:
 *         description: Unauthorized - Token tidak valid
 *       403:
 *         description: Forbidden - Hanya kaur_lab dan laboran yang bisa mengakses
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/activity-log/logs/{id}:
 *   get:
 *     summary: Get activity log by ID
 *     description: Mendapatkan detail activity log berdasarkan ID
 *     tags: [Activity Log]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Activity log ID
 *     responses:
 *       200:
 *         description: Activity log berhasil diambil
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/ActivityLog'
 *       404:
 *         description: Activity log tidak ditemukan
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/activity-log/statistics:
 *   get:
 *     summary: Get activity statistics
 *     description: Mendapatkan statistik aktivitas (total requests, errors, dll)
 *     tags: [Activity Log]
 *     parameters:
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter mulai dari tanggal
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter sampai tanggal
 *     responses:
 *       200:
 *         description: Statistics berhasil diambil
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/ActivityStatistics'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/activity-log/top-endpoints:
 *   get:
 *     summary: Get top endpoints
 *     description: Mendapatkan endpoint yang paling banyak diakses
 *     tags: [Activity Log]
 *     parameters:
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter mulai dari tanggal
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter sampai tanggal
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           minimum: 1
 *           maximum: 100
 *         description: Jumlah top endpoints yang ditampilkan
 *     responses:
 *       200:
 *         description: Top endpoints berhasil diambil
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
 *                     $ref: '#/components/schemas/TopEndpoint'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/activity-log/errors:
 *   get:
 *     summary: Get error logs
 *     description: Mendapatkan activity logs yang mengandung error
 *     tags: [Activity Log]
 *     parameters:
 *       - in: query
 *         name: user_id
 *         schema:
 *           type: string
 *         description: Filter berdasarkan user ID
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter mulai dari tanggal
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter sampai tanggal
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *         description: Limit jumlah results
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Offset untuk pagination
 *     responses:
 *       200:
 *         description: Error logs berhasil diambil
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
 *                     $ref: '#/components/schemas/ActivityLog'
 *                 pagination:
 *                   $ref: '#/components/schemas/ActivityLogPagination'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/activity-log/users/{userId}/logs:
 *   get:
 *     summary: Get user activity logs
 *     description: Mendapatkan activity logs untuk user tertentu
 *     tags: [Activity Log]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter mulai dari tanggal
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter sampai tanggal
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *         description: Limit jumlah results
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Offset untuk pagination
 *     responses:
 *       200:
 *         description: User activity logs berhasil diambil
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
 *                     $ref: '#/components/schemas/ActivityLog'
 *                 pagination:
 *                   $ref: '#/components/schemas/ActivityLogPagination'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Internal server error
 */

