import { jest } from '@jest/globals';

// Mock Models & Services
jest.unstable_mockModule('../../models/practicumModuleModel.js', () => ({
  findAll: jest.fn(),
  findByPracticum: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
}));
jest.unstable_mockModule('../../services/roomCategoryService.js', () => ({
  validateRequiredRoomCategory: jest.fn(),
}));

const moduleModel = await import('../../models/practicumModuleModel.js');
const roomCategoryService = await import('../../services/roomCategoryService.js');
const practicumModuleCtrl = await import('../../controllers/practicumModuleController.js');

describe('UC-03: Mengelola Modul Praktikum dan Kebutuhan Ruangan', () => {
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

  test('Menampilkan daftar modul praktikum yang tersedia', async () => {
    req.params.practicumId = 'p-123';
    moduleModel.findByPracticum.mockResolvedValue([
      { id: 'mod-1', name: 'Modul 1', code: 'MOD-01' }
    ]);

    await practicumModuleCtrl.list(req, res, next);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.arrayContaining([
          expect.objectContaining({ id: 'mod-1', name: 'Modul 1' })
        ])
      })
    );
  });

  test('Menyimpan perubahan data modul praktikum (update)', async () => {
    req.params.id = 'mod-1';
    req.body = { name: 'Modul 1 Terupdate', required_room_category: 'lab_komputer', week_number: 2 };
    
    moduleModel.findById.mockResolvedValue({ id: 'mod-1', name: 'Modul 1', required_room_category: 'lab_komputer', week_number: 1 });
    roomCategoryService.validateRequiredRoomCategory.mockResolvedValue({ ok: true, value: 'lab_komputer' });
    moduleModel.update.mockResolvedValue({ id: 'mod-1', name: 'Modul 1 Terupdate' });

    await practicumModuleCtrl.update(req, res, next);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ name: 'Modul 1 Terupdate' })
      })
    );
  });

  test('4a. Data modul praktikum tidak lengkap atau tidak valid saat penambahan', async () => {
    req.body = { code: 'MOD-01' }; // kurang nama dan practicum_id

    await practicumModuleCtrl.create(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: expect.stringContaining('required')
      })
    );
  });

  test('4b. Kategori ruangan tidak tersedia (belum ada di data master)', async () => {
    req.params.practicumId = 'p-123';
    req.body = {
      code: 'MOD-01',
      name: 'Modul 1',
      week_number: 1,
      required_room_category: 'lab_tidak_ada'
    };

    roomCategoryService.validateRequiredRoomCategory.mockResolvedValue({
      ok: false,
      message: 'Kategori ruangan lab_tidak_ada tidak valid'
    });

    await practicumModuleCtrl.create(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'Kategori ruangan lab_tidak_ada tidak valid'
      })
    );
  });

  test('4c. Penghapusan modul praktikum ditolak jika masih berkaitan dengan jadwal/registrasi', async () => {
    req.params.id = 'mod-1';
    
    moduleModel.findById.mockResolvedValue({ id: 'mod-1', name: 'Modul 1' });
    
    // Simulasikan database error saat menghapus karena constraint key
    const dbError = new Error('foreign key constraint violation');
    moduleModel.remove.mockRejectedValue(dbError);

    await practicumModuleCtrl.remove(req, res, next);

    // Error dilempar ke next middleware
    expect(next).toHaveBeenCalledWith(dbError);
  });
});
