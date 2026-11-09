import { registrationDb } from '../../../config/databases.js';
import * as activePeriodeService from '../../registration/services/activePeriodeService.js';
import { resolvePeriodeLabel } from '../../registration/services/practicumService.js';
import { resolveUserIdentifiers } from './registrationUserIdentifierService.js';

function parseDayOfWeekFromDate(date) {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const days = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];
  return days[d.getDay()];
}

function normalizeIdentifier(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized || null;
}

function parseAssistantList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      user_id: item.user_id ?? null,
      nim: item.nim ?? null,
    }))
    .filter((item) => item.user_id || item.nim);
}

function mapScheduleRow(row) {
  const assistants = parseAssistantList(row.assistants);
  const assistantIdentifiers = [
    ...assistants.map((assistant) => normalizeIdentifier(assistant.user_id)),
    ...assistants.map((assistant) => normalizeIdentifier(assistant.nim)),
  ].filter(Boolean);

  const start = row.jam_mulai ?? row.start_time ?? null;
  const end = row.jam_berakhir ?? row.end_time ?? null;
  const day = parseDayOfWeekFromDate(row.tanggal) ?? row.day_of_week ?? '';

  return {
    id: row.id,
    semester_code: row.semester_code ?? null,
    study_program_id: row.study_program_id ?? null,
    study_program_code: row.study_program_code ?? null,
    study_program_name: row.study_program_name ?? '',
    laboratory_id: row.laboratory_id ?? null,
    laboratory_code: row.laboratory_code ?? null,
    laboratory_name: row.laboratory_name ?? '',
    practicum_id: row.practicum_id ?? null,
    practicum_code: row.practicum_code ?? null,
    practicum_name: row.practicum_name ?? '',
    module_id: row.module_id ?? null,
    module_code: row.module_code ?? null,
    module_name: row.module_name ?? '',
    module_sequence: row.module_sequence ?? 0,
    week_number: row.week_number ?? 0,
    weeks: row.week_number ? [row.week_number] : [],
    class_group: row.detail_kegiatan ?? row.class_group ?? '',
    class_type: row.kelas ?? '',
    kelas: row.kelas ?? '',
    detail_kegiatan: row.detail_kegiatan ?? '',
    day_of_week: day,
    hari: day,
    tanggal: row.tanggal ?? null,
    shift_code: null,
    start_time: start,
    end_time: end,
    jam_mulai: start,
    jam_berakhir: end,
    hitungan_jam: row.hitungan_jam ?? null,
    venue: row.venue ?? null,
    ttlock_sync_status: row.ttlock_sync_status ?? 'not_sync',
    capacity: 0,
    assistants,
    assistant_identifiers: assistantIdentifiers,
    is_assigned_to_current_user: row.is_assigned_to_current_user === true,
    status: 'final',
  };
}

function buildScheduleWhere({
  currentUserIdentifiers,
  enrollmentOnly = false,
  assistantOnly = false,
} = {}) {
  const args = [];
  let joinFilter = '';

  if (currentUserIdentifiers?.length) {
    args.push(currentUserIdentifiers);
    const enrollmentFilter = `
        EXISTS (
          SELECT 1
          FROM practicum_modules pm
          JOIN practicum_enrollments pe ON pe.practicum_id = pm.practicum_id
          LEFT JOIN students st ON pe.student_id = st.id
          WHERE pm.id = s.module_id
            AND pe.status = 'enrolled'
            AND pe.role = 'mahasiswa'
            AND (
              lower(pe.student_id::text) = ANY($${args.length}::text[])
              OR lower(st.user_id::text) = ANY($${args.length}::text[])
              OR lower(st.student_number::text) = ANY($${args.length}::text[])
            )
        )`;
    const assistantFilter = `
        EXISTS (
          SELECT 1 FROM schedule_assistants sa
          WHERE sa.schedule_id = s.id
            AND (
              lower(sa.user_id) = ANY($${args.length}::text[])
              OR lower(sa.nim) = ANY($${args.length}::text[])
            )
        )`;

    if (assistantOnly) {
      joinFilter = ` AND (${assistantFilter})`;
    } else if (enrollmentOnly) {
      joinFilter = ` AND (${enrollmentFilter})`;
    } else {
      joinFilter = ` AND (${assistantFilter} OR ${enrollmentFilter})`;
    }
  }

  return { args, joinFilter };
}

function buildEnrollmentMatchClause(identifierParam) {
  return `
        EXISTS (
          SELECT 1
          FROM practicum_modules pm
          JOIN practicum_enrollments pe ON pe.practicum_id = pm.practicum_id
          LEFT JOIN students st ON pe.student_id = st.id
          WHERE pm.id = s.module_id
            AND pe.status = 'enrolled'
            AND pe.role = 'mahasiswa'
            AND (
              lower(pe.student_id::text) = ANY(${identifierParam}::text[])
              OR lower(st.user_id::text) = ANY(${identifierParam}::text[])
              OR lower(st.student_number::text) = ANY(${identifierParam}::text[])
            )
        )`;
}

function buildAssistantMatchClause(identifierParam) {
  return `
        EXISTS (
          SELECT 1 FROM schedule_assistants sa
          WHERE sa.schedule_id = s.id
            AND (
              lower(sa.user_id) = ANY(${identifierParam}::text[])
              OR lower(sa.nim) = ANY(${identifierParam}::text[])
            )
        )`;
}

/**
 * Resolve semester_code filter for plotted schedules.
 * Explicit query param wins; otherwise uses active_periode from registration_settings
 * (configured by kaur/laboran from Auth FRI Gateway / Igracias GET /periodes).
 * Supports semester_code=active as alias for the configured active period.
 */
export async function resolveSemesterCodeFilter(semesterCode) {
  const trimmed = String(semesterCode ?? '').trim();
  if (trimmed && trimmed.toLowerCase() !== 'active') {
    return trimmed;
  }

  const { active_periode } = await activePeriodeService.getActivePeriode();
  return resolvePeriodeLabel(active_periode) || '';
}

function scheduleSelect({ includeAssignmentFlag = true, hasSemesterCode = false } = {}) {
  return `
    SELECT
      s.id,
      ${hasSemesterCode ? 's.semester_code' : 'NULL AS semester_code'},
      s.module_id,
      s.tanggal,
      s.jam_mulai,
      s.jam_berakhir,
      s.hitungan_jam,
      s.kelas,
      s.detail_kegiatan,
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
      p.name AS practicum_name,
      pm.code AS module_code,
      pm.name AS module_name,
      pm.sequence AS module_sequence,
      COALESCE(
        (SELECT json_agg(
          json_build_object('user_id', sa.user_id, 'nim', sa.nim)
          ORDER BY sa.created_at
        )
         FROM schedule_assistants sa
         WHERE sa.schedule_id = s.id),
        '[]'::json
      ) AS assistants${includeAssignmentFlag ? `,
      EXISTS (
        SELECT 1
        FROM schedule_assistants sa
        WHERE sa.schedule_id = s.id
          AND (
            lower(sa.user_id) = ANY($1::text[])
            OR lower(sa.nim) = ANY($1::text[])
          )
      ) AS is_assigned_to_current_user` : `,
      false AS is_assigned_to_current_user`}
    FROM schedules s
    LEFT JOIN practicum_modules pm ON pm.id = s.module_id
    LEFT JOIN practicums p ON p.id = pm.practicum_id
    LEFT JOIN laboratories l ON l.id = p.laboratory_id
    LEFT JOIN study_programs sp ON sp.id = l.study_program_id
  `;
}

export async function listPlottedSchedules({
  currentUserId,
  semesterCode,
  enrollmentOnly = false,
  assistantOnly = false,
} = {}) {
  const currentUserIdentifiers = await resolveUserIdentifiers(currentUserId);
  const { args, joinFilter } = buildScheduleWhere({
    currentUserIdentifiers,
    enrollmentOnly,
    assistantOnly,
  });
  const queryArgs = [...args];
  const assignmentParam = currentUserIdentifiers.length > 0 ? '$1' : null;
  const assignmentFlagSelect = assignmentParam
    ? enrollmentOnly
      ? `${buildEnrollmentMatchClause(assignmentParam)} AS is_assigned_to_current_user`
      : `${buildAssistantMatchClause(assignmentParam)}
        OR ${buildEnrollmentMatchClause(assignmentParam)} AS is_assigned_to_current_user`
    : 'false AS is_assigned_to_current_user';
  const normalizedSemesterCode = await resolveSemesterCodeFilter(semesterCode);
  const semesterFilter = normalizedSemesterCode
    ? `AND p.periode = $${queryArgs.push(normalizedSemesterCode)}`
    : '';

  const result = await registrationDb.query(
    `
      SELECT
        s.id,
        p.periode AS semester_code,
        s.module_id,
        s.tanggal,
        s.jam_mulai,
        s.jam_berakhir,
        s.hitungan_jam,
        s.kelas,
        s.detail_kegiatan,
        s.venue,
        s.ttlock_sync_status,
        s.start_time,
        s.end_time,
        pm.name AS module_name,
        pm.sequence AS module_sequence,
        pm.week_number AS week_number,
        pm.practicum_id AS practicum_id,
        p.name AS practicum_name,
        COALESCE(
          (SELECT json_agg(
            json_build_object('user_id', sa.user_id, 'nim', sa.nim)
            ORDER BY sa.created_at
          )
             FROM schedule_assistants sa
             WHERE sa.schedule_id = s.id),
          '[]'::json
        ) AS assistants,
        ${assignmentFlagSelect}
      FROM schedules s
      LEFT JOIN practicum_modules pm ON pm.id = s.module_id
      LEFT JOIN practicums p ON p.id = pm.practicum_id
      WHERE 1=1
        ${joinFilter}
        ${semesterFilter}
      ORDER BY
        s.tanggal ASC NULLS LAST,
        s.jam_mulai ASC NULLS LAST,
        s.detail_kegiatan ASC
      LIMIT 500
    `,
    queryArgs
  );

  return result.rows.map(mapScheduleRow);
}

export async function listPlottedScheduleGroups({
  currentUserId,
  semesterCode,
  enrollmentOnly = false,
  assistantOnly = false,
} = {}) {
  const rows = await listPlottedSchedules({
    currentUserId,
    semesterCode,
    enrollmentOnly,
    assistantOnly,
  });
  const byPracticum = new Map();

  for (const row of rows) {
    const practicumKey = `${row.semester_code ?? ''}::${row.practicum_name ?? ''}`;
    let practicum = byPracticum.get(practicumKey);
    if (!practicum) {
      practicum = {
        semester_code: row.semester_code,
        study_program_name: row.study_program_name,
        laboratory_name: row.laboratory_name,
        practicum_name: row.practicum_name,
        modules: [],
      };
      byPracticum.set(practicumKey, practicum);
    }

    const moduleKey = `${row.module_sequence}::${row.week_number}::${row.module_name}`;
    let module = practicum.modules.find((item) => item._key === moduleKey);
    if (!module) {
      module = {
        _key: moduleKey,
        module_sequence: row.module_sequence,
        module_name: row.module_name,
        week_number: row.week_number,
        schedules: [],
      };
      practicum.modules.push(module);
    }

    module.schedules.push(row);
  }

  return [...byPracticum.values()].map((practicum) => ({
    ...practicum,
    modules: practicum.modules.map(({ _key, ...module }) => module),
  }));
}

export async function getPlottedScheduleById(id) {
  const result = await registrationDb.query(
    `
      SELECT
        s.id,
        p.periode AS semester_code,
        s.module_id,
        s.tanggal,
        s.jam_mulai,
        s.jam_berakhir,
        s.hitungan_jam,
        s.kelas,
        s.detail_kegiatan,
        s.venue,
        s.ttlock_sync_status,
        s.start_time,
        s.end_time,
        pm.name AS module_name,
        pm.sequence AS module_sequence,
        pm.week_number AS week_number,
        pm.practicum_id AS practicum_id,
        p.name AS practicum_name,
        COALESCE(
          (SELECT array_agg(sa.user_id ORDER BY sa.created_at)
             FROM schedule_assistants sa
             WHERE sa.schedule_id = s.id),
          '{}'
        ) AS assistants
      FROM schedules s
      LEFT JOIN practicum_modules pm ON pm.id = s.module_id
      LEFT JOIN practicums p ON p.id = pm.practicum_id
      WHERE s.id = $1
    `,
    [id]
  );
  return result.rows[0] ? mapScheduleRow(result.rows[0]) : null;
}
