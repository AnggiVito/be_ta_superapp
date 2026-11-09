import XLSX from 'xlsx';

const TEMPLATE_HEADERS = ['NIM'];

const SAMPLE_ROWS = [['1301220001'], ['1301220002'], ['1301220003']];

const COL_WIDTHS = [{ wch: 18 }];

const SHEET_NAME = 'Asisten Aktif';

export function generateActiveAssistantTemplate() {
  const wb = XLSX.utils.book_new();
  const wsData = [TEMPLATE_HEADERS, ...SAMPLE_ROWS];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws['!cols'] = COL_WIDTHS;
  XLSX.utils.book_append_sheet(wb, ws, SHEET_NAME);
  return wb;
}

export function generateActiveAssistantTemplateBuffer() {
  const wb = generateActiveAssistantTemplate();
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

export { TEMPLATE_HEADERS, SHEET_NAME };
