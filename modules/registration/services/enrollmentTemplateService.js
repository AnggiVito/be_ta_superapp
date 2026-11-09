import XLSX from 'xlsx';

const TEMPLATE_HEADERS = ['NIM', 'Kelas'];

const SAMPLE_ROWS = [
  ['1301220001', 'SI-46-01'],
  ['1301220002', 'SI-46-01'],
  ['1301220003', 'SI-46-02'],
];

const COL_WIDTHS = [{ wch: 18 }, { wch: 16 }];

const SHEET_NAME = 'Praktikan';

/**
 * Generate Excel workbook template for bulk practicum enrollment.
 * @returns {XLSX.WorkBook}
 */
export function generateEnrollmentTemplate() {
  const wb = XLSX.utils.book_new();
  const wsData = [TEMPLATE_HEADERS, ...SAMPLE_ROWS];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws['!cols'] = COL_WIDTHS;
  XLSX.utils.book_append_sheet(wb, ws, SHEET_NAME);
  return wb;
}

/**
 * @returns {Buffer}
 */
export function generateEnrollmentTemplateBuffer() {
  const wb = generateEnrollmentTemplate();
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

export { TEMPLATE_HEADERS, SHEET_NAME };
