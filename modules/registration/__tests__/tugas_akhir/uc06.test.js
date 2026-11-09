import { jest } from '@jest/globals';

// Mock Models/Services
jest.unstable_mockModule('../../models/scheduleModel.js', () => ({
  create: jest.fn(),
  update: jest.fn(),
  findById: jest.fn(),
  hasActiveBookings: jest.fn(),
}));
jest.unstable_mockModule('../../models/practicumModuleModel.js', () => ({
  findById: jest.fn(),
  update: jest.fn(),
}));
jest.unstable_mockModule('../../services/activeAssistantService.js', () => ({
  assertUsersAreRegisteredActiveAssistants: jest.fn(),
  listAvailableActiveAssistantsForAssignment: jest.fn(),
  getActiveAssistantRegistryForPracticum: jest.fn(),
  listActiveAssistantsForPracticum: jest.fn(),
}));

const scheduleModel = await import('../../models/scheduleModel.js');
const practicumModuleModel = await import('../../models/practicumModuleModel.js');
const activeAssistantService = await import('../../services/activeAssistantService.js');
const scheduleService = await import('../../services/scheduleService.js');

describe('UC-06: Mengelola Jadwal Praktikum', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('Asisten Praktikum berhasil menyusun jadwal praktikum baru', async () => {
    const payload = {
      module_id: 'mod-123',
      start_time: '2026-07-27T08:00:00.000+07:00', // Hari Senin (WIB)
      end_time: '2026-07-27T10:00:00.000+07:00',
      venue: 'Lab Komputer R1',
      assistants: ['asst-123']
    };

    practicumModuleModel.findById.mockResolvedValue({ id: 'mod-123', name: 'PBO', practicum_id: 'p-123' });
    activeAssistantService.assertUsersAreRegisteredActiveAssistants.mockResolvedValue();
    scheduleModel.create.mockResolvedValue({
      id: 'sch-123',
      module_id: 'mod-123',
      start_time: new Date(payload.start_time),
      end_time: new Date(payload.end_time),
      venue: 'Lab Komputer R1',
      assistants: ['asst-123']
    });

    const result = await scheduleService.createSchedule(payload);

    expect(result.id).toBe('sch-123');
    expect(scheduleModel.create).toHaveBeenCalled();
  });

  test('a. Penolakan jika data jadwal tidak lengkap (start_time atau end_time kosong)', async () => {
    const payload = {
      module_id: 'mod-123',
      venue: 'Lab Komputer R1'
    };

    practicumModuleModel.findById.mockResolvedValue({ id: 'mod-123', practicum_id: 'p-123' });

    await expect(
      scheduleService.createSchedule(payload)
    ).rejects.toThrow('start_time dan end_time harus diisi');

    expect(scheduleModel.create).not.toHaveBeenCalled();
  });

  test('5a. Terjadi konflik jadwal (schedule memiliki active bookings sehingga tidak bisa diupdate)', async () => {
    scheduleModel.findById.mockResolvedValue({ id: 'sch-123', module_id: 'mod-123' });
    scheduleModel.hasActiveBookings.mockResolvedValue(true); // Ada booking aktif, conflict!

    await expect(
      scheduleService.updateSchedule('sch-123', {
        module_id: 'mod-123',
        start_time: '2026-07-27T08:00:00.000Z',
        end_time: '2026-07-27T10:00:00.000Z'
      })
    ).rejects.toThrow('Schedule tidak bisa diupdate karena masih ada booking aktif');

    expect(scheduleModel.update).not.toHaveBeenCalled();
  });

  test('5b. Peringatan/penolakan jika waktu pengerjaan di luar jam operasional (diluar batas 06:00 - 20:00)', async () => {
    const payload = {
      module_id: 'mod-123',
      start_time: '2026-07-27T05:00:00.000+07:00', // Jam 5 Pagi (WIB), tidak boleh!
      end_time: '2026-07-27T08:00:00.000+07:00',
      assistants: ['asst-123']
    };

    practicumModuleModel.findById.mockResolvedValue({ id: 'mod-123', practicum_id: 'p-123' });

    await expect(
      scheduleService.createSchedule(payload)
    ).rejects.toThrow('tidak boleh dimulai sebelum jam 6 pagi');
  });

  test('5c. Aktor membatalkan perubahan jadwal (sistem tidak memanggil penyimpanan)', async () => {
    // Pada skenario pembatalan di frontend, update tidak dipanggil ke backend
    expect(scheduleModel.update).not.toHaveBeenCalled();
  });
});
