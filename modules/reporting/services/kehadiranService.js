/**
 * Reporting Kehadiran — proxy read-only ke data BAP modul conduct.
 */

import {
  listBaps,
  getBapBySession,
} from '../../conduct/services/practicumBapService.js';
import {
  resolveKehadiranPersona,
  resolveEffectiveScopePersona,
  applySessionScope,
  applyInboxFilter,
  computeInboxCounts,
} from './kehadiranScopeService.js';
import { conductDb } from '../../../config/databases.js';
import { resolveUserIdentifiers } from '../../conduct/utils/resolveUserIdentifiers.js';
import { nipOrNimFromJwtPayload } from '../../../core/utils/jwtIdentityFromPayload.js';
import { resolveCanonicalPracticumName } from '../config/praktikumCatalog.js';
import { resolveFeedbackSemesterScope } from './feedbackSemesterScopeService.js';

function sessionAttendanceRate(bap) {
  const students = Math.max(Number(bap.student_count) || 0, 1);
  return Number(bap.present_count || 0) / students;
}

function enrichSessionHeader(bap) {
  const rate = sessionAttendanceRate(bap);
  const canonicalPracticumName = resolveCanonicalPracticumName(
    bap.practicum_name,
    bap.module_name
  );
  return {
    ...bap,
    practicum_name: canonicalPracticumName ?? bap.practicum_name,
    attendance_rate: Math.round(rate * 10000) / 10000,
  };
}

function buildListFilters(filters = {}) {
  return {
    status: filters.status,
    incidentOnly: filters.incidentOnly,
    laboranReviewStatus: filters.tpaReviewStatus,
    lecturerSigned: filters.lecturerSigned,
    scheduleIds: filters.scheduleIds,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    practicumName: filters.practicumName,
    limit: filters.limit ?? 500,
  };
}

async function resolveKehadiranFilters(filters = {}) {
  const semesterInput =
    filters.semesterCode ?? filters.semester_code ?? 'active';
  const scope = await resolveFeedbackSemesterScope(semesterInput);
  return {
    ...filters,
    semesterCode: scope.semesterCode,
    scheduleIds: scope.scheduleIds,
  };
}

function buildPeriodPayload(filters = {}) {
  const code = filters.semesterCode ?? null;
  return {
    semester_code: code,
    label: code
      ? `Semester ${code}`
      : 'Periode aktif belum dikonfigurasi',
  };
}

function buildPraktikanSummary(
  sessions,
  persona,
  roleSlugs,
  inboxCounts,
  filters = {}
) {
  const totals = {
    present: 0,
    sick: 0,
    permission: 0,
    absent: 0,
    students: sessions.length,
  };

  for (const session of sessions) {
    const status = String(session.my_attendance_status ?? '').toLowerCase();
    if (status === 'present') totals.present += 1;
    else if (status === 'sick') totals.sick += 1;
    else if (status === 'permission') totals.permission += 1;
    else if (status === 'late' || status === 'absent') totals.absent += 1;
  }

  const sessionCount = sessions.length;
  const averageAttendanceRate =
    sessionCount > 0
      ? Math.round((totals.present / sessionCount) * 10000) / 10000
      : 0;

  const practicumNames = [
    ...new Set(
      sessions
        .map((session) => String(session.practicum_name ?? '').trim())
        .filter(Boolean)
    ),
  ].sort((a, b) => a.localeCompare(b));

  return {
    session_count: sessionCount,
    totals,
    average_attendance_rate: averageAttendanceRate,
    trend: [],
    practicum_names: practicumNames,
    persona,
    role_slugs: roleSlugs,
    inbox_counts: inboxCounts,
    period: buildPeriodPayload(filters),
  };
}

async function listScopedSessions(filters = {}, user = null) {
  const resolvedFilters = await resolveKehadiranFilters(filters);
  const nipnimHint = filters.nipnimHint || (user ? nipOrNimFromJwtPayload(user) : undefined);
  const personaCtx = user
    ? await resolveKehadiranPersona(user, { nipnimHint })
    : { persona: 'executive', userId: '', roleSlugs: [] };

  if (personaCtx.persona === 'blocked') {
    return { sessions: [], persona: personaCtx.persona, roleSlugs: personaCtx.roleSlugs };
  }

  const scopePersona = resolveEffectiveScopePersona(
    personaCtx.persona,
    resolvedFilters.viewMode
  );

  let rows = await listBaps(buildListFilters(resolvedFilters));
  rows = await applySessionScope(
    rows,
    personaCtx.persona,
    personaCtx.userId,
    nipnimHint,
    resolvedFilters.viewMode
  );
  const scopedRows = rows;
  const filteredRows = applyInboxFilter(rows, resolvedFilters.inbox);

  let sessions = filteredRows.map(enrichSessionHeader);
  if (scopePersona === 'praktikan') {
    sessions = await attachMyAttendanceStatus(
      sessions,
      personaCtx.userId,
      nipnimHint
    );
  }

  return {
    sessions,
    scopedRows,
    inboxCounts: computeInboxCounts(scopedRows),
    persona: personaCtx.persona,
    roleSlugs: personaCtx.roleSlugs,
    scopePersona,
    resolvedFilters,
  };
}

async function attachMyAttendanceStatus(sessions, userId, nipnimHint) {
  if (!sessions?.length) return sessions;
  const identifiers = await resolveUserIdentifiers(userId, { nipnimHint });
  if (!identifiers.length) return sessions;

  const sessionIds = sessions
    .map((s) => String(s.operational_session_id ?? '').trim())
    .filter(Boolean);
  if (!sessionIds.length) return sessions;

  const res = await conductDb.query(
    `SELECT b.operational_session_id::text AS operational_session_id,
            r.attendance_status
     FROM practicum_baps b
     INNER JOIN practicum_bap_attendance_rows r ON r.bap_id = b.id
     WHERE b.operational_session_id::text = ANY($1::text[])
       AND (
         lower(coalesce(r.student_user_id, '')) = ANY($2::text[])
         OR lower(coalesce(r.student_identifier, '')) = ANY($2::text[])
       )`,
    [sessionIds, identifiers]
  );

  const statusBySession = new Map(
    res.rows.map((row) => [row.operational_session_id, row.attendance_status])
  );

  return sessions.map((s) => ({
    ...s,
    my_attendance_status:
      statusBySession.get(String(s.operational_session_id ?? '')) ?? null,
  }));
}

export async function listSessions(filters = {}, user = null) {
  const { sessions } = await listScopedSessions(filters, user);
  return sessions;
}

export async function getSessionMeta(filters = {}, user = null) {
  const scoped = await listScopedSessions(filters, user);
  return {
    persona: scoped.persona,
    role_slugs: scoped.roleSlugs,
  };
}

export async function getSessionDetail(operationalSessionId, user = null, options = {}) {
  const nipnimHint = user ? nipOrNimFromJwtPayload(user) : undefined;
  const personaCtx = user
    ? await resolveKehadiranPersona(user, { nipnimHint })
    : { persona: 'executive', userId: '' };

  if (personaCtx.persona === 'blocked') {
    throw new Error('Akses laporan kehadiran tidak tersedia untuk peran ini');
  }

  const scopePersona = resolveEffectiveScopePersona(
    personaCtx.persona,
    options.viewMode
  );

  const bap = await getBapBySession(operationalSessionId);
  const rate = sessionAttendanceRate(bap);
  const enriched = {
    ...bap,
    attendance_rate: Math.round(rate * 10000) / 10000,
    assistants: bap.assistants || [],
    rows: bap.rows || [],
  };

  if (
    scopePersona === 'asisten' ||
    scopePersona === 'dosen' ||
    scopePersona === 'praktikan'
  ) {
    const allowed = await applySessionScope(
      [enriched],
      personaCtx.persona,
      personaCtx.userId,
      nipnimHint,
      options.viewMode
    );
    if (allowed.length === 0) {
      throw new Error('Sesi kehadiran tidak ditemukan atau akses ditolak');
    }
  }

  if (scopePersona === 'praktikan') {
    const identifiers = new Set(
      (await resolveUserIdentifiers(personaCtx.userId, { nipnimHint })).map((id) =>
        String(id).toLowerCase()
      )
    );
    enriched.rows = (enriched.rows || []).filter((row) => {
      const uid = String(row.student_user_id ?? '').toLowerCase();
      const sid = String(row.student_identifier ?? '').toLowerCase();
      return identifiers.has(uid) || (sid && identifiers.has(sid));
    });
    if (enriched.rows.length === 0) {
      throw new Error('Data kehadiran Anda tidak ditemukan pada sesi ini');
    }
    const self = enriched.rows[0];
    enriched.present_count = self.attendance_status === 'present' ? 1 : 0;
    enriched.sick_count = self.attendance_status === 'sick' ? 1 : 0;
    enriched.permission_count =
      self.attendance_status === 'permission' ? 1 : 0;
    enriched.absent_count =
      self.attendance_status === 'absent' || self.attendance_status === 'late'
        ? 1
        : 0;
    enriched.student_count = 1;
  }

  return enriched;
}

export async function getSummary(filters = {}, user = null) {
  const {
    sessions,
    persona,
    roleSlugs,
    inboxCounts,
    scopePersona,
    resolvedFilters,
  } = await listScopedSessions(filters, user);

  if (scopePersona === 'praktikan') {
    return buildPraktikanSummary(
      sessions,
      persona,
      roleSlugs,
      inboxCounts ?? {
        needs_review: 0,
        low_attendance: 0,
        awaiting_lecturer: 0,
        all: 0,
      },
      resolvedFilters
    );
  }

  const totals = {
    present: 0,
    sick: 0,
    permission: 0,
    absent: 0,
    students: 0,
  };
  const trendMap = new Map();

  let rateSum = 0;

  for (const s of sessions) {
    totals.present += Number(s.present_count) || 0;
    totals.sick += Number(s.sick_count) || 0;
    totals.permission += Number(s.permission_count) || 0;
    totals.absent += Number(s.absent_count) || 0;
    totals.students += Number(s.student_count) || 0;

    rateSum += Number(s.attendance_rate) || 0;

    const dateKey = s.scheduled_date
      ? String(s.scheduled_date).split('T')[0]
      : 'unknown';
    const prev = trendMap.get(dateKey) || {
      date: dateKey,
      present_sum: 0,
      student_sum: 0,
      session_count: 0,
    };
    prev.present_sum += Number(s.present_count) || 0;
    prev.student_sum += Number(s.student_count) || 0;
    prev.session_count += 1;
    trendMap.set(dateKey, prev);
  }

  const sessionCount = sessions.length;
  const averageAttendanceRate =
    sessionCount > 0 ? Math.round((rateSum / sessionCount) * 10000) / 10000 : 0;

  const trend = [...trendMap.values()]
    .filter((t) => t.date !== 'unknown')
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((t) => ({
      date: t.date,
      session_count: t.session_count,
      attendance_rate:
        t.student_sum > 0
          ? Math.round((t.present_sum / t.student_sum) * 10000) / 10000
          : 0,
    }));

  const practicumNames = [
    ...new Set(
      sessions
        .map((s) => String(s.practicum_name ?? '').trim())
        .filter(Boolean)
    ),
  ].sort((a, b) => a.localeCompare(b));

  return {
    session_count: sessionCount,
    totals,
    average_attendance_rate: averageAttendanceRate,
    trend,
    practicum_names: practicumNames,
    persona,
    role_slugs: roleSlugs,
    inbox_counts: inboxCounts ?? {
      needs_review: 0,
      low_attendance: 0,
      awaiting_lecturer: 0,
      all: 0,
    },
    period: buildPeriodPayload(resolvedFilters),
  };
}
