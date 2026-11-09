/**
 * Route wiring tests — feedback (member + staf), kehadiran, nilai.
 */

import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';
import {
  buildReportingTestApp,
  mockFeedbackController,
  mockKehadiranController,
  mockNilaiController,
} from './helpers/reportingTestApp.js';

const AUTH = { Authorization: 'Bearer test-token' };

describe('Reporting routes — conduct reporting API', () => {
  let app;
  let request;

  beforeAll(async () => {
    const ctx = await buildReportingTestApp();
    app = ctx.app;
    request = ctx.request;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('authentication', () => {
    it('returns 401 without JWT on feedback member summary', async () => {
      const res = await request(app).get('/api/reporting/feedback/my-summary');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('feedback — member (exit survey)', () => {
    it('GET /feedback/my-summary', async () => {
      const res = await request(app)
        .get('/api/reporting/feedback/my-summary')
        .set(AUTH)
        .query({ semester_code: 'active' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('eligible_count');
      expect(mockFeedbackController.getMemberSummary).toHaveBeenCalled();
    });

    it('GET /feedback/my-responses', async () => {
      const res = await request(app)
        .get('/api/reporting/feedback/my-responses')
        .set(AUTH)
        .query({ semester_code: '2025/2026-Ganjil' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('items');
      expect(mockFeedbackController.listMemberResponses).toHaveBeenCalled();
    });

    it('GET /feedback/my-responses/:operationalSessionId', async () => {
      const sessionId = '11111111-1111-1111-1111-111111111111';
      const res = await request(app)
        .get(`/api/reporting/feedback/my-responses/${sessionId}`)
        .set(AUTH);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockFeedbackController.getMemberResponseDetail).toHaveBeenCalled();
    });
  });

  describe('feedback — staff aggregate', () => {
    it('GET /feedback/praktikum-stats', async () => {
      const res = await request(app)
        .get('/api/reporting/feedback/praktikum-stats')
        .set(AUTH);

      expect(res.status).toBe(200);
      expect(mockFeedbackController.getPraktikumStats).toHaveBeenCalled();
    });

    it('GET /feedback/modules', async () => {
      const res = await request(app)
        .get('/api/reporting/feedback/modules')
        .set(AUTH)
        .query({ practicum_name: 'Praktikum Basis Data' });

      expect(res.status).toBe(200);
      expect(mockFeedbackController.getFeedbackModules).toHaveBeenCalled();
    });
  });

  describe('kehadiran', () => {
    it('GET /kehadiran/summary', async () => {
      const res = await request(app)
        .get('/api/reporting/kehadiran/summary')
        .set(AUTH)
        .query({ semester_code: 'active', view_mode: 'mine' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockKehadiranController.getSummary).toHaveBeenCalled();
    });

    it('GET /kehadiran/sessions', async () => {
      const res = await request(app)
        .get('/api/reporting/kehadiran/sessions')
        .set(AUTH);

      expect(res.status).toBe(200);
      expect(mockKehadiranController.listSessions).toHaveBeenCalled();
    });

    it('GET /kehadiran/sessions/:operationalSessionId', async () => {
      const sessionId = '22222222-2222-2222-2222-222222222222';
      const res = await request(app)
        .get(`/api/reporting/kehadiran/sessions/${sessionId}`)
        .set(AUTH);

      expect(res.status).toBe(200);
      expect(mockKehadiranController.getSessionDetail).toHaveBeenCalled();
    });
  });

  describe('nilai', () => {
    it('GET /nilai/summary', async () => {
      const res = await request(app)
        .get('/api/reporting/nilai/summary')
        .set(AUTH)
        .query({ semester_code: 'active' });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('display_mode');
      expect(mockNilaiController.getSummary).toHaveBeenCalled();
    });

    it('GET /nilai/modules', async () => {
      const res = await request(app)
        .get('/api/reporting/nilai/modules')
        .set(AUTH);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('items');
      expect(mockNilaiController.listModules).toHaveBeenCalled();
    });

    it('GET /nilai/modules/:moduleId', async () => {
      const moduleId = '33333333-3333-3333-3333-333333333333';
      const res = await request(app)
        .get(`/api/reporting/nilai/modules/${moduleId}`)
        .set(AUTH);

      expect(res.status).toBe(200);
      expect(mockNilaiController.getModuleDetail).toHaveBeenCalled();
    });

    it('GET /nilai/grades', async () => {
      const res = await request(app)
        .get('/api/reporting/nilai/grades')
        .set(AUTH);

      expect(res.status).toBe(200);
      expect(mockNilaiController.listGrades).toHaveBeenCalled();
    });

    it('GET /nilai/grades/:gradeId', async () => {
      const gradeId = '44444444-4444-4444-4444-444444444444';
      const res = await request(app)
        .get(`/api/reporting/nilai/grades/${gradeId}`)
        .set(AUTH);

      expect(res.status).toBe(200);
      expect(mockNilaiController.getGradeDetail).toHaveBeenCalled();
    });
  });

  describe('route ordering', () => {
    it('does not treat practikum-stats as operationalSessionId', async () => {
      const res = await request(app)
        .get('/api/reporting/feedback/praktikum-stats')
        .set(AUTH);

      expect(res.status).toBe(200);
      expect(mockFeedbackController.getPraktikumStats).toHaveBeenCalled();
      expect(mockFeedbackController.getMemberResponseDetail).not.toHaveBeenCalled();
    });
  });
});
