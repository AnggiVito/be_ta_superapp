import { jest } from '@jest/globals';

const mockRegistrationDb = { query: jest.fn() };
const mockUserManagementDb = { query: jest.fn() };
const mockGetActivePeriode = jest.fn().mockResolvedValue({ active_periode: null });

jest.unstable_mockModule('../../../config/databases.js', () => ({
  registrationDb: mockRegistrationDb,
  userManagementDb: mockUserManagementDb,
}));

jest.unstable_mockModule('../../registration/services/activePeriodeService.js', () => ({
  getActivePeriode: mockGetActivePeriode,
}));

const { listPlottedSchedules } = await import('../services/registrationPlotScheduleService.js');

describe('registrationPlotScheduleService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetActivePeriode.mockResolvedValue({ active_periode: null });
  });

  test('filters schedules by practicum periode when semester_code is provided', async () => {
    mockRegistrationDb.query.mockResolvedValueOnce({ rows: [] });

    const rows = await listPlottedSchedules({ semesterCode: '2526-2' });

    expect(rows).toEqual([]);
    expect(mockGetActivePeriode).not.toHaveBeenCalled();
    expect(mockRegistrationDb.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('AND p.periode = $1'),
      ['2526-2']
    );
  });

  test('filters by practicum periode without requiring schedules.semester_code column', async () => {
    mockRegistrationDb.query.mockResolvedValueOnce({ rows: [] });

    const rows = await listPlottedSchedules({ semesterCode: '2526-2' });

    expect(rows).toEqual([]);
    expect(mockRegistrationDb.query).toHaveBeenNthCalledWith(
      1,
      expect.not.stringContaining('information_schema.columns'),
      ['2526-2']
    );
    expect(mockRegistrationDb.query.mock.calls[0][0]).toContain('AND p.periode = $1');
  });

  test('uses empty query args when laboran lists all schedules without semester filter', async () => {
    mockRegistrationDb.query.mockResolvedValueOnce({ rows: [] });

    const rows = await listPlottedSchedules();

    expect(rows).toEqual([]);
    expect(mockGetActivePeriode).toHaveBeenCalledTimes(1);
    expect(mockRegistrationDb.query).toHaveBeenNthCalledWith(1, expect.any(String), []);
  });

  test('falls back to active periode from registration settings when semester_code omitted', async () => {
    mockGetActivePeriode.mockResolvedValueOnce({
      active_periode: { id: '2526-2', label: '2526-2' },
    });
    mockRegistrationDb.query.mockResolvedValueOnce({ rows: [] });

    await listPlottedSchedules();

    expect(mockRegistrationDb.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('AND p.periode = $1'),
      ['2526-2']
    );
  });

  test('resolves semester_code=active from configured active periode', async () => {
    mockGetActivePeriode.mockResolvedValueOnce({
      active_periode: { id: '2527-1', label: '2527-1' },
    });
    mockRegistrationDb.query.mockResolvedValueOnce({ rows: [] });

    await listPlottedSchedules({ semesterCode: 'active' });

    expect(mockGetActivePeriode).toHaveBeenCalledTimes(1);
    expect(mockRegistrationDb.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('AND p.periode = $1'),
      ['2527-1']
    );
  });

  test('matches schedules assigned by schedule_assistants.nim', async () => {
    mockUserManagementDb.query.mockResolvedValueOnce({
      rows: [
        {
          user_id: 'user-m002',
          nipnim: '2022002',
        },
      ],
    });

    mockRegistrationDb.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'schedule-1',
            semester_code: '2526-2',
            study_program_id: 'sp-1',
            study_program_code: 'SI',
            study_program_name: 'S1 Sistem Informasi',
            laboratory_id: 'lab-1',
            laboratory_code: 'LD',
            laboratory_name: 'Lab Database',
            practicum_id: 'prac-1',
            practicum_code: 'PBD',
            practicum_name: 'Praktikum Basis Data',
            module_id: 'module-1',
            module_code: 'M1',
            module_name: 'Modul 1',
            module_sequence: 1,
            tanggal: '2026-03-02',
            jam_mulai: '07:30:00',
            jam_berakhir: '10:30:00',
            hitungan_jam: '3.00',
            kelas: 'reguler',
            detail_kegiatan: 'Praktikum Basis Data - Modul 1',
            venue: 'Integra R2',
            start_time: '07:30:00',
            end_time: '10:30:00',
            assistants: [{ user_id: null, nim: '2022002' }],
            is_assigned_to_current_user: true,
          },
        ],
      });

    const rows = await listPlottedSchedules({ currentUserId: 'user-m002' });

    expect(mockRegistrationDb.query).toHaveBeenCalledWith(
      expect.stringContaining('lower(sa.nim) = ANY($1::text[])'),
      [expect.arrayContaining(['user-m002', '2022002'])]
    );
    expect(mockRegistrationDb.query.mock.calls[0][0]).toContain('practicum_enrollments');
    expect(rows).toHaveLength(1);
    expect(rows[0].is_assigned_to_current_user).toBe(true);
    expect(rows[0].assistants).toEqual([{ user_id: null, nim: '2022002' }]);
    expect(rows[0].study_program_name).toBe('S1 Sistem Informasi');
  });

  test('uses enrollment-only filter for mahasiswa mine queries', async () => {
    mockUserManagementDb.query.mockResolvedValueOnce({
      rows: [{ user_id: 'user-student-1', nipnim: '2024004' }],
    });
    mockRegistrationDb.query.mockResolvedValueOnce({ rows: [] });

    await listPlottedSchedules({
      currentUserId: 'user-student-1',
      enrollmentOnly: true,
    });

    const sql = mockRegistrationDb.query.mock.calls[0][0];
    expect(sql).toContain('practicum_enrollments');
    expect(sql).not.toMatch(
      /OR\s+EXISTS \(\s*SELECT 1 FROM schedule_assistants sa\s*WHERE sa\.schedule_id = s\.id/s
    );
  });
});
