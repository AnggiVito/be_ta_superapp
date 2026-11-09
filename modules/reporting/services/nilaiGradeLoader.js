/**
 * Muat & scope baris nilai conduct untuk reporting.
 */

import { listGradesForReporting } from '../../conduct/services/practicumAssessmentService.js';
import { resolveFeedbackSemesterScope } from './feedbackSemesterScopeService.js';
import { resolveCanonicalPracticumName } from '../config/praktikumCatalog.js';
import { nipOrNimFromJwtPayload } from '../../../core/utils/jwtIdentityFromPayload.js';
import {
  resolveNilaiPersona,
  resolveEffectiveScopePersona,
  applyGradeScope,
} from './nilaiScopeService.js';

function enrichGradeHeader(grade) {
  const canonicalPracticumName = resolveCanonicalPracticumName(
    grade.practicum_name,
    grade.module_name
  );
  return {
    ...grade,
    practicum_name: canonicalPracticumName ?? grade.practicum_name,
  };
}

async function resolveNilaiFilters(filters = {}) {
  const semesterInput =
    filters.semesterCode ?? filters.semester_code ?? 'active';
  const scope = await resolveFeedbackSemesterScope(semesterInput);
  return {
    ...filters,
    semesterCode: scope.semesterCode,
    scheduleIds: scope.scheduleIds,
  };
}

export async function listScopedGrades(filters = {}, user = null) {
  const resolvedFilters = await resolveNilaiFilters(filters);
  const nipnimHint = filters.nipnimHint || (user ? nipOrNimFromJwtPayload(user) : undefined);
  const personaCtx = user
    ? await resolveNilaiPersona(user, { nipnimHint })
    : { persona: 'executive', userId: '', roleSlugs: [] };

  if (personaCtx.persona === 'blocked') {
    return {
      grades: [],
      persona: personaCtx.persona,
      roleSlugs: personaCtx.roleSlugs,
      scopePersona: 'blocked',
      resolvedFilters,
    };
  }

  const scopePersona = resolveEffectiveScopePersona(
    personaCtx.persona,
    resolvedFilters.viewMode
  );

  let rows = await listGradesForReporting({
    scheduleIds: resolvedFilters.scheduleIds,
    practicumName: resolvedFilters.practicumName,
    limit: resolvedFilters.limit ?? 2000,
  });

  rows = await applyGradeScope(
    rows,
    personaCtx.persona,
    personaCtx.userId,
    nipnimHint,
    resolvedFilters.viewMode
  );

  const grades = rows.map(enrichGradeHeader);

  return {
    grades,
    persona: personaCtx.persona,
    roleSlugs: personaCtx.roleSlugs,
    scopePersona,
    resolvedFilters,
  };
}
