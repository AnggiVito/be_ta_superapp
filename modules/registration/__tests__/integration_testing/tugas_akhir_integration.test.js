import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import XLSX from 'xlsx';

const VALID_PRACTICUM_ID = '11111111-1111-1111-1111-111111111111';

// ==================== MOCK MODULES ====================

jest.unstable_mockModule('../../../../config/databases.js', () => {
  const genericMockDb = {
    connect: jest.fn(),
    query: jest.fn(),
  };

  return {
    registrationDb: genericMockDb,
    userManagementDb: genericMockDb,
    conductDb: genericMockDb,
    roomManagementDb: genericMockDb,
    reportingDb: genericMockDb,
    procurementDb: genericMockDb,
  };
});

jest.unstable_mockModule('../../../../modules/user-management/middleware/roleValidator.js', () => ({
  requireRole: jest.fn().mockImplementation((...allowedRoles) => (req, res, next) => {
    const userRole = req.headers['x-test-role'] || 'kaur_lab';
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: `Akses ditolak. Diperlukan salah satu role: ${allowedRoles.join(', ')}`,
      });
    }
    next();
  }),
  requireOwnerOrRole: jest.fn().mockImplementation((...allowedRoles) => (req, res, next) => {
    next();
  }),
  requireProcurementSupervisedLabManager: jest.fn().mockImplementation(() => (req, res, next) => {
    next();
  }),
  PROCUREMENT_SUPERVISED_LAB_MANAGER_ROLES: ['kaur_lab', 'kaur', 'laboran', 'tpa'],
  userCanManageProcurementSupervisedLabs: jest.fn().mockResolvedValue(true),
}));

jest.unstable_mockModule('../../../../core/auth/jwt-validator.js', () => ({
  validateJWT: jest.fn().mockImplementation((req, res, next) => {
    const testUser = req.headers['x-test-user'];
    if (testUser) {
      req.user = JSON.parse(testUser);
    } else {
      req.user = { id: 'user-123', role: req.headers['x-test-role'] || 'kaur_lab', roles: [req.headers['x-test-role'] || 'kaur_lab'] };
    }
    next();
  }),
  optionalJWT: jest.fn().mockImplementation((req, res, next) => {
    next();
  }),
}));

jest.unstable_mockModule('../../../user-management/services/roleService.js', () => ({
  userHasRole: jest.fn().mockImplementation((userId, role) => {
    return Promise.resolve(true);
  }),
  assignRole: jest.fn().mockImplementation((userId, role, assignedBy) => {
    if (userId === 'user-tidak-ada') {
      throw new Error('User tidak ditemukan');
    }
    return Promise.resolve({ id: 'role-123', user_id: userId, role });
  }),
}));

jest.unstable_mockModule('../../services/activeAssistantService.js', () => ({
  resolvePeriodeKey: jest.fn().mockReturnValue('ap-1'),
  requireActivePeriodeContext: jest.fn().mockResolvedValue({
    active_periode: { id: 'ap-1', label: '2025/2026 Ganjil' },
    periode_key: 'ap-1',
    periode_label: '2025/2026 Ganjil',
  }),
  requirePracticumAssignmentContext: jest.fn().mockResolvedValue({
    active_periode: { id: 'ap-1', label: '2025/2026 Ganjil' },
    periode_key: 'ap-1',
    periode_label: '2025/2026 Ganjil',
    practicum_id: VALID_PRACTICUM_ID,
    practicum: { id: VALID_PRACTICUM_ID, name: 'Kimia', periode: '2025/2026 Ganjil' },
  }),
  getActiveAssistantRegistryForPracticum: jest.fn().mockResolvedValue({
    userIds: new Set(['user-123']),
    nims: new Set(['1202210001']),
  }),
  listActiveAssistantsForPracticum: jest.fn().mockResolvedValue({ data: [] }),
  listAvailableActiveAssistantsForAssignment: jest.fn().mockResolvedValue([]),
  assertUsersAreRegisteredActiveAssistants: jest.fn().mockResolvedValue(true),
  assertNimsAreRegisteredActiveAssistants: jest.fn().mockResolvedValue(true),
  applyActiveAssistantRolesOnAssignment: jest.fn().mockResolvedValue(true),
  applyActiveAssistantRolesForAssignedNims: jest.fn().mockResolvedValue(true),
}));

// ==================== IMPORTS ====================

const dbModule = await import('../../../../config/databases.js');
const registrationRoutes = await import('../../routes.js').then((m) => m.default || m);
const userManagementRoutes = await import('../../../user-management/routes.js').then((m) => m.default || m);

// Setup test Express App
const app = express();
app.use(express.json());
app.use('/api/registration', registrationRoutes);
app.use('/api/user-management', userManagementRoutes);

// Error handler middleware
app.use((err, req, res, next) => {
  res.status(err.statusCode || err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
  });
});

describe('Tugas Akhir Backend Integration Testing - UC-01 s.d UC-08', () => {
  let mockClient;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockClient = {
      query: jest.fn().mockImplementation((q, params) => {
        if (q.includes('FROM active_periode') || q.includes('SELECT value FROM operational_settings')) {
          return { rows: [{ id: 'ap-1', value: '2025/2026 Ganjil' }], rowCount: 1 };
        }
        if (q.includes('FROM practicum_modules')) {
          return { rows: [{ id: 'mod-123', name: 'Modul 1', required_room_category: 'lab_komputer', week_number: 1, sequence: 1 }], rowCount: 1 };
        }
        if (q.includes('schedules') && q.includes('s.id')) {
          return { rows: [{ id: 'sch-123', module_id: 'mod-123', venue: 'Lab Komputer B', start_time: '2026-07-27T08:00:00.000+07:00', end_time: '2026-07-27T10:00:00.000+07:00' }], rowCount: 1 };
        }
        if (q.includes('FROM room_categories') || q.includes('room_categories')) {
          return { rows: [{ slug: 'lab_komputer', label: 'Lab Komputer' }], rowCount: 1 };
        }
        if (q.includes('FROM practicums')) {
          return { rows: [{ id: VALID_PRACTICUM_ID, name: 'Kimia', periode: '2025/2026 Ganjil' }], rowCount: 1 };
        }
        if (q.includes('FROM user_profiles')) {
          return { rows: [{ user_id: 'user-123', name: 'Alif', nipnim: '1202210001' }], rowCount: 1 };
        }
        if (q.includes('FROM user_roles')) {
          return { rows: [{ id: 'role-1', user_id: 'user-123', role: 'asisten_praktikum' }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }),
      release: jest.fn(),
    };

    dbModule.registrationDb.connect = jest.fn().mockReturnValue(mockClient);
    dbModule.userManagementDb.connect = jest.fn().mockReturnValue(mockClient);

    dbModule.registrationDb.query = jest.fn().mockImplementation((q, params) => mockClient.query(q, params));
    dbModule.userManagementDb.query = jest.fn().mockImplementation((q, params) => mockClient.query(q, params));
  });

  // ==================== UC-01: Mengelola Data Master Registrasi Praktikum ====================
  describe('UC-01: Mengelola Data Master Registrasi Praktikum & Menetapkan Periode Akademik Aktif', () => {
    test('Main Flow: Kaur menetapkan periode akademik aktif', async () => {
      mockClient.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ key: 'active_periode', value: '2025/2026 Ganjil' }]
      });

      const res = await request(app)
        .put('/api/registration/periode/active')
        .set('x-test-role', 'kaur_lab')
        .send({ value: '2025/2026 Ganjil' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('Alternatif 4a: Data tidak valid atau tidak lengkap', async () => {
      const res = await request(app)
        .put('/api/registration/periode/active')
        .set('x-test-role', 'kaur_lab')
        .send({ value: '' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('Alternatif 4b: Penghapusan laboratorium ditolak jika masih ada praktikum', async () => {
      mockClient.query.mockRejectedValueOnce(
        new Error('Laboratorium masih memiliki praktikum terkait')
      );

      const res = await request(app)
        .delete('/api/registration/laboratories/lab-123')
        .set('x-test-role', 'kaur_lab');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Laboratorium masih memiliki praktikum terkait');
    });

    test('Alternatif 4c: Penghapusan praktikum ditolak jika masih memiliki modul', async () => {
      mockClient.query.mockRejectedValueOnce(
        new Error('Praktikum masih memiliki modul aktif')
      );

      const res = await request(app)
        .delete(`/api/registration/practicums/${VALID_PRACTICUM_ID}`)
        .set('x-test-role', 'kaur_lab');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Praktikum masih memiliki modul aktif');
    });

    test('Alternatif 4d: Penghapusan kategori ruangan ditolak jika digunakan modul', async () => {
      mockClient.query = jest.fn().mockImplementation((q) => {
        if (q.includes('FROM room_categories') || q.includes('room_categories')) {
          return { rows: [{ slug: 'lab_komputer', label: 'Lab Komputer' }], rowCount: 1 };
        }
        if (q.includes('COUNT(*)') || q.includes('count')) {
          return { rows: [{ count: 3 }], rowCount: 1 }; // count > 0 -> used by 3 modules
        }
        return { rows: [], rowCount: 0 };
      });

      const res = await request(app)
        .delete('/api/registration/room-categories/lab_komputer')
        .set('x-test-role', 'kaur_lab');

      expect(res.status).toBe(409); // Conflict
      expect(res.body.success).toBe(false);
    });
  });

  // ==================== UC-02: Mengelola Modul Praktikum dan Kebutuhan Ruangan ====================
  describe('UC-02: Mengelola Modul Praktikum dan Kebutuhan Ruangan', () => {
    test('Main Flow: Menampilkan daftar modul praktikum dan menambahkan modul baru', async () => {
      const resGet = await request(app)
        .get(`/api/registration/practicums/${VALID_PRACTICUM_ID}/modules`)
        .set('x-test-role', 'kaur_lab');

      expect(resGet.status).toBe(200);
      expect(resGet.body.success).toBe(true);

      mockClient.query = jest.fn().mockImplementation((q) => {
        if (q.includes('FROM practicums')) {
          return { rowCount: 1, rows: [{ id: VALID_PRACTICUM_ID }] };
        }
        if (q.includes('FROM room_categories')) {
          return { rowCount: 1, rows: [{ slug: 'lab_komputer' }] };
        }
        if (q.includes('INSERT INTO practicum_modules')) {
          return { rowCount: 1, rows: [{ id: 'mod-2', name: 'Modul 2' }] };
        }
        return { rows: [] };
      });

      const resPost = await request(app)
        .post(`/api/registration/practicums/${VALID_PRACTICUM_ID}/modules`)
        .set('x-test-role', 'kaur_lab')
        .send({
          code: 'MOD-02',
          name: 'Modul 2',
          week_number: 2,
          required_room_category: 'lab_komputer'
        });

      expect(resPost.status).toBe(201);
      expect(resPost.body.success).toBe(true);
    });

    test('Alternatif 4a: Data modul praktikum tidak lengkap atau tidak valid', async () => {
      const res = await request(app)
        .post(`/api/registration/practicums/${VALID_PRACTICUM_ID}/modules`)
        .set('x-test-role', 'kaur_lab')
        .send({
          name: 'Modul Tanpa Kode'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('Alternatif 4b: Kategori ruangan tidak tersedia', async () => {
      mockClient.query = jest.fn().mockImplementation((q) => {
        if (q.includes('FROM practicums')) {
          return { rowCount: 1, rows: [{ id: VALID_PRACTICUM_ID }] };
        }
        if (q.includes('FROM room_categories')) {
          return { rowCount: 0, rows: [] }; // Category not found
        }
        return { rows: [] };
      });

      const res = await request(app)
        .post(`/api/registration/practicums/${VALID_PRACTICUM_ID}/modules`)
        .set('x-test-role', 'kaur_lab')
        .send({
          code: 'MOD-02',
          name: 'Modul 2',
          week_number: 2,
          required_room_category: 'kategori_fiktif'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('tidak valid');
    });
  });

  // ==================== UC-03: Mengelola Data Asisten Praktikum ====================
  describe('UC-03: Mengelola Data Asisten Praktikum', () => {
    test('Main Flow: Kaur menetapkan peran asisten praktikum pada pengguna', async () => {
      const res = await request(app)
        .post('/api/user-management/users/user-1/roles')
        .set('x-test-role', 'kaur_lab')
        .send({ role: 'asisten_praktikum' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('Alternatif 5a: Pengguna tidak dapat ditetapkan sebagai asisten (user tidak ada)', async () => {
      const res = await request(app)
        .post('/api/user-management/users/user-tidak-ada/roles')
        .set('x-test-role', 'kaur_lab')
        .send({ role: 'asisten_praktikum' });

      expect(res.status).toBe(500); // roleService throws User tidak ditemukan, caught and return 500
      expect(res.body.success).toBe(false);
    });
  });

  // ==================== UC-04: Menetapkan Periode Akademik Aktif ====================
  describe('UC-04: Menetapkan Periode Akademik Aktif', () => {
    test('Main Flow: Menetapkan periode aktif', async () => {
      mockClient.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ key: 'active_periode', value: '2025/2026 Ganjil' }]
      });

      const res = await request(app)
        .put('/api/registration/periode/active')
        .set('x-test-role', 'kaur_lab')
        .send({ value: '2025/2026 Ganjil' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('Alternatif 5a: Periode tidak valid atau tidak tersedia', async () => {
      const res = await request(app)
        .put('/api/registration/periode/active')
        .set('x-test-role', 'kaur_lab')
        .send({ value: '' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  // ==================== UC-05: Mengelola Data Peserta Praktikum ====================
  describe('UC-05: Mengelola Data Peserta Praktikum', () => {
    test('Alternatif 4a: Berkas Excel tidak sesuai format / kosong', async () => {
      const ws = XLSX.utils.json_to_sheet([]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      const res = await request(app)
        .post(`/api/registration/practicums/${VALID_PRACTICUM_ID}/enrollments/import`)
        .set('x-test-role', 'kaur_lab')
        .attach('enrollment_file', buffer, 'students.xlsx');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Tidak ada data');
    });

    test('Alternatif 5a: Terdapat data NIM peserta yang tidak ditemukan di user management', async () => {
      const ws = XLSX.utils.json_to_sheet([{ NIM: '9999999999', Kelas: 'IF-40-01' }]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      mockClient.query = jest.fn().mockImplementation((q) => {
        if (q.includes('FROM user_profiles')) {
          return { rowCount: 0, rows: [] }; // NIM not found
        }
        if (q.includes('FROM practicums')) {
          return { rowCount: 1, rows: [{ id: VALID_PRACTICUM_ID }] };
        }
        return { rows: [] };
      });

      const res = await request(app)
        .post(`/api/registration/practicums/${VALID_PRACTICUM_ID}/enrollments/import`)
        .set('x-test-role', 'kaur_lab')
        .attach('enrollment_file', buffer, 'students.xlsx');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Tidak ada data'); // Controller returns rollback error main message
    });
  });

  // ==================== UC-06: Mengelola Jadwal Praktikum ====================
  describe('UC-06: Mengelola Jadwal Praktikum', () => {
    test('Main Flow: Asisten membuat jadwal praktikum', async () => {
      mockClient.query = jest.fn().mockImplementation((q) => {
        if (q.includes('FROM practicum_modules')) {
          return { rowCount: 1, rows: [{ id: 'mod-123', name: 'Modul 1', practicum_id: VALID_PRACTICUM_ID }] };
        }
        if (q.includes('INSERT INTO schedules')) {
          return { rowCount: 1, rows: [{ id: 'sch-1' }] };
        }
        if (q.includes('schedules') && q.includes('s.id')) {
          return { rowCount: 1, rows: [{ id: 'sch-1', start_time: '2026-07-27T08:00:00.000+07:00', end_time: '2026-07-27T10:00:00.000+07:00' }] };
        }
        return { rows: [] };
      });

      const res = await request(app)
        .post('/api/registration/schedules')
        .set('x-test-role', 'asisten_praktikum_aktif')
        .send({
          module_id: 'mod-123',
          start_time: '2026-07-27T08:00:00.000+07:00',
          end_time: '2026-07-27T10:00:00.000+07:00',
          venue: 'Lab EAD',
          assistants: []
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    test('Alternatif a: Data jadwal tidak lengkap', async () => {
      const res = await request(app)
        .post('/api/registration/schedules')
        .set('x-test-role', 'asisten_praktikum_aktif')
        .send({
          module_id: 'mod-123',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('Alternatif 5a: Terjadi konflik jadwal (jam kerja diluar batas)', async () => {
      mockClient.query = jest.fn().mockImplementation((q) => {
        if (q.includes('FROM practicum_modules')) {
          return { rowCount: 1, rows: [{ id: 'mod-123', name: 'Modul 1', practicum_id: VALID_PRACTICUM_ID }] };
        }
        return { rows: [] };
      });

      const res = await request(app)
        .post('/api/registration/schedules')
        .set('x-test-role', 'asisten_praktikum_aktif')
        .send({
          module_id: 'mod-123',
          start_time: '2026-07-27T04:00:00.000+07:00', // Jam 4 Pagi WIB
          end_time: '2026-07-27T07:00:00.000+07:00',
          assistants: []
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('sebelum jam 6 pagi');
    });
  });

  // ==================== UC-07: Mengelola Penempatan Ruangan Praktikum ====================
  describe('UC-07: Mengelola Penempatan Ruangan Praktikum', () => {
    test('Main Flow: Laboran menetapkan ruangan pada jadwal praktikum', async () => {
      mockClient.query = jest.fn().mockImplementation((q) => {
        if (q.includes('schedules') && q.includes('s.id')) {
          return { rowCount: 1, rows: [{ id: 'sch-123', module_id: 'mod-123', start_time: '2026-07-27T08:00:00.000+07:00', end_time: '2026-07-27T10:00:00.000+07:00', venue: 'Lab Komputer B' }] };
        }
        if (q.includes('COUNT(*)')) {
          return { rowCount: 1, rows: [{ count: 0 }] }; // No active bookings
        }
        if (q.includes('UPDATE schedules')) {
          return { rowCount: 1, rows: [{ id: 'sch-123', venue: 'Lab Komputer B' }] };
        }
        return { rows: [] };
      });

      const res = await request(app)
        .put('/api/registration/schedules/sch-123')
        .set('x-test-role', 'laboran')
        .send({ venue: 'Lab Komputer B' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.venue).toBe('Lab Komputer B');
    });

    test('Alternatif 7a: Konflik penggunaan ruangan (masih ada booking aktif)', async () => {
      mockClient.query = jest.fn().mockImplementation((q) => {
        if (q.includes('schedules') && q.includes('s.id')) {
          return { rowCount: 1, rows: [{ id: 'sch-123', module_id: 'mod-123', start_time: '2026-07-27T08:00:00.000+07:00', end_time: '2026-07-27T10:00:00.000+07:00' }] };
        }
        if (q.includes('COUNT(*)')) {
          return { rowCount: 1, rows: [{ count: 1 }] }; // Has active bookings
        }
        return { rows: [] };
      });

      const res = await request(app)
        .put('/api/registration/schedules/sch-123')
        .set('x-test-role', 'laboran')
        .send({ venue: 'Lab Komputer B' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('booking aktif');
    });
  });

  // ==================== UC-08: Mengelola Komponen Penilaian Praktikum ====================
  describe('UC-08: Mengelola Komponen Penilaian Praktikum', () => {
    test('Main Flow: Koordinator menyimpan konfigurasi penilaian', async () => {
      mockClient.query = jest.fn().mockImplementation((q) => {
        if (q.includes('FROM practicums')) {
          return { rowCount: 1, rows: [{ id: VALID_PRACTICUM_ID, name: 'Kimia' }] };
        }
        if (q.includes('FROM practicum_modules')) {
          return { rowCount: 1, rows: [{ id: 'mod-123', code: 'MOD-123', name: 'Modul 1', practicum_id: VALID_PRACTICUM_ID }] };
        }
        if (q.includes('FROM grades')) {
          return { rowCount: 0, rows: [] }; // Not locked
        }
        if (q.includes('FROM module_assessment_configs')) {
          return { rowCount: 0, rows: [] };
        }
        return { rows: [], rowCount: 0 };
      });

      const res = await request(app)
        .put(`/api/registration/practicums/${VALID_PRACTICUM_ID}/module-assessment-config`)
        .set('x-test-role', 'koordinator_praktikum')
        .send({
          modules: [
            {
              module_id: 'mod-123',
              components: [
                { type: 'tugas_pendahuluan', weight_percent: 20, enabled: true },
                { type: 'tes_awal', weight_percent: 20, enabled: true },
                { type: 'jurnal', weight_percent: 20, enabled: true },
                { type: 'tes_akhir', weight_percent: 20, enabled: true },
                { type: 'audit', weight_percent: 20, enabled: true }
              ]
            }
          ]
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('Alternatif 6a: Total bobot tidak valid (tidak sama dengan 100%)', async () => {
      mockClient.query = jest.fn().mockImplementation((q) => {
        if (q.includes('FROM practicums')) {
          return { rowCount: 1, rows: [{ id: VALID_PRACTICUM_ID, name: 'Kimia' }] };
        }
        if (q.includes('FROM practicum_modules')) {
          return { rowCount: 1, rows: [{ id: 'mod-123', code: 'MOD-123', name: 'Modul 1', practicum_id: VALID_PRACTICUM_ID }] };
        }
        if (q.includes('FROM grades')) {
          return { rowCount: 0, rows: [] }; // Not locked
        }
        return { rows: [], rowCount: 0 };
      });

      const res = await request(app)
        .put(`/api/registration/practicums/${VALID_PRACTICUM_ID}/module-assessment-config`)
        .set('x-test-role', 'koordinator_praktikum')
        .send({
          modules: [
            {
              module_id: 'mod-123',
              components: [
                { type: 'tugas_pendahuluan', weight_percent: 20, enabled: true },
                { type: 'tes_awal', weight_percent: 20, enabled: true },
                { type: 'jurnal', weight_percent: 20, enabled: true },
                { type: 'tes_akhir', weight_percent: 10, enabled: true }, // total 90%
                { type: 'audit', weight_percent: 20, enabled: true }
              ]
            }
          ]
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('harus tepat 100%');
    });

    test('Alternatif 6c: Konfigurasi terkunci karena sudah ada nilai diinput', async () => {
      mockClient.query = jest.fn().mockImplementation((q) => {
        if (q.includes('FROM practicums')) {
          return { rowCount: 1, rows: [{ id: VALID_PRACTICUM_ID, name: 'Kimia' }] };
        }
        if (q.includes('FROM practicum_modules')) {
          return { rowCount: 1, rows: [{ id: 'mod-123', code: 'MOD-123', name: 'Modul 1', practicum_id: VALID_PRACTICUM_ID }] };
        }
        if (q.includes('FROM grades') || q.includes('grade')) {
          return { rows: [{ module_id: 'mod-123' }], rowCount: 1 }; // Locked (grades exist)
        }
        return { rows: [], rowCount: 0 };
      });

      const res = await request(app)
        .put(`/api/registration/practicums/${VALID_PRACTICUM_ID}/module-assessment-config`)
        .set('x-test-role', 'koordinator_praktikum')
        .send({
          modules: [
            {
              module_id: 'mod-123',
              components: [
                { type: 'tugas_pendahuluan', weight_percent: 20, enabled: true },
                { type: 'tes_awal', weight_percent: 20, enabled: true },
                { type: 'jurnal', weight_percent: 20, enabled: true },
                { type: 'tes_akhir', weight_percent: 20, enabled: true },
                { type: 'audit', weight_percent: 20, enabled: true }
              ]
            }
          ]
        });

      expect(res.status).toBe(409); // Conflict (grades already exist)
      expect(res.body.success).toBe(false);
    });
  });
});
