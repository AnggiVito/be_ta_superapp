import { jest } from '@jest/globals';

jest.unstable_mockModule('../models/profileModel.js', () => ({
  upsertUserProfile: jest.fn(),
  getUserProfile: jest.fn(),
  listUsersWithAccessCards: jest.fn(),
}));

jest.unstable_mockModule('../models/roleModel.js', () => ({
  userHasRole: jest.fn(),
}));

const profileModel = await import('../models/profileModel.js');
const roleModel = await import('../models/roleModel.js');
const {
  combineUserDataFromProfile,
  deriveAccessCredentialFlags,
  buildAccessCredentialsForEdit,
  canManageAccessCredentials,
  canListAccessCardsForAssignment,
  getAccessCredentialsForEdit,
  listUsersWithAccessCards,
  updateAccessCredentials,
} = await import('../services/profileService.js');

describe('profileService access credentials', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('deriveAccessCredentialFlags', () => {
    test('returns true when text columns have values', () => {
      expect(
        deriveAccessCredentialFlags({
          fingerprint: 'FP-12345',
          kartu_akses_number: 'CARD-001',
        })
      ).toEqual({ has_fingerprint: true, has_kartu_akses: true });
    });

    test('returns false for empty or whitespace', () => {
      expect(
        deriveAccessCredentialFlags({ fingerprint: '  ', kartu_akses_number: null })
      ).toEqual({ has_fingerprint: false, has_kartu_akses: false });
    });
  });

  describe('combineUserDataFromProfile (view)', () => {
    test('returns booleans only, not raw text values', () => {
      const result = combineUserDataFromProfile('user-1', {
        name: 'Budi',
        nipnim: '12345',
        fingerprint: 'FP-SECRET',
        kartu_akses_number: 'CARD-SECRET',
      });

      expect(result.has_fingerprint).toBe(true);
      expect(result.has_kartu_akses).toBe(true);
      expect(result.fingerprint).toBeUndefined();
      expect(result.kartu_akses_number).toBeUndefined();
      expect(result.profile?.fingerprint).toBeUndefined();
      expect(result.profile?.kartu_akses_number).toBeUndefined();
    });

    test('defaults flags to false when profile missing', () => {
      const result = combineUserDataFromProfile('user-1', null);
      expect(result.has_fingerprint).toBe(false);
      expect(result.has_kartu_akses).toBe(false);
    });
  });

  describe('buildAccessCredentialsForEdit', () => {
    test('returns raw text values for edit form', () => {
      const result = buildAccessCredentialsForEdit('user-1', {
        fingerprint: 'FP-12345',
        kartu_akses_number: 'CARD-001',
      });
      expect(result).toEqual({
        user_id: 'user-1',
        fingerprint: 'FP-12345',
        kartu_akses_number: 'CARD-001',
        access_credentials_updated_at: null,
        access_credentials_updated_by: null,
      });
    });
  });

  describe('getAccessCredentialsForEdit', () => {
    test('rejects non-laboran/kaur_lab', async () => {
      roleModel.userHasRole.mockResolvedValue(false);
      await expect(getAccessCredentialsForEdit('target-id', 'student-id')).rejects.toThrow(
        'Hanya Kaur Lab dan Laboran'
      );
    });

    test('returns text values for laboran', async () => {
      roleModel.userHasRole.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
      profileModel.getUserProfile.mockResolvedValue({
        fingerprint: 'FP-99',
        kartu_akses_number: null,
      });
      const result = await getAccessCredentialsForEdit('target-id', 'laboran-id');
      expect(result.fingerprint).toBe('FP-99');
      expect(result.kartu_akses_number).toBeNull();
    });
  });

  describe('updateAccessCredentials', () => {
    test('saves text and returns edit payload', async () => {
      roleModel.userHasRole.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
      profileModel.upsertUserProfile.mockResolvedValue({
        fingerprint: 'FP-NEW',
        kartu_akses_number: 'CARD-NEW',
        access_credentials_updated_at: new Date('2026-05-15'),
        access_credentials_updated_by: 'laboran-id',
      });

      const result = await updateAccessCredentials(
        'target-id',
        { fingerprint: 'FP-NEW', kartu_akses_number: 'CARD-NEW' },
        'laboran-id'
      );

      expect(profileModel.upsertUserProfile).toHaveBeenCalledWith(
        'target-id',
        expect.objectContaining({
          fingerprint: 'FP-NEW',
          kartu_akses_number: 'CARD-NEW',
        })
      );
      expect(result.fingerprint).toBe('FP-NEW');
      expect(result.kartu_akses_number).toBe('CARD-NEW');
      expect(result.has_fingerprint).toBeUndefined();
    });
  });

  describe('canListAccessCardsForAssignment', () => {
    test('allows kaur_lab, laboran, and tpa', async () => {
      roleModel.userHasRole.mockImplementation(async (_uid, role) =>
        ['kaur_lab', 'laboran', 'tpa'].includes(role)
      );

      expect(await canListAccessCardsForAssignment('kaur-id')).toBe(true);

      roleModel.userHasRole.mockImplementation(async (_uid, role) => role === 'tpa');
      expect(await canListAccessCardsForAssignment('tpa-id')).toBe(true);

      roleModel.userHasRole.mockResolvedValue(false);
      expect(await canListAccessCardsForAssignment('student-id')).toBe(false);
    });
  });

  describe('listUsersWithAccessCards', () => {
    test('rejects unauthorized roles', async () => {
      roleModel.userHasRole.mockResolvedValue(false);
      await expect(listUsersWithAccessCards('student-id')).rejects.toThrow(
        'Hanya Kaur Lab, Laboran, dan TPA'
      );
    });

    test('returns mapped users with kartu akses numbers', async () => {
      roleModel.userHasRole.mockImplementation(async (_uid, role) => role === 'laboran');
      profileModel.listUsersWithAccessCards.mockResolvedValue([
        {
          user_id: 'user-1',
          name: 'Asisten A',
          nipnim: 'H1D022001',
          kartu_akses_number: '2672633271',
        },
      ]);

      const result = await listUsersWithAccessCards('laboran-id', { search: 'h1d' });

      expect(profileModel.listUsersWithAccessCards).toHaveBeenCalledWith({ search: 'h1d' });
      expect(result).toEqual([
        {
          user_id: 'user-1',
          name: 'Asisten A',
          nipnim: 'H1D022001',
          kartu_akses_number: '2672633271',
        },
      ]);
    });
  });
});
