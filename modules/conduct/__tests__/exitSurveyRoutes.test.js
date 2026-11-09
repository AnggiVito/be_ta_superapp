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
  updateOperationalSessionStatus: jest.fn(),
  startOperationalSession: jest.fn(),
  completeOperationalSession: jest.fn(),
}));

jest.unstable_mockModule('../controllers/practicumOperationalSessionQrController.js', () => ({
  generateOperationalSessionActivationQr: jest.fn(),
  generateOperationalSessionQr: jest.fn(),
  getActiveOperationalSessionQr: jest.fn(),
}));

jest.unstable_mockModule('../controllers/practicumOperationalSessionAttendanceController.js', () => ({
  checkInOperationalSessionAttendance: jest.fn(),
  listMyOperationalSessionAttendances: jest.fn(),
  listOperationalSessionAttendances: jest.fn(),
}));

jest.unstable_mockModule('../controllers/registrationPlotScheduleController.js', () => ({
  listPlottedPracticumSchedules: jest.fn(),
}));

jest.unstable_mockModule('../controllers/exitSurveyController.js', () => ({
  createExitSurvey: jest.fn(),
  listExitSurveys: jest.fn(),
  getExitSurveyDetail: jest.fn(),
  updateExitSurvey: jest.fn(),
  deleteExitSurvey: jest.fn(),
  activateExitSurvey: jest.fn(),
  archiveExitSurvey: jest.fn(),
  listExitSurveyQuestions: jest.fn(),
  createExitSurveyQuestion: jest.fn(),
  updateExitSurveyQuestion: jest.fn(),
  deleteExitSurveyQuestion: jest.fn(),
  reorderExitSurveyQuestions: jest.fn(),
  listExitSurveySections: jest.fn(),
  createExitSurveySection: jest.fn(),
  updateExitSurveySection: jest.fn(),
  deleteExitSurveySection: jest.fn(),
  reorderExitSurveySections: jest.fn(),
  reorderExitSurveyBuilderItems: jest.fn(),
  getStudentActiveExitSurvey: jest.fn(),
  getMyExitSurveyResponse: jest.fn(),
  submitExitSurveyResponse: jest.fn(),
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

describe('Exit Survey Routes (#44)', () => {
  test('should restrict exit survey management to laboran', () => {
    expect(getAllowedRoles('/exit-surveys/student/active', 'get')).toEqual(['mahasiswa']);
    expect(getAllowedRoles('/exit-surveys/student/responses/:operationalSessionId', 'get')).toEqual(['mahasiswa']);
    expect(getAllowedRoles('/exit-surveys/student/responses', 'post')).toEqual(['mahasiswa']);
    expect(getAllowedRoles('/exit-surveys', 'post')).toEqual(['laboran']);
    expect(getAllowedRoles('/exit-surveys', 'get')).toEqual(['laboran']);
    expect(getAllowedRoles('/exit-surveys/:id', 'get')).toEqual(['laboran']);
    expect(getAllowedRoles('/exit-surveys/:id', 'put')).toEqual(['laboran']);
    expect(getAllowedRoles('/exit-surveys/:id', 'delete')).toEqual(['laboran']);
    expect(getAllowedRoles('/exit-surveys/:id/activate', 'post')).toEqual(['laboran']);
    expect(getAllowedRoles('/exit-surveys/:id/archive', 'post')).toEqual(['laboran']);
    expect(getAllowedRoles('/exit-surveys/:id/builder/reorder', 'put')).toEqual(['laboran']);
    expect(getAllowedRoles('/exit-surveys/:id/sections', 'get')).toEqual(['laboran']);
    expect(getAllowedRoles('/exit-surveys/:id/sections', 'post')).toEqual(['laboran']);
    expect(getAllowedRoles('/exit-surveys/:id/sections/reorder', 'put')).toEqual(['laboran']);
    expect(getAllowedRoles('/exit-surveys/:id/sections/:sectionId', 'put')).toEqual(['laboran']);
    expect(getAllowedRoles('/exit-surveys/:id/sections/:sectionId', 'delete')).toEqual(['laboran']);
    expect(getAllowedRoles('/exit-surveys/:id/questions', 'get')).toEqual(['laboran']);
    expect(getAllowedRoles('/exit-surveys/:id/questions', 'post')).toEqual(['laboran']);
    expect(getAllowedRoles('/exit-surveys/:id/questions/reorder', 'put')).toEqual(['laboran']);
    expect(getAllowedRoles('/exit-surveys/:id/questions/:questionId', 'put')).toEqual(['laboran']);
    expect(getAllowedRoles('/exit-surveys/:id/questions/:questionId', 'delete')).toEqual(['laboran']);
  });
});
