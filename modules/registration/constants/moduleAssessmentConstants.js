/** Slug komponen penilaian (selaras dengan kontrak frontend / API) */
export const ASSESSMENT_COMPONENT_TYPES = Object.freeze([
  'tugas_pendahuluan',
  'tes_awal',
  'jurnal',
  'tes_akhir',
  'audit',
]);

const _set = new Set(ASSESSMENT_COMPONENT_TYPES);

export function isValidComponentType(type) {
  return typeof type === 'string' && _set.has(type);
}
