/**
 * Logika bisnis praktikum — periode akademik & integrasi periode aktif.
 */

import * as activePeriodeService from './activePeriodeService.js';

export const ACTIVE_PERIODE_QUERY = 'active';

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
 * Ambil string periode untuk kolom practicums.periode.
 * @param {string|object|null|undefined} requestPeriode - dari body.periode
 */
export async function resolvePracticumPeriode(requestPeriode) {
  const fromRequest = resolvePeriodeLabel(requestPeriode);
  if (fromRequest) {
    return fromRequest;
  }

  const { active_periode } = await activePeriodeService.getActivePeriode();
  const fromActive = resolvePeriodeLabel(active_periode);
  if (fromActive) {
    return fromActive;
  }

  return null;
}

/**
 * Untuk query list: nilai ?periode= atau ?periode=active
 */
export async function resolveListPeriodeFilter(periodeQuery) {
  if (periodeQuery === undefined || periodeQuery === null || periodeQuery === '') {
    return { filter: null, useActiveDefault: false };
  }

  const trimmed = String(periodeQuery).trim();
  if (!trimmed) {
    return { filter: null, useActiveDefault: false };
  }

  if (trimmed.toLowerCase() === ACTIVE_PERIODE_QUERY) {
    const resolved = await resolvePracticumPeriode(null);
    if (!resolved) {
      const err = new Error('Periode aktif belum dikonfigurasi');
      err.code = 'ACTIVE_PERIODE_NOT_CONFIGURED';
      throw err;
    }
    return { filter: resolved, useActiveDefault: true };
  }

  return { filter: trimmed, useActiveDefault: false };
}

export function defaultPracticumCode(name) {
  const slug = String(name || '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
  return (slug || 'PRACT').slice(0, 32);
}

export function isPgUniqueViolation(err) {
  return err && (err.code === '23505' || err.constraint === 'uq_practicums_lab_name_periode');
}
