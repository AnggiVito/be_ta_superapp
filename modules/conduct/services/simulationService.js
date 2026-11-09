import { conductDb, userManagementDb } from '../../../config/databases.js';
import { logger } from '../../../core/utils/logger.js';
import fs from 'fs';
import path from 'path';
import {
  generateRollingQrToken,
  validateQrToken,
  getActiveQrSession,
  QR_EXPIRY_SECONDS,
} from './rollingQrService.js';

/** @deprecated Gunakan QR_EXPIRY_SECONDS dari rollingQrService */
const SIMULATION_QR_EXPIRY_SECONDS = QR_EXPIRY_SECONDS;

function normalizeDate(value) {
  if (!value) {
    return null;
  }

  // Treat date-only strings as-is to avoid timezone shifting.
  // Example: '2026-05-06' must stay '2026-05-06' (not become '2026-05-05').
  if (typeof value === 'string') {
    const raw = value.trim();
    // Accept both date-only and timestamp-ish strings that start with YYYY-MM-DD.
    // We always keep the date part as provided by the client.
    const datePrefix = raw.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(datePrefix)) {
      return datePrefix;
    }
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().split('T')[0];
}

function isValidTimeFormat(value) {
  if (!value || typeof value !== 'string') {
    return false;
  }

  return /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/.test(value.trim());
}

function normalizeTime(value) {
  if (!value) {
    return null;
  }

  const trimmed = String(value).trim();
  if (!isValidTimeFormat(trimmed)) {
    return null;
  }

  return trimmed.length === 5 ? `${trimmed}:00` : trimmed;
}

function isEndAfterStart(startTime, endTime) {
  const [startHour, startMinute, startSecond] = startTime.split(':').map(Number);
  const [endHour, endMinute, endSecond] = endTime.split(':').map(Number);

  const startTotalSeconds = (startHour * 3600) + (startMinute * 60) + startSecond;
  const endTotalSeconds = (endHour * 3600) + (endMinute * 60) + endSecond;

  return endTotalSeconds > startTotalSeconds;
}

async function ensureUserExists(userId) {
  const result = await userManagementDb.query(
    `SELECT user_id
     FROM user_profiles
     WHERE user_id = $1 AND deleted_at IS NULL
     LIMIT 1`,
    [String(userId)]
  );

  return result.rows.length > 0;
}

function normalizePagination(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    return fallback;
  }

  return parsed;
}

const ALLOWED_STATUSES = new Set(['draft', 'open', 'closed', 'cancelled']);
const SIMULATION_LATE_LIMIT_MINUTES = Number.parseInt(
  process.env.SIMULATION_LATE_LIMIT_MINUTES || '15',
  10
);

function pad2(value) {
  return String(value).padStart(2, '0');
}

function getSimulationDateString(simulationDate) {
  if (!simulationDate) {
    return null;
  }

  if (simulationDate instanceof Date) {
    // Treat as date-only value. Using UTC parts avoids off-by-one-day issues
    // when the server runs in UTC but the DB date was authored in WIB.
    const y = simulationDate.getUTCFullYear();
    const m = pad2(simulationDate.getUTCMonth() + 1);
    const d = pad2(simulationDate.getUTCDate());
    return `${y}-${m}-${d}`;
  }

  const raw = String(simulationDate).trim();
  if (!raw) {
    return null;
  }

  return raw.length >= 10 ? raw.slice(0, 10) : raw;
}

function buildWibDateTime(simulationDate, timeValue) {
  const dateStr = getSimulationDateString(simulationDate);
  const timeStr = normalizeTime(timeValue);

  if (!dateStr || !timeStr) {
    return null;
  }

  return new Date(`${dateStr}T${timeStr}+07:00`);
}

function nowWib() {
  // Use Asia/Jakarta wall-clock time independent of server timezone.
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const y = map.year;
  const m = map.month;
  const d = map.day;
  const hh = map.hour;
  const mm = map.minute;
  const ss = map.second;
  return new Date(`${y}-${m}-${d}T${hh}:${mm}:${ss}+07:00`);
}

function normalizeSimulationPayload(payload, { partial = false } = {}) {
  const values = {};

  if (!partial || Object.prototype.hasOwnProperty.call(payload, 'simulation_name')) {
    values.simulationName = String(payload.simulation_name || '').trim();
    if (!values.simulationName) {
      throw new Error('simulation_name is required');
    }
  }

  if (!partial || Object.prototype.hasOwnProperty.call(payload, 'simulation_date')) {
    values.simulationDate = normalizeDate(payload.simulation_date);
    if (!values.simulationDate) {
      throw new Error('simulation_date is required and must be a valid date');
    }
  }

  if (!partial || Object.prototype.hasOwnProperty.call(payload, 'start_time')) {
    values.startTime = normalizeTime(payload.start_time);
    if (!values.startTime) {
      throw new Error('start_time is required in HH:mm or HH:mm:ss format');
    }
  }

  if (!partial || Object.prototype.hasOwnProperty.call(payload, 'end_time')) {
    values.endTime = normalizeTime(payload.end_time);
    if (!values.endTime) {
      throw new Error('end_time is required in HH:mm or HH:mm:ss format');
    }
  }

  if (values.startTime && values.endTime && !isEndAfterStart(values.startTime, values.endTime)) {
    throw new Error('end_time must be greater than start_time');
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'location')) {
    values.location = payload.location ? String(payload.location).trim() : null;
  } else if (!partial) {
    values.location = null;
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'description')) {
    values.description = payload.description ? String(payload.description).trim() : null;
  } else if (!partial) {
    values.description = null;
  }

  if (!partial || Object.prototype.hasOwnProperty.call(payload, 'pic_user_id')) {
    values.picUserId = String(payload.pic_user_id || '').trim();
    if (!values.picUserId) {
      throw new Error('pic_user_id is required');
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'status')) {
    values.status = String(payload.status || '').trim();
    if (!ALLOWED_STATUSES.has(values.status)) {
      throw new Error('simulation status is invalid');
    }
  }

  return values;
}

export async function createSimulation({ creatorUserId, payload }) {
  const creatorId = String(creatorUserId);
  const simulationPayload = normalizeSimulationPayload(payload);

  const picExists = await ensureUserExists(simulationPayload.picUserId);
  if (!picExists) {
    throw new Error('PIC user not found');
  }

  const insertResult = await conductDb.query(
    `INSERT INTO practicum_simulations (
      simulation_name,
      simulation_date,
      start_time,
      end_time,
      location,
      description,
      pic_user_id,
      created_by,
      status,
      created_at,
      updated_at
    ) VALUES ($1, $2::date, $3::time, $4::time, $5, $6, $7, $8, 'draft', NOW(), NOW())
    RETURNING *`,
    [
      simulationPayload.simulationName,
      simulationPayload.simulationDate,
      simulationPayload.startTime,
      simulationPayload.endTime,
      simulationPayload.location,
      simulationPayload.description,
      simulationPayload.picUserId,
      creatorId,
    ]
  );

  const simulation = insertResult.rows[0];

  logger.info('Practicum simulation created', {
    simulationId: simulation.id,
    simulationDate: simulation.simulation_date,
    picUserId: simulation.pic_user_id,
    createdBy: simulation.created_by,
  });

  return simulation;
}

export async function listSimulations({ query = {} }) {
  const limit = Math.min(normalizePagination(query.limit, 10), 100);
  const offset = normalizePagination(query.offset, 0);

  const countResult = await conductDb.query(
    `SELECT COUNT(*)::int AS total
     FROM practicum_simulations
     WHERE deleted_at IS NULL`
  );

  const listResult = await conductDb.query(
    `SELECT s.*,
            (
              SELECT COUNT(1)::int
              FROM practicum_simulation_result_attachments a
              WHERE a.simulation_id = s.id
            ) AS result_attachment_count,
            (
              SELECT a.file_url
              FROM practicum_simulation_result_attachments a
              WHERE a.simulation_id = s.id
                AND a.mime_type LIKE 'image/%'
              ORDER BY a.uploaded_at ASC
              LIMIT 1
            ) AS result_first_image_url
     FROM practicum_simulations s
     WHERE s.deleted_at IS NULL
     ORDER BY s.simulation_date DESC, s.start_time DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  const total = countResult.rows[0]?.total || 0;

  return {
    simulations: listResult.rows,
    pagination: {
      total,
      limit,
      offset,
      hasMore: offset + listResult.rows.length < total,
    },
  };
}

export async function getSimulationById(simulationId) {
  const simulationIdString = String(simulationId || '').trim();

  if (!simulationIdString) {
    throw new Error('simulationId is required');
  }

  const result = await conductDb.query(
    `SELECT s.*,
            (
              SELECT COUNT(1)::int
              FROM practicum_simulation_attendance a
              WHERE a.simulation_id = s.id
            ) AS attendance_count
     FROM practicum_simulations s
     WHERE s.id = $1::uuid
       AND s.deleted_at IS NULL
     LIMIT 1`,
    [simulationIdString]
  );

  return result.rows[0] || null;
}

export async function updateSimulation({ simulationId, payload }) {
  const simulationIdString = String(simulationId || '').trim();

  if (!simulationIdString) {
    throw new Error('simulationId is required');
  }

  const currentSimulation = await getSimulationById(simulationIdString);
  if (!currentSimulation) {
    return null;
  }

  const simulationPayload = normalizeSimulationPayload(payload, { partial: true });
  const startTime = simulationPayload.startTime || currentSimulation.start_time;
  const endTime = simulationPayload.endTime || currentSimulation.end_time;

  if (!isEndAfterStart(String(startTime), String(endTime))) {
    throw new Error('end_time must be greater than start_time');
  }

  if (simulationPayload.picUserId) {
    const picExists = await ensureUserExists(simulationPayload.picUserId);
    if (!picExists) {
      throw new Error('PIC user not found');
    }
  }

  const updates = [];
  const values = [];

  function addUpdate(column, value, cast = '') {
    values.push(value);
    updates.push(`${column} = $${values.length}${cast}`);
  }

  if (Object.prototype.hasOwnProperty.call(simulationPayload, 'simulationName')) {
    addUpdate('simulation_name', simulationPayload.simulationName);
  }
  if (Object.prototype.hasOwnProperty.call(simulationPayload, 'simulationDate')) {
    addUpdate('simulation_date', simulationPayload.simulationDate, '::date');
  }
  if (Object.prototype.hasOwnProperty.call(simulationPayload, 'startTime')) {
    addUpdate('start_time', simulationPayload.startTime, '::time');
  }
  if (Object.prototype.hasOwnProperty.call(simulationPayload, 'endTime')) {
    addUpdate('end_time', simulationPayload.endTime, '::time');
  }
  if (Object.prototype.hasOwnProperty.call(simulationPayload, 'location')) {
    addUpdate('location', simulationPayload.location);
  }
  if (Object.prototype.hasOwnProperty.call(simulationPayload, 'description')) {
    addUpdate('description', simulationPayload.description);
  }
  if (Object.prototype.hasOwnProperty.call(simulationPayload, 'picUserId')) {
    addUpdate('pic_user_id', simulationPayload.picUserId);
  }
  if (Object.prototype.hasOwnProperty.call(simulationPayload, 'status')) {
    addUpdate('status', simulationPayload.status);
  }

  if (updates.length === 0) {
    return currentSimulation;
  }

  values.push(simulationIdString);
  const result = await conductDb.query(
    `UPDATE practicum_simulations
     SET ${updates.join(', ')},
         updated_at = NOW()
     WHERE id = $${values.length}::uuid
       AND deleted_at IS NULL
     RETURNING *`,
    values
  );

  return result.rows[0] || null;
}

export async function deleteSimulation(simulationId) {
  const simulationIdString = String(simulationId || '').trim();

  if (!simulationIdString) {
    throw new Error('simulationId is required');
  }

  const result = await conductDb.query(
    `UPDATE practicum_simulations
     SET deleted_at = NOW(),
         updated_at = NOW()
     WHERE id = $1::uuid
       AND deleted_at IS NULL
     RETURNING *`,
    [simulationIdString]
  );

  return result.rows[0] || null;
}

/**
 * Generate token QR rolling baru untuk absensi simulasi.
 *
 * Mendelegasikan ke rollingQrService.generateRollingQrToken().
 * Token lama akan otomatis dinonaktifkan sebelum token baru dibuat.
 *
 * @param {object} params
 * @param {string} params.simulationId       - UUID sesi simulasi
 * @param {string} params.generatedByUserId  - User ID koordinator
 * @returns {Promise<object|null>} Data token + gambar QR, atau null jika simulasi not found
 */
export async function generateSimulationAttendanceQR({
  simulationId,
  generatedByUserId,
}) {
  const simulationIdString = String(simulationId || '').trim();
  const generatedBy = String(generatedByUserId || '').trim();

  if (!simulationIdString) {
    throw new Error('simulationId is required');
  }

  if (!generatedBy) {
    throw new Error('User is not authenticated');
  }

  // Pastikan simulasi ada sebelum generate token
  const simulation = await getSimulationById(simulationIdString);
  if (!simulation) {
    return null;
  }

  // Guard: QR can only digenerate ketika session sudah dibuka.
  if (simulation.status !== 'open') {
    throw new Error('Simulation session has not been opened');
  }

  // Delegasi ke rollingQrService untuk generate + simpan token
  return generateRollingQrToken({
    simulationId: simulation.id,
    generatedBy,
  });
}

/**
 * Ambil token QR yang sedang aktif untuk suatu simulasi.
 * Digunakan oleh frontend saat polling untuk mendapatkan QR terkini.
 *
 * @param {string} simulationId - UUID sesi simulasi
 * @returns {Promise<object|null>} Data session aktif atau null
 */
export async function getActiveSimulationQr(simulationId) {
  const simulationIdString = String(simulationId || '').trim();

  if (!simulationIdString) {
    throw new Error('simulationId is required');
  }

  const simulation = await getSimulationById(simulationIdString);
  if (!simulation) {
    return null;
  }

  // Guard: QR aktif hanya relevan saat session open.
  if (simulation.status !== 'open') {
    return null;
  }

  return getActiveQrSession(simulation.id);
}

/**
 * Proses scan QR Code oleh peserta simulasi.
 *
 * Alur:
 *  1. Validasi token via rollingQrService (aktif? belum expired? simulasi cocok?)
 *  2. Cek apakah peserta sudah absen sebelumnya
 *  3. Catat kehadiran ke tabel practicum_simulation_attendance
 *
 * @param {object} params
 * @param {string} params.simulationId    - UUID sesi simulasi yang discan
 * @param {string} params.qrToken         - Token yang terbaca dari QR Code
 * @param {string} params.scannedByUserId - User ID peserta yang scan
 * @returns {Promise<object>} Hasil absensi
 */
export async function scanSimulationAttendance({
  simulationId,
  qrToken,
  scannedByUserId,
  scannedIp,
  scannedUserAgent,
}) {
  const simulationIdString = String(simulationId || '').trim();
  const qrTokenString = String(qrToken || '').trim();
  const scannedBy = String(scannedByUserId || '').trim();
  const scannedIpValue = scannedIp ? String(scannedIp).trim() : null;
  const scannedUserAgentValue = scannedUserAgent
    ? String(scannedUserAgent).trim()
    : null;

  if (!simulationIdString) {
    throw new Error('simulationId is required');
  }

  if (!qrTokenString) {
    throw new Error('qrToken is required');
  }

  if (!scannedBy) {
    throw new Error('User is not authenticated');
  }

  const simulation = await getSimulationById(simulationIdString);
  if (!simulation) {
    return null;
  }

  // Guard: scan can only ketika session open.
  if (simulation.status !== 'open') {
    if (simulation.status === 'closed') {
      throw new Error('Practicum simulation session has already been closed');
    }
    throw new Error('Practicum simulation session has not been opened');
  }

  const startDateTime = buildWibDateTime(simulation.simulation_date, simulation.start_time);
  if (!startDateTime) {
    throw new Error('Simulation time is invalid');
  }

  const lateLimit = new Date(startDateTime.getTime() + SIMULATION_LATE_LIMIT_MINUTES * 60 * 1000);
  if (nowWib() > lateLimit) {
    throw new Error(
      `Attendance time limit (${SIMULATION_LATE_LIMIT_MINUTES} minutes) has passed. ` +
        `Scan can only be done until ${lateLimit.toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
          timeZone: 'Asia/Jakarta',
        })} WIB.`
    );
  }

  // Langkah 1: Validasi token QR via rollingQrService
  // Akan melempar Error jika token is invalid / not active / expired
  const qrSession = await validateQrToken({
    simulationId: simulationIdString,
    qrToken: qrTokenString,
  });

  const client = await conductDb.connect();
  try {
    // Langkah 2: Cek apakah peserta sudah pernah absen di simulasi ini
    const existingAttendance = await client.query(
      `SELECT id FROM practicum_simulation_attendance
       WHERE simulation_id = $1::uuid
         AND scanned_by = $2`,
      [simulationIdString, scannedBy]
    );

    if (existingAttendance.rows.length > 0) {
      // Peserta sudah absen: kembalikan data yang ada tanpa error
      return {
        attendanceId: existingAttendance.rows[0].id,
        message: 'You have already been recorded as attended',
        alreadyScanned: true,
      };
    }

    // Langkah 3: Catat kehadiran baru
    let insertResult;
    try {
      insertResult = await client.query(
        `INSERT INTO practicum_simulation_attendance (
          simulation_id,
          scanned_by,
          scanned_at,
          qr_session_id,
          scanned_ip,
          scanned_user_agent
        ) VALUES ($1::uuid, $2, NOW(), $3, $4, $5)
        RETURNING id, simulation_id, scanned_by, scanned_at, scanned_ip, scanned_user_agent`,
        [
          simulationIdString,
          scannedBy,
          qrSession.id,
          scannedIpValue,
          scannedUserAgentValue,
        ]
      );
    } catch (e) {
      // Backward compatibility: older DB schema might not have scanned_ip/scanned_user_agent.
      const msg = e && e.message ? String(e.message) : '';
      if (msg.includes('column "scanned_ip"') || msg.includes('column "scanned_user_agent"')) {
        insertResult = await client.query(
          `INSERT INTO practicum_simulation_attendance (
            simulation_id,
            scanned_by,
            scanned_at,
            qr_session_id
          ) VALUES ($1::uuid, $2, NOW(), $3)
          RETURNING id, simulation_id, scanned_by, scanned_at`,
          [simulationIdString, scannedBy, qrSession.id]
        );
      } else {
        throw e;
      }
    }

    const attendance = insertResult.rows[0];

    logger.info('Simulation attendance recorded', {
      attendanceId: attendance.id,
      simulationId: attendance.simulation_id,
      scannedBy: attendance.scanned_by,
    });

    return {
      attendanceId: attendance.id,
      simulationId: attendance.simulation_id,
      scannedBy: attendance.scanned_by,
      scannedAt: attendance.scanned_at,
      scannedIp: attendance.scanned_ip || null,
      scannedUserAgent: attendance.scanned_user_agent || null,
      message: 'Simulation attendance recorded successfully',
    };
  } finally {
    client.release();
  }
}

export async function getSimulationAttendanceList({
  simulationId,
  limit = 50,
  offset = 0,
}) {
  const simulationIdString = String(simulationId || '').trim();
  if (!simulationIdString) {
    throw new Error('simulationId is required');
  }

  const normalizedLimit = Math.min(Number(limit) || 50, 200);
  const normalizedOffset = Number(offset) || 0;

  const attendanceResult = await conductDb.query(
    `SELECT id, simulation_id, scanned_by, scanned_at, scanned_ip, scanned_user_agent
     FROM practicum_simulation_attendance
     WHERE simulation_id = $1::uuid
     ORDER BY scanned_at DESC
     LIMIT $2 OFFSET $3`,
    [simulationIdString, normalizedLimit, normalizedOffset]
  );

  const userIds = attendanceResult.rows
    .map((row) => row.scanned_by)
    .filter(Boolean);

  let userProfileMap = new Map();
  if (userIds.length > 0) {
    const profileResult = await userManagementDb.query(
      `SELECT user_id, name, nipnim
       FROM user_profiles
       WHERE user_id = ANY($1) AND deleted_at IS NULL`,
      [userIds]
    );
    userProfileMap = new Map(
      profileResult.rows.map((row) => [row.user_id, row])
    );
  }

  const countResult = await conductDb.query(
    `SELECT COUNT(*)::int AS total
     FROM practicum_simulation_attendance
     WHERE simulation_id = $1::uuid`,
    [simulationIdString]
  );

  const total = countResult.rows[0]?.total || 0;

  const attendance = attendanceResult.rows.map((row) => {
    const profile = userProfileMap.get(row.scanned_by) || {};
    return {
      id: row.id,
      simulationId: row.simulation_id,
      scannedBy: row.scanned_by,
      scannedAt: row.scanned_at,
      scannedIp: row.scanned_ip || null,
      scannedUserAgent: row.scanned_user_agent || null,
      userName: profile.name || null,
      userNipnim: profile.nipnim || null,
    };
  });

  return {
    attendance,
    pagination: {
      total,
      limit: normalizedLimit,
      offset: normalizedOffset,
      hasMore: normalizedOffset + attendance.length < total,
    },
  };
}


export async function openSimulationSession({ simulationId, openedByUserId }) {
  const simulationIdString = String(simulationId || '').trim();
  const openedBy = String(openedByUserId || '').trim();

  if (!simulationIdString) {
    throw new Error('simulationId is required');
  }
  if (!openedBy) {
    throw new Error('User is not authenticated');
  }

  const simulation = await getSimulationById(simulationIdString);
  if (!simulation) {
    return null;
  }

  if (simulation.status === 'closed') {
    throw new Error('Simulation is already closed');
  }

  const result = await conductDb.query(
    `UPDATE practicum_simulations
     SET status = 'open',
         updated_at = NOW()
     WHERE id = $1::uuid
       AND deleted_at IS NULL
     RETURNING *`,
    [simulationIdString]
  );

  return result.rows[0] || null;
}

export async function closeSimulationSession({ simulationId, closedByUserId }) {
  const simulationIdString = String(simulationId || '').trim();
  const closedBy = String(closedByUserId || '').trim();

  if (!simulationIdString) {
    throw new Error('simulationId is required');
  }
  if (!closedBy) {
    throw new Error('User is not authenticated');
  }

  const simulation = await getSimulationById(simulationIdString);
  if (!simulation) {
    return null;
  }

  if (simulation.status === 'closed') {
    return simulation;
  }

  const result = await conductDb.query(
    `UPDATE practicum_simulations
     SET status = 'closed',
         updated_at = NOW()
     WHERE id = $1::uuid
       AND deleted_at IS NULL
     RETURNING *`,
    [simulationIdString]
  );

  return result.rows[0] || null;
}

export async function getSimulationResultAttachments(simulationId) {
  const simulationIdString = String(simulationId || '').trim();

  if (!simulationIdString) {
    throw new Error('simulationId is required');
  }

  const result = await conductDb.query(
    `SELECT id,
            simulation_id,
            file_url,
            mime_type,
            original_name,
            uploaded_at,
            uploaded_by
     FROM practicum_simulation_result_attachments
     WHERE simulation_id = $1::uuid
     ORDER BY uploaded_at ASC`,
    [simulationIdString]
  );

  return result.rows || [];
}

export async function submitSimulationResult({ simulationId, submittedByUserId, note, files }) {
  const simulationIdString = String(simulationId || '').trim();
  const submittedBy = String(submittedByUserId || '').trim();

  if (!simulationIdString) {
    throw new Error('simulationId is required');
  }
  if (!submittedBy) {
    throw new Error('User is not authenticated');
  }

  const noteString = String(note || '').trim();
  if (!noteString) {
    throw new Error('Simulation result notes are required');
  }

  const normalizedFiles = Array.isArray(files) ? files : [];
  if (normalizedFiles.length > 3) {
    throw new Error('Maximum upload is 3 attachment files');
  }

  const simulation = await getSimulationById(simulationIdString);
  if (!simulation) {
    return null;
  }

  if (simulation.status !== 'closed') {
    throw new Error('Simulation is not closed yet. Results can only be submitted after the simulation is completed');
  }

  const isUpdate = Boolean(simulation.result_submitted_at);

  await conductDb.query('BEGIN');
  try {
    const updateResult = await conductDb.query(
      `UPDATE practicum_simulations
       SET result_note = $2,
           result_submitted_at = COALESCE(result_submitted_at, NOW()),
           result_submitted_by = COALESCE(result_submitted_by, $3),
           updated_at = NOW()
       WHERE id = $1::uuid
         AND deleted_at IS NULL
       RETURNING *`,
      [simulationIdString, noteString, submittedBy]
    );

    const savedSimulation = updateResult.rows[0] || null;
    if (!savedSimulation) {
      await conductDb.query('ROLLBACK');
      return null;
    }

    const existingCountResult = await conductDb.query(
      `SELECT COUNT(1)::int AS total
       FROM practicum_simulation_result_attachments
       WHERE simulation_id = $1::uuid`,
      [simulationIdString]
    );
    const existingCount = existingCountResult.rows[0]?.total ?? 0;

    const totalAfter = existingCount + normalizedFiles.length;
    if (totalAfter == 0) {
      throw new Error('At least 1 simulation result attachment file must be uploaded');
    }
    if (totalAfter > 3) {
      throw new Error('Maximum upload is 3 attachment files');
    }

    const attachments = [];
    for (const file of normalizedFiles) {
      const filename = String(file.filename || '').trim();
      if (!filename) continue;
      const fileUrl = `/uploads/simulation_results/${filename}`;
      const filePath = file.path;

      const insertResult = await conductDb.query(
        `INSERT INTO practicum_simulation_result_attachments (
           simulation_id,
           file_path,
           file_url,
           mime_type,
           original_name,
           uploaded_by
         ) VALUES ($1::uuid, $2, $3, $4, $5, $6)
         RETURNING id, simulation_id, file_url, mime_type, original_name, uploaded_at, uploaded_by`,
        [simulationIdString, filePath, fileUrl, file.mimetype, file.originalname, submittedBy]
      );

      if (insertResult.rows[0]) {
        attachments.push(insertResult.rows[0]);
      }
    }

    await conductDb.query('COMMIT');

    const rows = await getSimulationResultAttachments(simulationIdString);
    return { simulation: savedSimulation, attachments: rows, isUpdate };
  } catch (err) {
    await conductDb.query('ROLLBACK');
    throw err;
  }
}

export async function deleteSimulationResultAttachment({
  simulationId,
  attachmentId,
  requestedByUserId,
}) {
  const simulationIdString = String(simulationId || '').trim();
  const attachmentIdString = String(attachmentId || '').trim();
  const requestedBy = String(requestedByUserId || '').trim();

  if (!simulationIdString) throw new Error('simulationId is required');
  if (!attachmentIdString) throw new Error('attachmentId is required');
  if (!requestedBy) throw new Error('User is not authenticated');

  const simulation = await getSimulationById(simulationIdString);
  if (!simulation) return null;

  if (simulation.status !== 'closed') {
    throw new Error('Simulation is not closed yet. Attachments can only be changed after the simulation is completed');
  }

  const client = await conductDb.connect();
  try {
    await client.query('BEGIN');

    const attRes = await client.query(
      `SELECT id, file_path
       FROM practicum_simulation_result_attachments
       WHERE id = $1::uuid
         AND simulation_id = $2::uuid
       LIMIT 1`,
      [attachmentIdString, simulationIdString]
    );

    const attachment = attRes.rows[0] || null;
    if (!attachment) {
      await client.query('ROLLBACK');
      return null;
    }

    // Security: prevent deleting files outside UPLOAD_DIR.
    const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
    const absoluteUploadDir = path.resolve(uploadDir);
    const absoluteFilePath = path.resolve(String(attachment.file_path || ''));
    if (!absoluteFilePath.startsWith(absoluteUploadDir)) {
      throw new Error('Invalid file path');
    }

    const remainingRes = await client.query(
      `SELECT COUNT(1)::int AS total
       FROM practicum_simulation_result_attachments
       WHERE simulation_id = $1::uuid`,
      [simulationIdString]
    );
    const remaining = remainingRes.rows[0]?.total ?? 0;
    if (remaining <= 1) {
      throw new Error('At least 1 simulation result attachment must remain');
    }

    await client.query(
      `DELETE FROM practicum_simulation_result_attachments
       WHERE id = $1::uuid
         AND simulation_id = $2::uuid`,
      [attachmentIdString, simulationIdString]
    );

    await client.query(
      `UPDATE practicum_simulations
       SET updated_at = NOW()
       WHERE id = $1::uuid
         AND deleted_at IS NULL`,
      [simulationIdString]
    );

    await client.query('COMMIT');

    // Best-effort: delete the physical file.
    try {
      if (absoluteFilePath && fs.existsSync(absoluteFilePath)) {
        await fs.promises.unlink(absoluteFilePath);
      }
    } catch (e) {
      logger.warn('Failed to delete simulation result file', {
        simulationId: simulationIdString,
        attachmentId: attachmentIdString,
        filePath: absoluteFilePath,
        error: e?.message || e,
      });
    }

    return attachment;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

