import { jest } from '@jest/globals';

const client = {
  query: jest.fn(),
  release: jest.fn(),
};
const mockConductDb = {
  query: jest.fn(),
  connect: jest.fn(() => client),
};
const mockRegistrationDb = {
  query: jest.fn(),
};

jest.unstable_mockModule('../../../config/databases.js', () => ({
  conductDb: mockConductDb,
  registrationDb: mockRegistrationDb,
}));

const {
  createExitSurvey,
  activateExitSurvey,
  deleteExitSurvey,
  listExitSurveys,
  updateExitSurvey,
  createExitSurveyQuestion,
  updateExitSurveyQuestion,
  deleteExitSurveyQuestion,
  listExitSurveyQuestions,
  reorderExitSurveyQuestions,
  getStudentExitSurveySubmissionDetail,
} = await import('../services/exitSurveyService.js');

describe('Exit Survey Service (#44)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockConductDb.connect.mockReturnValue(client);
  });

  test('should create FRI feedback survey as draft', async () => {
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 'survey-1', title: 'Feedback FRI', status: 'draft' }],
      })
      .mockResolvedValueOnce({});

    const result = await createExitSurvey({
      requesterUserId: 'laboran-1',
      payload: {
        title: 'Feedback FRI',
        description: 'Feedback Fakultas Rekayasa Industri',
      },
    });

    expect(client.query).toHaveBeenCalledWith('BEGIN');
    expect(client.query.mock.calls[1][0]).toContain('INSERT INTO exit_surveys');
    expect(result.title).toBe('Feedback FRI');
  });

  test('should reject missing title', async () => {
    await expect(
      createExitSurvey({
        requesterUserId: 'laboran-1',
        payload: {},
      })
    ).rejects.toThrow('title wajib diisi');
  });

  test('should update survey title and description', async () => {
    mockConductDb.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ id: 'survey-1', title: 'Exit Survey Updated', description: 'Updated' }],
    });

    const result = await updateExitSurvey({
      id: 'survey-1',
      requesterUserId: 'laboran-1',
      payload: { title: 'Exit Survey Updated', description: 'Updated' },
    });

    expect(mockConductDb.query.mock.calls[0][0]).toContain('UPDATE exit_surveys');
    expect(result.title).toBe('Exit Survey Updated');
  });

  test('should soft delete survey', async () => {
    mockConductDb.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ id: 'survey-1', deleted_at: new Date() }],
    });

    const result = await deleteExitSurvey({ id: 'survey-1', requesterUserId: 'laboran-1' });

    expect(mockConductDb.query.mock.calls[0][0]).toContain('deleted_at = NOW()');
    expect(result.id).toBe('survey-1');
  });

  test('should archive active survey before activating another survey', async () => {
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'survey-2', status: 'active' }] })
      .mockResolvedValueOnce({});

    const result = await activateExitSurvey({ id: 'survey-2', requesterUserId: 'laboran-1' });

    expect(client.query.mock.calls[1][0]).toContain("status = 'archived'");
    expect(client.query.mock.calls[2][0]).toContain("status = 'active'");
    expect(result.status).toBe('active');
  });

  test('should list surveys', async () => {
    mockConductDb.query.mockResolvedValueOnce({ rows: [{ id: 'survey-1', title: 'Feedback FRI' }] });

    const result = await listExitSurveys();

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Feedback FRI');
  });

  test('should create choice question with options', async () => {
    mockConductDb.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'survey-1' }] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 'question-1', question_type: 'single_choice', options: ['Baik', 'Kurang'] }],
      });

    const result = await createExitSurveyQuestion({
      surveyId: 'survey-1',
      requesterUserId: 'laboran-1',
      payload: {
        question_text: 'Bagaimana kualitas praktikum?',
        question_type: 'single_choice',
        options: ['Baik', 'Kurang'],
      },
    });

    expect(mockConductDb.query.mock.calls[1][0]).toContain('INSERT INTO exit_survey_questions');
    expect(mockConductDb.query.mock.calls[1][1][5]).toBe('["Baik","Kurang"]');
    expect(result.question_type).toBe('single_choice');
  });

  test('should create rating question with default range', async () => {
    mockConductDb.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'survey-1' }] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 'question-1', question_type: 'rating', min_rating: 1, max_rating: 5 }],
      });

    await createExitSurveyQuestion({
      surveyId: 'survey-1',
      requesterUserId: 'laboran-1',
      payload: {
        question_text: 'Beri rating praktikum',
        question_type: 'rating',
      },
    });

    expect(mockConductDb.query.mock.calls[1][1][9]).toBe(1);
    expect(mockConductDb.query.mock.calls[1][1][10]).toBe(5);
  });

  test('should create grid question with rows and columns', async () => {
    mockConductDb.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'survey-1' }] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 'question-1', question_type: 'multiple_choice_grid' }],
      });

    await createExitSurveyQuestion({
      surveyId: 'survey-1',
      requesterUserId: 'laboran-1',
      payload: {
        question_text: 'Nilai setiap aspek',
        question_type: 'multiple_choice_grid',
        rows: ['Materi', 'Asisten'],
        columns: ['Baik', 'Cukup'],
      },
    });

    expect(mockConductDb.query.mock.calls[1][1][6]).toBe('["Materi","Asisten"]');
    expect(mockConductDb.query.mock.calls[1][1][7]).toBe('["Baik","Cukup"]');
  });

  test('should create dropdown question with options', async () => {
    mockConductDb.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'survey-1' }] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 'question-1', question_type: 'dropdown' }],
      });

    await createExitSurveyQuestion({
      surveyId: 'survey-1',
      requesterUserId: 'laboran-1',
      payload: {
        question_text: 'Pilih kelas',
        question_type: 'dropdown',
        options: ['A', 'B'],
      },
    });

    expect(mockConductDb.query.mock.calls[1][1][5]).toBe('["A","B"]');
  });

  test('should reject choice question without enough options', async () => {
    await expect(
      createExitSurveyQuestion({
        surveyId: 'survey-1',
        requesterUserId: 'laboran-1',
        payload: {
          question_text: 'Pilih kualitas',
          question_type: 'multiple_choice',
          options: ['Baik'],
        },
      })
    ).rejects.toThrow('Pilihan jawaban minimal 2');
  });

  test('should reject grid question without enough rows', async () => {
    await expect(
      createExitSurveyQuestion({
        surveyId: 'survey-1',
        requesterUserId: 'laboran-1',
        payload: {
          question_text: 'Grid',
          question_type: 'checkbox_grid',
          rows: ['Materi'],
          columns: ['Baik', 'Kurang'],
        },
      })
    ).rejects.toThrow('Baris minimal 2');
  });

  test('should reject invalid rating range', async () => {
    await expect(
      createExitSurveyQuestion({
        surveyId: 'survey-1',
        requesterUserId: 'laboran-1',
        payload: {
          question_text: 'Rating',
          question_type: 'rating',
          min_rating: 5,
          max_rating: 1,
        },
      })
    ).rejects.toThrow('Rentang skala tidak valid');
  });

  test('should update question', async () => {
    mockConductDb.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ id: 'question-1', question_text: 'Updated' }],
    });

    const result = await updateExitSurveyQuestion({
      surveyId: 'survey-1',
      questionId: 'question-1',
      requesterUserId: 'laboran-1',
      payload: { question_text: 'Updated', question_type: 'textarea', is_required: false },
    });

    expect(mockConductDb.query.mock.calls[0][0]).toContain('UPDATE exit_survey_questions');
    expect(result.question_text).toBe('Updated');
  });

  test('should soft delete question', async () => {
    mockConductDb.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ id: 'question-1', deleted_at: new Date() }],
    });

    const result = await deleteExitSurveyQuestion({
      surveyId: 'survey-1',
      questionId: 'question-1',
      requesterUserId: 'laboran-1',
    });

    expect(mockConductDb.query.mock.calls[0][0]).toContain('deleted_at = NOW()');
    expect(result.id).toBe('question-1');
  });

  test('should list questions', async () => {
    mockConductDb.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'survey-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'question-1' }] });

    const result = await listExitSurveyQuestions({ surveyId: 'survey-1' });

    expect(result).toHaveLength(1);
  });

  test('should reorder questions in transaction', async () => {
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'question-1' }, { id: 'question-2' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'question-2' }, { id: 'question-1' }] })
      .mockResolvedValueOnce({});

    const result = await reorderExitSurveyQuestions({
      surveyId: 'survey-1',
      requesterUserId: 'laboran-1',
      questionIds: ['question-2', 'question-1'],
    });

    expect(client.query).toHaveBeenCalledWith('BEGIN');
    expect(client.query.mock.calls[2][0]).toContain('SET sort_order = $3');
    expect(result).toHaveLength(2);
  });

  test('should return submitted exit survey detail with answers for student', async () => {
    mockRegistrationDb.query.mockResolvedValueOnce({
      rows: [{
        registration_schedule_id: 'schedule-1',
        module_id: 'module-1',
        module_name: 'Modul A',
        practicum_id: 'practicum-1',
        practicum_name: 'Praktikum A',
      }],
    });

    mockConductDb.query
      .mockResolvedValueOnce({
        rows: [{
          id: 'response-1',
          exit_survey_id: 'survey-1',
          operational_session_id: 'session-1',
          submitted_at: '2026-06-07T10:00:00.000Z',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          id: 'session-1',
          registration_schedule_id: 'schedule-1',
          session_status: 'completed',
        }],
      })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ '?column?': 1 }] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 'survey-1', title: 'Exit Survey A', status: 'active' }],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'section-1', title: 'Bagian 1', sort_order: 0 }] })
      .mockResolvedValueOnce({
        rows: [{
          id: 'question-1',
          question_text: 'Bagaimana pengalaman Anda?',
          question_type: 'text',
          sort_order: 1,
        }],
      })
      .mockResolvedValueOnce({
        rows: [{ question_id: 'question-1', answer: 'Sangat baik' }],
      });

    const result = await getStudentExitSurveySubmissionDetail({
      requesterUserId: 'student-1',
      operationalSessionId: 'session-1',
    });

    expect(result.submitted).toBe(true);
    expect(result.survey.id).toBe('survey-1');
    expect(result.answers['question-1']).toBe('Sangat baik');
    expect(result.context.practicum_name).toBe('Praktikum A');
  });
});
