import { jest } from '@jest/globals';

const mockValidateJWT = jest.fn((req, res, next) => next());
const mockRequireRole = jest.fn((...roles) => {
  const middleware = (req, res, next) => next();
  middleware.allowedRoles = roles;
  return middleware;
});

jest.unstable_mockModule('../../../core/auth/jwt-validator.js', () => ({
  validateJWT: mockValidateJWT,
}));

jest.unstable_mockModule('../../user-management/middleware/roleValidator.js', () => ({
  requireRole: mockRequireRole,
}));

// Mock controllers referenced by routes.js
jest.unstable_mockModule('../controllers/qrAttendanceController.js', () => ({
  generateQRCode: jest.fn(),
  getActiveSession: jest.fn(),
  scanQRCode: jest.fn(),
  getQRHistory: jest.fn(),
  checkOut: jest.fn(),
  getAttendanceStatus: jest.fn(),
  getAttendanceHistory: jest.fn(),
}));

jest.unstable_mockModule('../controllers/permitController.js', () => ({
  submitPermit: jest.fn(),
  submitAssistantPermit: jest.fn(),
  getPraktikanPermitsForPic: jest.fn(),
  getAssistantPermitsForCoordinator: jest.fn(),
  reviewAssistantPermit: jest.fn(),
  getPermitStatisticsForLaboran: jest.fn(),
  getMyPermits: jest.fn(),
  getPicPermitsForReview: jest.fn(),
  reviewPermit: jest.fn(),
  reviewAssistantPermit: jest.fn(),
}));

jest.unstable_mockModule('../controllers/simulationController.js', () => ({
  createSimulation: jest.fn(),
  listSimulations: jest.fn(),
  getSimulationDetail: jest.fn(),
  updateSimulation: jest.fn(),
  deleteSimulation: jest.fn(),
  generateSimulationAttendanceQR: jest.fn(),
  getActiveSimulationQrHandler: jest.fn(),
  rollingQrStream: jest.fn(),
  scanSimulationAttendance: jest.fn(),
  getSimulationAttendanceList: jest.fn(),
  openSimulationSession: jest.fn(),
  closeSimulationSession: jest.fn(),
  submitSimulationResult: jest.fn(),
  deleteSimulationResultAttachment: jest.fn(),
}));

jest.unstable_mockModule('../controllers/registrationMasterDataController.js', () => ({
  listRegistrationPracticums: jest.fn(),
  listRegistrationPracticumModules: jest.fn(),
  listRegistrationSchedules: jest.fn(),
}));

jest.unstable_mockModule('../controllers/practicumOperationalSessionController.js', () => ({
  createOperationalSession: jest.fn(),
  listOperationalSessions: jest.fn(),
  getOperationalSessionDetail: jest.fn(),
  joinOperationalSessionViaQr: jest.fn(),
  requestOperationalApproval: jest.fn(),
  bypassOperationalApproval: jest.fn(),
  getBypassEvidence: jest.fn(),
  listOperationalSessionAssistants: jest.fn(),
  setOperationalSessionAssistants: jest.fn(),
  reviewOperationalSession: jest.fn(),
  updateOperationalSessionStatus: jest.fn(),
  startOperationalSession: jest.fn(),
  completeOperationalSession: jest.fn(),
}));

jest.unstable_mockModule('../controllers/registrationPlotScheduleController.js', () => ({
  listPlottedPracticumSchedules: jest.fn(),
}));

const { default: router } = await import('../routes.js');

function findRoute(path, method) {
  return router.stack.find((layer) => {
    return layer.route?.path === path && layer.route?.methods?.[method];
  })?.route;
}

function getAllowedRoles(path, method) {
  const route = findRoute(path, method);
  const roleMiddleware = route?.stack
    .map((layer) => layer.handle)
    .find((handler) => Array.isArray(handler.allowedRoles));

  return roleMiddleware?.allowedRoles ?? [];
}

describe('Registration Plot Schedule Routes (dummy integration)', () => {
  test('should allow coordinator, assistants, lecturer, laboran to read plot schedules', () => {
    expect(getAllowedRoles('/registration/plot-schedules', 'get')).toEqual([
      'koordinator_praktikum',
      'asisten_praktikum',
      'asisten_praktikum_aktif',
      'dosen',
      'laboran',
    ]);
  });
});

