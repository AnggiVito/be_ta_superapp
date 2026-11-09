/**
 * Normalize role identifiers from JWT/user-management payloads so comparisons
 * match DB slugs (`koordinator_asisten`, `dosen_pembina`, …).
 */

export function normalizeRoleSlug(raw) {
  if (raw == null || raw === '') return '';

  let s = String(raw).toLowerCase().trim();

  if (s === 'kaur' || s === 'kaur-lab' || s === 'kaur_lab' || s === 'kaur lab') {
    return 'kaur_lab';
  }

  s = s.replace(/[\s-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  return s;
}
