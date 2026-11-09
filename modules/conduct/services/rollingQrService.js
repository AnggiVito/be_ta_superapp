/**
 * Rolling QR Service
 *
 * Bertanggung jawab atas logika inti rolling QR Code untuk absensi simulasi:
 *  1. Generate token QR baru yang unik dan aman setiap 15 detik
 *  2. Menyimpan token ke database (practicum_simulation_qr_sessions)
 *  3. Menonaktifkan token lama secara otomatis sebelum membuat yang baru
 *  4. Memvalidasi token saat peserta melakukan scan
 *
 * Alur kerja (generate â†’ tampil â†’ scan â†’ validasi):
 *
 *  [Koordinator membuka halaman QR]
 *        â”‚
 *        â–¼
 *  generateRollingQrToken()       â† Backend generate token UUID baru
 *        â”‚  simpan ke DB (expired_at = now + 15 detik)
 *        â–¼
 *  QR Code ditampilkan di layar   â† Frontend render gambar QR dari token
 *        â”‚  (setiap 15 detik frontend minta token baru via polling/SSE)
 *        â–¼
 *  [Peserta scan QR dengan HP]
 *        â”‚
 *        â–¼
 *  validateAndConsumeQrToken()    â† Backend cek: token ada? aktif? belum expired?
 *        â”‚  jika valid â†’ catat kehadiran
 *        â–¼
 *  Kehadiran tercatat di DB       â† Token lama sudah tidak bisa dipakai lagi
 */

import { conductDb } from '../../../config/databases.js';
import { logger } from '../../../core/utils/logger.js';
import QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';

/** Masa berlaku tiap token QR dalam detik */
export const QR_EXPIRY_SECONDS = 15;

/**
 * Generate token QR baru untuk simulasi.
 *
 * Langkah yang dilakukan:
 *  1. Nonaktifkan semua token lama milik simulasi ini
 *  2. Buat token UUID baru + hitung kapan expired-nya
 *  3. Simpan ke tabel practicum_simulation_qr_sessions
 *  4. Generate gambar QR Code dari token (base64 Data URL)
 *
 * @param {object} params
 * @param {string} params.simulationId  - UUID sesi praktikum
 * @param {string} params.generatedBy   - User ID yang generate (koordinator)
 * @returns {Promise<object>} Data token + gambar QR
 */
export async function generateRollingQrToken({ simulationId, generatedBy }) {
  // Token baru: UUID v4 yang acak dan tidak bisa ditebak
  const qrToken = uuidv4();

  // Hitung waktu kedaluwarsa: sekarang + 15 detik
  const now = new Date();
  const expiredAt = new Date(now.getTime() + QR_EXPIRY_SECONDS * 1000);

  /**
   * Struktur data yang dimasukkan ke dalam QR Code.
   * Ini yang akan di-encode menjadi gambar QR dan dibaca saat di-scan.
   *
   * Contoh nilai:
   * {
   *   token: "550e8400-e29b-41d4-a716-446655440000",
   *   simulationId: "a8098c1a-f86e-11da-bd1a-00112444be1e",
   *   type: "simulation_attendance",
   *   expiredAt: "2026-04-30T10:15:15.000Z"
   * }
   */
  const qrPayload = {
    token: qrToken,
    simulationId,
    type: 'simulation_attendance',
    expiredAt: expiredAt.toISOString(),
  };

  const client = await conductDb.connect();
  try {
    await client.query('BEGIN');

    // Langkah 1: Nonaktifkan semua token lama milik simulasi ini
    // (is_active = false agar tidak bisa dipakai lagi walau belum expired)
    await client.query(
      `UPDATE practicum_simulation_qr_sessions
       SET is_active = false, updated_at = NOW()
       WHERE simulation_id = $1::uuid
         AND is_active = true`,
      [simulationId]
    );

    // Langkah 2: Simpan token baru ke database
    const insertResult = await client.query(
      `INSERT INTO practicum_simulation_qr_sessions (
        simulation_id,
        qr_token,
        qr_data,
        generated_by,
        expired_at,
        is_active,
        created_at,
        updated_at
      ) VALUES ($1::uuid, $2, $3::jsonb, $4, $5, true, NOW(), NOW())
      RETURNING id, simulation_id, qr_token, expired_at, created_at`,
      [
        simulationId,
        qrToken,
        JSON.stringify(qrPayload),
        generatedBy,
        expiredAt,
      ]
    );

    await client.query('COMMIT');

    const session = insertResult.rows[0];

    // Langkah 3: Buat gambar QR Code dari payload (format base64 PNG)
    // Frontend akan langsung menampilkan gambar ini dengan tag <img src="...">
    const qrCodeImage = await QRCode.toDataURL(JSON.stringify(qrPayload), {
      errorCorrectionLevel: 'H', // Tingkat koreksi error tertinggi (lebih tahan rusak)
      type: 'image/png',
      width: 300,
      margin: 2,
      color: {
        dark: '#1a1a2e',  // Warna modul QR (gelap)
        light: '#ffffff', // Warna latar (terang)
      },
    });

    logger.info('Rolling QR token generated', {
      simulationId,
      sessionId: session.id,
      expiredAt: session.expired_at,
    });

    return {
      sessionId: session.id,
      simulationId: session.simulation_id,
      qrToken: session.qr_token,
      qrCodeImage,       // Data URL gambar QR (untuk ditampilkan di frontend)
      expiredAt: session.expired_at,
      expirySeconds: QR_EXPIRY_SECONDS,
      generatedAt: session.created_at,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to generate rolling QR token', { simulationId, error: error.message });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Validasi token QR saat peserta melakukan scan.
 *
 * Pengecekan yang dilakukan (semua harus lolos):
 *  âœ… Token ada di database
 *  âœ… Token milik simulasi yang benar (simulationId cocok)
 *  âœ… Token masih aktif (is_active = true)
 *  âœ… Token belum expired (expired_at > waktu sekarang)
 *
 * @param {object} params
 * @param {string} params.simulationId - UUID sesi praktikum yang sedang berjalan
 * @param {string} params.qrToken      - Token yang dibaca dari QR Code
 * @returns {Promise<object>} Data session QR jika valid
 * @throws {Error} Jika token is invalid, not active, atau has expired
 */
export async function validateQrToken({ simulationId, qrToken }) {
  const result = await conductDb.query(
    `SELECT id, simulation_id, qr_token, expired_at, is_active
     FROM practicum_simulation_qr_sessions
     WHERE simulation_id = $1::uuid
       AND qr_token = $2
     LIMIT 1`,
    [simulationId, qrToken]
  );

  // Pengecekan 1: Apakah token ada di database?
  if (result.rows.length === 0) {
    throw new Error('QR token is invalid or not found');
  }

  const qrSession = result.rows[0];

  // Pengecekan 2: Apakah token masih aktif?
  // (Token di-nonaktifkan saat token baru di-generate)
  if (!qrSession.is_active) {
    throw new Error('QR token is no longer active because it has been replaced by a new token');
  }

  // Pengecekan 3: Apakah token belum melewati waktu expired?
  const now = new Date();
  if (new Date(qrSession.expired_at) < now) {
    // Tandai sebagai not active agar pembersihan lebih mudah
    await conductDb.query(
      `UPDATE practicum_simulation_qr_sessions
       SET is_active = false, updated_at = NOW()
       WHERE id = $1`,
      [qrSession.id]
    );
    throw new Error('QR token has expired. Silakan scan QR terbaru');
  }

  return qrSession;
}

/**
 * Ambil informasi token QR yang sedang aktif untuk suatu simulasi.
 * Digunakan oleh frontend untuk polling: "apakah token baru sudah tersedia?"
 *
 * @param {string} simulationId - UUID sesi praktikum
 * @returns {Promise<object|null>} Data session aktif, atau null jika tidak ada
 */
export async function getActiveQrSession(simulationId) {
  const result = await conductDb.query(
    `SELECT id, simulation_id, qr_token, qr_data, expired_at, created_at
     FROM practicum_simulation_qr_sessions
     WHERE simulation_id = $1::uuid
       AND is_active = true
       AND expired_at > NOW()
     ORDER BY created_at DESC
     LIMIT 1`,
    [simulationId]
  );

  return result.rows[0] || null;
}

/**
 * Bersihkan token-token QR yang has expired dari database.
 * Bisa dipanggil secara periodik (cron job) untuk menjaga tabel tetap bersih.
 *
 * @param {string} [simulationId] - Opsional: batasi pembersihan untuk simulasi tertentu
 * @returns {Promise<number>} Jumlah token yang dibersihkan
 */
export async function cleanupExpiredQrTokens(simulationId = null) {
  let query;
  let params;

  if (simulationId) {
    query = `UPDATE practicum_simulation_qr_sessions
             SET is_active = false, updated_at = NOW()
             WHERE expired_at < NOW()
               AND is_active = true
               AND simulation_id = $1::uuid`;
    params = [simulationId];
  } else {
    query = `UPDATE practicum_simulation_qr_sessions
             SET is_active = false, updated_at = NOW()
             WHERE expired_at < NOW()
               AND is_active = true`;
    params = [];
  }

  const result = await conductDb.query(query, params);
  const count = result.rowCount || 0;

  if (count > 0) {
    logger.info('Expired QR tokens cleaned up', { count, simulationId });
  }

  return count;
}

