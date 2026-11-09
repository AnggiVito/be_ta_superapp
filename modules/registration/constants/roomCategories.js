/** Kategori ruangan yang dibutuhkan modul praktikum (selaras dengan kolom DB & kontrak API) */
export const REQUIRED_ROOM_CATEGORIES = Object.freeze([
  'classroom',
  'lab_kelas',
  'lab_komputer',
  'lab_exam',
  'lab_online',
  'lab_workshop',
]);

export const REQUIRED_ROOM_CATEGORY_LABELS = Object.freeze({
  classroom: 'Classroom',
  lab_kelas: 'Lab Kelas',
  lab_komputer: 'Lab Komputer',
  lab_exam: 'Lab Exam',
  lab_online: 'Lab Online',
  lab_workshop: 'Lab Workshop',
});

const _set = new Set(REQUIRED_ROOM_CATEGORIES);

export function isValidRequiredRoomCategory(value) {
  return typeof value === 'string' && _set.has(value);
}
