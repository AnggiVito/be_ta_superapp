/**
 * Scope & persona Report Nilai — selaras kehadiran (reuse persona resolver).
 */

import { conductDb } from '../../../config/databases.js';
import { resolveUserIdentifiers } from '../../conduct/utils/resolveUserIdentifiers.js';
import {
  resolveKehadiranPersona,
  resolveEffectiveScopePersona,
  normalizeKehadiranViewMode,
} from './kehadiranScopeService.js';

export {
  resolveKehadiranPersona as resolveNilaiPersona,
  resolveEffectiveScopePersona,
  normalizeKehadiranViewMode as normalizeNilaiViewMode,
};

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

/**
 * Filter baris nilai sesuai persona / view mode.
 */
export async function applyGradeScope(rows, persona, userId, nipnimHint, viewMode) {
  if (!rows?.length) return [];
  const scopePersona = resolveEffectiveScopePersona(persona, viewMode);
  if (scopePersona === 'executive' || scopePersona === 'lab_ops' || scopePersona === 'dosen') {
    return rows;
  }
  if (scopePersona === 'blocked') return [];

  if (scopePersona === 'praktikan') {
    const identifiers = new Set(
      (await resolveUserIdentifiers(userId, { nipnimHint }))
        .map((id) => String(id).toLowerCase())
        .filter(Boolean)
    );
    identifiers.add(String(userId).toLowerCase());
    return rows.filter((row) => {
      const studentId = String(row.student_user_id ?? '').toLowerCase();
      const studentNim = String(row.student_identifier ?? '').toLowerCase();
      return identifiers.has(studentId) || (studentNim && identifiers.has(studentNim));
    });
  }

  if (scopePersona === 'asisten') {
    const allowedSessions = await sessionIdsForAsisten(userId, nipnimHint);
    const graderId = String(userId).toLowerCase();
    return rows.filter((row) => {
      const sessionId = String(row.operational_session_id ?? '');
      const gradedBy = String(row.grader_user_id ?? '').toLowerCase();
      return allowedSessions.has(sessionId) || gradedBy === graderId;
    });
  }

  return [];
}
