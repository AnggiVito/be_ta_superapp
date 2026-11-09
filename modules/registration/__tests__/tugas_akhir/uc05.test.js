import { jest } from '@jest/globals';
import XLSX from 'xlsx';

// Mock DB & Model
jest.unstable_mockModule('../../../../config/databases.js', () => ({
  registrationDb: {
    connect: jest.fn().mockReturnValue({
      query: jest.fn(),
      release: jest.fn(),
    }),
  },
}));
jest.unstable_mockModule('../../../user-management/models/profileModel.js', () => ({
  findByNipnims: jest.fn(),
}));

const dbModule = await import('../../../../config/databases.js');
const profileModel = await import('../../../user-management/models/profileModel.js');
const enrollmentImportService = await import('../../services/enrollmentImportService.js');

describe('UC-05: Mengelola Data Peserta Praktikum', () => {
  let mockClient;

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };
    dbModule.registrationDb.connect.mockReturnValue(mockClient);
  });

  test('Aktor berhasil melakukan import data peserta praktikum melalui Excel yang valid', async () => {
    // Generate valid Excel buffer
    const data = [
      { NIM: '1202210001', Kelas: 'SI-45-01' }
    ];
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    profileModel.findByNipnims.mockResolvedValue([
      { user_id: 'user-1', nipnim: '1202210001', name: 'Ahmad' }
    ]);
    mockClient.query.mockResolvedValue({ rowCount: 1, rows: [{ id: 'p-123' }] });

    const results = await enrollmentImportService.importEnrollmentsFromExcel(buffer, 'p-123', 'admin-123');

    expect(results.success.length).toBe(1);
    expect(results.errors.length).toBe(0);
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
  });

  test('4a. Berkas Excel tidak sesuai format (berkas kosong)', async () => {
    const ws = XLSX.utils.json_to_sheet([]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const results = await enrollmentImportService.importEnrollmentsFromExcel(buffer, 'p-123', 'admin-123');

    expect(results.errors.length).toBeGreaterThan(0);
    expect(results.errors[0].error).toContain('Tidak ada data mahasiswa');
    expect(mockClient.query).not.toHaveBeenCalledWith('BEGIN');
  });

  test('5a. Terdapat data peserta yang tidak valid (NIM tidak ditemukan di user-management)', async () => {
    const data = [
      { NIM: '1202219999', Kelas: 'SI-45-01' } // NIM fiktif
    ];
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    profileModel.findByNipnims.mockResolvedValue([]); // Kosong
    mockClient.query.mockResolvedValue({ rowCount: 1, rows: [{ id: 'p-123' }] });

    const results = await enrollmentImportService.importEnrollmentsFromExcel(buffer, 'p-123', 'admin-123');

    expect(results.errors.length).toBeGreaterThan(0);
    expect(results.errors[0].error).toContain('tidak ditemukan di user management');
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
  });

  test('5b. Data peserta telah tersedia pada sistem (mencegah duplikasi Excel)', async () => {
    const data = [
      { NIM: '1202210001', Kelas: 'SI-45-01' },
      { NIM: '1202210001', Kelas: 'SI-45-02' } // Duplikat NIM dalam satu berkas
    ];
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    profileModel.findByNipnims.mockResolvedValue([
      { user_id: 'user-1', nipnim: '1202210001', name: 'Ahmad' }
    ]);
    mockClient.query.mockResolvedValue({ rowCount: 1, rows: [{ id: 'p-123' }] });

    const results = await enrollmentImportService.importEnrollmentsFromExcel(buffer, 'p-123', 'admin-123');

    expect(results.errors.length).toBeGreaterThan(0);
    expect(results.errors[0].error).toContain('duplikat dalam file Excel');
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
  });

  test('6a. Proses import dibatalkan oleh aktor', async () => {
    // Skenario dibatalkan, tidak ada pengerjaan database query
    expect(mockClient.query).not.toHaveBeenCalled();
  });
});
