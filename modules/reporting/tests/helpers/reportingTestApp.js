/**
 * Mini Express app untuk uji route reporting dengan controller & auth di-mock.
 */

import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

export const mockFeedbackController = {
  getMemberSummary: jest.fn((req, res) =>
    res.json({
      success: true,
      data: { eligible_count: 1, submitted_count: 0, pending_count: 1 },
    })
  ),
  listMemberResponses: jest.fn((req, res) =>
    res.json({ success: true, data: { items: [] } })
  ),
  getMemberResponseDetail: jest.fn((req, res) =>
    res.json({ success: true, data: { submitted: false, status: 'pending' } })
  ),
  getPraktikumStats: jest.fn((req, res) =>
    res.json({ success: true, data: { stats: [] } })
  ),
  getFeedbackModules: jest.fn((req, res) =>
    res.json({ success: true, data: { modules: [] } })
  ),
  getTopAndWorstReviews: jest.fn((req, res) =>
    res.json({ success: true, data: {} })
  ),
};

export const mockKehadiranController = {
  listSessions: jest.fn((req, res) =>
    res.json({ success: true, data: [] })
  ),
  getSummary: jest.fn((req, res) =>
    res.json({ success: true, data: { session_count: 0 } })
  ),
  getSessionDetail: jest.fn((req, res) =>
    res.json({ success: true, data: { id: req.params.operationalSessionId } })
  ),
};

export const mockNilaiController = {
  listGrades: jest.fn((req, res) =>
    res.json({ success: true, data: [] })
  ),
  getSummary: jest.fn((req, res) =>
    res.json({ success: true, data: { display_mode: 'module', module_count: 0 } })
  ),
  listModules: jest.fn((req, res) =>
    res.json({ success: true, data: { display_mode: 'module', items: [] } })
  ),
  getModuleDetail: jest.fn((req, res) =>
    res.json({ success: true, data: { module_id: req.params.moduleId, students: [] } })
  ),
  getGradeDetail: jest.fn((req, res) =>
    res.json({ success: true, data: { id: req.params.gradeId } })
  ),
};

export const mockKeuanganController = {
  getPeriods: jest.fn((req, res) => res.json({ success: true, data: [] })),
  createNewPeriod: jest.fn(),
  getPeriodSummaryHandler: jest.fn(),
  getProdiBudgets: jest.fn(),
  createProdiBudget: jest.fn(),
  updateProdiBudgetHandler: jest.fn(),
  getProdiBudgetDetail: jest.fn(),
  getTransactions: jest.fn(),
  uploadKpaFile: jest.fn(),
  getUploads: jest.fn(),
  listAllUploads: jest.fn(),
  deleteKpaUpload: jest.fn(),
  getBudgetSummaryHandler: jest.fn(),
  reprocessKpa: jest.fn(),
};

export function createMockValidateJWT() {
  return jest.fn((req, res, next) => {
    const auth = req.headers.authorization;
    if (!auth || !String(auth).startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }
    req.user = { id: 'test-user-id', roles: ['mahasiswa'] };
    next();
  });
}

export const passThrough = jest.fn((req, res, next) => next());

export async function buildReportingTestApp() {
  jest.resetModules();

  const mockValidateJWT = createMockValidateJWT();

  jest.unstable_mockModule('../../../../core/auth/jwt-validator.js', () => ({
    validateJWT: mockValidateJWT,
  }));

  jest.unstable_mockModule('../../middleware/roleAuthMiddleware.js', () => ({
    requireViewReportAccess: passThrough,
    requireKehadiranReportAccess: passThrough,
    requireNilaiReportAccess: passThrough,
    requireKeuanganReportAccess: passThrough,
    requireManageReportAccess: passThrough,
    requireKpaKaurTpaDeleteAccess: passThrough,
    filterByRole: passThrough,
  }));

  jest.unstable_mockModule('../../middleware/keuanganScopeMiddleware.js', () => ({
    attachKeuanganAccessScope: passThrough,
  }));

  jest.unstable_mockModule('../../controllers/feedbackController.js', () => ({
    ...mockFeedbackController,
  }));

  jest.unstable_mockModule('../../controllers/kehadiranController.js', () => ({
    ...mockKehadiranController,
  }));

  jest.unstable_mockModule('../../controllers/nilaiController.js', () => ({
    ...mockNilaiController,
  }));

  jest.unstable_mockModule('../../controllers/keuanganController.js', () => ({
    ...mockKeuanganController,
  }));

  const { default: reportingRoutes } = await import('../../routes.js');
  const app = express();
  app.use(express.json());
  app.use('/api/reporting', reportingRoutes);

  return { app, mockValidateJWT, request };
}
