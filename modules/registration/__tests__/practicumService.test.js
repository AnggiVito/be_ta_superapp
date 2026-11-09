import { jest } from '@jest/globals';

jest.unstable_mockModule('../services/activePeriodeService.js', () => ({
  getActivePeriode: jest.fn(),
}));

const activePeriodeService = await import('../services/activePeriodeService.js');
const {
  resolvePeriodeLabel,
  resolvePracticumPeriode,
  resolveListPeriodeFilter,
  defaultPracticumCode,
  ACTIVE_PERIODE_QUERY,
} = await import('../services/practicumService.js');

describe('practicumService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('resolvePeriodeLabel', () => {
    test('prefers label over id', () => {
      expect(resolvePeriodeLabel({ id: 'p-1', label: '2526-2' })).toBe('2526-2');
    });

    test('accepts plain string', () => {
      expect(resolvePeriodeLabel('2526-1')).toBe('2526-1');
    });
  });

  describe('resolvePracticumPeriode', () => {
    test('uses request periode when provided', async () => {
      const result = await resolvePracticumPeriode('2526-2');
      expect(result).toBe('2526-2');
      expect(activePeriodeService.getActivePeriode).not.toHaveBeenCalled();
    });

    test('falls back to active periode', async () => {
      activePeriodeService.getActivePeriode.mockResolvedValue({
        active_periode: { id: 'x', label: '2527-1' },
        updated_at: null,
      });
      const result = await resolvePracticumPeriode(undefined);
      expect(result).toBe('2527-1');
    });

    test('returns null when neither request nor active', async () => {
      activePeriodeService.getActivePeriode.mockResolvedValue({
        active_periode: null,
        updated_at: null,
      });
      const result = await resolvePracticumPeriode(null);
      expect(result).toBeNull();
    });
  });

  describe('resolveListPeriodeFilter', () => {
    test('no query means no filter', async () => {
      const result = await resolveListPeriodeFilter(undefined);
      expect(result).toEqual({ filter: null, useActiveDefault: false });
    });

    test('periode=active resolves active label', async () => {
      activePeriodeService.getActivePeriode.mockResolvedValue({
        active_periode: { label: '2526-2' },
        updated_at: null,
      });
      const result = await resolveListPeriodeFilter(ACTIVE_PERIODE_QUERY);
      expect(result.filter).toBe('2526-2');
      expect(result.useActiveDefault).toBe(true);
    });

    test('periode=active throws when not configured', async () => {
      activePeriodeService.getActivePeriode.mockResolvedValue({
        active_periode: null,
        updated_at: null,
      });
      await expect(resolveListPeriodeFilter('active')).rejects.toMatchObject({
        code: 'ACTIVE_PERIODE_NOT_CONFIGURED',
      });
    });
  });

  describe('defaultPracticumCode', () => {
    test('builds code from name', () => {
      expect(defaultPracticumCode('Jarkom')).toBe('JARKOM');
    });
  });
});
