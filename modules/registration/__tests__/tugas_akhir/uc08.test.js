import { jest } from '@jest/globals';

// Mock Models
jest.unstable_mockModule('../../models/practicumModel.js', () => ({
  findById: jest.fn(),
}));
jest.unstable_mockModule('../../models/practicumModuleModel.js', () => ({
  findByPracticum: jest.fn(),
}));
jest.unstable_mockModule('../../models/moduleAssessmentModel.js', () => ({
  findModuleIdsWithGrades: jest.fn(),
  replaceComponentsForModule: jest.fn(),
  findComponentsByModuleIds: jest.fn(),
}));
jest.unstable_mockModule('../../../../config/databases.js', () => ({
  registrationDb: {
    connect: jest.fn().mockReturnValue({
      query: jest.fn(),
      release: jest.fn(),
    }),
  },
}));

const practicumModel = await import('../../models/practicumModel.js');
const practicumModuleModel = await import('../../models/practicumModuleModel.js');
const moduleAssessmentModel = await import('../../models/moduleAssessmentModel.js');
const dbModule = await import('../../../../config/databases.js');
const moduleAssessmentService = await import('../../services/moduleAssessmentService.js');

describe('UC-08: Mengelola Komponen Penilaian Praktikum', () => {
  let mockClient;

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = {
      query: jest.fn().mockResolvedValue({ rowCount: 1, rows: [] }),
      release: jest.fn(),
    };
    dbModule.registrationDb.connect.mockReturnValue(mockClient);
    moduleAssessmentModel.findComponentsByModuleIds.mockResolvedValue(new Map());
  });

  test('Asisten Praktikum berhasil mengaktifkan komponen penilaian dan menentukan bobot (total 100%)', async () => {
    practicumModel.findById.mockResolvedValue({ id: 'p-123' });
    practicumModuleModel.findByPracticum.mockResolvedValue([{ id: 'mod-123' }]);
    moduleAssessmentModel.findModuleIdsWithGrades.mockResolvedValue(new Set()); // Belum dinilai/tidak dikunci
    moduleAssessmentModel.replaceComponentsForModule.mockResolvedValue({ success: true });

    const payload = {
      modules: [
        {
          module_id: 'mod-123',
          components: [
            { type: 'tugas_pendahuluan', enabled: true, weight_percent: 30 },
            { type: 'tes_awal', enabled: true, weight_percent: 20 },
            { type: 'jurnal', enabled: true, weight_percent: 30 },
            { type: 'tes_akhir', enabled: true, weight_percent: 20 },
            { type: 'audit', enabled: false, weight_percent: 0 },
          ]
        }
      ]
    };

    const result = await moduleAssessmentService.putModuleAssessmentConfig('p-123', payload);

    expect(result.practicum_id).toBe('p-123');
    expect(moduleAssessmentModel.replaceComponentsForModule).toHaveBeenCalled();
  });

  // Alur Alternatif 6a: Total bobot tidak valid
  test('6a. Penolakan jika total bobot komponen yang aktif tidak sama dengan 100%', async () => {
    practicumModel.findById.mockResolvedValue({ id: 'p-123' });
    practicumModuleModel.findByPracticum.mockResolvedValue([{ id: 'mod-123' }]);
    moduleAssessmentModel.findModuleIdsWithGrades.mockResolvedValue(new Set());

    const payload = {
      modules: [
        {
          module_id: 'mod-123',
          components: [
            { type: 'tugas_pendahuluan', enabled: true, weight_percent: 40 },
            { type: 'tes_awal', enabled: true, weight_percent: 40 }, // Total = 80%, salah!
            { type: 'jurnal', enabled: false, weight_percent: 0 },
            { type: 'tes_akhir', enabled: false, weight_percent: 0 },
            { type: 'audit', enabled: false, weight_percent: 0 },
          ]
        }
      ]
    };

    await expect(
      moduleAssessmentService.putModuleAssessmentConfig('p-123', payload)
    ).rejects.toThrow('harus tepat 100% per modul');
    
    expect(moduleAssessmentModel.replaceComponentsForModule).not.toHaveBeenCalled();
  });

  // Alur Alternatif 6b: Tidak ada komponen aktif
  test('6b. Penolakan jika tidak ada satupun komponen penilaian yang aktif', async () => {
    practicumModel.findById.mockResolvedValue({ id: 'p-123' });
    practicumModuleModel.findByPracticum.mockResolvedValue([{ id: 'mod-123' }]);
    moduleAssessmentModel.findModuleIdsWithGrades.mockResolvedValue(new Set());

    const payload = {
      modules: [
        {
          module_id: 'mod-123',
          components: [
            { type: 'tugas_pendahuluan', enabled: false, weight_percent: 0 },
            { type: 'tes_awal', enabled: false, weight_percent: 0 },
            { type: 'jurnal', enabled: false, weight_percent: 0 },
            { type: 'tes_akhir', enabled: false, weight_percent: 0 },
            { type: 'audit', enabled: false, weight_percent: 0 },
          ]
        }
      ]
    };

    await expect(
      moduleAssessmentService.putModuleAssessmentConfig('p-123', payload)
    ).rejects.toThrow('Minimal satu komponen harus diaktifkan per modul');
  });

  // Alur Alternatif 6c: Konfigurasi terkunci karena nilai sudah diinput
  test('6c. Penolakan jika modul sudah digunakan untuk penilaian (nilai sudah diinput)', async () => {
    practicumModel.findById.mockResolvedValue({ id: 'p-123' });
    practicumModuleModel.findByPracticum.mockResolvedValue([{ id: 'mod-123' }]);
    moduleAssessmentModel.findModuleIdsWithGrades.mockResolvedValue(new Set(['mod-123'])); // Terkunci

    const payload = {
      modules: [
        {
          module_id: 'mod-123',
          components: [
            { type: 'tugas_pendahuluan', enabled: true, weight_percent: 100 },
            { type: 'tes_awal', enabled: false, weight_percent: 0 },
            { type: 'jurnal', enabled: false, weight_percent: 0 },
            { type: 'tes_akhir', enabled: false, weight_percent: 0 },
            { type: 'audit', enabled: false, weight_percent: 0 },
          ]
        }
      ]
    };

    await expect(
      moduleAssessmentService.putModuleAssessmentConfig('p-123', payload)
    ).rejects.toThrow('tidak dapat diubah karena nilai sudah masuk');
    
    expect(moduleAssessmentModel.replaceComponentsForModule).not.toHaveBeenCalled();
  });
});
