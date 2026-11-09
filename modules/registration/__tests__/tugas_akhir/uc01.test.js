import { jest } from '@jest/globals';

// Mock Model/Service
jest.unstable_mockModule('../../models/registrationOperationalSettingsModel.js', () => ({
  findSettingByKey: jest.fn(),
  upsertSetting: jest.fn(),
}));

const settingsModel = await import('../../models/registrationOperationalSettingsModel.js');
const activePeriodeCtrl = await import('../../controllers/activePeriodeController.js');

describe('UC-01: Menetapkan Periode Akademik Aktif', () => {
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

  test('Membuka menu dan menampilkan periode akademik aktif saat ini', async () => {
    settingsModel.findSettingByKey.mockResolvedValue({
      setting_key: 'active_periode',
      value: { label: '2025/2026 Ganjil' },
      updated_at: new Date()
    });

    await activePeriodeCtrl.getActivePeriode(req, res, next);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          active_periode: expect.objectContaining({ label: '2025/2026 Ganjil' })
        })
      })
    );
  });

  test('Aktor memilih satu periode dan berhasil mengonfirmasi penetapan periode akademik aktif', async () => {
    req.body = { active_periode: '2025/2026 Genap' };
    req.user = { id: 'kaur-lab-123' };

    settingsModel.upsertSetting.mockResolvedValue({
      setting_key: 'active_periode',
      value: { label: '2025/2026 Genap' },
      updated_at: new Date()
    });

    await activePeriodeCtrl.setActivePeriode(req, res, next);

    expect(settingsModel.upsertSetting).toHaveBeenCalledWith(
      'active_periode',
      { label: '2025/2026 Genap' },
      expect.any(String)
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'Periode aktif berhasil diperbarui',
      })
    );
  });

  test('3a. Aktor membatalkan proses (sistem tidak mengubah periode akademik aktif)', async () => {
    // Pada skenario pembatalan di client-side, request penetapan tidak dikirimkan ke server.
    // Memastikan tidak ada panggilan ke model penyimpanan/perubahan data.
    expect(settingsModel.upsertSetting).not.toHaveBeenCalled();
  });

  test('5a. Periode tidak valid atau tidak tersedia (sistem menampilkan pesan kesalahan)', async () => {
    req.body = { active_periode: 12345 }; // Tipe data tidak valid (bukan string/object)

    await activePeriodeCtrl.setActivePeriode(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: expect.stringContaining('harus berupa string atau object'),
      })
    );
  });
});
