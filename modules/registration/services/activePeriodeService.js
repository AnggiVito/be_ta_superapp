/**
 * Periode aktif sistem — disimpan di registration_settings.
 * Daftar opsi dropdown diambil FE dari Auth FRI Gateway (GET /periodes).
 */

import * as settingsModel from '../models/registrationOperationalSettingsModel.js';
import { logger } from '../../../core/utils/logger.js';

export const ACTIVE_PERIODE_SETTING_KEY = 'active_periode';

/**
 * Normalisasi nilai periode dari string atau object gateway { id?, label? }.
 * Prioritas: label, lalu id.
 */
export function resolvePeriodeLabel(raw) {
  if (raw === null || raw === undefined) {
    return null;
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    return trimmed || null;
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const label = raw.label != null ? String(raw.label).trim() : null;
    const id = raw.id != null ? String(raw.id).trim() : null;
    return label || id || null;
  }
  throw new Error('periode harus berupa string atau object { id?, label? }');
}

/**
 * Normalisasi body request ke bentuk JSON yang disimpan.
 * Menerima string (label/id) atau object { id?, label? }.
 */
export function normalizeActivePeriodeValue(raw) {
  if (raw === null || raw === undefined) {
    return null;
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    return { label: trimmed };
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const periode = raw.periode != null ? String(raw.periode).trim() : null;
    const id = raw.id != null ? String(raw.id).trim() : periode;
    const label = raw.label != null
      ? String(raw.label).trim()
      : raw.name != null
        ? String(raw.name).trim()
        : periode;
    if (!id && !label) return null;
    const out = {};
    if (id) out.id = id;
    if (label) out.label = label;
    if (periode) out.periode = periode;
    return out;
  }
  throw new Error('active_periode harus berupa string atau object { id?, label? }');
}

export async function getActivePeriode() {
  const row = await settingsModel.findSettingByKey(ACTIVE_PERIODE_SETTING_KEY);
  if (!row) {
    return { active_periode: null, updated_at: null };
  }
  return {
    active_periode: row.value ?? null,
    updated_at: row.updated_at ?? null,
  };
}

export async function setActivePeriode(rawValue, updatedBy = null) {
  const normalized = normalizeActivePeriodeValue(rawValue);
  if (!normalized) {
    throw new Error('active_periode wajib diisi (string atau object dengan id/label)');
  }

  const description =
    'Periode akademik aktif sistem (default saat membuat praktikum baru); opsi dropdown dari Auth FRI Gateway GET /periodes';

  const row = await settingsModel.upsertSetting(
    ACTIVE_PERIODE_SETTING_KEY,
    normalized,
    description
  );

  logger.info('Active periode updated', {
    active_periode: normalized,
    updated_by: updatedBy,
  });

  return {
    active_periode: row.value,
    updated_at: row.updated_at,
  };
}
