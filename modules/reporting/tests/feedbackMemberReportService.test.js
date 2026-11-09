import { jest } from '@jest/globals';

const mockConductDb = { query: jest.fn() };
const mockRegistrationDb = { query: jest.fn() };
const mockResolveFeedbackSemesterScope = jest.fn();
const mockResolveUserIdentifiers = jest.fn();
const mockNipOrNim = jest.fn(() => '2024001');

jest.unstable_mockModule('../../../config/databases.js', () => ({
  conductDb: mockConductDb,
  registrationDb: mockRegistrationDb,
}));

jest.unstable_mockModule('../services/feedbackSemesterScopeService.js', () => ({
  resolveFeedbackSemesterScope: mockResolveFeedbackSemesterScope,
}));

jest.unstable_mockModule('../../conduct/utils/resolveUserIdentifiers.js', () => ({
  resolveUserIdentifiers: mockResolveUserIdentifiers,
}));

jest.unstable_mockModule('../../../core/utils/jwtIdentityFromPayload.js', () => ({
  nipOrNimFromJwtPayload: mockNipOrNim,
}));

const {
  getMemberSummary,
  listMemberResponses,
  getMemberResponseDetail,
} = await import('../services/feedbackMemberReportService.js');

const USER = { id: 'user-1', roles: ['mahasiswa'] };
const SESSION_SUBMITTED = '11111111-1111-1111-1111-111111111111';
const SESSION_PENDING = '22222222-2222-2222-2222-222222222222';
const SCHEDULE_ID = '33333333-3333-3333-3333-333333333333';
const RESPONSE_ID = '44444444-4444-4444-4444-444444444444';
const SURVEY_ID = '55555555-5555-5555-5555-555555555555';

function mockSemesterScope() {
  mockResolveFeedbackSemesterScope.mockResolvedValue({
    semesterCode: '2025/2026-Ganjil',
    scheduleIds: [SCHEDULE_ID],
  });
  mockResolveUserIdentifiers.mockResolvedValue(['user-1']);
}

function mockEligibleSessions() {
  mockConductDb.query.mockImplementation((sql) => {
    if (sql.includes("status = 'active'") && sql.includes('exit_surveys')) {
      return Promise.resolve({
        rows: [{ id: SURVEY_ID, title: 'Exit Survey FRI', description: 'Deskripsi' }],
      });
    }
    if (sql.includes('practicum_operational_sessions')) {
      return Promise.resolve({
        rows: [
          {
            operational_session_id: SESSION_SUBMITTED,
            registration_schedule_id: SCHEDULE_ID,
            practicum_name: 'Praktikum Basis Data',
            module_name: 'Modul 1',
            module_id: null,
            response_id: RESPONSE_ID,
            submitted_at: '2026-05-25T10:00:00.000Z',
            scheduled_date: '2026-05-25',
            start_time: '07:30',
            end_time: '10:30',
            venue: 'Lab A',
            session_status: 'completed',
            completed_at: '2026-05-25T10:00:00.000Z',
          },
          {
            operational_session_id: SESSION_PENDING,
            registration_schedule_id: SCHEDULE_ID,
            practicum_name: 'Praktikum Basis Data',
            module_name: 'Modul 2',
            module_id: null,
            response_id: null,
            submitted_at: null,
            scheduled_date: '2026-05-26',
            start_time: '07:30',
            end_time: '10:30',
            venue: 'Lab B',
            session_status: 'completed',
            completed_at: '2026-05-26T10:00:00.000Z',
          },
        ],
      });
    }
    return Promise.resolve({ rows: [] });
  });

  mockRegistrationDb.query.mockResolvedValue({
    rows: [
      {
        id: SCHEDULE_ID,
        module_id: '66666666-6666-6666-6666-666666666666',
        practicum_name: 'Praktikum Basis Data',
        module_name: 'Modul 1',
      },
    ],
  });
}

describe('feedbackMemberReportService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSemesterScope();
  });

  describe('getMemberSummary', () => {
    it('returns eligible, submitted, and pending counts', async () => {
      mockEligibleSessions();

      const result = await getMemberSummary({ semester_code: 'active' }, USER);

      expect(result.eligible_count).toBe(2);
      expect(result.submitted_count).toBe(1);
      expect(result.pending_count).toBe(1);
      expect(result.active_survey).toMatchObject({
        id: SURVEY_ID,
        title: 'Exit Survey FRI',
      });
      expect(result.period.semester_code).toBe('2025/2026-Ganjil');
    });

    it('returns zero counts when user has no identifiers', async () => {
      mockResolveUserIdentifiers.mockResolvedValue([]);
      mockConductDb.query.mockResolvedValue({ rows: [] });

      const result = await getMemberSummary({}, { id: '', roles: [] });

      expect(result.eligible_count).toBe(0);
      expect(result.submitted_count).toBe(0);
      expect(result.pending_count).toBe(0);
    });
  });

  describe('listMemberResponses', () => {
    it('returns session items with pending and submitted status', async () => {
      mockEligibleSessions();

      const result = await listMemberResponses({}, USER);

      expect(result.items).toHaveLength(2);
      expect(result.items.find((i) => i.operational_session_id === SESSION_SUBMITTED).status).toBe(
        'submitted'
      );
      expect(result.items.find((i) => i.operational_session_id === SESSION_PENDING).status).toBe(
        'pending'
      );
    });
  });

  describe('getMemberResponseDetail', () => {
    it('throws when operational_session_id is empty', async () => {
      await expect(getMemberResponseDetail('', {}, USER)).rejects.toThrow(
        'operational_session_id wajib diisi'
      );
    });

    it('throws when session is not in eligible scope', async () => {
      mockEligibleSessions();

      await expect(
        getMemberResponseDetail('99999999-9999-9999-9999-999999999999', {}, USER)
      ).rejects.toThrow('Data feedback tidak ditemukan atau akses ditolak');
    });

    it('returns pending payload without survey answers', async () => {
      mockEligibleSessions();

      const result = await getMemberResponseDetail(SESSION_PENDING, {}, USER);

      expect(result.submitted).toBe(false);
      expect(result.status).toBe('pending');
      expect(result.sections).toEqual([]);
      expect(result.answers).toEqual([]);
      expect(result.survey).toBeNull();
    });

    it('returns submitted response with parsed answers', async () => {
      mockEligibleSessions();

      mockConductDb.query.mockImplementation((sql, params) => {
        if (sql.includes("status = 'active'") && sql.includes('exit_surveys')) {
          return Promise.resolve({
            rows: [{ id: SURVEY_ID, title: 'Exit Survey FRI', description: 'Deskripsi' }],
          });
        }
        if (sql.includes('practicum_operational_sessions')) {
          return Promise.resolve({
            rows: [
              {
                operational_session_id: SESSION_SUBMITTED,
                registration_schedule_id: SCHEDULE_ID,
                practicum_name: 'Praktikum Basis Data',
                module_name: 'Modul 1',
                module_id: null,
                response_id: RESPONSE_ID,
                submitted_at: '2026-05-25T10:00:00.000Z',
                scheduled_date: '2026-05-25',
                session_status: 'completed',
                completed_at: '2026-05-25T10:00:00.000Z',
              },
            ],
          });
        }
        if (sql.includes('SELECT *') && sql.includes('FROM exit_survey_responses')) {
          return Promise.resolve({
            rows: [{ id: RESPONSE_ID, exit_survey_id: SURVEY_ID }],
          });
        }
        if (sql.includes('exit_survey_response_answers')) {
          return Promise.resolve({
            rows: [{ question_id: 'q-1', answer: 'Sangat baik' }],
          });
        }
        if (sql.includes('FROM exit_surveys') && sql.includes('exit_survey_id FROM')) {
          return Promise.resolve({
            rows: [{ id: SURVEY_ID, title: 'Exit Survey FRI', description: 'Desc', status: 'active' }],
          });
        }
        if (sql.includes('exit_survey_sections')) {
          return Promise.resolve({
            rows: [{ id: 'sec-1', exit_survey_id: SURVEY_ID, title: 'Umum', sort_order: 1 }],
          });
        }
        if (sql.includes('exit_survey_questions')) {
          return Promise.resolve({
            rows: [
              {
                id: 'q-1',
                exit_survey_id: SURVEY_ID,
                section_id: 'sec-1',
                question_text: 'Bagaimana pengalaman Anda?',
                question_type: 'short_text',
                sort_order: 1,
                options: null,
                rows: null,
                columns: null,
                scale_labels: null,
              },
            ],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      mockRegistrationDb.query.mockResolvedValue({
        rows: [
          {
            id: SCHEDULE_ID,
            module_id: '66666666-6666-6666-6666-666666666666',
            practicum_name: 'Praktikum Basis Data',
            module_name: 'Modul 1',
          },
        ],
      });

      const result = await getMemberResponseDetail(SESSION_SUBMITTED, {}, USER);

      expect(result.submitted).toBe(true);
      expect(result.survey.title).toBe('Exit Survey FRI');
      expect(result.answers).toHaveLength(1);
      expect(result.answers[0]).toMatchObject({
        question_id: 'q-1',
        answer: 'Sangat baik',
        answer_display: 'Sangat baik',
      });
    });
  });
});
