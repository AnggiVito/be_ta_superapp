import { describe, test, expect, beforeEach, jest } from '@jest/globals';

const SCHEDULE_ID = '11111111-1111-1111-1111-111111111111';
const ROOM_ID = '22222222-2222-2222-2222-222222222222';
const USER_ID = 'admin-user-1';

function buildSchedule(overrides = {}) {
  return {
    id: SCHEDULE_ID,
    module_id: 'mod-1',
    tanggal: '2026-06-10',
    jam_mulai: '08:00:00',
    jam_berakhir: '10:00:00',
    detail_kegiatan: 'Praktikum 1',
    kelas: 'A',
    venue: 'Lab 101',
    start_time: null,
    end_time: null,
    ttlock_sync_status: 'not_sync',
    module_name: 'Modul 1',
    practicum_name: 'Praktikum Kimia',
    assistants: [{ user_id: null, nim: '12345678' }],
    ...overrides,
  };
}

const mockRegistrationDb = {
  query: jest.fn(),
};

const mockUserManagementDb = {
  query: jest.fn(),
};

const mockRoomModel = {
  getAllRooms: jest.fn(),
  getRoomById: jest.fn(),
};

const mockBookingModel = {
  findBookingByRegistrationScheduleId: jest.fn(),
  findActiveConflict: jest.fn(),
  createSyncedBooking: jest.fn(),
  updateSyncedBookingTimes: jest.fn(),
  linkBookingPasscode: jest.fn(),
  relinkBookingPasscode: jest.fn(),
  updateBookingSyncMetadata: jest.fn(),
  appendBookingSyncMetadata: jest.fn(),
  cancelBooking: jest.fn(),
};

const mockPasscodeService = {
  createTemporaryPasscode: jest.fn(),
  deletePasscode: jest.fn(),
};

const mockPasscodeModel = {
  findActivePracticumSyncPasscodeLogs: jest.fn(),
  findActivePracticumSyncPasscodeLogsByName: jest.fn(),
};

const mockCardService = {
  addCard: jest.fn(),
  deleteCard: jest.fn(),
};

const mockCardModel = {
  findActivePracticumSyncCardLogs: jest.fn(),
  findActivePracticumSyncCardLogsByNumber: jest.fn(),
  findActiveCreatedCardLogsForWindow: jest.fn(),
  logCardCreation: jest.fn(),
};

const mockResolveSemesterCodeFilter = jest.fn();

jest.unstable_mockModule('../../../config/databases.js', () => ({
  registrationDb: mockRegistrationDb,
  userManagementDb: mockUserManagementDb,
}));

jest.unstable_mockModule('../models/roomModel.js', () => mockRoomModel);

jest.unstable_mockModule('../models/roomBookingModel.js', () => mockBookingModel);

jest.unstable_mockModule('../services/passcodeService.js', () => mockPasscodeService);

jest.unstable_mockModule('../models/passcodeModel.js', () => mockPasscodeModel);

jest.unstable_mockModule('../services/cardService.js', () => mockCardService);

jest.unstable_mockModule('../models/cardModel.js', () => mockCardModel);

jest.unstable_mockModule(
  '../../conduct/services/registrationPlotScheduleService.js',
  () => ({
    resolveSemesterCodeFilter: mockResolveSemesterCodeFilter,
  })
);

const { syncPracticumSchedules } = await import('../services/practicumScheduleSyncService.js');

function setupRegistrationQueries(schedules) {
  mockRegistrationDb.query.mockImplementation(async (sql) => {
    if (sql.includes('information_schema.columns')) {
      return { rowCount: 1 };
    }
    if (sql.includes('FROM schedules s')) {
      return { rows: schedules };
    }
    if (sql.includes("ttlock_sync_status = 'sync'")) {
      return { rowCount: 1 };
    }
    if (sql.includes("ttlock_sync_status = 'not_sync'")) {
      return { rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  });
}

function setupRooms() {
  mockRoomModel.getAllRooms.mockResolvedValue([
    {
      id: ROOM_ID,
      name: 'Lab 101',
      door_lock_id: 'lock-1',
    },
  ]);
  mockRoomModel.getRoomById.mockResolvedValue({
    id: ROOM_ID,
    name: 'Lab 101',
    door_lock_id: 'lock-1',
  });
}

function setupBookingPipeline() {
  mockBookingModel.findBookingByRegistrationScheduleId.mockResolvedValue(null);
  mockBookingModel.findActiveConflict.mockResolvedValue(null);
  mockBookingModel.createSyncedBooking.mockImplementation(async (data) => ({
    id: 'booking-1',
    room_id: data.roomId,
    start_time: data.startTime,
    end_time: data.endTime,
    registration_schedule_id: data.registrationScheduleId,
    access_mode: data.accessMode,
  }));
  mockBookingModel.linkBookingPasscode.mockResolvedValue(undefined);
  mockBookingModel.updateBookingSyncMetadata.mockResolvedValue(undefined);
  mockBookingModel.appendBookingSyncMetadata.mockResolvedValue(undefined);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockResolveSemesterCodeFilter.mockResolvedValue('20261');
  mockCardModel.findActivePracticumSyncCardLogs.mockResolvedValue([]);
  mockCardModel.findActivePracticumSyncCardLogsByNumber.mockResolvedValue([]);
  mockCardModel.findActiveCreatedCardLogsForWindow.mockResolvedValue([]);
  mockCardModel.logCardCreation.mockResolvedValue({ id: 'card-log-1' });
  mockPasscodeModel.findActivePracticumSyncPasscodeLogs.mockResolvedValue([]);
  mockPasscodeModel.findActivePracticumSyncPasscodeLogsByName.mockResolvedValue([]);
  mockPasscodeService.deletePasscode.mockResolvedValue({ success: true });
  mockCardService.deleteCard.mockResolvedValue({ success: true });
  setupRooms();
  setupBookingPipeline();
});

describe('practicumScheduleSyncService', () => {
  test('no NIM profile match uses passcode access mode', async () => {
    setupRegistrationQueries([buildSchedule()]);
    mockUserManagementDb.query.mockResolvedValue({ rows: [] });
    mockPasscodeService.createTemporaryPasscode.mockResolvedValue({
      id: 'pass-log-1',
      passcodeId: 'pwd-1',
    });

    const result = await syncPracticumSchedules({
      semesterCode: '20261',
      userId: USER_ID,
      dryRun: false,
    });

    expect(result.synced).toBe(1);
    expect(result.results[0].accessMode).toBe('passcode');
    expect(mockPasscodeService.createTemporaryPasscode).toHaveBeenCalledTimes(1);
    expect(mockCardService.addCard).not.toHaveBeenCalled();
    expect(mockBookingModel.createSyncedBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        registrationScheduleId: SCHEDULE_ID,
        accessMode: 'passcode',
      })
    );
  });

  test('matched NIM with kartu akses on all assistants uses RFID', async () => {
    setupRegistrationQueries([
      buildSchedule({
        assistants: [{ user_id: null, nim: 'H1D022001' }],
      }),
    ]);
    mockUserManagementDb.query.mockResolvedValue({
      rows: [
        {
          user_id: 'user-1',
          name: 'Asisten A',
          nipnim: 'H1D022001',
          kartu_akses_number: '2672633271',
        },
      ],
    });
    mockPasscodeService.createTemporaryPasscode.mockResolvedValue({
      id: 'pass-log-rfid',
      passcodeId: 'pwd-rfid',
    });
    mockCardService.addCard.mockResolvedValue({
      cardId: 'card-1',
      cardNumber: '2672633271',
      cardName: 'Asisten A',
    });

    const result = await syncPracticumSchedules({
      semesterCode: '20261',
      userId: USER_ID,
      dryRun: false,
    });

    expect(result.synced).toBe(1);
    expect(result.results[0].accessMode).toBe('rfid');
    expect(mockCardService.addCard).toHaveBeenCalledTimes(1);
    expect(mockCardService.addCard).toHaveBeenCalledWith(
      ROOM_ID,
      expect.objectContaining({
        cardNumber: '2672633271',
        persistLog: false,
      })
    );
    expect(mockPasscodeService.createTemporaryPasscode).not.toHaveBeenCalled();
    expect(mockBookingModel.createSyncedBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        accessMode: 'rfid',
      })
    );
  });

  test('matched NIM with kartu still gets RFID when another matched NIM lacks kartu', async () => {
    setupRegistrationQueries([
      buildSchedule({
        assistants: [
          { user_id: null, nim: 'H1D022001' },
          { user_id: null, nim: 'H1D022002' },
        ],
      }),
    ]);
    mockUserManagementDb.query.mockResolvedValue({
      rows: [
        {
          user_id: 'user-1',
          name: 'Asisten A',
          nipnim: 'H1D022001',
          kartu_akses_number: '2672633271',
        },
        {
          user_id: 'user-2',
          name: 'Asisten B',
          nipnim: 'H1D022002',
          kartu_akses_number: null,
        },
      ],
    });
    mockCardService.addCard.mockResolvedValue({
      cardId: 'card-1',
      cardNumber: '2672633271',
      cardName: 'Asisten A',
    });
    mockPasscodeService.createTemporaryPasscode.mockResolvedValue({
      id: 'pass-log-3',
      passcodeId: 'pwd-3',
    });

    const result = await syncPracticumSchedules({
      semesterCode: '20261',
      userId: USER_ID,
      dryRun: false,
    });

    expect(result.synced).toBe(1);
    expect(result.results[0].accessMode).toBe('rfid+passcode');
    expect(mockCardService.addCard).toHaveBeenCalledTimes(1);
    expect(mockPasscodeService.createTemporaryPasscode).toHaveBeenCalledTimes(1);
  });

  test('matches Excel numeric NIM to profile nipnim with prefix for RFID', async () => {
    setupRegistrationQueries([
      buildSchedule({
        assistants: [{ user_id: null, nim: '022001' }],
      }),
    ]);
    mockUserManagementDb.query.mockResolvedValue({
      rows: [
        {
          user_id: 'user-1',
          name: 'Asisten A',
          nipnim: 'H1D022001',
          kartu_akses_number: '2672633271',
        },
      ],
    });
    mockCardService.addCard.mockResolvedValue({
      cardId: 'card-1',
      cardNumber: '2672633271',
      cardName: 'Asisten A',
    });

    const result = await syncPracticumSchedules({
      semesterCode: '20261',
      userId: USER_ID,
      dryRun: false,
    });

    expect(result.synced).toBe(1);
    expect(result.results[0].accessMode).toBe('rfid');
    expect(mockCardService.addCard).toHaveBeenCalledTimes(1);
    expect(mockPasscodeService.createTemporaryPasscode).not.toHaveBeenCalled();
  });

  test('matched NIM without kartu akses falls back to passcode only', async () => {
    setupRegistrationQueries([
      buildSchedule({
        assistants: [{ user_id: null, nim: 'H1D022002' }],
      }),
    ]);
    mockUserManagementDb.query.mockResolvedValue({
      rows: [
        {
          user_id: 'user-2',
          name: 'Asisten B',
          nipnim: 'H1D022002',
          kartu_akses_number: null,
        },
      ],
    });
    mockPasscodeService.createTemporaryPasscode.mockResolvedValue({
      id: 'pass-log-2',
      passcodeId: 'pwd-2',
    });

    const result = await syncPracticumSchedules({
      semesterCode: '20261',
      userId: USER_ID,
      dryRun: false,
    });

    expect(result.synced).toBe(1);
    expect(result.results[0].accessMode).toBe('passcode');
    expect(result.results[0].accessReason).toContain('kartu akses');
    expect(mockPasscodeService.createTemporaryPasscode).toHaveBeenCalledTimes(1);
    expect(mockCardService.addCard).not.toHaveBeenCalled();
  });

  test('skips schedule when active booking already exists (idempotency)', async () => {
    setupRegistrationQueries([buildSchedule()]);
    mockBookingModel.findBookingByRegistrationScheduleId.mockResolvedValue({
      id: 'existing-booking',
    });

    const result = await syncPracticumSchedules({
      semesterCode: '20261',
      userId: USER_ID,
      dryRun: false,
    });

    expect(result.skipped).toBe(1);
    expect(result.synced).toBe(0);
    expect(result.results[0]).toMatchObject({
      scheduleId: SCHEDULE_ID,
      status: 'skipped',
      bookingId: 'existing-booking',
    });
    expect(mockBookingModel.createSyncedBooking).not.toHaveBeenCalled();
    expect(mockPasscodeService.createTemporaryPasscode).not.toHaveBeenCalled();
    expect(mockCardService.addCard).not.toHaveBeenCalled();
  });

  test('fails when venue does not resolve to a room', async () => {
    setupRegistrationQueries([
      buildSchedule({ venue: 'Ruangan Tidak Ada' }),
    ]);

    const result = await syncPracticumSchedules({
      semesterCode: '20261',
      userId: USER_ID,
      dryRun: false,
    });

    expect(result.failed).toBe(1);
    expect(result.results[0]).toMatchObject({
      scheduleId: SCHEDULE_ID,
      status: 'failed',
    });
    expect(result.results[0].reason).toContain('Room not found');
    expect(mockBookingModel.createSyncedBooking).not.toHaveBeenCalled();
  });

  test('stores WIB wall-clock in room_bookings when timestamptz is present', async () => {
    setupRegistrationQueries([
      buildSchedule({
        start_time: new Date('2026-06-10T01:00:00.000Z'),
        end_time: new Date('2026-06-10T03:00:00.000Z'),
      }),
    ]);
    mockUserManagementDb.query.mockResolvedValue({ rows: [] });
    mockPasscodeService.createTemporaryPasscode.mockResolvedValue({
      id: 'pass-log-tz',
      passcodeId: 'pwd-tz',
    });

    await syncPracticumSchedules({
      semesterCode: '20261',
      userId: USER_ID,
      dryRun: false,
    });

    expect(mockBookingModel.createSyncedBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        startTime: '2026-06-10 08:00:00',
        endTime: '2026-06-10 10:00:00',
      })
    );
    expect(mockPasscodeService.createTemporaryPasscode).toHaveBeenCalledWith(
      ROOM_ID,
      expect.objectContaining({
        startDate: '2026-06-10 08:00:00',
        endDate: '2026-06-10 10:00:00',
      })
    );
  });

  test('resolves venue to room case-insensitively in dry run', async () => {
    setupRegistrationQueries([
      buildSchedule({ venue: 'lab 101' }),
    ]);
    mockUserManagementDb.query.mockResolvedValue({ rows: [] });

    const result = await syncPracticumSchedules({
      semesterCode: '20261',
      userId: USER_ID,
      dryRun: true,
    });

    expect(result.planned).toBe(1);
    expect(result.results[0]).toMatchObject({
      scheduleId: SCHEDULE_ID,
      status: 'dry_run',
      roomId: ROOM_ID,
      roomName: 'Lab 101',
      accessMode: 'passcode',
    });
    expect(mockBookingModel.createSyncedBooking).not.toHaveBeenCalled();
  });
});
