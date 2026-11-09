import { jest } from '@jest/globals';

jest.unstable_mockModule('../models/registrationOperationalSettingsModel.js', () => ({
  findSettingByKey: jest.fn(),
  upsertSetting: jest.fn(),
}));

const settingsModel = await import('../models/registrationOperationalSettingsModel.js');
const {
  resolvePeriodeLabel,
  getActivePeriode,
  setActivePeriode,
  normalizeActivePeriodeValue,
  ACTIVE_PERIODE_SETTING_KEY,
} = await import('../services/activePeriodeService.js');

describe('activePeriodeService', () => {
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

  describe('normalizeActivePeriodeValue', () => {
    test('accepts string as label', () => {
      expect(normalizeActivePeriodeValue('2024/2025 Ganjil')).toEqual({
        label: '2024/2025 Ganjil',
      });
    });

    test('accepts object with id and label', () => {
      expect(
        normalizeActivePeriodeValue({ id: 'p-1', label: '2024/2025 Ganjil' })
      ).toEqual({ id: 'p-1', label: '2024/2025 Ganjil' });
    });

    test('rejects empty', () => {
      expect(normalizeActivePeriodeValue('  ')).toBeNull();
    });
  });

  describe('getActivePeriode', () => {
    test('returns null when not configured', async () => {
      settingsModel.findSettingByKey.mockResolvedValue(null);
      const result = await getActivePeriode();
      expect(result).toEqual({ active_periode: null, updated_at: null });
      expect(settingsModel.findSettingByKey).toHaveBeenCalledWith(ACTIVE_PERIODE_SETTING_KEY);
    });

    test('returns stored value', async () => {
      settingsModel.findSettingByKey.mockResolvedValue({
        value: { id: 'p-1', label: '2024/2025 Ganjil' },
        updated_at: '2026-05-15T00:00:00.000Z',
      });
      const result = await getActivePeriode();
      expect(result.active_periode).toEqual({ id: 'p-1', label: '2024/2025 Ganjil' });
    });
  });

  describe('setActivePeriode', () => {
    test('persists normalized value', async () => {
      settingsModel.upsertSetting.mockResolvedValue({
        value: { id: 'p-2', label: '2025/2026 Genap' },
        updated_at: '2026-05-16T00:00:00.000Z',
      });
      const result = await setActivePeriode(
        { id: 'p-2', label: '2025/2026 Genap' },
        'admin-id'
      );
      expect(settingsModel.upsertSetting).toHaveBeenCalledWith(
        ACTIVE_PERIODE_SETTING_KEY,
        { id: 'p-2', label: '2025/2026 Genap' },
        expect.any(String)
      );
      expect(result.active_periode.label).toBe('2025/2026 Genap');
    });
  });
});
