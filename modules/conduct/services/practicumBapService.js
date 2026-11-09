import fs from 'fs';
import path from 'path';

import ExcelJS from 'exceljs';
import QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';

import { conductDb, registrationDb, userManagementDb } from '../../../config/databases.js';
import { logger } from '../../../core/utils/logger.js';
import * as roleService from '../../user-management/services/roleService.js';
import { getAbsoluteFilePath } from '../../user-management/services/fileStorageService.js';
import { getOperationalSessionById, listSessionActiveAssistants, reassessAndPersistActiveAssistantAttendanceStatuses } from './practicumOperationalSessionService.js';
import {
  buildPlotGroupMapForSession,
  listOperationalSessionAttendances,
  loadQrSessionGeneratedByMap,
  resolveAssignedAssistantUserId,
} from './practicumOperationalSessionAttendanceService.js';
import {
  buildSessionStartContext,
  enrichActiveAssistantWithAttendanceContext,
  resolveScheduleStartAt,
} from './practicumOperationalSessionAttendanceContextService.js';

export const BAP_LECTURER_SIGNATURE_QR_EXPIRY_SECONDS = 300;

function requireNonEmptyString(value, fieldName) {
  const s = String(value ?? '').trim();
  if (!s) throw new Error(`${fieldName} is required`);
  return s;
}

function toDateOnly(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().split('T')[0];
}

function toTimeOnly(value) {
  if (!value) return null;
  const text = String(value);
  const match = text.match(/\d{2}:\d{2}(?::\d{2})?/);
  return match ? match[0] : null;
}

function mimeTypeFromFilePath(filePath) {
  const extension = path.extname(String(filePath || '')).toLowerCase();
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.webp') return 'image/webp';
  if (extension === '.gif') return 'image/gif';
  return 'image/png';
}

function isImageDataUrl(value) {
  return /^data:image\/[a-z0-9.+-]+;base64,/i.test(String(value || '').trim());
}

async function signatureSnapshotFromProfile(profile) {
  const filePath = String(profile?.ttd_file_path || '').trim();
  if (filePath) {
    try {
      const absolutePath = getAbsoluteFilePath(filePath);
      if (absolutePath && fs.existsSync(absolutePath)) {
        const buffer = await fs.promises.readFile(absolutePath);
        return {
          ttd_file_path: filePath,
          ttd_snapshot: `data:${mimeTypeFromFilePath(filePath)};base64,${buffer.toString('base64')}`,
        };
      }
    } catch (_) {}
  }

  const legacyTtd = String(profile?.ttd || '').trim();
  if (isImageDataUrl(legacyTtd)) {
    return { ttd_file_path: filePath || null, ttd_snapshot: legacyTtd };
  }
  if (legacyTtd) {
    return { ttd_file_path: filePath || null, ttd_snapshot: `data:image/png;base64,${legacyTtd}` };
  }
  return { ttd_file_path: filePath || null, ttd_snapshot: null };
}

async function getSignatureSnapshotsForUsers(userIds) {
  const ids = [...new Set(userIds.map((id) => String(id ?? '').trim()).filter(Boolean))];
  if (ids.length === 0) return new Map();
  const normalizedIds = ids.map((id) => id.toLowerCase());
  const result = await userManagementDb.query(
    `SELECT user_id, name, nipnim, ttd, ttd_file_path
     FROM user_profiles
     WHERE deleted_at IS NULL
       AND (
         lower(user_id) = ANY($1::text[])
         OR lower(nipnim) = ANY($1::text[])
         OR lower(name) = ANY($1::text[])
       )`,
    [normalizedIds]
  );
  const snapshotByIdentifier = new Map();
  for (const profile of result.rows) {
    const snapshot = await signatureSnapshotFromProfile(profile);
    const value = { ...profile, ...snapshot };
    for (const key of [profile.user_id, profile.nipnim, profile.name]) {
      const normalized = String(key ?? '').trim().toLowerCase();
      if (normalized) snapshotByIdentifier.set(normalized, value);
    }
  }
  return new Map(ids.map((id) => [id, snapshotByIdentifier.get(id.toLowerCase())]).filter(([, value]) => value));
}

async function getSignatureSnapshotForUser(userId) {
  const snapshots = await getSignatureSnapshotsForUsers([userId]);
  return snapshots.get(String(userId)) || {
    user_id: userId,
    ttd_file_path: null,
    ttd_snapshot: null,
  };
}

async function getScheduleContext(scheduleId) {
  const result = await registrationDb.query(
    `SELECT
       s.id,
       s.tanggal,
       s.jam_mulai,
       s.jam_berakhir,
       s.detail_kegiatan,
       s.kelas,
       s.venue,
       s.start_time,
       s.end_time,
       sp.id AS study_program_id,
       sp.code AS study_program_code,
       sp.name AS study_program_name,
       l.id AS laboratory_id,
       l.code AS laboratory_code,
       l.name AS laboratory_name,
       p.id AS practicum_id,
       p.code AS practicum_code,
       COALESCE(p.name, '') AS practicum_name,
       pm.id AS module_id,
       pm.code AS module_code,
       COALESCE(pm.name, '') AS module_name,
       pm.week_number AS module_week_number
     FROM schedules s
     LEFT JOIN practicum_modules pm ON pm.id = s.module_id
     LEFT JOIN practicums p ON p.id = pm.practicum_id
     LEFT JOIN laboratories l ON l.id = p.laboratory_id
     LEFT JOIN study_programs sp ON sp.id = l.study_program_id
     WHERE s.id = $1::uuid
     LIMIT 1`,
    [scheduleId]
  );
  if (result.rowCount === 0) throw new Error('Registration schedule was not found');
  return result.rows[0];
}

async function getActivePeriodeSnapshot() {
  const result = await registrationDb.query(
    `SELECT value
     FROM registration_settings
     WHERE setting_key = 'active_periode'
     LIMIT 1`
  );
  return result.rows[0]?.value || null;
}

function buildRegistrationSnapshot(schedule, activePeriode) {
  return {
    active_periode: activePeriode,
    study_program: {
      id: schedule.study_program_id || null,
      code: schedule.study_program_code || null,
      name: schedule.study_program_name || null,
    },
    laboratory: {
      id: schedule.laboratory_id || null,
      code: schedule.laboratory_code || null,
      name: schedule.laboratory_name || null,
    },
    practicum: {
      id: schedule.practicum_id || null,
      code: schedule.practicum_code || null,
      name: schedule.practicum_name || null,
    },
    module: {
      id: schedule.module_id || null,
      code: schedule.module_code || null,
      name: schedule.module_name || null,
      week_number: schedule.module_week_number ?? null,
    },
    schedule: {
      id: schedule.id || null,
      date: toDateOnly(schedule.tanggal || schedule.start_time),
      start_time: toTimeOnly(schedule.jam_mulai || schedule.start_time),
      end_time: toTimeOnly(schedule.jam_berakhir || schedule.end_time),
      class_shift: schedule.detail_kegiatan || schedule.kelas || null,
      venue: schedule.venue || null,
    },
  };
}

async function getProfiles(userIds) {
  const ids = [...new Set(userIds.map((id) => String(id ?? '').trim()).filter(Boolean))];
  if (ids.length === 0) return new Map();
  const result = await userManagementDb.query(
    `SELECT user_id, name, nipnim
     FROM user_profiles
     WHERE user_id = ANY($1::text[])
       AND deleted_at IS NULL`,
    [ids]
  );
  return new Map(result.rows.map((row) => [String(row.user_id), row]));
}

async function listEnrolledStudents(scheduleId) {
  const result = await registrationDb.query(
    `SELECT DISTINCT
       COALESCE(NULLIF(trim(st.user_id::text), ''), pe.student_id::text) AS user_id,
       st.student_number,
       st.name AS student_name,
       COALESCE(st.student_number, pe.student_id::text) AS sort_key
     FROM schedules s
     INNER JOIN practicum_modules pm ON s.module_id = pm.id
     INNER JOIN practicum_enrollments pe ON pm.practicum_id = pe.practicum_id
     LEFT JOIN students st ON pe.student_id = st.id
     WHERE s.id = $1::uuid
       AND pe.status = 'enrolled'
       AND pe.role = 'mahasiswa'
     ORDER BY sort_key ASC`,
    [scheduleId]
  );
  const profiles = await getProfiles(result.rows.map((row) => row.user_id));
  return result.rows.map((row) => {
    const profile = profiles.get(String(row.user_id));
    return {
      user_id: row.user_id,
      student_name: profile?.name || row.student_name || row.user_id,
      student_identifier: profile?.nipnim || row.student_number || null,
    };
  });
}

async function listAssistantRoleIdentifiers(userIds) {
  const ids = [...new Set(userIds.map((id) => String(id ?? '').trim()).filter(Boolean))];
  if (ids.length === 0) return new Set();
  const result = await userManagementDb.query(
    `SELECT DISTINCT ur.user_id, up.nipnim
     FROM user_roles ur
     LEFT JOIN user_profiles up ON up.user_id = ur.user_id AND up.deleted_at IS NULL
     WHERE (
         lower(ur.user_id) = ANY($1::text[])
         OR lower(up.nipnim) = ANY($1::text[])
       )
       AND ur.role IN (
         'asisten_praktikum',
         'asisten_praktikum_aktif',
         'koordinator_asisten',
         'koordinator_praktikum'
       )
       AND ur.is_active = true
       AND ur.deleted_at IS NULL`,
    [ids.map((id) => id.toLowerCase())]
  );
  const identifiers = new Set();
  for (const row of result.rows) {
    if (row.user_id) identifiers.add(String(row.user_id).toLowerCase());
    if (row.nipnim) identifiers.add(String(row.nipnim).toLowerCase());
  }
  return identifiers;
}

async function listAssignedAssistantIdentifiers(scheduleId) {
  const result = await registrationDb.query(
    `SELECT DISTINCT user_id, nim
     FROM schedule_assistants
     WHERE schedule_id = $1::uuid`,
    [scheduleId]
  );
  const identifiers = new Set();
  for (const row of result.rows) {
    if (row.user_id) identifiers.add(String(row.user_id).toLowerCase());
    if (row.nim) identifiers.add(String(row.nim).toLowerCase());
  }
  const profiles = await getProfiles(result.rows.map((row) => row.user_id).filter(Boolean));
  for (const profile of profiles.values()) {
    if (profile.nipnim) identifiers.add(String(profile.nipnim).toLowerCase());
  }
  return identifiers;
}

function isAssistantIdentity(row, assistantIdentifiers) {
  return (
    assistantIdentifiers.has(String(row.user_id ?? '').toLowerCase()) ||
    assistantIdentifiers.has(String(row.student_identifier ?? '').toLowerCase()) ||
    assistantIdentifiers.has(String(row.user_identifier ?? '').toLowerCase())
  );
}

function normalizeStudentIdentifier(value) {
  return String(value ?? '').trim().toLowerCase();
}

function resolveStudentNim(row) {
  return normalizeStudentIdentifier(row?.student_identifier ?? row?.user_identifier ?? row?.student_number);
}

function buildEnrollmentIdentityIndexes(students) {
  const byUserId = new Map();
  const byNim = new Map();
  for (const student of students) {
    byUserId.set(String(student.user_id), student);
    const nim = resolveStudentNim(student);
    if (nim && !byNim.has(nim)) {
      byNim.set(nim, student);
    }
  }
  return { byUserId, byNim };
}

function buildAttendanceIdentityIndexes(attendances) {
  const byUserId = new Map();
  const byNim = new Map();
  for (const attendance of attendances) {
    byUserId.set(String(attendance.user_id), attendance);
    const nim = resolveStudentNim(attendance);
    if (nim && !byNim.has(nim)) {
      byNim.set(nim, attendance);
    }
  }
  return { byUserId, byNim };
}

function findEnrollmentForIdentity({ userId, nim }, enrolledByUser, enrolledByNim) {
  const byUser = enrolledByUser.get(String(userId));
  if (byUser) return byUser;
  if (nim) return enrolledByNim.get(nim) || null;
  return null;
}

function findAttendanceForStudent(student, attendanceIndexes) {
  const byUser = attendanceIndexes.byUserId.get(String(student.user_id));
  if (byUser) return byUser;
  const nim = resolveStudentNim(student);
  if (nim) return attendanceIndexes.byNim.get(nim) || null;
  return null;
}

function isStudentAlreadyRepresented(studentByUser, { userId, nim }) {
  for (const entry of studentByUser.values()) {
    if (String(entry.user_id) === String(userId)) return true;
    const entryNim = resolveStudentNim(entry);
    if (nim && entryNim && entryNim === nim) return true;
  }
  return false;
}

function findPermitReasonForStudent(student, permitsByUser, enrolledByNim) {
  const direct = permitsByUser.get(String(student.user_id));
  if (direct) return direct;
  const nim = resolveStudentNim(student);
  if (!nim) return undefined;
  const enrolled = enrolledByNim.get(nim);
  if (!enrolled) return undefined;
  return permitsByUser.get(String(enrolled.user_id));
}

async function listApprovedPermits({ userIds, scheduleDate }) {
  const ids = [...new Set(userIds.map((id) => String(id ?? '').trim()).filter(Boolean))];
  if (ids.length === 0 || !scheduleDate) return new Map();
  const result = await conductDb.query(
    `SELECT user_id, reason
     FROM permit_requests
     WHERE user_id = ANY($1::text[])
       AND absent_date = $2::date
       AND status = 'approved'
       AND reason IN ('izin', 'sakit')`,
    [ids, scheduleDate]
  );
  return new Map(result.rows.map((row) => [String(row.user_id), row.reason]));
}

function statusFromAttendance(status) {
  if (status === 'late') return 'late';
  if (status === 'present') return 'present';
  return 'absent';
}

function signatureFromStatus(status) {
  if (status === 'present' || status === 'late') return 'qr_attended';
  return 'not_signed';
}

function assistantSignatureFromRow(row) {
  if ((row.attendance_status === 'present' || row.attendance_status === 'late') && row.assigned_assistant_user_id) {
    return 'qr_validated';
  }
  return 'not_signed';
}

function plotSortValue(plotGroup) {
  const value = String(plotGroup || '').trim().toUpperCase();
  const match = value.match(/^PLOT\s+([A-Z]+)$/);
  if (!match) return Number.MAX_SAFE_INTEGER;
  return [...match[1]].reduce((sum, char) => sum * 26 + (char.charCodeAt(0) - 64), 0);
}

function compareBapAttendanceRows(a, b) {
  const plotDiff = plotSortValue(a.plot_group || a.assistant_code) - plotSortValue(b.plot_group || b.assistant_code);
  if (plotDiff !== 0) return plotDiff;
  const nameDiff = String(a.student_name || '').localeCompare(String(b.student_name || ''));
  if (nameDiff !== 0) return nameDiff;
  return String(a.student_identifier || a.student_user_id).localeCompare(String(b.student_identifier || b.student_user_id));
}

function plotLabelFromIndex(index) {
  let n = index + 1;
  let label = '';
  while (n > 0) {
    n -= 1;
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26);
  }
  return `Plot ${label}`;
}

function resolvePlotFromActiveAssistants(assistantUserId, activeAssistants = []) {
  const assistantId = String(assistantUserId ?? '').trim();
  if (!assistantId) return null;
  const idx = activeAssistants.findIndex(
    (assistant) => String(assistant.user_id) === assistantId
  );
  if (idx < 0) return null;
  return plotLabelFromIndex(idx);
}

function normalizeStoredPlotLabel(value) {
  const stored = String(value ?? '').trim();
  if (!stored) return null;
  if (stored.toLowerCase() === 'unassigned plot') return null;
  return stored;
}

async function enrichBapAttendanceRows(sessionId, attendanceRows = [], metadata = {}) {
  const liveAttendances = await listOperationalSessionAttendances(sessionId);
  const liveByUser = new Map(
    liveAttendances.map((row) => [String(row.user_id), row])
  );
  const qrSessionById = await loadQrSessionGeneratedByMap(
    liveAttendances.flatMap((row) => [row.assigned_qr_session_id, row.qr_session_id])
  );
  const plotMap = await buildPlotGroupMapForSession(sessionId);
  const activeAssistants = metadata?.active_assistants || [];

  return attendanceRows.map((row) => {
    const live = liveByUser.get(String(row.student_user_id));
    const assistantId =
      resolveAssignedAssistantUserId(live, qrSessionById) ||
      row.assigned_assistant_user_id ||
      row.assistant_signature_user_id ||
      null;
    const plotFromLive = live?.plot_group || null;
    const plotFromMap = assistantId
      ? plotMap.get(String(assistantId))?.plot_group || null
      : null;
    const plotFromMetadata = assistantId
      ? resolvePlotFromActiveAssistants(assistantId, activeAssistants)
      : null;
    const storedPlot = normalizeStoredPlotLabel(row.plot_group ?? row.assistant_code);
    const plotGroup =
      plotFromLive ||
      plotFromMap ||
      plotFromMetadata ||
      storedPlot ||
      null;
    const plotMeta = assistantId ? plotMap.get(String(assistantId)) : null;

    return {
      ...row,
      assistant_code: plotGroup || row.assistant_code || null,
      plot_group: plotGroup,
      assigned_assistant_user_id: assistantId,
      assigned_assistant_name:
        live?.assigned_assistant_name ||
        plotMeta?.plot_assistant_name ||
        row.assigned_assistant_name ||
        null,
      assigned_assistant_identifier:
        live?.assigned_assistant_identifier ||
        plotMeta?.plot_assistant_identifier ||
        row.assigned_assistant_identifier ||
        null,
    };
  });
}

function mapBap(row, attendanceRows = []) {
  const metadata = row.metadata || {};
  if (row.pic_user_id && !metadata.pic_user_id) metadata.pic_user_id = row.pic_user_id;
  const plotAssistants = new Map(
    (metadata.active_assistants || []).map((assistant, index) => [
      plotLabelFromIndex(index),
      assistant,
    ])
  );
  const rowsWithPlotMetadata = attendanceRows.map((attendance) => {
    const assistant = plotAssistants.get(
      attendance.plot_group || attendance.assistant_code
    );
    const plotGroup =
      attendance.plot_group ||
      attendance.assistant_code ||
      (attendance.assigned_assistant_user_id
        ? resolvePlotFromActiveAssistants(
            attendance.assigned_assistant_user_id,
            metadata.active_assistants || []
          )
        : null);
    return {
      ...attendance,
      plot_group: plotGroup,
      assigned_assistant_name:
        attendance.assigned_assistant_name || assistant?.user_name || null,
      assigned_assistant_identifier:
        attendance.assigned_assistant_identifier || assistant?.user_identifier || null,
      student_has_signature_snapshot: Boolean(attendance.student_signature_ttd_snapshot),
      assistant_has_signature_snapshot: Boolean(attendance.assistant_signature_ttd_snapshot),
    };
  });
  return {
    id: row.id,
    operational_session_id: row.operational_session_id,
    registration_schedule_id: row.registration_schedule_id,
    bap_number: row.bap_number,
    status: row.status,
    practicum_name: row.practicum_name,
    module_name: row.module_name,
    class_shift: row.class_shift,
    activity_type: row.activity_type,
    scheduled_date: row.scheduled_date,
    start_time: row.start_time,
    end_time: row.end_time,
    venue: row.venue,
    present_count: row.present_count,
    sick_count: row.sick_count,
    permission_count: row.permission_count,
    absent_count: row.absent_count,
    student_count: row.student_count,
    assistant_count: row.assistant_count,
    incident_notes: row.incident_notes,
    lecturer_signed_at: row.lecturer_signed_at,
    lecturer_signed_by: row.lecturer_signed_by,
    lecturer_signed_by_name: row.lecturer_signed_by_name || null,
    lecturer_signed_by_identifier: row.lecturer_signed_by_identifier || null,
    laboran_review_status: row.laboran_review_status,
    laboran_reviewed_at: row.laboran_reviewed_at,
    laboran_reviewed_by: row.laboran_reviewed_by,
    laboran_reviewed_by_name: row.laboran_reviewed_by_name || null,
    laboran_reviewed_by_identifier: row.laboran_reviewed_by_identifier || null,
    laboran_review_note: row.laboran_review_note,
    lecturer_signature_ttd_file_path: row.lecturer_signature_ttd_file_path || null,
    lecturer_signature_ttd_snapshot: row.lecturer_signature_ttd_snapshot || null,
    lecturer_signature_snapshot_at: row.lecturer_signature_snapshot_at || null,
    lecturer_has_signature_snapshot: Boolean(row.lecturer_signature_ttd_snapshot),
    laboran_signature_ttd_file_path: row.laboran_signature_ttd_file_path || null,
    laboran_signature_ttd_snapshot: row.laboran_signature_ttd_snapshot || null,
    laboran_signature_snapshot_at: row.laboran_signature_snapshot_at || null,
    laboran_has_signature_snapshot: Boolean(row.laboran_signature_ttd_snapshot),
    metadata: row.metadata || {},
    generated_at: row.generated_at,
    assistants: row.metadata?.active_assistants || [],
    rows: rowsWithPlotMetadata,
  };
}

function resolvePlotGroupLabel(attendance) {
  if (!attendance) return '-';
  const plot = String(attendance.plot_group ?? '').trim();
  if (plot) return plot;
  const assistantName = String(
    attendance.plot_assistant_name ?? attendance.assigned_assistant_name ?? ''
  ).trim();
  if (assistantName) return assistantName;
  const assistantIdentifier = String(
    attendance.plot_assistant_identifier ?? attendance.assigned_assistant_identifier ?? ''
  ).trim();
  if (assistantIdentifier) return assistantIdentifier;
  const assistantUserId = String(attendance.assigned_assistant_user_id ?? '').trim();
  if (assistantUserId) return assistantUserId;
  return '-';
}

export async function generateBapForCompletedSession(operationalSessionId) {
  const sessionId = requireNonEmptyString(operationalSessionId, 'operational_session_id');
  const session = await getOperationalSessionById(sessionId);
  if (session.session_status !== 'completed') {
    throw new Error('BAP can only be generated after the session is completed');
  }

  const existingBap = await conductDb.query(
    `SELECT lecturer_signed_at
     FROM practicum_baps
     WHERE operational_session_id = $1::uuid
     LIMIT 1`,
    [sessionId]
  );
  if (existingBap.rows[0]?.lecturer_signed_at) {
    throw new Error('BAP cannot be regenerated after lecturer signature');
  }

  const schedule = await getScheduleContext(session.registration_schedule_id);
  const activePeriode = await getActivePeriodeSnapshot();
  const registrationSnapshot = buildRegistrationSnapshot(schedule, activePeriode);
  const scheduledStartAt = await resolveScheduleStartAt(session.registration_schedule_id);
  const sessionStartContext = buildSessionStartContext({
    ongoingAt: session.ongoing_at,
    scheduledStartAt,
  });
  const activeAssistantsRaw = await listSessionActiveAssistants(sessionId);
  const activeAssistantsReassessed = await reassessAndPersistActiveAssistantAttendanceStatuses(
    session,
    activeAssistantsRaw
  );
  const activeAssistants = activeAssistantsReassessed.map((assistant) =>
    enrichActiveAssistantWithAttendanceContext(assistant, {
      ongoingAt: session.ongoing_at,
      scheduledStartAt,
    })
  );
  const attendances = await listOperationalSessionAttendances(sessionId);
  const enrolledStudents = await listEnrolledStudents(session.registration_schedule_id);

  const roleAssistantIdentifiers = await listAssistantRoleIdentifiers([
    ...enrolledStudents.map((student) => student.user_id),
    ...enrolledStudents.map((student) => student.student_identifier),
    ...attendances.map((attendance) => attendance.user_id),
    ...attendances.map((attendance) => attendance.user_identifier),
  ]);
  const assignedAssistantIdentifiers = await listAssignedAssistantIdentifiers(session.registration_schedule_id);
  const assistantIdentifiers = new Set([
    ...activeAssistants.map((assistant) => String(assistant.user_id).toLowerCase()),
    ...activeAssistants.map((assistant) => String(assistant.user_identifier ?? '').toLowerCase()).filter(Boolean),
    ...roleAssistantIdentifiers,
    ...assignedAssistantIdentifiers,
  ]);
  const studentAttendances = attendances.filter((row) => !isAssistantIdentity(row, assistantIdentifiers));
  const enrolledStudentsFiltered = enrolledStudents.filter(
    (student) => !isAssistantIdentity(student, assistantIdentifiers)
  );
  const { byUserId: enrolledStudentByUser, byNim: enrolledByNim } =
    buildEnrollmentIdentityIndexes(enrolledStudentsFiltered);
  const attendanceIndexes = buildAttendanceIdentityIndexes(studentAttendances);

  // BAP draft only includes students who checked in via QR or have approved permits.
  // Match enrollment to scan by user_id OR NIM so duplicate profiles with the same NIM
  // still reconcile to one practikan row.
  const studentByUser = new Map();
  for (const attendance of studentAttendances) {
    const nim = resolveStudentNim(attendance);
    const enrolled = findEnrollmentForIdentity(
      { userId: attendance.user_id, nim },
      enrolledStudentByUser,
      enrolledByNim
    );
    studentByUser.set(String(attendance.user_id), {
      user_id: attendance.user_id,
      student_name: attendance.user_name || enrolled?.student_name || attendance.user_id,
      student_identifier: attendance.user_identifier || enrolled?.student_identifier || null,
    });
  }

  const scheduleDate = toDateOnly(schedule.tanggal || schedule.start_time || session.completed_at);
  const permitsByUser = await listApprovedPermits({
    userIds: enrolledStudentsFiltered.map((student) => student.user_id),
    scheduleDate,
  });
  for (const student of enrolledStudentsFiltered) {
    if (!findPermitReasonForStudent(student, permitsByUser, enrolledByNim)) continue;
    const nim = resolveStudentNim(student);
    if (isStudentAlreadyRepresented(studentByUser, { userId: student.user_id, nim })) continue;
    studentByUser.set(String(student.user_id), student);
  }

  const signatureSnapshots = await getSignatureSnapshotsForUsers([
    ...studentByUser.keys(),
    ...[...studentByUser.values()].map((student) => student.student_identifier),
    ...[...studentByUser.values()].map((student) => student.student_name),
    ...studentAttendances.map((attendance) => attendance.assigned_assistant_user_id),
    ...studentAttendances.map((attendance) => attendance.assigned_assistant_identifier),
    ...activeAssistants.map((assistant) => assistant.user_id),
    ...activeAssistants.map((assistant) => assistant.user_identifier),
  ]);
  const plotMap = await buildPlotGroupMapForSession(sessionId);

  const allRows = [...studentByUser.values()]
    .sort((a, b) => String(a.student_identifier || a.student_name).localeCompare(String(b.student_identifier || b.student_name)))
    .map((student, index) => {
      const attendance = findAttendanceForStudent(student, attendanceIndexes);
      const permitReason = findPermitReasonForStudent(student, permitsByUser, enrolledByNim);
      const attendanceStatus = attendance
        ? statusFromAttendance(attendance.attendance_status)
        : permitReason === 'sakit'
          ? 'sick'
          : permitReason === 'izin'
            ? 'permission'
            : 'absent';
      const studentSignature = signatureSnapshots.get(String(student.user_id)) ||
        (student.student_identifier ? signatureSnapshots.get(String(student.student_identifier)) : null) ||
        (student.student_name ? signatureSnapshots.get(String(student.student_name)) : null);
      const assistantSignature = attendance?.assigned_assistant_user_id
        ? signatureSnapshots.get(String(attendance.assigned_assistant_user_id)) ||
          (attendance.assigned_assistant_identifier
            ? signatureSnapshots.get(String(attendance.assigned_assistant_identifier))
            : null)
        : null;
      const assignedAssistantId = attendance?.assigned_assistant_user_id || null;
      const plotMeta = assignedAssistantId
        ? plotMap.get(String(assignedAssistantId))
        : null;
      const plotGroup =
        attendance?.plot_group ||
        plotMeta?.plot_group ||
        (assignedAssistantId
          ? resolvePlotFromActiveAssistants(assignedAssistantId, activeAssistants)
          : null);
      return {
        row_number: index + 1,
        student_user_id: student.user_id,
        student_identifier: student.student_identifier,
        student_name: student.student_name,
        assistant_code: resolvePlotGroupLabel(attendance),
        plot_group: resolvePlotGroupLabel(attendance),
        assigned_assistant_user_id: attendance?.assigned_assistant_user_id || null,
        assigned_assistant_name: attendance?.assigned_assistant_name || null,
        assigned_assistant_identifier: attendance?.assigned_assistant_identifier || null,
        attendance_status: attendanceStatus,
        attendance_time: attendance?.attendance_time || null,
        student_signature_status: signatureFromStatus(attendanceStatus),
        student_signature_ttd_file_path: studentSignature?.ttd_file_path || null,
        student_signature_ttd_snapshot: studentSignature?.ttd_snapshot || null,
        assistant_signature_status: assistantSignatureFromRow({
          attendance_status: attendanceStatus,
          assigned_assistant_user_id: attendance?.assigned_assistant_user_id || null,
        }),
        assistant_signature_user_id: attendance?.assigned_assistant_user_id || null,
        assistant_signature_ttd_file_path: assistantSignature?.ttd_file_path || null,
        assistant_signature_ttd_snapshot: assistantSignature?.ttd_snapshot || null,
      };
    });
  const rows = allRows
    .filter((row) => row.attendance_status !== 'absent')
    .sort(compareBapAttendanceRows)
    .map((row, index) => ({ ...row, row_number: index + 1 }));

  const presentCount = allRows.filter((row) => row.attendance_status === 'present' || row.attendance_status === 'late').length;
  const sickCount = allRows.filter((row) => row.attendance_status === 'sick').length;
  const permissionCount = allRows.filter((row) => row.attendance_status === 'permission').length;
  const absentCount = allRows.filter((row) => row.attendance_status === 'absent').length;

  const client = await conductDb.connect();
  try {
    await client.query('BEGIN');
    const bapResult = await client.query(
      `INSERT INTO practicum_baps (
         operational_session_id,
         registration_schedule_id,
         status,
         practicum_name,
         module_name,
         class_shift,
         activity_type,
         scheduled_date,
         start_time,
         end_time,
         venue,
         present_count,
         sick_count,
         permission_count,
         absent_count,
         student_count,
         assistant_count,
         metadata,
         generated_at,
         updated_at
       ) VALUES (
         $1::uuid, $2::uuid, 'draft_generated', $3, $4, $5, 'Hands-On', $6::date, $7::time, $8::time, $9,
         $10, $11, $12, $13, $14, $15, $16::jsonb, NOW(), NOW()
       )
       ON CONFLICT (operational_session_id)
       DO UPDATE SET
         registration_schedule_id = EXCLUDED.registration_schedule_id,
         practicum_name = EXCLUDED.practicum_name,
         module_name = EXCLUDED.module_name,
         class_shift = EXCLUDED.class_shift,
         scheduled_date = EXCLUDED.scheduled_date,
         start_time = EXCLUDED.start_time,
         end_time = EXCLUDED.end_time,
         venue = EXCLUDED.venue,
         present_count = EXCLUDED.present_count,
         sick_count = EXCLUDED.sick_count,
         permission_count = EXCLUDED.permission_count,
         absent_count = EXCLUDED.absent_count,
         student_count = EXCLUDED.student_count,
         assistant_count = EXCLUDED.assistant_count,
         metadata = EXCLUDED.metadata || jsonb_build_object(
           'registration_snapshot', COALESCE(practicum_baps.metadata->'registration_snapshot', EXCLUDED.metadata->'registration_snapshot'),
           'active_periode', COALESCE(practicum_baps.metadata->'registration_snapshot'->'active_periode', EXCLUDED.metadata->'active_periode'),
           'study_program', COALESCE(practicum_baps.metadata->'registration_snapshot'->'study_program', EXCLUDED.metadata->'study_program'),
           'laboratory', COALESCE(practicum_baps.metadata->'registration_snapshot'->'laboratory', EXCLUDED.metadata->'laboratory'),
           'practicum', COALESCE(practicum_baps.metadata->'registration_snapshot'->'practicum', EXCLUDED.metadata->'practicum'),
           'schedule', COALESCE(practicum_baps.metadata->'registration_snapshot'->'schedule', EXCLUDED.metadata->'schedule')
         ),
         generated_at = NOW(),
         updated_at = NOW()
       RETURNING *`,
      [
        sessionId,
        session.registration_schedule_id,
        schedule.practicum_name || null,
        schedule.module_name || null,
        schedule.detail_kegiatan || schedule.kelas || null,
        scheduleDate,
        toTimeOnly(schedule.jam_mulai || schedule.start_time),
        toTimeOnly(schedule.jam_berakhir || schedule.end_time),
        schedule.venue || null,
        presentCount,
        sickCount,
        permissionCount,
        absentCount,
        rows.length,
        activeAssistants.length,
        JSON.stringify({
          active_assistants: activeAssistants,
          session_start_context: sessionStartContext,
          scheduled_start_at: scheduledStartAt ? scheduledStartAt.toISOString() : null,
          pic_user_id: session.pic_user_id || null,
          registration_snapshot: registrationSnapshot,
          active_periode: registrationSnapshot.active_periode,
          study_program: registrationSnapshot.study_program,
          laboratory: registrationSnapshot.laboratory,
          practicum: registrationSnapshot.practicum,
          schedule: registrationSnapshot.schedule,
          source: 'auto_generated_from_completed_session',
        }),
      ]
    );

    const bap = bapResult.rows[0];
    await client.query('DELETE FROM practicum_bap_attendance_rows WHERE bap_id = $1::uuid', [bap.id]);
    for (const row of rows) {
      await client.query(
        `INSERT INTO practicum_bap_attendance_rows (
           bap_id,
           row_number,
           student_user_id,
           student_identifier,
           student_name,
           assistant_code,
           attendance_status,
           attendance_time,
           student_signature_status,
           assistant_signature_status,
           student_signature_ttd_file_path,
           student_signature_ttd_snapshot,
           student_signature_snapshot_at,
           assistant_signature_user_id,
           assistant_signature_ttd_file_path,
           assistant_signature_ttd_snapshot,
           assistant_signature_snapshot_at
         ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::text, $12::text, CASE WHEN $11::text IS NOT NULL OR $12::text IS NOT NULL THEN NOW() ELSE NULL END, $13::text, $14::text, $15::text, CASE WHEN $14::text IS NOT NULL OR $15::text IS NOT NULL THEN NOW() ELSE NULL END)`,
        [
          bap.id,
          row.row_number,
          row.student_user_id,
          row.student_identifier,
          row.student_name,
          row.assistant_code,
          row.attendance_status,
          row.attendance_time,
          row.student_signature_status,
          row.assistant_signature_status,
          row.student_signature_ttd_file_path,
          row.student_signature_ttd_snapshot,
          row.assistant_signature_user_id,
          row.assistant_signature_ttd_file_path,
          row.assistant_signature_ttd_snapshot,
        ]
      );
    }
    await client.query('COMMIT');
    return getBapBySession(sessionId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getBapBySession(operationalSessionId) {
  const sessionId = requireNonEmptyString(operationalSessionId, 'operational_session_id');
  const result = await conductDb.query(
    `SELECT * FROM practicum_baps WHERE operational_session_id = $1::uuid LIMIT 1`,
    [sessionId]
  );
  if (result.rowCount === 0) {
    const session = await getOperationalSessionById(sessionId);
    if (session.session_status === 'completed') return generateBapForCompletedSession(sessionId);
    throw new Error('BAP is not available because the session is not completed');
  }

  const rowsResult = await conductDb.query(
    `SELECT *
     FROM practicum_bap_attendance_rows
     WHERE bap_id = $1::uuid
     ORDER BY row_number ASC`,
    [result.rows[0].id]
  );
  const bapRow = result.rows[0];
  const reviewerIds = [bapRow.lecturer_signed_by, bapRow.laboran_reviewed_by]
    .map((id) => String(id ?? '').trim())
    .filter(Boolean);
  if (reviewerIds.length > 0) {
    const reviewerProfiles = await getProfiles(reviewerIds);
    const lecturerProfile = reviewerProfiles.get(String(bapRow.lecturer_signed_by));
    if (lecturerProfile?.name) bapRow.lecturer_signed_by_name = lecturerProfile.name;
    if (lecturerProfile?.nipnim) bapRow.lecturer_signed_by_identifier = lecturerProfile.nipnim;
    const laboranProfile = reviewerProfiles.get(String(bapRow.laboran_reviewed_by));
    if (laboranProfile?.name) bapRow.laboran_reviewed_by_name = laboranProfile.name;
    if (laboranProfile?.nipnim) bapRow.laboran_reviewed_by_identifier = laboranProfile.nipnim;
  }
  const enrichedRows = await enrichBapAttendanceRows(
    sessionId,
    rowsResult.rows,
    bapRow.metadata
  );
  return mapBap(bapRow, enrichedRows);
}

function parseReportingDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function listBaps({
  status,
  incidentOnly,
  laboranReviewStatus,
  lecturerSigned,
  dateFrom,
  dateTo,
  scheduleIds,
  practicumName,
  limit = 200,
} = {}) {
  const args = [];
  const conditions = [];

  if (status) {
    args.push(String(status).trim());
    conditions.push(`status = $${args.length}`);
  }

  if (incidentOnly) {
    conditions.push(`incident_notes IS NOT NULL AND btrim(incident_notes) <> ''`);
  }

  if (laboranReviewStatus) {
    args.push(String(laboranReviewStatus).trim());
    conditions.push(`laboran_review_status = $${args.length}`);
  }

  if (lecturerSigned === true) {
    conditions.push('lecturer_signed_at IS NOT NULL');
  } else if (lecturerSigned === false) {
    conditions.push('lecturer_signed_at IS NULL');
  }

  if (Array.isArray(scheduleIds)) {
    if (scheduleIds.length === 0) {
      conditions.push('1 = 0');
    } else {
      args.push(scheduleIds);
      conditions.push(`registration_schedule_id = ANY($${args.length}::uuid[])`);
    }
  } else {
    const fromDate = parseReportingDate(dateFrom);
    if (fromDate) {
      args.push(fromDate.toISOString().slice(0, 10));
      conditions.push(`scheduled_date >= $${args.length}::date`);
    }

    const toDate = parseReportingDate(dateTo);
    if (toDate) {
      args.push(toDate.toISOString().slice(0, 10));
      conditions.push(`scheduled_date <= $${args.length}::date`);
    }
  }

  const practicum = String(practicumName ?? '').trim();
  if (practicum) {
    args.push(practicum);
    conditions.push(`LOWER(TRIM(practicum_name)) = LOWER(TRIM($${args.length}))`);
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 2000);
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await conductDb.query(
    `SELECT *
     FROM practicum_baps
     ${where}
     ORDER BY scheduled_date DESC NULLS LAST, generated_at DESC
     LIMIT ${safeLimit}`,
    args
  );
  return result.rows.map((row) => mapBap(row));
}

export async function refreshBapSignatureSnapshots(operationalSessionId) {
  const sessionId = requireNonEmptyString(operationalSessionId, 'operational_session_id');
  const bap = await getBapBySession(sessionId);
  if (bap.lecturer_signed_at) {
    throw new Error('Signature snapshots cannot be refreshed after lecturer signature');
  }

  const signatureSnapshots = await getSignatureSnapshotsForUsers([
    ...bap.rows.map((row) => row.student_user_id),
    ...bap.rows.map((row) => row.student_identifier),
    ...bap.rows.map((row) => row.student_name),
    ...bap.rows.map((row) => row.assistant_signature_user_id),
    ...bap.rows.map((row) => row.assigned_assistant_identifier),
    ...bap.assistants.map((assistant) => assistant.user_id),
    ...bap.assistants.map((assistant) => assistant.user_identifier),
  ]);

  const client = await conductDb.connect();
  try {
    await client.query('BEGIN');
    for (const row of bap.rows) {
      const studentSignature = signatureSnapshots.get(String(row.student_user_id)) ||
        (row.student_identifier ? signatureSnapshots.get(String(row.student_identifier)) : null) ||
        (row.student_name ? signatureSnapshots.get(String(row.student_name)) : null);
      const assistantSignature = row.assistant_signature_user_id
        ? signatureSnapshots.get(String(row.assistant_signature_user_id)) ||
          (row.assigned_assistant_identifier
            ? signatureSnapshots.get(String(row.assigned_assistant_identifier))
            : null)
        : null;
      await client.query(
        `UPDATE practicum_bap_attendance_rows
         SET student_signature_ttd_file_path = $2::text,
             student_signature_ttd_snapshot = $3::text,
             student_signature_snapshot_at = CASE WHEN $2::text IS NOT NULL OR $3::text IS NOT NULL THEN NOW() ELSE NULL END,
             assistant_signature_ttd_file_path = $4::text,
             assistant_signature_ttd_snapshot = $5::text,
             assistant_signature_snapshot_at = CASE WHEN $4::text IS NOT NULL OR $5::text IS NOT NULL THEN NOW() ELSE NULL END
         WHERE id = $1::uuid`,
        [
          row.id,
          studentSignature?.ttd_file_path || null,
          studentSignature?.ttd_snapshot || null,
          assistantSignature?.ttd_file_path || null,
          assistantSignature?.ttd_snapshot || null,
        ]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return getBapBySession(sessionId);
}

export async function updateBapIncidentNotes({ operationalSessionId, requesterUserId, incidentNotes }) {
  const sessionId = requireNonEmptyString(operationalSessionId, 'operational_session_id');
  if (!requesterUserId) throw new Error('User is not authenticated');

  const session = await getOperationalSessionById(sessionId);
  if (session.session_status !== 'completed') {
    throw new Error('Incident notes can only be updated after the session is completed');
  }
  if (String(session.pic_user_id ?? '') !== String(requesterUserId)) {
    throw new Error('Only the session PIC can update BAP incident notes');
  }

  const notes = String(incidentNotes ?? '').trim();
  if (notes.length > 4000) {
    throw new Error('Incident notes can be at most 4000 characters');
  }

  let bap = await getBapBySession(sessionId);
  if (bap.lecturer_signed_at) {
    throw new Error('Incident notes cannot be updated after lecturer signature');
  }

  await conductDb.query(
    `UPDATE practicum_baps
     SET incident_notes = $2,
         metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb,
         updated_at = NOW()
     WHERE operational_session_id = $1::uuid`,
    [sessionId, notes || null, JSON.stringify({ pic_user_id: session.pic_user_id || null })]
  );

  bap = await getBapBySession(sessionId);
  return bap;
}

export async function reviewBapByLaboran({ operationalSessionId, requesterUserId, reviewStatus, reviewNote }) {
  const sessionId = requireNonEmptyString(operationalSessionId, 'operational_session_id');
  if (!requesterUserId) throw new Error('User is not authenticated');

  const normalizedStatus = String(reviewStatus ?? '').trim();
  if (!['approved', 'revision_required'].includes(normalizedStatus)) {
    throw new Error('Laboratory review status is invalid');
  }
  const note = String(reviewNote ?? '').trim();
  if (note.length > 4000) {
    throw new Error('Laboratory review note can be at most 4000 characters');
  }
  if (normalizedStatus === 'revision_required' && !note) {
    throw new Error('Review note is required when requesting revision');
  }

  const bap = await getBapBySession(sessionId);
  if (!bap.lecturer_signed_at) {
    throw new Error('BAP can only be reviewed by laboratory staff after lecturer signature');
  }

  const laboranSignature = await getSignatureSnapshotForUser(requesterUserId);
  const nextStatus = normalizedStatus === 'approved' ? 'final_approved' : 'revision_required';
  await conductDb.query(
    `UPDATE practicum_baps
     SET laboran_review_status = $2,
         laboran_reviewed_at = NOW(),
         laboran_reviewed_by = $3,
         laboran_review_note = $4,
         status = $5,
         laboran_signature_ttd_file_path = $6::text,
         laboran_signature_ttd_snapshot = $7::text,
         laboran_signature_snapshot_at = CASE WHEN $6::text IS NOT NULL OR $7::text IS NOT NULL THEN NOW() ELSE NULL END,
         updated_at = NOW()
     WHERE operational_session_id = $1::uuid`,
    [
      sessionId,
      normalizedStatus,
      requesterUserId,
      note || null,
      nextStatus,
      laboranSignature.ttd_file_path,
      laboranSignature.ttd_snapshot,
    ]
  );

  return getBapBySession(sessionId);
}

async function ensureBapForSignatureFlow(operationalSessionId) {
  const session = await getOperationalSessionById(operationalSessionId);
  if (session.session_status !== 'completed') {
    throw new Error('BAP can only be signed after the session is completed');
  }
  return getBapBySession(operationalSessionId);
}

async function buildLecturerSignatureQrPayload({ qrToken, operationalSessionId, bapId, expiredAt }) {
  return {
    t: 'bap_sig',
    token: qrToken,
    sid: operationalSessionId,
    bid: bapId,
    exp: expiredAt.toISOString(),
  };
}

async function generateQrCodeImage(payload) {
  return QRCode.toDataURL(JSON.stringify(payload), {
    errorCorrectionLevel: 'M',
    type: 'image/png',
    width: 420,
    margin: 4,
    color: {
      dark: '#1a1a2e',
      light: '#ffffff',
    },
  });
}

function mapLecturerSignatureQr(row, image) {
  return {
    qr_token: row.qr_token,
    operational_session_id: row.operational_session_id,
    expired_at: row.expired_at,
    expiry_seconds: BAP_LECTURER_SIGNATURE_QR_EXPIRY_SECONDS,
    generated_at: row.created_at,
    image,
  };
}

export async function generateLecturerSignatureQr({ operationalSessionId, requesterUserId }) {
  const sessionId = requireNonEmptyString(operationalSessionId, 'operational_session_id');
  if (!requesterUserId) throw new Error('User is not authenticated');
  const bap = await ensureBapForSignatureFlow(sessionId);
  if (bap.lecturer_signed_at) {
    throw new Error('This BAP has already been signed by the lecturer');
  }

  const qrToken = uuidv4();
  const now = new Date();
  const expiredAt = new Date(now.getTime() + BAP_LECTURER_SIGNATURE_QR_EXPIRY_SECONDS * 1000);
  const qrPayload = await buildLecturerSignatureQrPayload({
    qrToken,
    operationalSessionId: sessionId,
    bapId: bap.id,
    expiredAt,
  });

  const client = await conductDb.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE practicum_operational_session_qr_sessions
       SET is_active = false, updated_at = NOW()
       WHERE operational_session_id = $1::uuid
         AND is_active = true
         AND (qr_data->>'type' = 'bap_lecturer_signature' OR qr_data->>'t' = 'bap_sig')`,
      [sessionId]
    );

    const insertResult = await client.query(
      `INSERT INTO practicum_operational_session_qr_sessions (
         operational_session_id,
         qr_token,
         qr_data,
         generated_by,
         expired_at,
         is_active,
         created_at,
         updated_at
       ) VALUES ($1::uuid, $2, $3::jsonb, $4, $5, true, NOW(), NOW())
       RETURNING id, operational_session_id, qr_token, qr_data, expired_at, created_at`,
      [sessionId, qrToken, JSON.stringify(qrPayload), requesterUserId, expiredAt]
    );

    await client.query('COMMIT');
    const image = await generateQrCodeImage(qrPayload);
    return mapLecturerSignatureQr(insertResult.rows[0], image);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getActiveLecturerSignatureQr({ operationalSessionId }) {
  const sessionId = requireNonEmptyString(operationalSessionId, 'operational_session_id');
  const result = await conductDb.query(
    `SELECT *
     FROM practicum_operational_session_qr_sessions
     WHERE operational_session_id = $1::uuid
       AND (qr_data->>'type' = 'bap_lecturer_signature' OR qr_data->>'t' = 'bap_sig')
       AND is_active = true
       AND expired_at > NOW()
     ORDER BY created_at DESC
     LIMIT 1`,
    [sessionId]
  );
  if (result.rowCount === 0) return null;
  const row = result.rows[0];
  const image = await generateQrCodeImage(row.qr_data);
  return mapLecturerSignatureQr(row, image);
}

async function resolveLaboratoryIdForSchedule(scheduleId) {
  const result = await registrationDb.query(
    `SELECT l.id AS laboratory_id
     FROM schedules s
     INNER JOIN practicum_modules pm ON pm.id = s.module_id
     INNER JOIN practicums p ON p.id = pm.practicum_id
     INNER JOIN laboratories l ON l.id = p.laboratory_id
     WHERE s.id = $1::uuid
     LIMIT 1`,
    [scheduleId]
  );
  return result.rows[0]?.laboratory_id || null;
}

async function assertLecturerCanSignBap({ requesterUserId, registrationScheduleId }) {
  const requesterId = String(requesterUserId);
  const hasDosenRole =
    (await roleService.userHasRole(requesterId, 'dosen')) ||
    (await roleService.userHasRole(requesterId, 'dosen_pembina'));

  if (!hasDosenRole) {
    throw new Error('Only assigned lecturers can sign this BAP');
  }

  const laboratoryId = await resolveLaboratoryIdForSchedule(registrationScheduleId);
  if (!laboratoryId) {
    throw new Error('Laboratory for this BAP was not found');
  }

  const profileResult = await userManagementDb.query(
    `SELECT procurement_supervised_lab_id
     FROM user_profiles
     WHERE user_id = $1
       AND deleted_at IS NULL
     LIMIT 1`,
    [requesterId]
  );
  const supervisedLabId = profileResult.rows[0]?.procurement_supervised_lab_id;
  if (supervisedLabId && String(supervisedLabId) === String(laboratoryId)) {
    return;
  }

  const isDev = (process.env.NODE_ENV || '').toLowerCase() === 'development';
  if (isDev) {
    logger.warn('BAP lecturer validation: allowing dosen in development without lab match', {
      requesterUserId: requesterId,
      laboratoryId,
      supervisedLabId,
    });
    return;
  }

  throw new Error('You are not the supervising lecturer for this practicum laboratory');
}

export async function signBapByLecturer({ qrToken, requesterUserId }) {
  const token = requireNonEmptyString(qrToken, 'qr_token');
  if (!requesterUserId) throw new Error('User is not authenticated');

  const qrResult = await conductDb.query(
    `SELECT *
     FROM practicum_operational_session_qr_sessions
     WHERE qr_token = $1
       AND (qr_data->>'type' = 'bap_lecturer_signature' OR qr_data->>'t' = 'bap_sig')
     LIMIT 1`,
    [token]
  );
  if (qrResult.rowCount === 0) throw new Error('Signature QR token was not found');
  const qrRow = qrResult.rows[0];
  if (!qrRow.is_active) throw new Error('Signature QR token is no longer active');
  if (new Date(qrRow.expired_at).getTime() <= Date.now()) {
    throw new Error('Signature QR token has expired');
  }

  const bapResult = await conductDb.query(
    `SELECT * FROM practicum_baps WHERE operational_session_id = $1::uuid LIMIT 1`,
    [qrRow.operational_session_id]
  );
  if (bapResult.rowCount === 0) throw new Error('BAP was not found for this session');
  const bap = bapResult.rows[0];
  if (bap.lecturer_signed_at) {
    throw new Error('This BAP has already been signed by the lecturer');
  }

  await assertLecturerCanSignBap({
    requesterUserId,
    registrationScheduleId: bap.registration_schedule_id,
  });

  const lecturerSignature = await getSignatureSnapshotForUser(requesterUserId);
  const client = await conductDb.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE practicum_baps
       SET lecturer_signed_at = NOW(),
           lecturer_signed_by = $2,
           lecturer_signature_ttd_file_path = $3::text,
           lecturer_signature_ttd_snapshot = $4::text,
           lecturer_signature_snapshot_at = CASE WHEN $3::text IS NOT NULL OR $4::text IS NOT NULL THEN NOW() ELSE NULL END,
           status = 'lecturer_signed',
           updated_at = NOW()
       WHERE id = $1::uuid`,
      [bap.id, requesterUserId, lecturerSignature.ttd_file_path, lecturerSignature.ttd_snapshot]
    );
    await client.query(
      `UPDATE practicum_operational_session_qr_sessions
       SET is_active = false, updated_at = NOW()
       WHERE id = $1::uuid`,
      [qrRow.id]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return getBapBySession(qrRow.operational_session_id);
}

function formatDate(value) {
  if (!value) return '-';
  const raw = String(value).trim();
  if (!raw || raw === '-') return '-';

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[3]}-${isoMatch[2]}-${isoMatch[1]}`;
  }

  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return raw;

  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

function snapshotEntityLabel(entity) {
  if (!entity) return '-';
  const code = String(entity.code ?? '').trim();
  const name = String(entity.name ?? '').trim();
  if (code && name) return `${code} - ${name}`;
  return name || code || '-';
}

function bapRegistrationSnapshot(bap) {
  return bap.metadata?.registration_snapshot || {};
}

function bapStudyProgramHeader(bap) {
  const snapshot = bapRegistrationSnapshot(bap);
  const studyProgram = snapshot.study_program || bap.metadata?.study_program || {};
  const name = String(studyProgram.name || '').trim();
  return `PROGRAM STUDI ${name || '-'}`.toUpperCase();
}

function bapSemesterHeader(bap) {
  const snapshot = bapRegistrationSnapshot(bap);
  const activePeriode = snapshot.active_periode || bap.metadata?.active_periode || {};
  const raw = String(activePeriode.label || activePeriode.id || '').trim();
  const match = raw.match(/^(\d{2})(\d{2})-(\d+)$/);
  if (!match) return raw ? `SEMESTER ${raw}`.toUpperCase() : 'SEMESTER -';
  const startYear = `20${match[1]}`;
  const endYear = `20${match[2]}`;
  const semester = match[3] === '2' ? 'GENAP' : 'GANJIL';
  return `SEMESTER ${semester} ${startYear}/${endYear}`;
}

function bapWeekLabel(bap) {
  const snapshot = bapRegistrationSnapshot(bap);
  const module = snapshot.module || bap.metadata?.module || {};
  const weekNumber = module.week_number ?? module.weekNumber;
  const parsed = Number.parseInt(weekNumber, 10);
  return Number.isInteger(parsed) && parsed > 0 ? String(parsed) : '-';
}

function bapInfoRows(bap) {
  const snapshot = bapRegistrationSnapshot(bap);
  const snapshotSchedule = snapshot.schedule || bap.metadata?.schedule || {};
  const snapshotTime = [snapshotSchedule.start_time, snapshotSchedule.end_time]
    .filter(Boolean)
    .join(' - ');
  return [
    ['Periode', snapshot.active_periode?.label || snapshot.active_periode?.id || '-'],
    ['Program Studi', snapshotEntityLabel(snapshot.study_program || bap.metadata?.study_program)],
    ['Laboratorium', snapshotEntityLabel(snapshot.laboratory || bap.metadata?.laboratory)],
    [
      'Praktikum / Mata Kuliah',
      snapshotEntityLabel(snapshot.practicum || bap.metadata?.practicum) || bap.practicum_name || '-',
    ],
    ['Modul', snapshotEntityLabel(snapshot.module) || bap.module_name || '-'],
    ['Week', bapWeekLabel(bap)],
    ['Kelas / Shift', bap.class_shift || snapshotSchedule.class_shift || '-'],
    ['Tanggal', formatDate(snapshotSchedule.date || bap.scheduled_date)],
    ['Waktu', snapshotTime || [bap.start_time, bap.end_time].filter(Boolean).join(' - ') || '-'],
    ['Jenis Kegiatan', bap.activity_type || 'Hands-On'],
    ['Venue', snapshotSchedule.venue || bap.venue || '-'],
  ];
}

function assistantAttendanceContextLabel(assistant) {
  const label = assistant?.attendance_context?.attendance_context_label;
  if (label && String(label).trim()) return String(label).trim();
  return '-';
}

function statusLabel(status) {
  switch (status) {
    case 'present':
      return 'Present';
    case 'late':
      return 'Late';
    case 'sick':
      return 'Sick';
    case 'permission':
      return 'Permitted';
    case 'absent':
      return 'Absent';
    case 'qr_attended':
      return 'Present via Student QR Scan';
    case 'qr_validated':
      return 'Validated via Assistant QR';
    case 'not_signed':
      return 'Not Signed';
    case 'pic_open':
      return 'Via PIC';
    case 'qr_scan':
      return 'Practicum Assistant QR Activation';
    case 'pending':
      return 'Pending';
    default:
      return status || '-';
  }
}

const thinBorder = {
  top: { style: 'thin' },
  left: { style: 'thin' },
  bottom: { style: 'thin' },
  right: { style: 'thin' },
};

const mediumBorder = {
  top: { style: 'medium' },
  left: { style: 'medium' },
  bottom: { style: 'medium' },
  right: { style: 'medium' },
};

function styleRange(worksheet, startRow, endRow, startCol, endCol, style = {}) {
  for (let row = startRow; row <= endRow; row += 1) {
    for (let col = startCol; col <= endCol; col += 1) {
      const cell = worksheet.getCell(row, col);
      if (style.font) cell.font = { ...(cell.font || {}), ...style.font };
      if (style.alignment) cell.alignment = { ...(cell.alignment || {}), ...style.alignment };
      if (style.border) cell.border = style.border;
      if (style.fill) cell.fill = style.fill;
    }
  }
}

function setRowValues(worksheet, rowNumber, values) {
  const row = worksheet.getRow(rowNumber);
  values.forEach((value, index) => {
    row.getCell(index + 1).value = value;
  });
  return row;
}

function csvEscape(value) {
  const text = String(value ?? '');
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function csvLine(values) {
  return `${values.map(csvEscape).join(',')}\r\n`;
}

function ensureBapFinalApprovedForExport(bap) {
  if (bap.laboran_review_status !== 'approved') {
    throw new Error('Final CSV/PDF export is only available after the BAP is approved by laboratory staff');
  }
}

function bapFilename(bap, extension) {
  return `BAP-${bap.class_shift || bap.operational_session_id}.${extension}`.replace(/[\\/:*?"<>|]/g, '-');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeImageDataUrl(value) {
  const text = String(value || '').trim();
  return isImageDataUrl(text) ? text : null;
}

function signatureAvailabilityLabel(snapshot) {
  return safeImageDataUrl(snapshot) ? 'Profile signature available' : 'Profile signature unavailable';
}

function dataUrlToExcelImage(dataUrl) {
  const match = String(dataUrl || '').match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/i);
  if (!match) return null;
  return {
    extension: match[1].toLowerCase() === 'jpg' ? 'jpeg' : match[1].toLowerCase(),
    base64: match[2],
  };
}

function addSignatureImageToWorksheet(workbook, worksheet, dataUrl, range) {
  const image = dataUrlToExcelImage(dataUrl);
  if (!image) return false;
  const imageId = workbook.addImage(image);
  worksheet.addImage(imageId, range);
  return true;
}

function signatureHtml(dataUrl, fallback, label = '') {
  const src = safeImageDataUrl(dataUrl);
  if (!src) return escapeHtml(fallback);
  const labelHtml = label ? `<div class="signature-label">${escapeHtml(label)}</div>` : '';
  return `<img class="signature-img" src="${src}" alt="TTD" />${labelHtml}`;
}

export async function exportBapExcelBySession(operationalSessionId) {
  const bap = await getBapBySession(operationalSessionId);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'FRI Super App';
  workbook.created = new Date();
  const worksheet = workbook.addWorksheet('BAP Praktikum', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  });

  worksheet.columns = [
    { width: 6 },
    { width: 18 },
    { width: 38 },
    { width: 18 },
    { width: 24 },
    { width: 24 },
    { width: 24 },
  ];

  worksheet.mergeCells('A1:D1');
  worksheet.mergeCells('A2:D2');
  worksheet.mergeCells('A3:D3');
  worksheet.mergeCells('E1:G1');
  worksheet.mergeCells('E2:G2');
  worksheet.mergeCells('E3:G3');
  setRowValues(worksheet, 1, ['UNIVERSITAS TELKOM', '', '', '', 'No. Formulir']);
  setRowValues(worksheet, 2, ['Jl. Telekomunikasi No. 1 Ters. Buah Batu Bandung 40257', '', '', '', 'Revisi 00']);
  setRowValues(worksheet, 3, ['BERITA ACARA PENYERAHAN DOKUMEN', '', '', '', 'Berlaku Efektif']);
  styleRange(worksheet, 1, 3, 1, 7, { border: mediumBorder, alignment: { vertical: 'middle', wrapText: true } });
  worksheet.getCell('A1').font = { bold: true, size: 12 };
  worksheet.getCell('A3').font = { bold: true };
  styleRange(worksheet, 1, 3, 5, 7, { alignment: { horizontal: 'center', vertical: 'middle' } });

  worksheet.mergeCells('A5:G5');
  worksheet.mergeCells('A6:G6');
  worksheet.mergeCells('A7:G7');
  setRowValues(worksheet, 5, ['DAFTAR HADIR & BERITA ACARA PELAKSANAAN PRAKTIKUM']);
  setRowValues(worksheet, 6, [bapStudyProgramHeader(bap)]);
  setRowValues(worksheet, 7, [bapSemesterHeader(bap)]);
  styleRange(worksheet, 5, 7, 1, 7, {
    font: { bold: true, size: 13 },
    alignment: { horizontal: 'center', vertical: 'middle' },
  });

  let rowNumber = 9;
  for (const [label, value] of bapInfoRows(bap)) {
    worksheet.mergeCells(rowNumber, 2, rowNumber, 7);
    setRowValues(worksheet, rowNumber, [label, value]);
    worksheet.getCell(rowNumber, 1).font = { bold: true };
    styleRange(worksheet, rowNumber, rowNumber, 1, 7, { border: thinBorder, alignment: { vertical: 'middle' } });
    rowNumber += 1;
  }

  rowNumber += 2;
  worksheet.mergeCells(rowNumber, 1, rowNumber, 7);
  worksheet.getCell(rowNumber, 1).value = 'DAFTAR ASISTEN PRAKTIKUM';
  styleRange(worksheet, rowNumber, rowNumber, 1, 7, {
    font: { bold: true },
    alignment: { horizontal: 'center', vertical: 'middle' },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2F0D9' } },
    border: thinBorder,
  });
  rowNumber += 1;
  setRowValues(worksheet, rowNumber, ['No', 'Kode/NIM', 'Nama Asisten', 'Aktivasi', 'Status', 'Keterangan']);
  worksheet.mergeCells(rowNumber, 6, rowNumber, 7);
  styleRange(worksheet, rowNumber, rowNumber, 1, 7, {
    font: { bold: true },
    alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9EAF7' } },
    border: mediumBorder,
  });
  rowNumber += 1;
  for (const [index, assistant] of (bap.assistants || []).entries()) {
    setRowValues(worksheet, rowNumber, [
      index + 1,
      assistant.user_identifier || '-',
      assistant.user_name || 'Practicum Assistant',
      statusLabel(assistant.activation_method),
      statusLabel(assistant.attendance_status),
      assistantAttendanceContextLabel(assistant),
    ]);
    worksheet.mergeCells(rowNumber, 6, rowNumber, 7);
    styleRange(worksheet, rowNumber, rowNumber, 1, 7, { border: thinBorder, alignment: { vertical: 'middle', wrapText: true } });
    styleRange(worksheet, rowNumber, rowNumber, 1, 2, { alignment: { horizontal: 'center', vertical: 'middle' }, border: thinBorder });
    styleRange(worksheet, rowNumber, rowNumber, 3, 3, { alignment: { horizontal: 'center', vertical: 'middle', wrapText: true }, border: thinBorder });
    styleRange(worksheet, rowNumber, rowNumber, 4, 5, { alignment: { horizontal: 'center', vertical: 'middle', wrapText: true }, border: thinBorder });
    styleRange(worksheet, rowNumber, rowNumber, 6, 7, { alignment: { horizontal: 'left', vertical: 'middle', wrapText: true }, border: thinBorder });
    rowNumber += 1;
  }

  rowNumber += 1;
  worksheet.mergeCells(rowNumber, 1, rowNumber, 7);
  worksheet.getCell(rowNumber, 1).value = 'DAFTAR HADIR PRAKTIKAN';
  styleRange(worksheet, rowNumber, rowNumber, 1, 7, {
    font: { bold: true },
    alignment: { horizontal: 'center', vertical: 'middle' },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2F0D9' } },
    border: thinBorder,
  });
  rowNumber += 1;
  setRowValues(worksheet, rowNumber, ['No', 'NIM', 'Nama Mahasiswa', 'Grup Plotting', 'Status', 'Tanda Tangan Mhs', 'Tanda Tangan Asprak']);
  styleRange(worksheet, rowNumber, rowNumber, 1, 7, {
    font: { bold: true },
    alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9EAF7' } },
    border: mediumBorder,
  });
  rowNumber += 1;
  for (const row of bap.rows || []) {
    const studentSignatureText = safeImageDataUrl(row.student_signature_ttd_snapshot)
      ? signatureAvailabilityLabel(row.student_signature_ttd_snapshot)
      : statusLabel(row.student_signature_status);
    const assistantSignatureText = safeImageDataUrl(row.assistant_signature_ttd_snapshot)
      ? signatureAvailabilityLabel(row.assistant_signature_ttd_snapshot)
      : statusLabel(row.assistant_signature_status || 'not_signed');
    setRowValues(worksheet, rowNumber, [
      row.row_number,
      row.student_identifier || '-',
      row.student_name || '-',
      row.assistant_code || '-',
      statusLabel(row.attendance_status),
      studentSignatureText,
      assistantSignatureText,
    ]);
    styleRange(worksheet, rowNumber, rowNumber, 1, 7, { border: thinBorder, alignment: { vertical: 'middle', wrapText: true } });
    styleRange(worksheet, rowNumber, rowNumber, 1, 2, { alignment: { horizontal: 'center', vertical: 'middle' }, border: thinBorder });
    styleRange(worksheet, rowNumber, rowNumber, 3, 3, { alignment: { horizontal: 'center', vertical: 'middle', wrapText: true }, border: thinBorder });
    styleRange(worksheet, rowNumber, rowNumber, 4, 7, { alignment: { horizontal: 'center', vertical: 'middle', wrapText: true }, border: thinBorder });
    styleRange(worksheet, rowNumber, rowNumber, 6, 7, { alignment: { horizontal: 'center', vertical: 'middle' }, border: thinBorder });
    if (addSignatureImageToWorksheet(workbook, worksheet, row.student_signature_ttd_snapshot, {
      tl: { col: 5.1, row: rowNumber - 0.85 },
      ext: { width: 90, height: 28 },
    })) {
      worksheet.getCell(rowNumber, 6).value = null;
    }
    if (addSignatureImageToWorksheet(workbook, worksheet, row.assistant_signature_ttd_snapshot, {
      tl: { col: 6.1, row: rowNumber - 0.85 },
      ext: { width: 90, height: 28 },
    })) {
      worksheet.getCell(rowNumber, 7).value = null;
    }
    worksheet.getRow(rowNumber).height = 32;
    rowNumber += 1;
  }

  rowNumber += 1;
  worksheet.mergeCells(rowNumber, 1, rowNumber + 2, 7);
  worksheet.getCell(rowNumber, 1).value = `Catatan kejadian:\n${bap.incident_notes || 'No incident notes yet.'}`;
  styleRange(worksheet, rowNumber, rowNumber + 2, 1, 7, { border: mediumBorder, alignment: { vertical: 'top', wrapText: true } });
  worksheet.getCell(rowNumber, 1).font = { bold: true };
  rowNumber += 4;

  const recapItems = [
    ['Hadir', bap.present_count],
    ['Sakit', bap.sick_count],
    ['Izin', bap.permission_count],
    ['Alpa', bap.absent_count],
    ['Jumlah Praktikan', bap.student_count],
    ['Jumlah Asisten', bap.assistant_count],
  ];
  for (const [label, value] of recapItems) {
    worksheet.mergeCells(rowNumber, 1, rowNumber, 3);
    worksheet.mergeCells(rowNumber, 4, rowNumber, 7);
    worksheet.getCell(rowNumber, 1).value = `${label}:`;
    worksheet.getCell(rowNumber, 4).value = value;
    styleRange(worksheet, rowNumber, rowNumber, 1, 3, {
      font: { bold: true },
      alignment: { horizontal: 'left', vertical: 'middle', indent: 1 },
      border: thinBorder,
    });
    styleRange(worksheet, rowNumber, rowNumber, 4, 7, {
      font: { bold: true },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: thinBorder,
    });
    rowNumber += 1;
  }
  rowNumber += 1;

  worksheet.mergeCells(rowNumber, 1, rowNumber, 3);
  worksheet.mergeCells(rowNumber, 5, rowNumber, 7);
  worksheet.getCell(rowNumber, 1).value = 'Dosen Pengampu';
  worksheet.getCell(rowNumber, 5).value = 'Laboran';
  styleRange(worksheet, rowNumber, rowNumber, 1, 3, { font: { bold: true }, alignment: { horizontal: 'center', vertical: 'middle' }, border: mediumBorder });
  styleRange(worksheet, rowNumber, rowNumber, 5, 7, { font: { bold: true }, alignment: { horizontal: 'center', vertical: 'middle' }, border: mediumBorder });
  rowNumber += 1;

  const signatureTopRow = rowNumber;
  worksheet.mergeCells(signatureTopRow, 1, signatureTopRow + 4, 3);
  worksheet.mergeCells(signatureTopRow, 5, signatureTopRow + 4, 7);
  worksheet.getCell(signatureTopRow, 1).value = bap.lecturer_signed_at ? '.................................' : 'Belum ditandatangani';
  worksheet.getCell(signatureTopRow, 5).value = bap.laboran_reviewed_at ? '.................................' : 'Belum direview';
  styleRange(worksheet, signatureTopRow, signatureTopRow + 4, 1, 3, { alignment: { horizontal: 'center', vertical: 'middle', wrapText: true }, border: mediumBorder });
  styleRange(worksheet, signatureTopRow, signatureTopRow + 4, 5, 7, { alignment: { horizontal: 'center', vertical: 'middle', wrapText: true }, border: mediumBorder });
  if (addSignatureImageToWorksheet(workbook, worksheet, bap.lecturer_signature_ttd_snapshot, {
    tl: { col: 0.85, row: signatureTopRow - 0.2 },
    ext: { width: 165, height: 72 },
  })) {
    worksheet.getCell(signatureTopRow, 1).value = null;
  }
  if (addSignatureImageToWorksheet(workbook, worksheet, bap.laboran_signature_ttd_snapshot, {
    tl: { col: 4.85, row: signatureTopRow - 0.2 },
    ext: { width: 165, height: 72 },
  })) {
    worksheet.getCell(signatureTopRow, 5).value = null;
  }
  rowNumber = signatureTopRow + 5;

  worksheet.mergeCells(rowNumber, 1, rowNumber, 3);
  worksheet.mergeCells(rowNumber, 5, rowNumber, 7);
  worksheet.getCell(rowNumber, 1).value = `( ${bap.lecturer_signed_by_name || bap.lecturer_signed_by || 'Dosen Pengampu'} )`;
  worksheet.getCell(rowNumber, 5).value = `( ${bap.laboran_reviewed_by_name || bap.laboran_reviewed_by || 'Laboran'} )`;
  styleRange(worksheet, rowNumber, rowNumber, 1, 3, { alignment: { horizontal: 'center', vertical: 'middle' }, border: mediumBorder });
  styleRange(worksheet, rowNumber, rowNumber, 5, 7, { alignment: { horizontal: 'center', vertical: 'middle' }, border: mediumBorder });
  rowNumber += 1;

  worksheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.font = { name: 'Calibri', size: cell.font?.size || 11, bold: cell.font?.bold || false };
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = bapFilename(bap, 'xlsx');
  return { buffer: Buffer.from(buffer), filename };
}

export async function exportBapCsvBySession(operationalSessionId) {
  const bap = await getBapBySession(operationalSessionId);
  ensureBapFinalApprovedForExport(bap);

  let csv = '﻿';
  csv += csvLine(['BAP Praktikum']);
  csv += csvLine([bapStudyProgramHeader(bap)]);
  csv += csvLine([bapSemesterHeader(bap)]);
  for (const [label, value] of bapInfoRows(bap)) {
    csv += csvLine([label, value]);
  }
  csv += csvLine(['Catatan kejadian', bap.incident_notes || 'No incident notes yet.']);
  csv += csvLine(['Tanda tangan dosen', bap.lecturer_signed_at ? `Tervalidasi ${formatDate(bap.lecturer_signed_at)}` : 'Belum tervalidasi']);
  csv += csvLine(['TTD profil dosen', signatureAvailabilityLabel(bap.lecturer_signature_ttd_snapshot)]);
  csv += csvLine(['Review laboran', bap.laboran_review_status]);
  csv += csvLine(['TTD profil laboran', signatureAvailabilityLabel(bap.laboran_signature_ttd_snapshot)]);
  csv += csvLine(['Catatan review laboran', bap.laboran_review_note || '-']);
  csv += csvLine([]);

  csv += csvLine(['Daftar Asisten Praktikum']);
  csv += csvLine(['No', 'Kode/NIM', 'Nama Asisten', 'Aktivasi', 'Status', 'Keterangan']);
  for (const [index, assistant] of (bap.assistants || []).entries()) {
    csv += csvLine([
      index + 1,
      assistant.user_identifier || '-',
      assistant.user_name || 'Practicum Assistant',
      statusLabel(assistant.activation_method),
      statusLabel(assistant.attendance_status),
      assistantAttendanceContextLabel(assistant),
    ]);
  }
  csv += csvLine([]);

  csv += csvLine(['Daftar Hadir Praktikan']);
  csv += csvLine(['No', 'NIM', 'Nama Mahasiswa', 'Grup Plotting', 'Status', 'Tanda Tangan Mhs', 'Tanda Tangan Asprak']);
  for (const row of bap.rows || []) {
    csv += csvLine([
      row.row_number,
      row.student_identifier || '-',
      row.student_name || '-',
      row.assistant_code || '-',
      statusLabel(row.attendance_status),
      signatureAvailabilityLabel(row.student_signature_ttd_snapshot),
      signatureAvailabilityLabel(row.assistant_signature_ttd_snapshot),
    ]);
  }

  return { buffer: Buffer.from(csv, 'utf8'), filename: bapFilename(bap, 'csv') };
}

async function renderHtmlToPdf(html) {
  const { default: puppeteer } = await import('puppeteer-core').catch(() => ({ default: null }));
  if (!puppeteer) throw new Error('PDF generator is not available on the server');

  const fs = await import('fs');
  const candidates = [];
  if (process.env.PUPPETEER_EXECUTABLE_PATH) candidates.push(process.env.PUPPETEER_EXECUTABLE_PATH);
  candidates.push('/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome-stable', '/usr/bin/chrome');
  const executablePath = candidates.find((p) => {
    try { return fs.existsSync(p); } catch (_) { return false; }
  });
  if (!executablePath) throw new Error('PDF generator is not available on the server');

  const browser = await puppeteer.launch({ executablePath, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true });
    if (!Buffer.isBuffer(pdf) || pdf.slice(0, 4).toString('utf8') !== '%PDF') {
      throw new Error('PDF generator failed to create a valid document');
    }
    return pdf;
  } finally {
    await browser.close();
  }
}

function buildBapPdfHtml(bap) {
  const assistantRows = (bap.assistants || []).map((assistant, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(assistant.user_identifier || '-')}</td>
      <td>${escapeHtml(assistant.user_name || 'Practicum Assistant')}</td>
      <td>${escapeHtml(statusLabel(assistant.activation_method))}</td>
      <td>${escapeHtml(statusLabel(assistant.attendance_status))}</td>
      <td>${escapeHtml(assistantAttendanceContextLabel(assistant))}</td>
    </tr>`).join('');
  const infoRows = bapInfoRows(bap)
    .map(
      ([label, value]) =>
        `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`
    )
    .join('');
  const attendanceRows = (bap.rows || []).map((row) => `
    <tr>
      <td>${escapeHtml(row.row_number)}</td>
      <td>${escapeHtml(row.student_identifier || '-')}</td>
      <td>${escapeHtml(row.student_name || '-')}</td>
      <td>${escapeHtml(row.assistant_code || '-')}</td>
      <td>${escapeHtml(statusLabel(row.attendance_status))}</td>
      <td>${signatureHtml(row.student_signature_ttd_snapshot, statusLabel(row.student_signature_status), `${row.student_name || '-'} / ${row.student_identifier || '-'}`)}</td>
      <td>${signatureHtml(row.assistant_signature_ttd_snapshot, statusLabel(row.assistant_signature_status || 'not_signed'), `${row.assigned_assistant_name || '-'} / ${row.assigned_assistant_identifier || '-'}`)}</td>
    </tr>`).join('');
  const lecturerVerification = bap.lecturer_signed_at
    ? `${signatureHtml(bap.lecturer_signature_ttd_snapshot, 'Lecturer profile signature unavailable')}<br/>Validated by ${escapeHtml(bap.lecturer_signed_by_name || bap.lecturer_signed_by || 'Lecturer')} on ${escapeHtml(formatDate(bap.lecturer_signed_at))}.`
    : 'Not validated yet.';
  const laboranVerification = `${signatureHtml(bap.laboran_signature_ttd_snapshot, 'Laboratory staff profile signature unavailable')}<br/>${escapeHtml(statusLabel(bap.laboran_review_status))}${bap.laboran_reviewed_at ? ` pada ${escapeHtml(formatDate(bap.laboran_reviewed_at))}` : ''}`;

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #111; }
    h1 { font-size: 16px; text-align: center; margin-bottom: 4px; }
    h2 { font-size: 13px; margin-top: 18px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { border: 1px solid #555; padding: 5px; vertical-align: top; }
    th { background: #e8f0fe; }
    .meta td:first-child { width: 180px; font-weight: bold; }
    .box { border: 1px solid #555; padding: 8px; min-height: 42px; white-space: pre-wrap; }
    .signature-img { max-width: 120px; max-height: 42px; object-fit: contain; display: block; margin: 0 auto 4px; }
    .signature-label { font-size: 9px; text-align: center; line-height: 1.2; }
  </style>
</head>
<body>
  <h1>DAFTAR HADIR & BERITA ACARA PELAKSANAAN PRAKTIKUM</h1>
  <h1>${escapeHtml(bapStudyProgramHeader(bap))}</h1>
  <h1>${escapeHtml(bapSemesterHeader(bap))}</h1>
  <table class="meta">
    ${infoRows}
  </table>

  <h2>Catatan Kejadian</h2>
  <div class="box">${escapeHtml(bap.incident_notes || 'No incident notes yet.')}</div>

  <h2>Daftar Asisten Praktikum</h2>
  <table><thead><tr><th>No</th><th>Kode/NIM</th><th>Nama Asisten</th><th>Aktivasi</th><th>Status</th><th>Keterangan</th></tr></thead><tbody>${assistantRows}</tbody></table>

  <h2>Daftar Hadir Praktikan</h2>
  <table><thead><tr><th>No</th><th>NIM</th><th>Nama Mahasiswa</th><th>Grup Plotting</th><th>Status</th><th>TTD Mhs</th><th>TTD Asprak</th></tr></thead><tbody>${attendanceRows}</tbody></table>

  <h2>Rekap</h2>
  <table class="meta">
    <tr><td>Hadir</td><td>${escapeHtml(bap.present_count)}</td></tr>
    <tr><td>Sakit</td><td>${escapeHtml(bap.sick_count)}</td></tr>
    <tr><td>Izin</td><td>${escapeHtml(bap.permission_count)}</td></tr>
    <tr><td>Alpa</td><td>${escapeHtml(bap.absent_count)}</td></tr>
    <tr><td>Jumlah Praktikan</td><td>${escapeHtml(bap.student_count)}</td></tr>
    <tr><td>Jumlah Asisten</td><td>${escapeHtml(bap.assistant_count)}</td></tr>
  </table>

  <h2>Verifikasi</h2>
  <table class="meta">
    <tr><td>Dosen Pengampu</td><td>${lecturerVerification}</td></tr>
    <tr><td>Review Laboran</td><td>${laboranVerification}</td></tr>
    <tr><td>Catatan Laboran</td><td>${escapeHtml(bap.laboran_review_note || '-')}</td></tr>
  </table>
</body>
</html>`;
}

export async function exportBapPdfBySession(operationalSessionId) {
  const bap = await getBapBySession(operationalSessionId);
  ensureBapFinalApprovedForExport(bap);
  const buffer = await renderHtmlToPdf(buildBapPdfHtml(bap));
  return { buffer, filename: bapFilename(bap, 'pdf') };
}
