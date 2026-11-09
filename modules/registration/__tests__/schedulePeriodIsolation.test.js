import { jest } from '@jest/globals';

const mockRegistrationDb = { query: jest.fn() };
const mockUserManagementDb = { query: jest.fn() };

jest.unstable_mockModule('../../../config/databases.js', () => ({
  registrationDb: mockRegistrationDb,
  userManagementDb: mockUserManagementDb,
}));

const scheduleModel = await import('../models/scheduleModel.js');
const scheduleBookingModel = await import('../models/scheduleBookingModel.js');

describe('schedule period isolation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRegistrationDb.query.mockResolvedValue({ rows: [] });
    mockUserManagementDb.query.mockResolvedValue({ rows: [] });
  });

  test('filters schedule list by practicum periode', async () => {
    await scheduleModel.findAll(null, null, { periode: '2526-2' });

    expect(mockRegistrationDb.query).toHaveBeenCalledWith(
      expect.stringContaining('p.periode = $1'),
      ['2526-2']
    );
    expect(mockRegistrationDb.query.mock.calls[0][0]).toContain('LEFT JOIN practicums p');
  });

  test('keeps user assignment and booking filters inside the selected periode', async () => {
    mockUserManagementDb.query.mockResolvedValueOnce({
      rows: [{ user_id: 'assistant-1', nipnim: '130001' }],
    });

    await scheduleModel.findAll(null, 'assistant-1', { periode: '2526-2' });

    const [query, params] = mockRegistrationDb.query.mock.calls[0];
    expect(query).toContain('lower(sa.nim) = ANY($1::text[])');
    expect(query).toContain('FROM schedule_bookings sb');
    expect(query).toContain('p.periode = $2');
    expect(params).toEqual([expect.arrayContaining(['assistant-1', '130001']), '2526-2']);
  });

  test('filters student bookings by practicum periode', async () => {
    await scheduleBookingModel.findByUser('student-1', {
      status: 'active',
      periode: '2526-2',
    });

    const [query, params] = mockRegistrationDb.query.mock.calls[0];
    expect(query).toContain('INNER JOIN practicums p ON pm.practicum_id = p.id');
    expect(query).toContain('p.periode = $3');
    expect(params).toEqual(['student-1', 'active', '2526-2']);
  });

  test('filters assistant assigned bookings by identifiers and practicum periode', async () => {
    mockUserManagementDb.query.mockResolvedValueOnce({
      rows: [{ user_id: 'assistant-1', nipnim: '130001' }],
    });

    await scheduleBookingModel.findByAssistant('assistant-1', {
      status: 'active',
      periode: '2526-2',
    });

    const [query, params] = mockRegistrationDb.query.mock.calls[0];
    expect(query).toContain('lower(sa.nim) = ANY($1::text[])');
    expect(query).toContain('INNER JOIN practicums p ON pm.practicum_id = p.id');
    expect(query).toContain('p.periode = $3');
    expect(params).toEqual([expect.arrayContaining(['assistant-1', '130001']), 'active', '2526-2']);
  });
});
