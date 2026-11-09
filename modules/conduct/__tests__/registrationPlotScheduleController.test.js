import { jest } from '@jest/globals';

const mockRoleService = {
  userHasRole: jest.fn(),
};

const mockPlotService = {
  listPlottedSchedules: jest.fn(),
  listPlottedScheduleGroups: jest.fn(),
};

jest.unstable_mockModule('../../user-management/services/roleService.js', () => mockRoleService);

jest.unstable_mockModule('../services/registrationPlotScheduleService.js', () => mockPlotService);

const {
  jwtHasAssistantPlotScheduleRole,
  shouldFilterPlotSchedulesByEnrollmentOnly,
  resolvePlotScheduleScope,
  listPlottedPracticumSchedules,
} = await import('../controllers/registrationPlotScheduleController.js');

describe('registrationPlotScheduleController scope', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockPlotService.listPlottedSchedules.mockResolvedValue([]);
  });

  test('detects assistant role from singular JWT role claim', () => {
    expect(
      jwtHasAssistantPlotScheduleRole({
        role: 'asisten_praktikum',
      })
    ).toBe(true);
    expect(
      jwtHasAssistantPlotScheduleRole({
        role: 'koordinator_asisten',
      })
    ).toBe(true);
  });

  test('uses DB roles when JWT has no assistant role claims', async () => {
    mockRoleService.userHasRole.mockImplementation(async (_userId, role) => role === 'koordinator_asisten');

    const enrollmentOnly = await shouldFilterPlotSchedulesByEnrollmentOnly(
      { id: 'user-m002', role: 'mahasiswa' },
      true
    );

    expect(enrollmentOnly).toBe(false);
    expect(mockRoleService.userHasRole).toHaveBeenCalled();
  });

  test('defaults to enrollment-only mine filter for plain mahasiswa', async () => {
    mockRoleService.userHasRole.mockResolvedValue(false);

    const enrollmentOnly = await shouldFilterPlotSchedulesByEnrollmentOnly(
      { id: 'user-student-1', role: 'mahasiswa' },
      true
    );

    expect(enrollmentOnly).toBe(true);
  });

  test('resolvePlotScheduleScope keeps explicit enrollment_only for permit form', async () => {
    const scope = await resolvePlotScheduleScope(
      {
        user: { id: 'user-m002', role: 'asisten_praktikum' },
        query: { enrollment_only: 'true' },
      },
      true
    );

    expect(scope).toEqual({ enrollmentOnly: true, assistantOnly: false });
    expect(mockRoleService.userHasRole).not.toHaveBeenCalled();
  });

  test('listPlottedPracticumSchedules passes assistant+enrollment filter for assigned assistant mine queries', async () => {
    mockRoleService.userHasRole.mockImplementation(async (_userId, role) => role === 'asisten_praktikum');

    const req = {
      user: { id: 'user-m003', role: 'mahasiswa' },
      query: { mine: 'true', semester_code: '2526-2' },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    await listPlottedPracticumSchedules(req, res, next);

    expect(mockPlotService.listPlottedSchedules).toHaveBeenCalledWith({
      semesterCode: '2526-2',
      currentUserId: 'user-m003',
      enrollmentOnly: false,
      assistantOnly: false,
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
