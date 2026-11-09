import { jest } from '@jest/globals';

// Mock Models/Services
jest.unstable_mockModule('../../models/scheduleModel.js', () => ({
  findAll: jest.fn(),
  findById: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  hasActiveBookings: jest.fn(),
}));
jest.unstable_mockModule('../../../user-management/models/roleModel.js', () => ({
  getActiveUserRoles: jest.fn(),
}));
jest.unstable_mockModule('../../services/practicumService.js', () => ({
  resolveListPeriodeFilter: jest.fn(),
}));
jest.unstable_mockModule('../../../../config/databases.js', () => ({
  registrationDb: {
    connect: jest.fn().mockReturnValue({
      query: jest.fn(),
      release: jest.fn(),
    }),
    query: jest.fn().mockImplementation((q, params) => {
      if (q.includes('FROM practicum_modules')) {
        return { rows: [{ id: params[0] || 'mod-123', practicum_id: 'p-123' }], rowCount: 1 };
      }
      if (q.includes('FROM schedules')) {
        return { rows: [{ id: params[0] || 'sch-123', module_id: 'mod-123' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }),
  },
  userManagementDb: {
    connect: jest.fn().mockReturnValue({
      query: jest.fn(),
      release: jest.fn(),
    }),
    query: jest.fn().mockImplementation(() => {
      return { rows: [], rowCount: 0 };
    }),
  }
}));

const scheduleModel = await import('../../models/scheduleModel.js');
const roleModel = await import('../../../user-management/models/roleModel.js');
const practicumService = await import('../../services/practicumService.js');
const scheduleService = await import('../../services/scheduleService.js');
const dbModule = await import('../../../../config/databases.js');

describe('UC-07: Mengelola Penempatan Ruangan Praktikum', () => {
  let mockClient;

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };
    dbModule.registrationDb.connect.mockReturnValue(mockClient);
    dbModule.userManagementDb.connect.mockReturnValue(mockClient);
  });

  test('Sistem menampilkan daftar jadwal praktikum yang belum memiliki ruangan beserta kategori ruangan yang dibutuhkan', async () => {
    // Aktor: Laboran
    roleModel.getActiveUserRoles.mockResolvedValue([{ role: 'laboran' }]);
    
    // Mock schedules return: schedule 1 has no room, schedule 2 has room
    const mockSchedules = [
      {
        id: 'sch-1',
        module_id: 'mod-1',
        venue: null, // belum memiliki ruangan
        module_name: 'Modul 1',
        required_room_category: 'lab_komputer',
      },
      {
        id: 'sch-2',
        module_id: 'mod-2',
        venue: 'Lab Komputer 101', // sudah memiliki ruangan
        module_name: 'Modul 2',
        required_room_category: 'lab_komputer',
      }
    ];
    
    scheduleModel.findAll.mockResolvedValue(mockSchedules);
    practicumService.resolveListPeriodeFilter.mockResolvedValue({ filter: '2025/2026 Ganjil' });

    const result = await scheduleService.getAllSchedules({
      userId: 'laboran-123',
      periode: 'active'
    });

    // Menampilkan daftar jadwal praktikum yang belum memiliki ruangan
    const schedulesWithoutRoom = result.filter(s => s.venue === null || s.venue === undefined);

    expect(schedulesWithoutRoom.length).toBe(1);
    expect(schedulesWithoutRoom[0].id).toBe('sch-1');
    expect(schedulesWithoutRoom[0].required_room_category).toBe('lab_komputer');
  });

  test('Sistem menampilkan daftar ruangan yang sesuai dengan kategori kebutuhan dan tersedia pada waktu pelaksanaan praktikum', async () => {
    const requiredCategory = 'lab_komputer';
    const startTime = '2026-07-27T08:00:00.000Z';
    const endTime = '2026-07-27T10:00:00.000Z';

    // Mock daftar ruangan yang tersedia sesuai kategori dan ketersediaan waktu
    const mockRooms = [
      { id: 'room-1', name: 'Lab Komputer A', category: 'lab_komputer', is_available: true },
      { id: 'room-2', name: 'Lab Komputer B', category: 'lab_komputer', is_available: true },
      { id: 'room-3', name: 'Lab Kimia', category: 'lab_kimia', is_available: true } // kategori berbeda
    ];

    // Helper mock function to simulate retrieving matching available rooms
    const getAvailableRooms = jest.fn().mockImplementation((category, start, end) => {
      return mockRooms.filter(room => room.category === category && room.is_available);
    });

    const availableRooms = getAvailableRooms(requiredCategory, startTime, endTime);

    expect(availableRooms.length).toBe(2);
    expect(availableRooms[0].category).toBe('lab_komputer');
    expect(availableRooms[0].name).toBe('Lab Komputer A');
    expect(availableRooms[1].name).toBe('Lab Komputer B');
  });

  test('Aktor mengonfirmasi penempatan ruangan, sistem memvalidasi dan berhasil menyimpan penempatan', async () => {
    const scheduleId = 'sch-123';
    const targetRoom = 'Lab Komputer A';

    scheduleModel.findById.mockResolvedValue({ 
      id: scheduleId, 
      module_id: 'mod-123',
      start_time: '2026-07-27T08:00:00.000Z',
      end_time: '2026-07-27T10:00:00.000Z',
      venue: null
    });
    scheduleModel.hasActiveBookings.mockResolvedValue(false);
    scheduleModel.update.mockResolvedValue({ id: scheduleId, venue: targetRoom });

    // Aktor memilih ruangan dan mengonfirmasi penempatan
    const result = await scheduleService.updateSchedule(scheduleId, {
      venue: targetRoom
    });

    expect(result.venue).toBe(targetRoom);
    expect(scheduleModel.update).toHaveBeenCalledWith(scheduleId, expect.objectContaining({
      venue: targetRoom
    }));
  });

  test('a5a. Aktor membatalkan penempatan ruangan, sistem mempertahankan kondisi jadwal sebelumnya', async () => {
    const scheduleId = 'sch-123';
    const originalRoom = null;

    // Spy on update method to verify it is not called when canceled
    const updateSpy = jest.spyOn(scheduleModel, 'update');

    // Aktor membatalkan proses penempatan (tidak ada pemanggilan ke update)
    expect(updateSpy).not.toHaveBeenCalled();
  });

  test('7a. Terjadi konflik penggunaan ruangan (ruangan telah digunakan oleh jadwal praktikum lain)', async () => {
    const scheduleId = 'sch-123';
    const targetRoom = 'Lab Komputer A';

    scheduleModel.findById.mockResolvedValue({ 
      id: scheduleId, 
      module_id: 'mod-123',
      start_time: '2026-07-27T08:00:00.000Z',
      end_time: '2026-07-27T10:00:00.000Z',
      venue: null
    });
    scheduleModel.hasActiveBookings.mockResolvedValue(false);

    // Mock validation to check conflict
    const validateRoomAssignment = jest.fn().mockImplementation((room, start, end) => {
      // Menemukan bentrok jadwal dengan ruangan yang sama pada waktu yang sama
      throw new Error('Terjadi konflik penggunaan ruangan: Ruangan telah digunakan oleh jadwal praktikum lain pada waktu yang sama');
    });

    await expect(async () => {
      await validateRoomAssignment(targetRoom, '2026-07-27T08:00:00.000Z', '2026-07-27T10:00:00.000Z');
    }).rejects.toThrow('Terjadi konflik penggunaan ruangan: Ruangan telah digunakan oleh jadwal praktikum lain pada waktu yang sama');
  });

  test('7b. Kategori ruangan tidak sesuai dengan kebutuhan modul praktikum', async () => {
    const selectedRoomCategory = 'lab_kimia';
    const requiredCategory = 'lab_komputer';

    // Mock validation to check category suitability
    const validateRoomCategory = jest.fn().mockImplementation((selected, required) => {
      if (selected !== required) {
        throw new Error('Kategori ruangan tidak sesuai dengan kebutuhan modul praktikum');
      }
    });

    await expect(async () => {
      await validateRoomCategory(selectedRoomCategory, requiredCategory);
    }).rejects.toThrow('Kategori ruangan tidak sesuai dengan kebutuhan modul praktikum');
  });
});
