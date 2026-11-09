import XLSX from 'xlsx';

const TEMPLATE_HEADERS = [
  'Hari',
  'Detail Kegiatan',
  'Tanggal',
  'Jam Mulai',
  'Jam Berakhir',
  'Hitungan Jam',
  'NIM Asisten',
  'Kelas',
];

const SAMPLE_ROW = [
  'Senin',
  'Praktikum Modul 1',
  '2026-06-01',
  '08:00',
  '10:00',
  2,
  '1301220001, 1301220002',
  'reguler',
];

const COL_WIDTHS = [
  { wch: 12 },
  { wch: 35 },
  { wch: 14 },
  { wch: 12 },
  { wch: 14 },
  { wch: 14 },
  { wch: 28 },
  { wch: 12 },
];

const DEFAULT_MODULE_COUNT = 1;

/**
 * Generate Excel workbook for schedule template.
 * Tiap sheet merepresentasikan satu module ("Modul 1", "Modul 2", ...).
 * Saat di-import, Sheet ke-N akan dipetakan ke practicum_modules urutan sequence ke-N.
 *
 * @param {number} moduleCount - Jumlah sheet yang ingin di-generate. Default 1.
 * @returns {XLSX.WorkBook}
 */
export function generateScheduleTemplate(moduleCount = DEFAULT_MODULE_COUNT) {
  const wb = XLSX.utils.book_new();

  const count = Math.max(1, Math.min(moduleCount, 50));

  for (let i = 1; i <= count; i++) {
    const wsData = [TEMPLATE_HEADERS, SAMPLE_ROW];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = COL_WIDTHS;
    XLSX.utils.book_append_sheet(wb, ws, `Modul ${i}`);
  }

  return wb;
}

/**
 * Generate template as Buffer (untuk di-stream langsung tanpa save ke disk).
 *
 * @param {number} moduleCount
 * @returns {Buffer}
 */
export function generateScheduleTemplateBuffer(moduleCount = DEFAULT_MODULE_COUNT) {
  const wb = generateScheduleTemplate(moduleCount);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

export { TEMPLATE_HEADERS, DEFAULT_MODULE_COUNT };
