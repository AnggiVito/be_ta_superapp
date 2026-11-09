/**
 * Rubric & grade aggregation helpers for Report Nilai per modul.
 */

import { registrationDb } from '../../../config/databases.js';
import { ASSESSMENT_COMPONENT_TYPES } from '../../registration/constants/moduleAssessmentConstants.js';
import * as moduleAssessmentModel from '../../registration/models/moduleAssessmentModel.js';
import { resolveCanonicalPracticumName } from '../config/praktikumCatalog.js';
import { listScopedGrades } from './nilaiGradeLoader.js';

const COMPONENT_LABELS = {
  tugas_pendahuluan: 'Preliminary Task',
  tes_awal: 'Initial Test',
  jurnal: 'Lab Work',
  tes_akhir: 'Final Test',
  audit: 'Audit',
};

const CONDUCT_NAME_TO_TYPE = new Map([
  ['preliminary assignment', 'tugas_pendahuluan'],
  ['preliminary task', 'tugas_pendahuluan'],
  ['tugas pendahuluan', 'tugas_pendahuluan'],
  ['pre-test', 'tes_awal'],
  ['initial test', 'tes_awal'],
  ['tes awal', 'tes_awal'],
  ['journal', 'jurnal'],
  ['lab work', 'jurnal'],
  ['jurnal', 'jurnal'],
  ['post-test', 'tes_akhir'],
  ['final test', 'tes_akhir'],
  ['tes akhir', 'tes_akhir'],
  ['audit', 'audit'],
]);

export function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function round2(value) {
  return Math.round(toNumber(value) * 100) / 100;
}

function resolveComponentType(componentName) {
  const key = String(componentName ?? '').trim().toLowerCase();
  return CONDUCT_NAME_TO_TYPE.get(key) || null;
}

export function defaultRubricComponents() {
  return ASSESSMENT_COMPONENT_TYPES.map((type) => ({
    component_type: type,
    label: COMPONENT_LABELS[type] || type,
    enabled: false,
    weight_percent: 0,
  }));
}

function mergeRubricComponents(storedList) {
  const byType = new Map((storedList || []).map((r) => [r.component_type, r]));
  return ASSESSMENT_COMPONENT_TYPES.map((type) => {
    const stored = byType.get(type);
    if (!stored) {
      return {
        component_type: type,
        label: COMPONENT_LABELS[type] || type,
        enabled: false,
        weight_percent: 0,
      };
    }
    return {
      component_type: type,
      label: COMPONENT_LABELS[type] || type,
      enabled: Boolean(stored.enabled),
      weight_percent: toNumber(stored.weight_percent),
    };
  });
}

function isRubricReady(components) {
  if (!components?.length) return false;
  const enabled = components.filter((c) => c.enabled && c.weight_percent > 0);
  if (enabled.length === 0) return false;
  const total = enabled.reduce((sum, c) => sum + c.weight_percent, 0);
  return total === 100;
}

function extractComponentScores(grades) {
  const sorted = [...grades].sort((a, b) => {
    const ad = new Date(a.submitted_at || 0).getTime();
    const bd = new Date(b.submitted_at || 0).getTime();
    return bd - ad;
  });

  const scores = new Map();
  for (const grade of sorted) {
    for (const comp of grade.components || []) {
      const type = resolveComponentType(comp.component_name);
      if (!type || scores.has(type)) continue;
      const maxScore = toNumber(comp.max_score);
      const score = toNumber(comp.score);
      const percentage =
        maxScore > 0
          ? round2((score / maxScore) * 100)
          : round2(toNumber(comp.percentage));
      scores.set(type, {
        score,
        max_score: maxScore > 0 ? maxScore : 100,
        percentage,
        grade_id: grade.id,
        submitted_at: grade.submitted_at,
      });
    }
  }
  return scores;
}

function buildComponentPayload(rubricComponents, scoreMap) {
  return rubricComponents.map((rubric) => {
    const hit = scoreMap.get(rubric.component_type);
    return {
      component_type: rubric.component_type,
      label: rubric.label,
      enabled: rubric.enabled,
      weight_percent: rubric.weight_percent,
      has_score: Boolean(hit),
      score: hit ? hit.score : null,
      max_score: hit ? hit.max_score : 100,
      percentage: hit ? hit.percentage : null,
      grade_id: hit?.grade_id ?? null,
      submitted_at: hit?.submitted_at ?? null,
    };
  });
}

function computeFinalScore(rubricComponents, scoreMap) {
  const enabled = rubricComponents.filter((c) => c.enabled && c.weight_percent > 0);
  if (enabled.length === 0) return null;

  let total = 0;
  for (const rubric of enabled) {
    const hit = scoreMap.get(rubric.component_type);
    if (!hit || hit.percentage == null) return null;
    total += (hit.percentage * rubric.weight_percent) / 100;
  }
  return round2(total);
}

export async function loadModuleMetadata(moduleIds) {
  const ids = [...new Set(moduleIds.map((id) => String(id).trim()).filter(Boolean))];
  if (ids.length === 0) return new Map();

  const result = await registrationDb.query(
    `SELECT
       pm.id AS module_id,
       pm.code AS module_code,
       pm.name AS module_name,
       pm.practicum_id,
       COALESCE(p.name, '') AS practicum_name
     FROM practicum_modules pm
     LEFT JOIN practicums p ON p.id = pm.practicum_id
     WHERE pm.id = ANY($1::uuid[])`,
    [ids]
  );

  return new Map(
    result.rows.map((row) => [
      String(row.module_id),
      {
        module_id: String(row.module_id),
        module_code: row.module_code || '',
        module_name: row.module_name || '',
        practicum_id: row.practicum_id ? String(row.practicum_id) : null,
        practicum_name: resolveCanonicalPracticumName(row.practicum_name, row.module_name)
          ?? row.practicum_name
          ?? '',
      },
    ])
  );
}

export async function loadRubricsByModuleId(moduleIds) {
  const stored = await moduleAssessmentModel.findComponentsByModuleIds(moduleIds);
  const map = new Map();
  for (const id of moduleIds) {
    const key = String(id);
    const list = stored.get(key) || [];
    const components = list.length > 0 ? mergeRubricComponents(list) : defaultRubricComponents();
    map.set(key, {
      has_stored_config: list.length > 0,
      rubric_ready: isRubricReady(components),
      components,
    });
  }
  return map;
}

export function groupGradesByStudentModule(grades) {
  const map = new Map();
  for (const grade of grades) {
    const moduleId = String(grade.module_id ?? '').trim();
    const studentId = String(grade.student_user_id ?? '').trim();
    if (!moduleId || !studentId) continue;
    const key = `${studentId}::${moduleId}`;
    const bucket = map.get(key) || { studentId, moduleId, grades: [] };
    bucket.grades.push(grade);
    map.set(key, bucket);
  }
  return map;
}

export function groupGradesByModule(grades) {
  const map = new Map();
  for (const grade of grades) {
    const moduleId = String(grade.module_id ?? '').trim();
    if (!moduleId) continue;
    const bucket = map.get(moduleId) || [];
    bucket.push(grade);
    map.set(moduleId, bucket);
  }
  return map;
}

export function buildStudentModuleRow({ gradeSample, moduleId, grades, rubric, metadata }) {
  const rubricComponents = rubric.components;
  const rubricReady = rubric.rubric_ready;
  const scoreMap = extractComponentScores(grades);
  const components = buildComponentPayload(rubricComponents, scoreMap);
  const finalScore = rubricReady ? computeFinalScore(rubricComponents, scoreMap) : null;
  const displayMode = rubricReady ? 'module' : 'session';

  const meta = metadata.get(moduleId) || {};
  const canonicalPracticum = resolveCanonicalPracticumName(
    gradeSample.practicum_name,
    gradeSample.module_name
  );

  return {
    module_id: moduleId,
    module_code: meta.module_code || '',
    module_name: meta.module_name || gradeSample.module_name || '',
    practicum_id: meta.practicum_id || null,
    practicum_name: canonicalPracticum ?? meta.practicum_name ?? gradeSample.practicum_name ?? '',
    student_user_id: gradeSample.student_user_id,
    student_name: gradeSample.student_name,
    student_identifier: gradeSample.student_identifier,
    display_mode: displayMode,
    rubric_ready: rubricReady,
    has_stored_config: rubric.has_stored_config,
    final_score: finalScore,
    components,
    session_grades: displayMode === 'session' ? grades : [],
    session_count: new Set(grades.map((g) => g.operational_session_id)).size,
  };
}

export function buildModuleSummaryRow({ moduleId, grades, rubric, metadata, studentRows }) {
  const meta = metadata.get(moduleId) || {};
  const sample = grades[0] || {};
  const canonicalPracticum = resolveCanonicalPracticumName(
    sample.practicum_name,
    sample.module_name
  );

  const finals = studentRows
    .map((row) => row.final_score)
    .filter((v) => v != null);
  const averageFinal =
    finals.length > 0
      ? round2(finals.reduce((sum, v) => sum + v, 0) / finals.length)
      : null;

  return {
    module_id: moduleId,
    module_code: meta.module_code || '',
    module_name: meta.module_name || sample.module_name || '',
    practicum_id: meta.practicum_id || null,
    practicum_name: canonicalPracticum ?? meta.practicum_name ?? sample.practicum_name ?? '',
    display_mode: rubric.rubric_ready ? 'module' : 'session',
    rubric_ready: rubric.rubric_ready,
    has_stored_config: rubric.has_stored_config,
    student_count: studentRows.length,
    graded_student_count: finals.length,
    average_final_score: averageFinal,
    session_count: new Set(grades.map((g) => g.operational_session_id)).size,
    grade_count: grades.length,
    rubric_components: rubric.components,
  };
}

export function resolveOverallDisplayMode(items) {
  if (!items.length) return 'session';
  return items.some((item) => item.display_mode === 'module') ? 'module' : 'session';
}

export function filterByPracticumName(items, practicumName) {
  if (!practicumName) return items;
  const target = String(practicumName).trim().toLowerCase();
  return items.filter((item) => {
    const candidates = [item.practicum_name, item.module_name]
      .map((v) => String(v ?? '').trim().toLowerCase())
      .filter(Boolean);
    return candidates.some((v) => v === target || v.includes(target));
  });
}

export async function prepareScopedGrades(filters = {}, user = null) {
  const { grades, persona, roleSlugs, scopePersona, resolvedFilters } =
    await listScopedGrades(filters, user);
  return { grades, persona, roleSlugs, scopePersona, resolvedFilters };
}
