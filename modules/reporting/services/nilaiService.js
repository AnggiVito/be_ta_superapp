/**
 * Reporting Nilai — read-only dari practicum_student_grades (modul conduct).
 */

import { listGradesForReporting } from '../../conduct/services/practicumAssessmentService.js';
import { nipOrNimFromJwtPayload } from '../../../core/utils/jwtIdentityFromPayload.js';
import { resolveCanonicalPracticumName } from '../config/praktikumCatalog.js';
import {
  resolveNilaiPersona,
  resolveEffectiveScopePersona,
  applyGradeScope,
} from './nilaiScopeService.js';
import { listScopedGrades } from './nilaiGradeLoader.js';
import {
  listModuleReports,
  buildModuleAwareSummary,
} from './nilaiModuleService.js';

export async function listGrades(filters = {}, user = null) {
  const { grades } = await listScopedGrades(filters, user);
  return grades;
}

export async function getSummary(filters = {}, user = null) {
  const scoped = await listScopedGrades(filters, user);
  const moduleReport = await listModuleReports(filters, user, scoped);
  return buildModuleAwareSummary(
    moduleReport,
    scoped.grades,
    scoped.persona,
    scoped.roleSlugs,
    scoped.resolvedFilters
  );
}

export { listModuleReports, getModuleDetail } from './nilaiModuleService.js';

export async function getGradeDetail(gradeId, user = null, options = {}) {
  const nipnimHint = user ? nipOrNimFromJwtPayload(user) : undefined;
  const personaCtx = user
    ? await resolveNilaiPersona(user, { nipnimHint })
    : { persona: 'executive', userId: '' };

  if (personaCtx.persona === 'blocked') {
    throw new Error('Akses laporan nilai tidak tersedia untuk peran ini');
  }

  const scopePersona = resolveEffectiveScopePersona(
    personaCtx.persona,
    options.viewMode
  );

  const rows = await listGradesForReporting({ gradeId });
  if (!rows.length) {
    throw new Error('Data nilai tidak ditemukan');
  }

  const scoped = await applyGradeScope(
    rows,
    personaCtx.persona,
    personaCtx.userId,
    nipnimHint,
    options.viewMode
  );

  if (!scoped.length) {
    throw new Error('Data nilai tidak ditemukan atau akses ditolak');
  }

  const row = scoped[0];
  const canonicalPracticumName = resolveCanonicalPracticumName(
    row.practicum_name,
    row.module_name
  );
  return {
    ...row,
    practicum_name: canonicalPracticumName ?? row.practicum_name,
  };
}
