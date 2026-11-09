/**
 * Scope & persona Report Kehadiran berdasarkan role user.
 */

import { conductDb } from '../../../config/databases.js';
import { resolveUserIdentifiers } from '../../conduct/utils/resolveUserIdentifiers.js';
import * as roleService from '../../user-management/services/roleService.js';
import { nipOrNimFromJwtPayload } from '../../../core/utils/jwtIdentityFromPayload.js';

const STAFF_ROLES = new Set([
  'kaprodi',
  'dosen',
  'dosen_pembina',
  'kaur',
  'kaur_lab',
  'tpa',
  'koordinator_praktikum',
  'koordinator_asisten',
  'koordinator',
  'admin',
]);

const EXECUTIVE_ROLES = new Set(['kaprodi', 'koordinator_praktikum', 'koordinator_asisten', 'koordinator', 'admin']);

const LAB_OPS_ROLES = new Set(['kaur_lab', 'kaur', 'tpa']);

const ASISTEN_ROLES = new Set(['asisten_praktikum', 'asisten_praktikum_aktif', 'asisten']);

function normalizeRoleSlug(role) {
  if (role == null || role === '') return '';
  const raw = typeof role === 'string' ? role : String(role.role ?? role.slug ?? role.name ?? role);
  const normalized = raw.toLowerCase().trim().replaceAll('-', '_');
  if (normalized === 'kaur' || normalized === 'kepala_urusan_laboratorium') return 'kaur_lab';
  return normalized;
}

function collectJwtRoleSlugs(user) {
  const slugs = new Set();
  const add = (v) => {
    const n = normalizeRoleSlug(v);
    if (n) slugs.add(n);
  };
  const role = user?.role ?? user?.roles;
  if (Array.isArray(role)) {
    role.forEach(add);
  } else if (role) {
    add(role);
  }
  return slugs;
}

async function loadRoleSlugsFromUm(userId) {
  const active = await roleService.getActiveUserRoles(userId);
  return active.map((r) => normalizeRoleSlug(r.role)).filter(Boolean);
}

function hasAny(slugs, allowed) {
  const set = slugs instanceof Set ? slugs : new Set(slugs);
  for (const s of set) {
    if (allowed.has(s)) return true;
  }
  return false;
}

function mergeRoleSlugs(umSlugs, jwtSlugs) {
  return [...new Set([...umSlugs, ...jwtSlugs])];
}

export function normalizeKehadiranViewMode(raw) {
  const value = String(raw ?? '').trim().toLowerCase();
  if (value === 'handled' || value === 'assist' || value === 'asisten') return 'handled';
  if (value === 'mine' || value === 'self' || value === 'praktikan') return 'mine';
  return null;
}

/**
 * Persona efektif untuk scoping data sesuai tab/view yang dipilih.
 */
export function resolveEffectiveScopePersona(persona, viewMode) {
  const view = normalizeKehadiranViewMode(viewMode);
  if (persona === 'praktikan_asisten') {
    return view === 'handled' ? 'asisten' : 'praktikan';
  }
  return persona;
}

function hasStaffRole(slugSet) {
  return [...slugSet].some((slug) => STAFF_ROLES.has(slug));
}

function hasAsistenRole(slugSet, umSet) {
  return hasAny(slugSet, ASISTEN_ROLES) || hasAny(umSet, ASISTEN_ROLES);
}

/**
 * @returns {{ persona: string, userId: string, roleSlugs: string[] }}
 */
export async function resolveKehadiranPersona(user, { nipnimHint } = {}) {
  const userId = String(user?.id ?? '').trim();
  if (!userId) {
    return { persona: 'blocked', userId: '', roleSlugs: [] };
  }

  const umSlugs = await loadRoleSlugsFromUm(userId);
  const jwtSlugs = [...collectJwtRoleSlugs(user)];
  const roleSlugs = mergeRoleSlugs(umSlugs, jwtSlugs);
  const slugSet = new Set(roleSlugs);
  const umSet = new Set(umSlugs);

  const hasExecutive = (set) => hasAny(set, EXECUTIVE_ROLES);

  if (hasExecutive(slugSet)) {
    return { persona: 'executive', userId, roleSlugs };
  }

  const isMahasiswaOnly =
    slugSet.has('mahasiswa') && ![...slugSet].some((s) => STAFF_ROLES.has(s) || ASISTEN_ROLES.has(s));

  if (isMahasiswaOnly) {
    return { persona: 'praktikan', userId, roleSlugs };
  }

  const isPraktikanAsisten =
    slugSet.has('mahasiswa') &&
    hasAsistenRole(slugSet, umSet) &&
    !hasStaffRole(slugSet);

  if (isPraktikanAsisten) {
    return { persona: 'praktikan_asisten', userId, roleSlugs };
  }

  // UM prioritas untuk lab_ops agar JWT `kaur` tidak menimpa role aktif `dosen`.
  if (umSet.size > 0) {
    if (hasAny(slugSet, LAB_OPS_ROLES)) {
      return { persona: 'lab_ops', userId, roleSlugs };
    }
    if (hasAny(umSet, new Set(['dosen', 'dosen_pembina']))) {
      return { persona: 'dosen', userId, roleSlugs };
    }
    if (hasAny(umSet, ASISTEN_ROLES)) {
      return { persona: 'asisten', userId, roleSlugs };
    }
    if (hasAny(umSet, STAFF_ROLES)) {
      return { persona: 'executive', userId, roleSlugs };
    }
  }

  if (hasAny(slugSet, LAB_OPS_ROLES)) {
    return { persona: 'lab_ops', userId, roleSlugs };
  }

  if (hasAny(slugSet, new Set(['dosen', 'dosen_pembina']))) {
    return { persona: 'dosen', userId, roleSlugs };
  }

  if (hasAny(slugSet, ASISTEN_ROLES)) {
    return { persona: 'asisten', userId, roleSlugs };
  }

  if (hasAny(slugSet, STAFF_ROLES)) {
    return { persona: 'executive', userId, roleSlugs };
  }

  return { persona: 'blocked', userId, roleSlugs };
}

async function sessionIdsForPic(userId, nipnimHint) {
  const identifiers = await resolveUserIdentifiers(userId, { nipnimHint });
  if (identifiers.length === 0) return new Set();

  const res = await conductDb.query(
    `SELECT id::text
     FROM practicum_operational_sessions
     WHERE lower(coalesce(pic_user_id, '')) = ANY($1::text[])`,
    [identifiers]
  );
  return new Set(res.rows.map((r) => r.id));
}

async function sessionIdsForAsisten(userId, nipnimHint) {
  const identifiers = await resolveUserIdentifiers(userId, { nipnimHint });
  if (identifiers.length === 0) return new Set();

  const [picRows, activeRows, qrRows] = await Promise.all([
    conductDb.query(
      `SELECT id::text AS operational_session_id
       FROM practicum_operational_sessions
       WHERE lower(coalesce(pic_user_id, '')) = ANY($1::text[])`,
      [identifiers]
    ),
    conductDb.query(
      `SELECT DISTINCT operational_session_id::text AS operational_session_id
       FROM practicum_operational_session_active_assistants
       WHERE lower(coalesce(user_id, '')) = ANY($1::text[])`,
      [identifiers]
    ),
    conductDb.query(
      `SELECT DISTINCT operational_session_id::text AS operational_session_id
       FROM practicum_operational_session_qr_sessions
       WHERE lower(coalesce(generated_by, '')) = ANY($1::text[])`,
      [identifiers]
    ),
  ]);

  return new Set(
    [...picRows.rows, ...activeRows.rows, ...qrRows.rows]
      .map((row) => String(row.operational_session_id ?? '').trim())
      .filter(Boolean)
  );
}

async function sessionIdsForDosen(userId, nipnimHint) {
  const identifiers = await resolveUserIdentifiers(userId, { nipnimHint });
  if (identifiers.length === 0) return new Set();

  const signed = await conductDb.query(
    `SELECT operational_session_id::text
     FROM practicum_baps
     WHERE lower(coalesce(lecturer_signed_by, '')) = ANY($1::text[])`,
    [identifiers]
  );

  const awaiting = await conductDb.query(
    `SELECT operational_session_id::text
     FROM practicum_baps
     WHERE lecturer_signed_at IS NULL`
  );

  return new Set([
    ...signed.rows.map((r) => r.operational_session_id),
    ...awaiting.rows.map((r) => r.operational_session_id),
  ]);
}

async function sessionIdsForMahasiswa(userId, nipnimHint) {
  const identifiers = await resolveUserIdentifiers(userId, { nipnimHint });
  if (identifiers.length === 0) return new Set();

  const res = await conductDb.query(
    `SELECT DISTINCT b.operational_session_id::text AS operational_session_id
     FROM practicum_baps b
     INNER JOIN practicum_bap_attendance_rows r ON r.bap_id = b.id
     WHERE lower(coalesce(r.student_user_id, '')) = ANY($1::text[])
        OR lower(coalesce(r.student_identifier, '')) = ANY($1::text[])`,
    [identifiers]
  );
  return new Set(res.rows.map((r) => r.operational_session_id));
}

/**
 * Filter baris BAP (mapBap output) sesuai persona / view mode.
 */
export async function applySessionScope(rows, persona, userId, nipnimHint, viewMode) {
  if (!rows?.length) return [];
  const scopePersona = resolveEffectiveScopePersona(persona, viewMode);
  if (scopePersona === 'executive' || scopePersona === 'lab_ops') return rows;
  if (scopePersona === 'blocked') return [];

  let allowed = null;
  if (scopePersona === 'asisten') {
    allowed = await sessionIdsForAsisten(userId, nipnimHint);
  } else if (scopePersona === 'dosen') {
    allowed = await sessionIdsForDosen(userId, nipnimHint);
  } else if (scopePersona === 'praktikan') {
    allowed = await sessionIdsForMahasiswa(userId, nipnimHint);
  }

  if (!allowed || allowed.size === 0) return [];

  return rows.filter((row) =>
    allowed.has(String(row.operational_session_id ?? row.id ?? ''))
  );
}

export function applyInboxFilter(rows, inbox) {
  if (!inbox || inbox === 'all') return rows;

  if (inbox === 'needs_review') {
    return rows.filter(
      (r) =>
        r.lecturer_signed_at &&
        String(r.tpa_review_status ?? 'pending').toLowerCase() === 'pending'
    );
  }

  if (inbox === 'low_attendance') {
    return rows.filter((r) => {
      const students = Math.max(Number(r.student_count) || 0, 1);
      const rate = Number(r.present_count || 0) / students;
      return rate < 0.6;
    });
  }

  if (inbox === 'awaiting_lecturer') {
    return rows.filter((r) => !r.lecturer_signed_at);
  }

  if (inbox === 'approved') {
    return rows.filter(
      (r) => String(r.tpa_review_status ?? '').toLowerCase() === 'approved'
    );
  }

  if (inbox === 'pending') {
    return rows.filter(
      (r) =>
        String(r.tpa_review_status ?? 'pending').toLowerCase() === 'pending'
    );
  }

  return rows;
}

/** Hitung jumlah per kotak masuk dari baris scoped (sebelum filter inbox aktif). */
export function computeInboxCounts(rows) {
  const list = rows ?? [];
  return {
    needs_review: applyInboxFilter(list, 'needs_review').length,
    low_attendance: applyInboxFilter(list, 'low_attendance').length,
    awaiting_lecturer: applyInboxFilter(list, 'awaiting_lecturer').length,
    approved: applyInboxFilter(list, 'approved').length,
    pending: applyInboxFilter(list, 'pending').length,
    all: list.length,
  };
}
