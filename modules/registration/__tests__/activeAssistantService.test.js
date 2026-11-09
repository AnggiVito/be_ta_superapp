import { jest } from '@jest/globals';

jest.unstable_mockModule('../services/activePeriodeService.js', () => ({
  getActivePeriode: jest.fn(),
  resolvePeriodeLabel: jest.fn((raw) => {
    if (!raw) return null;
    if (typeof raw === 'string') return raw.trim() || null;
    return raw.label || raw.id || null;
  }),
}));

jest.unstable_mockModule('../models/activeAssistantModel.js', () => ({
  findByPracticumAndPeriodeKey: jest.fn(),
}));

jest.unstable_mockModule('../models/practicumModel.js', () => ({
  findById: jest.fn(),
}));

jest.unstable_mockModule('../../user-management/models/profileModel.js', () => ({
  findByUserIds: jest.fn(),
}));

jest.unstable_mockModule('../../user-management/services/roleService.js', () => ({
  ensureActiveAssistantRoles: jest.fn(),
}));

const { getActivePeriode } = await import('../services/activePeriodeService.js');
const activeAssistantModel = await import('../models/activeAssistantModel.js');
const practicumModel = await import('../models/practicumModel.js');
const profileModel = await import('../../user-management/models/profileModel.js');
const roleService = await import('../../user-management/services/roleService.js');
const {
  resolvePeriodeKey,
  requireActivePeriodeContext,
  requirePracticumAssignmentContext,
  listActiveAssistantsForPracticum,
  applyActiveAssistantRolesOnAssignment,
} = await import('../services/activeAssistantService.js');

describe('activeAssistantService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('resolvePeriodeKey', () => {
    test('prefers id over label', () => {
      expect(resolvePeriodeKey({ id: 'p-1', label: '2025 Ganjil' })).toBe('p-1');
    });

    test('falls back to label', () => {
      expect(resolvePeriodeKey({ label: '2025 Ganjil' })).toBe('2025 Ganjil');
    });
  });

  describe('requireActivePeriodeContext', () => {
    test('throws when active periode missing', async () => {
      getActivePeriode.mockResolvedValue({ active_periode: null, updated_at: null });
      await expect(requireActivePeriodeContext()).rejects.toMatchObject({
        code: 'ACTIVE_PERIODE_NOT_CONFIGURED',
      });
    });

    test('returns context when configured', async () => {
      getActivePeriode.mockResolvedValue({
        active_periode: { id: 'p-2', label: '2026 Genap' },
        updated_at: '2026-01-01T00:00:00.000Z',
      });
      const ctx = await requireActivePeriodeContext();
      expect(ctx.periode_key).toBe('p-2');
      expect(ctx.periode_label).toBe('2026 Genap');
    });
  });

  describe('requirePracticumAssignmentContext', () => {
    test('throws when practicum_id missing', async () => {
      await expect(requirePracticumAssignmentContext('')).rejects.toMatchObject({
        code: 'PRACTICUM_ID_REQUIRED',
      });
    });

    test('throws when practicum not found', async () => {
      getActivePeriode.mockResolvedValue({
        active_periode: { id: 'p-1', label: '2025 Ganjil' },
        updated_at: null,
      });
      practicumModel.findById.mockResolvedValue(null);
      await expect(requirePracticumAssignmentContext('prac-1')).rejects.toMatchObject({
        code: 'PRACTICUM_NOT_FOUND',
      });
    });

    test('throws when practicum periode mismatch', async () => {
      getActivePeriode.mockResolvedValue({
        active_periode: { id: 'p-1', label: '2025 Ganjil' },
        updated_at: null,
      });
      practicumModel.findById.mockResolvedValue({
        id: 'prac-1',
        name: 'Praktikum A',
        periode: '2024 Genap',
      });
      await expect(requirePracticumAssignmentContext('prac-1')).rejects.toMatchObject({
        code: 'PRACTICUM_PERIODE_MISMATCH',
      });
    });
  });

  describe('listActiveAssistantsForPracticum', () => {
    test('enriches assignments with profile data', async () => {
      getActivePeriode.mockResolvedValue({
        active_periode: { id: 'p-1', label: '2025 Ganjil' },
        updated_at: null,
      });
      practicumModel.findById.mockResolvedValue({
        id: 'prac-1',
        name: 'Praktikum A',
        periode: '2025 Ganjil',
      });
      activeAssistantModel.findByPracticumAndPeriodeKey.mockResolvedValue([
        { user_id: 'user-1', nim: '1301220001', practicum_id: 'prac-1', periode_key: 'p-1' },
      ]);
      profileModel.findByUserIds.mockResolvedValue([
        { user_id: 'user-1', name: 'Asisten A', nipnim: '1301220001' },
      ]);

      const result = await listActiveAssistantsForPracticum('prac-1');
      expect(result.practicum_id).toBe('prac-1');
      expect(result.data[0].name).toBe('Asisten A');
    });
  });

  describe('applyActiveAssistantRolesOnAssignment', () => {
    test('assigns roles for imported assistants', async () => {
      await applyActiveAssistantRolesOnAssignment(['user-1'], 'admin-1');
      expect(roleService.ensureActiveAssistantRoles).toHaveBeenCalledWith('user-1', 'admin-1');
    });
  });
});
