import { conductDb, registrationDb, userManagementDb } from '../../../config/databases.js';
import { logger } from '../../../core/utils/logger.js';

function normalizeDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().split('T')[0];
}

function isAtLeastHMinus1(absentDate) {
  const absent = new Date(absentDate);
  absent.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return absent > today;
}

async function getUserProfile(userId) {
  const profileResult = await userManagementDb.query(
    `SELECT user_id, name, nipnim
     FROM user_profiles
     WHERE user_id = $1 AND deleted_at IS NULL
     LIMIT 1`,
    [String(userId)]
  );

  return profileResult.rows[0] || null;
}

function mapPermitReasonToAttendanceStatus(reason) {
  if (reason === 'izin') {
    return 'izin';
  }

  if (reason === 'sakit') {
    return 'sakit';
  }

  return null;
}

function normalizeUuid(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized) return null;
  if (!/^[0-9a-f-]{36}$/i.test(normalized)) {
    throw new Error('schedule id must be a valid UUID');
  }
  return normalized;
}

async function insertPermitRequest({ userId, payload, allowedAcademicRole }) {
  const userIdString = String(userId);
  const reason = String(payload.reason || '').trim().toLowerCase();
  const academicRole = String(payload.academic_role || allowedAcademicRole).trim();
  const absentDate = normalizeDate(payload.absent_date);
  const keterangan = payload.keterangan ? String(payload.keterangan).trim() : null;
  const evidenceBase64 = payload.evidence_base64 ? String(payload.evidence_base64) : null;
  const originalScheduleId = normalizeUuid(payload.original_registration_schedule_id);
  const shiftScheduleId = normalizeUuid(payload.shift_registration_schedule_id);

  if (!reason) {
    throw new Error('reason is required');
  }

  if (!['izin', 'sakit'].includes(reason)) {
    throw new Error('Permit requests can only use reason "izin" or "sakit"');
  }

  if (academicRole !== allowedAcademicRole) {
    throw new Error(`This endpoint is only for academic_role "${allowedAcademicRole}"`);
  }

  if (!absentDate) {
    throw new Error('absent_date is required and must be a valid date');
  }

  if (!originalScheduleId) {
    throw new Error('original_registration_schedule_id is required');
  }

  if (!shiftScheduleId) {
    throw new Error('shift_registration_schedule_id is required');
  }

  if (originalScheduleId === shiftScheduleId) {
    throw new Error('Shift schedule must be different from the original schedule');
  }

  if (
    allowedAcademicRole === 'asisten_praktikum' &&
    (!evidenceBase64 || evidenceBase64.trim().length === 0)
  ) {
    throw new Error('For active assistants, permit proof must be uploaded');
  }

  const profile = await getUserProfile(userIdString);

  const userName = String(payload.user_name || profile?.name || '').trim();
  const userNim = String(payload.user_nim || profile?.nipnim || '').trim();

  if (!userName) {
    throw new Error('user_name is required');
  }

  if (!userNim) {
    throw new Error('user_nim is required');
  }

  const duplicateCheck = await conductDb.query(
    `SELECT id
     FROM permit_requests
     WHERE user_id = $1
       AND reason IN ('izin', 'sakit')
       AND absent_date = $2::date
       AND status = 'pending'
       AND deleted_at IS NULL
     LIMIT 1`,
    [userIdString, absentDate]
  );

  if (duplicateCheck.rows.length > 0) {
    throw new Error('You already have a pending leave/sick request for that date');
  }

  const insertResult = await conductDb.query(
    `INSERT INTO permit_requests (
      user_id,
      user_name,
      user_nim,
      academic_role,
      reason,
      absent_date,
      evidence_base64,
      keterangan,
      original_registration_schedule_id,
      shift_registration_schedule_id,
      status,
      created_at,
      updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6::date, $7, $8, $9::uuid, $10::uuid, 'pending', NOW(), NOW())
    RETURNING *`,
    [
      userIdString,
      userName,
      userNim,
      academicRole,
      reason,
      absentDate,
      evidenceBase64,
      keterangan,
      originalScheduleId,
      shiftScheduleId,
    ]
  );

  const permit = insertResult.rows[0];

  logger.info('Permit request submitted', {
    permitId: permit.id,
    userId: userIdString,
    reason: permit.reason,
    absentDate: permit.absent_date,
    originalRegistrationScheduleId: permit.original_registration_schedule_id,
    shiftRegistrationScheduleId: permit.shift_registration_schedule_id,
    status: permit.status,
  });

  return permit;
}

function formatScheduleClock(value) {
  if (!value) return '';
  const raw = String(value).trim();
  const match = raw.match(/^(\d{2}):(\d{2})/);
  if (match) {
    return `${match[1]}.${match[2]}`;
  }
  return raw.replaceAll(':', '.');
}

function formatScheduleDateLabel(value) {
  if (!value) return '-';
  const raw = String(value).trim();
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[3]}-${isoMatch[2]}-${isoMatch[1]}`;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return raw;
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}-${month}-${date.getFullYear()}`;
}

function buildScheduleSummary(row) {
  if (!row) return null;

  const start = formatScheduleClock(row.jam_mulai || row.start_time);
  const end = formatScheduleClock(row.jam_berakhir || row.end_time);
  const timeRange = end && end !== start ? `${start} - ${end}` : start;
  const title =
    String(row.detail_kegiatan || '').trim() ||
    [row.practicum_name, row.module_name].filter(Boolean).join(' - ') ||
    'Jadwal Praktikum';

  return {
    id: row.id,
    label: `${formatScheduleDateLabel(row.tanggal || row.start_time)} • ${timeRange} • ${title}`,
    tanggal: row.tanggal || null,
    jam_mulai: row.jam_mulai || null,
    jam_berakhir: row.jam_berakhir || null,
    practicum_name: row.practicum_name || null,
    module_name: row.module_name || null,
    detail_kegiatan: row.detail_kegiatan || null,
    venue: row.venue || null,
  };
}

async function getScheduleSummariesByIds(scheduleIds) {
  const ids = [...new Set(scheduleIds.map((id) => String(id ?? '').trim()).filter(Boolean))];
  if (ids.length === 0) return new Map();

  const result = await registrationDb.query(
    `SELECT
       s.id,
       s.tanggal,
       s.jam_mulai,
       s.jam_berakhir,
       s.detail_kegiatan,
       s.start_time,
       s.end_time,
       s.venue,
       COALESCE(p.name, '') AS practicum_name,
       COALESCE(pm.name, '') AS module_name
     FROM schedules s
     LEFT JOIN practicum_modules pm ON pm.id = s.module_id
     LEFT JOIN practicums p ON p.id = pm.practicum_id
     WHERE s.id = ANY($1::uuid[])`,
    [ids]
  );

  return new Map(result.rows.map((row) => [String(row.id), buildScheduleSummary(row)]));
}

async function enrichPermitRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return rows;

  const scheduleIds = rows.flatMap((permit) => [
    permit.original_registration_schedule_id,
    permit.shift_registration_schedule_id,
  ]);
  const scheduleMap = await getScheduleSummariesByIds(scheduleIds);

  return rows.map((permit) => ({
    ...permit,
    original_schedule:
      scheduleMap.get(String(permit.original_registration_schedule_id ?? '')) || null,
    shift_schedule:
      scheduleMap.get(String(permit.shift_registration_schedule_id ?? '')) || null,
  }));
}

async function findOperationalSessionForSchedule(scheduleId) {
  const result = await conductDb.query(
    `SELECT id
     FROM practicum_operational_sessions
     WHERE registration_schedule_id = $1::uuid
       AND deleted_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1`,
    [scheduleId]
  );
  return result.rows[0]?.id || null;
}

async function upsertPermitAttendanceForSession({ sessionId, userId, attendanceStatus }) {
  const result = await conductDb.query(
    `INSERT INTO practicum_operational_session_attendances (
       operational_session_id,
       user_id,
       attendance_time,
       attendance_status,
       created_at,
       updated_at
     ) VALUES ($1::uuid, $2, NOW(), $3, NOW(), NOW())
     ON CONFLICT (operational_session_id, user_id)
     DO UPDATE SET
       attendance_status = CASE
         WHEN practicum_operational_session_attendances.attendance_status IN ('present', 'late')
           THEN practicum_operational_session_attendances.attendance_status
         ELSE EXCLUDED.attendance_status
       END,
       updated_at = NOW()
     RETURNING id`,
    [sessionId, userId, attendanceStatus]
  );
  return result.rowCount > 0 ? 1 : 0;
}

async function syncAttendanceForApprovedPermit(permit) {
  const userId = String(permit.user_id);
  const attendanceStatus = mapPermitReasonToAttendanceStatus(permit.reason);
  if (!attendanceStatus) {
    return 0;
  }

  let syncedCount = 0;
  const originalScheduleId = permit.original_registration_schedule_id;
  const shiftScheduleId = permit.shift_registration_schedule_id;

  if (originalScheduleId) {
    const originalSessionId = await findOperationalSessionForSchedule(originalScheduleId);
    if (originalSessionId) {
      syncedCount += await upsertPermitAttendanceForSession({
        sessionId: originalSessionId,
        userId,
        attendanceStatus,
      });
    }
  }

  logger.info('Synced attendance for approved permit', {
    permitId: permit.id,
    userId,
    reason: permit.reason,
    attendanceStatus,
    originalRegistrationScheduleId: originalScheduleId,
    shiftRegistrationScheduleId: shiftScheduleId,
    syncedCount,
  });

  return syncedCount;
}

export async function submitPermitRequest({ userId, payload }) {
  return insertPermitRequest({
    userId,
    payload,
    allowedAcademicRole: 'praktikan',
  });
}

export async function getMyPermits(userId) {
  const userIdString = String(userId);

  const result = await conductDb.query(
    `SELECT *
     FROM permit_requests
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userIdString]
  );

  return enrichPermitRows(result.rows);
}

export async function submitAssistantPermitRequest({ userId, payload }) {
  return insertPermitRequest({
    userId,
    payload: {
      ...payload,
      academic_role: 'asisten_praktikum',
    },
    allowedAcademicRole: 'asisten_praktikum',
  });
}

export async function getAssistantPermitSubmissions({ status } = {}) {
  const statusFilter = status ? String(status).trim().toLowerCase() : 'pending';

  if (!['pending', 'approved', 'rejected'].includes(statusFilter)) {
    throw new Error('status filter is invalid, use pending/approved/rejected');
  }

  const query = `SELECT *
     FROM permit_requests
     WHERE academic_role = 'asisten_praktikum'
       AND reason IN ('izin', 'sakit')
       AND deleted_at IS NULL
       ${statusFilter ? 'AND status = $1' : ''}
     ORDER BY created_at DESC`;

  const params = statusFilter ? [statusFilter] : [];
  const result = await conductDb.query(query, params);

  return enrichPermitRows(result.rows);
}

export async function getPraktikanPermitSubmissions({ status } = {}) {
  const statusFilter = status ? String(status).trim().toLowerCase() : null;

  if (statusFilter && !['pending', 'approved', 'rejected'].includes(statusFilter)) {
    throw new Error('status filter is invalid, use pending/approved/rejected');
  }

  const query = `SELECT *
     FROM permit_requests
     WHERE academic_role = 'praktikan'
       AND reason IN ('izin', 'sakit')
       AND deleted_at IS NULL
       ${statusFilter ? 'AND status = $1' : ''}
     ORDER BY created_at DESC`;

  const params = statusFilter ? [statusFilter] : [];
  const result = await conductDb.query(query, params);

  return enrichPermitRows(result.rows);
}

export async function reviewAssistantPermitRequest({ permitId, reviewerId, payload }) {
  const permitIdString = String(permitId || '').trim();
  const reviewerIdString = String(reviewerId || '').trim();
  const action = String(payload.action || '').trim().toLowerCase();
  const reviewNote = String(payload.review_note || '').trim();

  if (!permitIdString) {
    throw new Error('permitId is required');
  }

  if (!reviewerIdString) {
    throw new Error('reviewerId is required');
  }

  if (!['approve', 'reject'].includes(action)) {
    throw new Error('action is invalid, use "approve" or "reject"');
  }

  if (!reviewNote) {
    throw new Error('review_note is required');
  }

  const existingResult = await conductDb.query(
    `SELECT *
     FROM permit_requests
     WHERE id = $1
       AND deleted_at IS NULL
     LIMIT 1`,
    [permitIdString]
  );

  const permit = existingResult.rows[0];

  if (!permit) {
    throw new Error('Permit request not found');
  }

  if (permit.academic_role !== 'asisten_praktikum') {
    throw new Error('Assistant permit review is only for asisten_praktikum submissions');
  }

  if (!['izin', 'sakit'].includes(permit.reason)) {
    throw new Error('Review is only for submissions with reason "izin" or "sakit"');
  }

  if (permit.status !== 'pending') {
    throw new Error('Request has already been processed');
  }

  const nextStatus = action === 'approve' ? 'approved' : 'rejected';

  const updateResult = await conductDb.query(
    `UPDATE permit_requests
     SET status = $2,
         reviewed_by = $3,
         reviewed_at = NOW(),
         review_note = $4,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [permitIdString, nextStatus, reviewerIdString, reviewNote]
  );

  const reviewedPermit = updateResult.rows[0];

  if (nextStatus === 'approved') {
    await syncAttendanceForApprovedPermit(permit);
  }

  logger.info('Assistant permit request reviewed', {
    permitId: reviewedPermit.id,
    reviewerId: reviewerIdString,
    action,
    status: reviewedPermit.status,
  });

  return reviewedPermit;
}

export async function reviewPermitRequest({ permitId, reviewerId, payload }) {
  const permitIdString = String(permitId || '').trim();
  const reviewerIdString = String(reviewerId || '').trim();
  const action = String(payload.action || '').trim().toLowerCase();
  const reviewNote = payload.review_note ? String(payload.review_note).trim() : null;

  if (!permitIdString) {
    throw new Error('permitId is required');
  }

  if (!reviewerIdString) {
    throw new Error('reviewerId is required');
  }

  if (!['approve', 'reject'].includes(action)) {
    throw new Error('action is invalid, use "approve" or "reject"');
  }

  const existingResult = await conductDb.query(
    `SELECT *
     FROM permit_requests
     WHERE id = $1
       AND deleted_at IS NULL
     LIMIT 1`,
    [permitIdString]
  );

  const permit = existingResult.rows[0];

  if (!permit) {
    throw new Error('Permit request not found');
  }

  if (permit.academic_role !== 'praktikan') {
    throw new Error('Task #34 is only for praktikan submissions');
  }

  if (!['izin', 'sakit'].includes(permit.reason)) {
    throw new Error('Review is only for submissions with reason "izin" or "sakit"');
  }

  if (permit.status !== 'pending') {
    throw new Error('Request has already been processed');
  }

  const nextStatus = action === 'approve' ? 'approved' : 'rejected';

  const updateResult = await conductDb.query(
    `UPDATE permit_requests
     SET status = $2,
         reviewed_by = $3,
         reviewed_at = NOW(),
         review_note = $4,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [permitIdString, nextStatus, reviewerIdString, reviewNote]
  );

  const reviewedPermit = updateResult.rows[0];

  if (nextStatus === 'approved') {
    await syncAttendanceForApprovedPermit(permit);
  }

  logger.info('Permit request reviewed', {
    permitId: reviewedPermit.id,
    reviewerId: reviewerIdString,
    action,
    status: reviewedPermit.status,
  });

  return reviewedPermit;
}

export async function getPermitStatisticsForLaboran() {
  const result = await conductDb.query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status = 'approved')::int AS approved,
       COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected
     FROM permit_requests
     WHERE deleted_at IS NULL
       AND reason IN ('izin', 'sakit')`
  );

  const row = result.rows[0] || {};
  return {
    total: Number(row.total || 0),
    approved: Number(row.approved || 0),
    rejected: Number(row.rejected || 0),
  };
}

