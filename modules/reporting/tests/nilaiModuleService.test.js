import { jest } from '@jest/globals';

const mockRegistrationDb = { query: jest.fn() };
const mockFindComponentsByModuleIds = jest.fn();
const mockListScopedGrades = jest.fn();

jest.unstable_mockModule('../../../config/databases.js', () => ({
  registrationDb: mockRegistrationDb,
}));

jest.unstable_mockModule('../../registration/models/moduleAssessmentModel.js', () => ({
  findComponentsByModuleIds: mockFindComponentsByModuleIds,
}));

jest.unstable_mockModule('../services/nilaiGradeLoader.js', () => ({
  listScopedGrades: mockListScopedGrades,
}));

const {
  listModuleReports,
  getModuleDetail,
  buildModuleAwareSummary,
} = await import('../services/nilaiModuleService.js');

const MODULE_ID = '33333333-3333-4333-8333-333333333333';
const MODULE_ID_2 = '44444444-4444-4444-8444-444444444444';
const STUDENT_ID = 'student-1';
const STUDENT_ID_2 = 'student-2';
const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const USER = { id: STUDENT_ID, roles: ['mahasiswa'] };

function makeGrade(overrides = {}) {
  return {
    id: 'grade-1',
    module_id: MODULE_ID,
    student_user_id: STUDENT_ID,
    student_name: 'Rina Kusuma',
    student_identifier: '2024005',
    practicum_name: 'Praktikum Basis Data',
    module_name: 'Modul 1',
    operational_session_id: SESSION_ID,
    total_score: 85,
    submitted_at: '2026-05-25T03:00:00.000Z',
    components: [
      { component_name: 'Preliminary Task', score: 80, max_score: 100 },
      { component_name: 'Initial Test', score: 90, max_score: 100 },
    ],
    ...overrides,
  };
}

function readyRubricMap() {
  return new Map([
    [
      MODULE_ID,
      [
        { component_type: 'tugas_pendahuluan', enabled: true, weight_percent: 50 },
        { component_type: 'tes_awal', enabled: true, weight_percent: 50 },
        { component_type: 'jurnal', enabled: false, weight_percent: 0 },
        { component_type: 'tes_akhir', enabled: false, weight_percent: 0 },
        { component_type: 'audit', enabled: false, weight_percent: 0 },
      ],
    ],
  ]);
}

function preloadedMember(grades) {
  return {
    grades,
    persona: 'praktikan',
    roleSlugs: ['mahasiswa'],
    scopePersona: 'praktikan',
    resolvedFilters: { semesterCode: '2025/2026-Ganjil', practicumName: null },
  };
}

function preloadedStaff(grades) {
  return {
    grades,
    persona: 'executive',
    roleSlugs: ['kaprodi'],
    scopePersona: 'executive',
    resolvedFilters: { semesterCode: '2025/2026-Ganjil', practicumName: null },
  };
}

function mockModuleMetadata() {
  mockRegistrationDb.query.mockResolvedValue({
    rows: [
      {
        module_id: MODULE_ID,
        module_code: 'M1',
        module_name: 'Modul 1',
        practicum_id: 'prac-1',
        practicum_name: 'Praktikum Basis Data',
      },
      {
        module_id: MODULE_ID_2,
        module_code: 'M2',
        module_name: 'Modul 2',
        practicum_id: 'prac-1',
        practicum_name: 'Praktikum Basis Data',
      },
    ],
  });
}

describe('nilaiModuleService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockModuleMetadata();
  });

  describe('listModuleReports — member (praktikan)', () => {
    it('computes weighted final_score when rubric is ready', async () => {
      mockFindComponentsByModuleIds.mockResolvedValue(readyRubricMap());

      const result = await listModuleReports({}, USER, preloadedMember([makeGrade()]));

      expect(result.display_mode).toBe('module');
      expect(result.items).toHaveLength(1);
      expect(result.items[0].final_score).toBe(85);
      expect(result.items[0].rubric_ready).toBe(true);
      expect(result.items[0].components.filter((c) => c.has_score)).toHaveLength(2);
    });

    it('falls back to session display_mode when rubric is not ready', async () => {
      mockFindComponentsByModuleIds.mockResolvedValue(
        new Map([
          [
            MODULE_ID,
            [{ component_type: 'tugas_pendahuluan', enabled: true, weight_percent: 40 }],
          ],
        ])
      );

      const result = await listModuleReports({}, USER, preloadedMember([makeGrade()]));

      expect(result.display_mode).toBe('session');
      expect(result.items[0].display_mode).toBe('session');
      expect(result.items[0].final_score).toBeNull();
      expect(result.items[0].session_grades).toHaveLength(1);
    });
  });

  describe('listModuleReports — staff aggregate', () => {
    it('returns module summary with average final score', async () => {
      mockFindComponentsByModuleIds.mockResolvedValue(readyRubricMap());

      const grades = [
        makeGrade(),
        makeGrade({
          id: 'grade-2',
          student_user_id: STUDENT_ID_2,
          student_name: 'Budi',
          student_identifier: '2024006',
          components: [
            { component_name: 'Preliminary Task', score: 60, max_score: 100 },
            { component_name: 'Initial Test', score: 80, max_score: 100 },
          ],
        }),
      ];

      const result = await listModuleReports({}, null, preloadedStaff(grades));

      expect(result.items).toHaveLength(1);
      expect(result.items[0].student_count).toBe(2);
      expect(result.items[0].graded_student_count).toBe(2);
      expect(result.items[0].average_final_score).toBe(77.5);
    });
  });

  describe('getModuleDetail', () => {
    it('throws when module_id is empty', async () => {
      await expect(getModuleDetail('', {}, USER)).rejects.toThrow('module_id wajib diisi');
    });

    it('throws when module has no grades in scope', async () => {
      mockListScopedGrades.mockResolvedValue(preloadedMember([]));

      await expect(getModuleDetail(MODULE_ID, {}, USER)).rejects.toThrow(
        'Data modul tidak ditemukan atau akses ditolak'
      );
    });

    it('returns students with final scores for a module', async () => {
      mockListScopedGrades.mockResolvedValue(preloadedMember([makeGrade()]));
      mockFindComponentsByModuleIds.mockResolvedValue(readyRubricMap());

      const result = await getModuleDetail(MODULE_ID, {}, USER);

      expect(result.module_id).toBe(MODULE_ID);
      expect(result.rubric_ready).toBe(true);
      expect(result.students).toHaveLength(1);
      expect(result.students[0].final_score).toBe(85);
    });

    it('filters by student_user_id when provided', async () => {
      mockListScopedGrades.mockResolvedValue(
        preloadedStaff([
          makeGrade(),
          makeGrade({
            id: 'grade-2',
            student_user_id: STUDENT_ID_2,
            student_name: 'Budi',
          }),
        ])
      );
      mockFindComponentsByModuleIds.mockResolvedValue(readyRubricMap());

      const result = await getModuleDetail(
        MODULE_ID,
        { student_user_id: STUDENT_ID_2 },
        null
      );

      expect(result.students).toHaveLength(1);
      expect(result.students[0].student_user_id).toBe(STUDENT_ID_2);
    });

    it('throws when student_user_id filter matches no rows', async () => {
      mockListScopedGrades.mockResolvedValue(preloadedMember([makeGrade()]));
      mockFindComponentsByModuleIds.mockResolvedValue(readyRubricMap());

      await expect(
        getModuleDetail(MODULE_ID, { student_user_id: 'unknown-student' }, USER)
      ).rejects.toThrow('Data nilai mahasiswa tidak ditemukan atau akses ditolak');
    });
  });

  describe('buildModuleAwareSummary', () => {
    it('builds module-mode summary for member persona', () => {
      const moduleReport = {
        display_mode: 'module',
        scope_persona: 'praktikan',
        period: { semester_code: '2025/2026-Ganjil', label: 'Semester 2025/2026-Ganjil' },
        items: [
          { final_score: 85, practicum_name: 'Praktikum Basis Data' },
          { final_score: 75, practicum_name: 'Praktikum Basis Data' },
        ],
      };

      const summary = buildModuleAwareSummary(
        moduleReport,
        [makeGrade(), makeGrade({ id: 'g2', operational_session_id: 'sess-2' })],
        'praktikan',
        ['mahasiswa']
      );

      expect(summary.display_mode).toBe('module');
      expect(summary.module_count).toBe(2);
      expect(summary.average_score).toBe(80);
      expect(summary.student_count).toBeUndefined();
    });

    it('builds session-mode summary when rubric fallback applies', () => {
      const sessionGrades = [
        makeGrade({ total_score: 80 }),
        makeGrade({ id: 'g2', total_score: 90, operational_session_id: 'sess-2' }),
      ];

      const summary = buildModuleAwareSummary(
        { display_mode: 'session', items: [] },
        sessionGrades,
        'executive',
        ['kaprodi']
      );

      expect(summary.display_mode).toBe('session');
      expect(summary.module_count).toBe(0);
      expect(summary.average_score).toBe(85);
      expect(summary.student_count).toBe(1);
    });
  });
});
