import { jest } from '@jest/globals';

const mockUserManagementDb = { query: jest.fn() };
const mockRegistrationDb = { query: jest.fn() };

jest.unstable_mockModule('../../../config/databases.js', () => ({
  userManagementDb: mockUserManagementDb,
  registrationDb: mockRegistrationDb,
}));

const { resolveUserIdentifiers } = await import(
  '../services/registrationUserIdentifierService.js'
);

describe('registrationUserIdentifierService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('resolveUserIdentifiers returns only the matched profile identifiers', async () => {
    mockUserManagementDb.query.mockResolvedValueOnce({
      rows: [{ user_id: 'user-2024004', nipnim: '2024004' }],
    });
    mockRegistrationDb.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const identifiers = await resolveUserIdentifiers('user-2024004');

    expect(mockUserManagementDb.query).toHaveBeenCalledTimes(1);
    expect(identifiers).toEqual(expect.arrayContaining(['user-2024004', '2024004']));
    expect(identifiers).toHaveLength(2);
  });

  test('resolveUserIdentifiers does not expand identifiers by shared name', async () => {
    mockUserManagementDb.query.mockResolvedValueOnce({
      rows: [{ user_id: 'user-2024004', nipnim: '2024004' }],
    });
    mockRegistrationDb.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const identifiers = await resolveUserIdentifiers('2024004');

    expect(mockUserManagementDb.query).toHaveBeenCalledTimes(1);
    expect(identifiers).not.toContain('user-other-student');
    expect(identifiers).not.toContain('2024999');
  });

  test('resolveUserIdentifiers adds registration student and enrollment ids for shared NIM', async () => {
    mockUserManagementDb.query.mockResolvedValueOnce({
      rows: [{ user_id: '7ed35e7c-5ba1-4d31-bca6-d7d2bc23e656', nipnim: '2024004' }],
    });
    mockRegistrationDb.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: '2cb017e9-ab60-49ec-b288-b421325485f5',
            user_id: '55ee59d8-031c-4947-971d-acf396001266',
            student_number: '2024004',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ student_id: '55ee59d8-031c-4947-971d-acf396001266' }],
      });

    const identifiers = await resolveUserIdentifiers('7ed35e7c-5ba1-4d31-bca6-d7d2bc23e656');

    expect(identifiers).toEqual(
      expect.arrayContaining([
        '7ed35e7c-5ba1-4d31-bca6-d7d2bc23e656',
        '2024004',
        '55ee59d8-031c-4947-971d-acf396001266',
        '2cb017e9-ab60-49ec-b288-b421325485f5',
      ])
    );
  });
});
