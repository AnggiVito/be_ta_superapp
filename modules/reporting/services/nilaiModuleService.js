/**
 * Report Nilai per modul — agregasi nilai conduct + rubrik registrasi.
 */

import { resolveCanonicalPracticumName } from '../config/praktikumCatalog.js';
import {
  round2,
  defaultRubricComponents,
  loadModuleMetadata,
  loadRubricsByModuleId,
  groupGradesByStudentModule,
  groupGradesByModule,
  buildStudentModuleRow,
  buildModuleSummaryRow,
  resolveOverallDisplayMode,
  filterByPracticumName,
  prepareScopedGrades,
} from './nilaiRubricHelpers.js';

export async function listModuleReports(filters = {}, user = null, preloaded = null) {
  const { grades, persona, roleSlugs, scopePersona, resolvedFilters } =
    preloaded ?? (await prepareScopedGrades(filters, user));

  const moduleIds = [...new Set(grades.map((g) => String(g.module_id ?? '').trim()).filter(Boolean))];
  const [metadata, rubrics] = await Promise.all([
    loadModuleMetadata(moduleIds),
    loadRubricsByModuleId(moduleIds),
  ]);

  const isMemberScope = scopePersona === 'praktikan';
  let items = [];

  if (isMemberScope) {
    const grouped = groupGradesByStudentModule(grades);
    items = [...grouped.values()].map((bucket) => {
      const rubric = rubrics.get(bucket.moduleId) || {
        has_stored_config: false,
        rubric_ready: false,
        components: defaultRubricComponents(),
      };
      return buildStudentModuleRow({
        gradeSample: bucket.grades[0],
        moduleId: bucket.moduleId,
        grades: bucket.grades,
        rubric,
        metadata,
      });
    });
  } else {
    const byModule = groupGradesByModule(grades);
    items = [...byModule.entries()].map(([moduleId, moduleGrades]) => {
      const rubric = rubrics.get(moduleId) || {
        has_stored_config: false,
        rubric_ready: false,
        components: defaultRubricComponents(),
      };
      const studentBuckets = groupGradesByStudentModule(moduleGrades);
      const studentRows = [...studentBuckets.values()].map((bucket) =>
        buildStudentModuleRow({
          gradeSample: bucket.grades[0],
          moduleId: bucket.moduleId,
          grades: bucket.grades,
          rubric,
          metadata,
        })
      );
      return buildModuleSummaryRow({
        moduleId,
        grades: moduleGrades,
        rubric,
        metadata,
        studentRows,
      });
    });
  }

  items = filterByPracticumName(items, resolvedFilters.practicumName);
  items.sort((a, b) => {
    const practicumCmp = String(a.practicum_name || '').localeCompare(
      String(b.practicum_name || '')
    );
    if (practicumCmp !== 0) return practicumCmp;
    return String(a.module_name || '').localeCompare(String(b.module_name || ''));
  });

  return {
    display_mode: resolveOverallDisplayMode(items),
    items,
    persona,
    role_slugs: roleSlugs,
    scope_persona: scopePersona,
    period: {
      semester_code: resolvedFilters.semesterCode ?? null,
      label: resolvedFilters.semesterCode
        ? `Semester ${resolvedFilters.semesterCode}`
        : 'Periode aktif belum dikonfigurasi',
    },
  };
}

export async function getModuleDetail(moduleId, filters = {}, user = null) {
  const targetModuleId = String(moduleId ?? '').trim();
  if (!targetModuleId) {
    throw new Error('module_id wajib diisi');
  }

  const { grades, persona, roleSlugs, scopePersona, resolvedFilters } =
    await prepareScopedGrades(filters, user);

  const moduleGrades = grades.filter(
    (g) => String(g.module_id ?? '').trim() === targetModuleId
  );
  if (!moduleGrades.length) {
    throw new Error('Data modul tidak ditemukan atau akses ditolak');
  }

  const [metadata, rubrics] = await Promise.all([
    loadModuleMetadata([targetModuleId]),
    loadRubricsByModuleId([targetModuleId]),
  ]);

  const rubric = rubrics.get(targetModuleId) || {
    has_stored_config: false,
    rubric_ready: false,
    components: defaultRubricComponents(),
  };

  const studentBuckets = groupGradesByStudentModule(moduleGrades);
  let students = [...studentBuckets.values()].map((bucket) =>
    buildStudentModuleRow({
      gradeSample: bucket.grades[0],
      moduleId: bucket.moduleId,
      grades: bucket.grades,
      rubric,
      metadata,
    })
  );

  const studentUserId = String(
    filters.studentUserId ?? filters.student_user_id ?? ''
  ).trim();
  if (studentUserId) {
    students = students.filter(
      (row) => String(row.student_user_id ?? '') === studentUserId
    );
    if (!students.length) {
      throw new Error('Data nilai mahasiswa tidak ditemukan atau akses ditolak');
    }
  }

  students.sort((a, b) =>
    String(a.student_name || '').localeCompare(String(b.student_name || ''))
  );

  const meta = metadata.get(targetModuleId) || {};
  const sample = moduleGrades[0];

  return {
    module_id: targetModuleId,
    module_code: meta.module_code || '',
    module_name: meta.module_name || sample.module_name || '',
    practicum_id: meta.practicum_id || null,
    practicum_name:
      resolveCanonicalPracticumName(sample.practicum_name, sample.module_name)
      ?? meta.practicum_name
      ?? sample.practicum_name
      ?? '',
    display_mode: rubric.rubric_ready ? 'module' : 'session',
    rubric_ready: rubric.rubric_ready,
    has_stored_config: rubric.has_stored_config,
    rubric_components: rubric.components,
    students,
    persona,
    role_slugs: roleSlugs,
    scope_persona: scopePersona,
    period: {
      semester_code: resolvedFilters.semesterCode ?? null,
      label: resolvedFilters.semesterCode
        ? `Semester ${resolvedFilters.semesterCode}`
        : 'Periode aktif belum dikonfigurasi',
    },
  };
}

export function buildModuleAwareSummary(moduleReport, sessionGrades, persona, roleSlugs, filters = {}) {
  const items = moduleReport?.items || [];
  const displayMode = moduleReport?.display_mode || 'session';

  if (displayMode === 'module' && items.length > 0) {
    const isMember = persona === 'praktikan' || moduleReport?.scope_persona === 'praktikan';
    const finals = items
      .map((item) => item.final_score ?? item.average_final_score)
      .filter((v) => v != null);
    const averageScore =
      finals.length > 0
        ? round2(finals.reduce((sum, v) => sum + v, 0) / finals.length)
        : 0;

    const practicumNames = [
      ...new Set(items.map((i) => String(i.practicum_name ?? '').trim()).filter(Boolean)),
    ].sort((a, b) => a.localeCompare(b));

    const base = {
      display_mode: 'module',
      module_count: items.length,
      average_score: averageScore,
      practicum_names: practicumNames,
      persona,
      role_slugs: roleSlugs,
      period: moduleReport?.period || {
        semester_code: filters.semesterCode ?? null,
        label: filters.semesterCode
          ? `Semester ${filters.semesterCode}`
          : 'Periode aktif belum dikonfigurasi',
      },
      grade_count: sessionGrades.length,
      session_count: new Set(
        sessionGrades.map((g) => String(g.operational_session_id ?? '').trim()).filter(Boolean)
      ).size,
    };

    if (isMember) {
      return base;
    }

    const studentIds = new Set(
      sessionGrades.map((g) => String(g.student_user_id ?? '').trim()).filter(Boolean)
    );
    return {
      ...base,
      student_count: studentIds.size,
    };
  }

  const gradeCount = sessionGrades.length;
  const averageScore =
    gradeCount > 0
      ? round2(
          sessionGrades.reduce((sum, g) => sum + Number(g.total_score || 0), 0) / gradeCount
        )
      : 0;
  const sessionIds = new Set(
    sessionGrades.map((g) => String(g.operational_session_id ?? '').trim()).filter(Boolean)
  );
  const practicumNames = [
    ...new Set(sessionGrades.map((g) => String(g.practicum_name ?? '').trim()).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b));

  const base = {
    display_mode: 'session',
    module_count: 0,
    grade_count: gradeCount,
    session_count: sessionIds.size,
    average_score: averageScore,
    practicum_names: practicumNames,
    persona,
    role_slugs: roleSlugs,
    period: moduleReport?.period || {
      semester_code: filters.semesterCode ?? null,
      label: filters.semesterCode
        ? `Semester ${filters.semesterCode}`
        : 'Periode aktif belum dikonfigurasi',
    },
  };

  const studentIds = new Set(
    sessionGrades.map((g) => String(g.student_user_id ?? '').trim()).filter(Boolean)
  );
  if (persona === 'praktikan' || moduleReport?.scope_persona === 'praktikan') {
    return base;
  }
  return { ...base, student_count: studentIds.size };
}
