import { jest } from '@jest/globals';
import XLSX from 'xlsx';

jest.unstable_mockModule('../models/activeAssistantModel.js', () => ({
  replaceForPracticum: jest.fn(),
}));

jest.unstable_mockModule('../../user-management/models/profileModel.js', () => ({
  findByNipnims: jest.fn(),
}));

jest.unstable_mockModule('../services/activeAssistantService.js', () => ({
  requirePracticumAssignmentContext: jest.fn(),
  applyActiveAssistantRolesOnAssignment: jest.fn(),
}));

jest.unstable_mockModule('../../../config/databases.js', () => ({
  registrationDb: {
    connect: jest.fn(),
  },
}));

const activeAssistantModel = await import('../models/activeAssistantModel.js');
const profileModel = await import('../../user-management/models/profileModel.js');
const {
  requirePracticumAssignmentContext,
  applyActiveAssistantRolesOnAssignment,
} = await import('../services/activeAssistantService.js');
const { registrationDb } = await import('../../../config/databases.js');
const { importActiveAssistantsFromExcel } = await import('../services/activeAssistantImportService.js');

function buildWorkbook(rows) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([['NIM'], ...rows.map((nim) => [nim])]);
  XLSX.utils.book_append_sheet(wb, ws, 'Asisten Aktif');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

describe('activeAssistantImportService', () => {
  const mockClient = {
    query: jest.fn(),
    release: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    registrationDb.connect.mockResolvedValue(mockClient);
    mockClient.query.mockImplementation(async (sql) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
        return { rows: [] };
      }
      return { rows: [] };
    });
    requirePracticumAssignmentContext.mockResolvedValue({
      active_periode: { id: 'p-1', label: '2025/2026 Ganjil' },
      periode_key: 'p-1',
      periode_label: '2025/2026 Ganjil',
      practicum_id: 'prac-1',
      practicum: { id: 'prac-1', name: 'Praktikum A', periode: '2025/2026 Ganjil' },
    });
    profileModel.findByNipnims.mockResolvedValue([
      { user_id: 'user-1', nipnim: '1301220001', name: 'Asisten Satu' },
      { user_id: 'user-2', nipnim: '1301220002', name: 'Asisten Dua' },
    ]);
    activeAssistantModel.replaceForPracticum.mockResolvedValue([
      { id: 'a-1', user_id: 'user-1', nim: '1301220001', practicum_id: 'prac-1' },
      { id: 'a-2', user_id: 'user-2', nim: '1301220002', practicum_id: 'prac-1' },
    ]);
    applyActiveAssistantRolesOnAssignment.mockResolvedValue(undefined);
  });

  test('imports valid rows for selected practicum and assigns roles immediately', async () => {
    const buffer = buildWorkbook(['1301220001', '1301220002']);
    const result = await importActiveAssistantsFromExcel(buffer, 'prac-1', 'admin-1');

    expect(result.errors).toEqual([]);
    expect(result.success).toHaveLength(2);
    expect(result.practicum_id).toBe('prac-1');
    expect(activeAssistantModel.replaceForPracticum).toHaveBeenCalledWith(
      'prac-1',
      'p-1',
      '2025/2026 Ganjil',
      { id: 'p-1', label: '2025/2026 Ganjil' },
      [
        { user_id: 'user-1', nim: '1301220001' },
        { user_id: 'user-2', nim: '1301220002' },
      ],
      'admin-1',
      mockClient
    );
    expect(applyActiveAssistantRolesOnAssignment).toHaveBeenCalledWith(
      ['user-1', 'user-2'],
      'admin-1'
    );
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
  });

  test('returns row errors without persisting when NIM is unknown', async () => {
    profileModel.findByNipnims.mockResolvedValue([
      { user_id: 'user-1', nipnim: '1301220001', name: 'Asisten Satu' },
    ]);
    const buffer = buildWorkbook(['1301220001', '9999999999']);
    const result = await importActiveAssistantsFromExcel(buffer, 'prac-1', 'admin-1');

    expect(result.success).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toContain('9999999999');
    expect(activeAssistantModel.replaceForPracticum).not.toHaveBeenCalled();
    expect(applyActiveAssistantRolesOnAssignment).not.toHaveBeenCalled();
  });

  test('rejects duplicate NIM in file', async () => {
    const buffer = buildWorkbook(['1301220001', '1301220001']);
    const result = await importActiveAssistantsFromExcel(buffer, 'prac-1', 'admin-1');

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toContain('duplikat');
  });
});
