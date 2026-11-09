import { registrationDb } from '../../../config/databases.js';
import * as practicumModuleModel from '../models/practicumModuleModel.js';
import * as practicumModel from '../models/practicumModel.js';
import * as moduleAssessmentModel from '../models/moduleAssessmentModel.js';
import {
  ASSESSMENT_COMPONENT_TYPES,
  isValidComponentType,
} from '../constants/moduleAssessmentConstants.js';

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function defaultComponents() {
  return ASSESSMENT_COMPONENT_TYPES.map((type) => ({
    type,
    enabled: false,
    weight_percent: 0,
  }));
}

function mergeStoredWithDefaults(storedList) {
  const byType = new Map((storedList || []).map((r) => [r.component_type, r]));
  return ASSESSMENT_COMPONENT_TYPES.map((type) => {
    const s = byType.get(type);
    if (!s) {
      return { type, enabled: false, weight_percent: 0 };
    }
    return {
      type,
      enabled: Boolean(s.enabled),
      weight_percent: Number(s.weight_percent),
    };
  });
}

/**
 * GET konfigurasi komponen penilaian: satu entri per modul pada praktikum (sinkron dengan daftar modul).
 * @param {string} practicumId
 */
export async function getModuleAssessmentConfig(practicumId) {
  const practicum = await practicumModel.findById(practicumId);
  if (!practicum) {
    throw httpError(404, 'Praktikum tidak ditemukan');
  }

  const modules = await practicumModuleModel.findByPracticum(practicumId);
  if (modules.length === 0) {
    return {
      practicum_id: practicumId,
      modules: [],
    };
  }

  const moduleIds = modules.map((m) => m.id);
  const [byModule, lockedIds] = await Promise.all([
    moduleAssessmentModel.findComponentsByModuleIds(moduleIds),
    moduleAssessmentModel.findModuleIdsWithGrades(moduleIds),
  ]);

  const payloadModules = modules.map((m) => {
    const stored = byModule.get(m.id) || [];
    const has_stored_config = stored.length > 0;
    const locked = lockedIds.has(m.id);
    return {
      module_id: m.id,
      practicum_id: m.practicum_id,
      code: m.code,
      name: m.name,
      description: m.description ?? null,
      is_individual_mentoring: m.is_individual_mentoring ?? false,
      mentoring_duration_minutes: m.mentoring_duration_minutes ?? null,
      locked,
      editable: !locked,
      lock_reason: locked ? 'Rubrik modul sudah digunakan untuk penilaian dan tidak dapat diubah.' : null,
      has_stored_config,
      components: has_stored_config ? mergeStoredWithDefaults(stored) : defaultComponents(),
    };
  });

  return {
    practicum_id: practicumId,
    modules: payloadModules,
  };
}

/**
 * Validasi & normalisasi satu modul dari body PUT.
 * @returns {{ type: string, enabled: boolean, weight_percent: number }[]}
 */
function validateModulePayload(moduleId, componentsRaw) {
  if (!Array.isArray(componentsRaw)) {
    throw httpError(400, `components untuk modul ${moduleId} harus berupa array`);
  }

  const byType = new Map();
  for (const c of componentsRaw) {
    const type = c.type ?? c.component_type;
    if (!isValidComponentType(type)) {
      throw httpError(400, `Tipe komponen tidak valid: ${type}`);
    }
    if (byType.has(type)) {
      throw httpError(400, `Duplikat komponen: ${type}`);
    }
    const enabled = Boolean(c.enabled);
    let weight = c.weight_percent;
    if (weight === undefined || weight === null) {
      throw httpError(400, `weight_percent wajib untuk ${type}`);
    }
    weight = Number(weight);
    if (!Number.isInteger(weight) || weight < 0 || weight > 100) {
      throw httpError(400, `weight_percent harus integer 0–100 untuk ${type}`);
    }
    byType.set(type, { type, enabled, weight_percent: enabled ? weight : 0 });
  }

  if (byType.size !== ASSESSMENT_COMPONENT_TYPES.length) {
    throw httpError(400, 'Setiap modul harus menyertakan tepat lima komponen (semua tipe)');
  }

  for (const t of ASSESSMENT_COMPONENT_TYPES) {
    if (!byType.has(t)) {
      throw httpError(400, `Komponen wajib hilang: ${t}`);
    }
  }

  const rows = ASSESSMENT_COMPONENT_TYPES.map((t) => byType.get(t));
  const enabledRows = rows.filter((r) => r.enabled);
  if (enabledRows.length === 0) {
    throw httpError(400, 'Minimal satu komponen harus diaktifkan per modul');
  }

  const sum = enabledRows.reduce((acc, r) => acc + r.weight_percent, 0);
  if (sum !== 100) {
    throw httpError(400, 'Jumlah weight_percent pada komponen yang aktif harus tepat 100% per modul');
  }

  return rows;
}

/**
 * PUT bulk konfigurasi komponen penilaian.
 * @param {string} practicumIdFromPath
 * @param {{ practicum_id?: string, modules: { module_id: string, components: any[] }[] }} body
 */
export async function putModuleAssessmentConfig(practicumIdFromPath, body) {
  const practicum = await practicumModel.findById(practicumIdFromPath);
  if (!practicum) {
    throw httpError(404, 'Praktikum tidak ditemukan');
  }

  if (body?.practicum_id && String(body.practicum_id) !== String(practicumIdFromPath)) {
    throw httpError(400, 'practicum_id pada body tidak cocok dengan path');
  }

  const modulesPayload = body?.modules;
  if (!Array.isArray(modulesPayload) || modulesPayload.length === 0) {
    throw httpError(400, 'modules harus berupa array tidak kosong');
  }

  const existingModules = await practicumModuleModel.findByPracticum(practicumIdFromPath);
  const allowedIds = new Set(existingModules.map((m) => m.id));

  const moduleIds = modulesPayload.map((m) => m.module_id).filter(Boolean);
  const lockedIds = await moduleAssessmentModel.findModuleIdsWithGrades(moduleIds);

  const normalized = [];
  for (const entry of modulesPayload) {
    const moduleId = entry.module_id;
    if (!moduleId || !allowedIds.has(moduleId)) {
      throw httpError(400, 'module_id tidak valid atau bukan milik praktikum ini');
    }
    if (lockedIds.has(moduleId)) {
      throw httpError(
        409,
        `Konfigurasi komponen penilaian untuk modul ${moduleId} tidak dapat diubah karena nilai sudah masuk`
      );
    }
    const rows = validateModulePayload(moduleId, entry.components);
    normalized.push({ moduleId, rows });
  }

  const client = await registrationDb.connect();
  try {
    await client.query('BEGIN');
    for (const { moduleId, rows } of normalized) {
      await moduleAssessmentModel.replaceComponentsForModule(client, moduleId, rows);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  return getModuleAssessmentConfig(practicumIdFromPath);
}
