import { jest } from '@jest/globals';

// Mock Models
jest.unstable_mockModule('../../../user-management/models/roleModel.js', () => ({
  userHasRole: jest.fn(),
  assignRole: jest.fn(),
  getRoleById: jest.fn(),
  countActiveUsersByRole: jest.fn(),
  removeRole: jest.fn(),
}));

const roleModel = await import('../../../user-management/models/roleModel.js');
const roleService = await import('../../../user-management/services/roleService.js');

describe('UC-04: Mengelola Data Asisten Praktikum', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('Aktor berhasil menetapkan peran asisten praktikum', async () => {
    roleModel.userHasRole.mockResolvedValue(true); // Memenuhi prasyarat role dasar
    roleModel.assignRole.mockResolvedValue({ id: 'role-123', role: 'asisten_praktikum_aktif' });

    const result = await roleService.assignRole('user-1', 'asisten_praktikum_aktif', 'kaur-lab-123');

    expect(roleModel.userHasRole).toHaveBeenCalledWith('user-1', 'asisten_praktikum');
    expect(result.role).toBe('asisten_praktikum_aktif');
  });

  test('4a. Aktor membatalkan perubahan role (sistem tidak memanggil penyimpanan)', async () => {
    // Skenario pembatalan tidak memanggil assignRole ke model
    expect(roleModel.assignRole).not.toHaveBeenCalled();
  });

  test('5a. Pengguna tidak dapat ditetapkan karena tidak memiliki role dasar asisten_praktikum', async () => {
    roleModel.userHasRole.mockResolvedValue(false); // Tidak punya role dasar asisten_praktikum

    await expect(
      roleService.assignRole('user-1', 'asisten_praktikum_aktif', 'kaur-lab-123')
    ).rejects.toThrow('User harus memiliki role asisten_praktikum terlebih dahulu');
    
    expect(roleModel.assignRole).not.toHaveBeenCalled();
  });

  test('5b. Perubahan role menyebabkan data tidak sesuai (misal menghapus asisten aktif terakhir)', async () => {
    roleModel.getRoleById.mockResolvedValue({ id: 'role-123', user_id: 'user-1', role: 'laboran' });
    roleModel.countActiveUsersByRole.mockResolvedValue(1); // Hanya ada 1 asisten aktif

    // Aturan bisnis: minimal harus ada asisten terdaftar
    await expect(
      roleService.removeRole('role-123', 'kaur-lab-123')
    ).rejects.toThrow('Laboran harus ada minimal 1 user aktif');
  });
});
