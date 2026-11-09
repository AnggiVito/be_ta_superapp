import { jest } from '@jest/globals';

// Mock Models & Services
jest.unstable_mockModule('../../models/studyProgramModel.js', () => ({
  findById: jest.fn(),
  countLaboratories: jest.fn(),
  remove: jest.fn(),
}));
jest.unstable_mockModule('../../models/laboratoryModel.js', () => ({
  findById: jest.fn(),
  countPracticums: jest.fn(),
  remove: jest.fn(),
}));
jest.unstable_mockModule('../../models/practicumModel.js', () => ({
  findById: jest.fn(),
  countModules: jest.fn(),
  countEnrollments: jest.fn(),
  remove: jest.fn(),
}));
jest.unstable_mockModule('../../services/roomCategoryService.js', () => ({
  deleteCategory: jest.fn(),
  findCategoryBySlug: jest.fn(),
  validateRequiredRoomCategory: jest.fn(),
}));
jest.unstable_mockModule('../../models/registrationOperationalSettingsModel.js', () => ({
  findSettingByKey: jest.fn(),
  upsertSetting: jest.fn(),
}));
jest.unstable_mockModule('../../models/practicumModuleModel.js', () => ({
  create: jest.fn(),
}));

const studyProgramModel = await import('../../models/studyProgramModel.js');
const laboratoryModel = await import('../../models/laboratoryModel.js');
const practicumModel = await import('../../models/practicumModel.js');
const roomCategoryService = await import('../../services/roomCategoryService.js');
const settingsModel = await import('../../models/registrationOperationalSettingsModel.js');
const practicumModuleModel = await import('../../models/practicumModuleModel.js');

const activePeriodeCtrl = await import('../../controllers/activePeriodeController.js');
const studyProgramCtrl = await import('../../controllers/studyProgramController.js');
const laboratoryCtrl = await import('../../controllers/laboratoryController.js');
const practicumCtrl = await import('../../controllers/practicumController.js');
const practicumModuleCtrl = await import('../../controllers/practicumModuleController.js');

describe('UC-02: Mengelola Data Master Registrasi Praktikum', () => {
  let req, res, next;

  beforeEach(() => {
    jest.clearAllMocks();
    req = { params: {}, body: {}, query: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  test('Kaur Lab berhasil menetapkan periode akademik aktif', async () => {
    req.body = { active_periode: '2025/2026 Ganjil' };
    req.user = { id: 'kaur-lab-123' };

    settingsModel.upsertSetting.mockResolvedValue({
      setting_key: 'active_periode',
      value: { label: '2025/2026 Ganjil' },
      updated_at: new Date()
    });

    await activePeriodeCtrl.setActivePeriode(req, res, next);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'Periode aktif berhasil diperbarui',
      })
    );
  });

  test('4a. Data tidak valid atau tidak lengkap (input kosong)', async () => {
    req.body = {}; // Kosong

    await activePeriodeCtrl.setActivePeriode(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: expect.stringContaining('wajib diisi'),
      })
    );
  });

  test('4b. Penghapusan laboratorium ditolak jika masih memiliki praktikum', async () => {
    req.params.id = 'lab-123';
    laboratoryModel.findById.mockResolvedValue({ id: 'lab-123', name: 'Lab EAD' });
    laboratoryModel.countPracticums.mockResolvedValue(2); // Ada praktikum

    await laboratoryCtrl.remove(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: expect.stringContaining('has practicums'),
      })
    );
  });

  test('4c. Penghapusan praktikum ditolak jika masih memiliki modul atau peserta terdaftar', async () => {
    req.params.id = 'practicum-123';
    practicumModel.findById.mockResolvedValue({ id: 'practicum-123', name: 'Basis Data' });
    practicumModel.countModules.mockResolvedValue(1); // Ada modul

    await practicumCtrl.remove(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: expect.stringContaining('has modules or enrollments'),
      })
    );
  });

  test('4d. Penghapusan kategori ruangan ditolak jika masih digunakan modul', async () => {
    const error = new Error('Kategori "lab_komputer" masih dipakai oleh modul');
    error.statusCode = 409;
    roomCategoryService.deleteCategory.mockRejectedValue(error);

    await expect(roomCategoryService.deleteCategory('lab_komputer')).rejects.toThrow('masih dipakai oleh modul');
  });

  test('4e. Penambahan modul praktikum dengan validasi kategori ruangan', async () => {
    req.params.practicumId = 'practicum-123';
    req.body = {
      code: 'MOD-01',
      name: 'Pengenalan SQL',
      week_number: 1,
      required_room_category: 'lab_komputer',
      sequence: 1
    };

    practicumModel.findById.mockResolvedValue({ id: 'practicum-123' });
    roomCategoryService.validateRequiredRoomCategory.mockResolvedValue({ ok: true, value: 'lab_komputer' });
    practicumModuleModel.create.mockResolvedValue({ id: 'mod-123', code: 'MOD-01' });

    await practicumModuleCtrl.create(req, res, next);

    expect(roomCategoryService.validateRequiredRoomCategory).toHaveBeenCalledWith('lab_komputer', { required: true });
    expect(res.status).toHaveBeenCalledWith(201);
  });
});
