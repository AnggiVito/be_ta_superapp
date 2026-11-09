import { jest } from '@jest/globals';
import { performance } from 'perf_hooks';

// Mock all required models/services to respond instantly
jest.unstable_mockModule('../../models/registrationOperationalSettingsModel.js', () => ({
  findSettingByKey: jest.fn(),
  upsertSetting: jest.fn(),
}));
jest.unstable_mockModule('../../models/practicumModel.js', () => ({
  findById: jest.fn(),
}));
jest.unstable_mockModule('../../models/enrollmentModel.js', () => ({
  findByStudentAndPracticum: jest.fn(),
  create: jest.fn(),
}));
jest.unstable_mockModule('../../models/scheduleModel.js', () => ({
  create: jest.fn(),
}));
jest.unstable_mockModule('../../models/practicumModuleModel.js', () => ({
  findById: jest.fn(),
}));
jest.unstable_mockModule('../../services/activeAssistantService.js', () => ({
  assertUsersAreRegisteredActiveAssistants: jest.fn(),
  listAvailableActiveAssistantsForAssignment: jest.fn(),
  getActiveAssistantRegistryForPracticum: jest.fn(),
  listActiveAssistantsForPracticum: jest.fn(),
}));
jest.unstable_mockModule('../../../user-management/services/roleService.js', () => ({
  getActiveUserRoles: jest.fn(),
}));

const settingsModel = await import('../../models/registrationOperationalSettingsModel.js');
const practicumModel = await import('../../models/practicumModel.js');
const enrollmentModel = await import('../../models/enrollmentModel.js');
const scheduleModel = await import('../../models/scheduleModel.js');
const practicumModuleModel = await import('../../models/practicumModuleModel.js');
const activeAssistantService = await import('../../services/activeAssistantService.js');
const roleService = await import('../../../user-management/services/roleService.js');

const activePeriodeService = await import('../../services/activePeriodeService.js');
const enrollmentService = await import('../../services/enrollmentService.js');
const scheduleService = await import('../../services/scheduleService.js');

describe('Evaluasi Non-Fungsional: Performance & Response Time', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('Performa Penetapan Periode Akademik Aktif (harus < 50ms)', async () => {
    settingsModel.upsertSetting.mockResolvedValue({
      setting_key: 'active_periode',
      value: { label: '2025/2026 Ganjil' },
      updated_at: new Date()
    });

    const start = performance.now();
    await activePeriodeService.setActivePeriode('2025/2026 Ganjil', 'admin-123');
    const duration = performance.now() - start;

    console.log(`[PERFORMANCE] setActivePeriode response time: ${duration.toFixed(2)} ms`);
    expect(duration).toBeLessThan(50); // Batas maksimum 50ms
  });

  test('Performa Registrasi Praktikum Mahasiswa (harus < 50ms)', async () => {
    practicumModel.findById.mockResolvedValue({ id: 'p-123', name: 'APSI' });
    enrollmentModel.findByStudentAndPracticum.mockResolvedValue(null);
    roleService.getActiveUserRoles.mockResolvedValue([{ role: 'mahasiswa' }]);
    enrollmentModel.create.mockResolvedValue({ id: 'enroll-123' });

    const start = performance.now();
    await enrollmentService.enroll('p-123', 'student-123');
    const duration = performance.now() - start;

    console.log(`[PERFORMANCE] enroll (registrasi) response time: ${duration.toFixed(2)} ms`);
    expect(duration).toBeLessThan(50); // Batas maksimum 50ms
  });

  test('Performa Pembuatan Jadwal Praktikum Baru (harus < 50ms)', async () => {
    practicumModuleModel.findById.mockResolvedValue({ id: 'mod-123', practicum_id: 'p-123' });
    activeAssistantService.assertUsersAreRegisteredActiveAssistants.mockResolvedValue();
    scheduleModel.create.mockResolvedValue({ id: 'sch-123' });

    const payload = {
      module_id: 'mod-123',
      start_time: '2026-07-27T08:00:00.000+07:00',
      end_time: '2026-07-27T10:00:00.000+07:00',
      venue: 'Lab EAD',
      assistants: ['asst-123']
    };

    const start = performance.now();
    await scheduleService.createSchedule(payload);
    const duration = performance.now() - start;

    console.log(`[PERFORMANCE] createSchedule response time: ${duration.toFixed(2)} ms`);
    expect(duration).toBeLessThan(50); // Batas maksimum 50ms
  });
});
