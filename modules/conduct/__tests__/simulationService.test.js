import { jest } from '@jest/globals';

const mockConductDb = {
  query: jest.fn(),
};

const mockUserManagementDb = {
  query: jest.fn(),
};

const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
};

jest.unstable_mockModule('../../../config/databases.js', () => ({
  conductDb: mockConductDb,
  userManagementDb: mockUserManagementDb,
}));

jest.unstable_mockModule('../../../core/utils/logger.js', () => ({
  logger: mockLogger,
}));

const {
  createSimulation,
  listSimulations,
  getSimulationById,
  updateSimulation,
  deleteSimulation,
} = await import('../services/simulationService.js');

describe('Simulation Service - Task #48', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('should create practicum simulation successfully', async () => {
    mockUserManagementDb.query.mockResolvedValueOnce({
      rows: [{ user_id: 'pic-user-1' }],
    });

    mockConductDb.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'simulation-1',
          simulation_name: 'Simulasi Praktikum Basis Data',
          simulation_date: '2026-05-10',
          start_time: '08:00:00',
          end_time: '10:00:00',
          location: 'Lab Dasar 1',
          description: 'Sesi simulasi awal',
          pic_user_id: 'pic-user-1',
          created_by: 'coordinator-1',
          status: 'draft',
        },
      ],
    });

    const result = await createSimulation({
      creatorUserId: 'coordinator-1',
      payload: {
        simulation_name: 'Simulasi Praktikum Basis Data',
        simulation_date: '2026-05-10',
        start_time: '08:00',
        end_time: '10:00',
        location: 'Lab Dasar 1',
        description: 'Sesi simulasi awal',
        pic_user_id: 'pic-user-1',
      },
    });

    expect(result.id).toBe('simulation-1');
    expect(result.status).toBe('draft');
    expect(mockUserManagementDb.query).toHaveBeenCalledTimes(1);
    expect(mockConductDb.query).toHaveBeenCalledTimes(1);
  });

  test('should reject when simulation_name is missing', async () => {
    await expect(
      createSimulation({
        creatorUserId: 'coordinator-1',
        payload: {
          simulation_date: '2026-05-10',
          start_time: '08:00',
          end_time: '10:00',
          pic_user_id: 'pic-user-1',
        },
      })
    ).rejects.toThrow('simulation_name is required');
  });

  test('should reject when end_time is not after start_time', async () => {
    await expect(
      createSimulation({
        creatorUserId: 'coordinator-1',
        payload: {
          simulation_name: 'Simulasi Praktikum Dasar',
          simulation_date: '2026-05-10',
          start_time: '10:00',
          end_time: '09:30',
          pic_user_id: 'pic-user-1',
        },
      })
    ).rejects.toThrow('end_time must be greater than start_time');
  });

  test('should reject when PIC user is not found', async () => {
    mockUserManagementDb.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      createSimulation({
        creatorUserId: 'coordinator-1',
        payload: {
          simulation_name: 'Simulasi Praktikum Dasar',
          simulation_date: '2026-05-10',
          start_time: '08:00',
          end_time: '09:30',
          pic_user_id: 'pic-user-404',
        },
      })
    ).rejects.toThrow('PIC user not found');
  });

  test('should return simulation list with pagination', async () => {
    mockConductDb.query
      .mockResolvedValueOnce({ rows: [{ total: 2 }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'simulation-2',
            simulation_name: 'Simulasi 2',
            status: 'draft',
          },
          {
            id: 'simulation-1',
            simulation_name: 'Simulasi 1',
            status: 'open',
          },
        ],
      });

    const result = await listSimulations({
      query: { limit: '10', offset: '0' },
    });

    expect(result.simulations).toHaveLength(2);
    expect(result.pagination.total).toBe(2);
    expect(result.pagination.hasMore).toBe(false);
    expect(mockConductDb.query).toHaveBeenCalledTimes(2);
  });

  test('should return simulation detail by id', async () => {
    mockConductDb.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'simulation-1',
          simulation_name: 'Simulasi Praktikum Dasar',
          status: 'draft',
        },
      ],
    });

    const result = await getSimulationById('simulation-1');

    expect(result).toBeTruthy();
    expect(result.id).toBe('simulation-1');
    expect(mockConductDb.query).toHaveBeenCalledTimes(1);
  });

  test('should return null when simulation detail not found', async () => {
    mockConductDb.query.mockResolvedValueOnce({ rows: [] });

    const result = await getSimulationById('simulation-404');

    expect(result).toBeNull();
  });

  test('should update simulation status', async () => {
    mockConductDb.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'simulation-1',
            simulation_name: 'Simulasi Praktikum Dasar',
            simulation_date: '2026-05-10',
            start_time: '08:00:00',
            end_time: '10:00:00',
            pic_user_id: 'pic-user-1',
            status: 'draft',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'simulation-1',
            simulation_name: 'Simulasi Praktikum Dasar',
            status: 'open',
          },
        ],
      });

    const result = await updateSimulation({
      simulationId: 'simulation-1',
      payload: { status: 'open' },
    });

    expect(result.status).toBe('open');
    expect(mockConductDb.query).toHaveBeenCalledTimes(2);
  });

  test('should update simulation and validate PIC user', async () => {
    mockConductDb.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'simulation-1',
            simulation_name: 'Simulasi Lama',
            simulation_date: '2026-05-10',
            start_time: '08:00:00',
            end_time: '10:00:00',
            pic_user_id: 'pic-user-1',
            status: 'draft',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'simulation-1',
            simulation_name: 'Simulasi Baru',
            status: 'draft',
          },
        ],
      });
    mockUserManagementDb.query.mockResolvedValueOnce({
      rows: [{ user_id: 'pic-user-2' }],
    });

    const result = await updateSimulation({
      simulationId: 'simulation-1',
      payload: {
        simulation_name: 'Simulasi Baru',
        start_time: '09:00',
        end_time: '11:00',
        pic_user_id: 'pic-user-2',
      },
    });

    expect(result.simulation_name).toBe('Simulasi Baru');
    expect(mockUserManagementDb.query).toHaveBeenCalledTimes(1);
    expect(mockConductDb.query).toHaveBeenCalledTimes(2);
  });

  test('should soft delete simulation', async () => {
    mockConductDb.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'simulation-1',
          simulation_name: 'Simulasi Praktikum Dasar',
        },
      ],
    });

    const result = await deleteSimulation('simulation-1');

    expect(result.id).toBe('simulation-1');
    expect(mockConductDb.query).toHaveBeenCalledTimes(1);
  });
});
