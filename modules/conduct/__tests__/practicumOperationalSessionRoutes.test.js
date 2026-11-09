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

// practicum-sessions deprecated

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
  listOperationalSessionAttendancePlotHistory: jest.fn(),
  reassignOperationalSessionAttendancePlot: jest.fn(),
  bulkReassignOperationalSessionAttendancePlot: jest.fn(),
}));

jest.unstable_mockModule('../controllers/practicumBapController.js', () => ({
  listBaps: jest.fn(),
  getBapBySession: jest.fn(),
  generateBapForSession: jest.fn(),
  refreshSignatureSnapshots: jest.fn(),
  exportBapExcel: jest.fn(),
  exportBapCsv: jest.fn(),
  exportBapPdf: jest.fn(),
  updateIncidentNotes: jest.fn(),
  reviewByLaboran: jest.fn(),
  updateIncidentNotes: jest.fn(),
  generateLecturerSignatureQr: jest.fn(),
  getActiveLecturerSignatureQr: jest.fn(),
  signBapByLecturer: jest.fn(),
}));

jest.unstable_mockModule('../controllers/practicumAssessmentController.js', () => ({
  listAssistantGradingSessions: jest.fn(),
  listGradingStudents: jest.fn(),
  getGradingForm: jest.fn(),
  submitStudentGrade: jest.fn(),
  listGradesForReporting: jest.fn(),
}));

jest.unstable_mockModule('../controllers/registrationPlotScheduleController.js', () => ({
  listPlottedPracticumSchedules: jest.fn(),
}));

jest.unstable_mockModule('../controllers/exitSurveyController.js', () => ({
  getStudentActiveExitSurvey: jest.fn(),
  getMyExitSurveyResponse: jest.fn(),
  submitExitSurveyResponse: jest.fn(),
  createExitSurvey: jest.fn(),
  listExitSurveys: jest.fn(),
  getExitSurveyDetail: jest.fn(),
  updateExitSurvey: jest.fn(),
  deleteExitSurvey: jest.fn(),
  activateExitSurvey: jest.fn(),
  archiveExitSurvey: jest.fn(),
  listExitSurveySections: jest.fn(),
  createExitSurveySection: jest.fn(),
  reorderExitSurveyBuilderItems: jest.fn(),
  reorderExitSurveySections: jest.fn(),
  updateExitSurveySection: jest.fn(),
  deleteExitSurveySection: jest.fn(),
  listExitSurveyQuestions: jest.fn(),
  createExitSurveyQuestion: jest.fn(),
  reorderExitSurveyQuestions: jest.fn(),
  updateExitSurveyQuestion: jest.fn(),
  deleteExitSurveyQuestion: jest.fn(),
}));

const { default: router } = await import('../routes.js');

function findRoute(path, method) {
  return router.stack.find((layer) => {
    return layer.route?.path === path && layer.route?.methods?.[method];
  })?.route;
}

function countRoutes(path, method) {
  return router.stack.filter((layer) => {
    return layer.route?.path === path && layer.route?.methods?.[method];
  }).length;
}

function getAllowedRoles(path, method) {
  const route = findRoute(path, method);
  const roleMiddleware = route?.stack
    .map((layer) => layer.handle)
    .find((handler) => Array.isArray(handler.allowedRoles));

  return roleMiddleware?.allowedRoles ?? [];
}

describe('Practicum Operational Session Routes (#19)', () => {
  test('should restrict operational session lifecycle roles', () => {
    expect(getAllowedRoles('/practicum-operational-sessions', 'post')).toEqual([
      'asisten_praktikum',
    ]);
    expect(getAllowedRoles('/practicum-operational-sessions', 'get')).toEqual([
      'koordinator_praktikum',
      'asisten_praktikum',
      'asisten_praktikum_aktif',
      'dosen',
      'laboran',
      'mahasiswa',
    ]);
    expect(getAllowedRoles('/practicum-operational-sessions/:id', 'get')).toEqual([
      'koordinator_praktikum',
      'asisten_praktikum',
      'asisten_praktikum_aktif',
      'dosen',
      'laboran',
      'mahasiswa',
    ]);
    expect(getAllowedRoles('/practicum-operational-sessions/:id/join', 'post')).toEqual([
      'asisten_praktikum',
      'asisten_praktikum_aktif',
    ]);
    expect(getAllowedRoles('/practicum-operational-sessions/:id/status', 'patch')).toEqual([
      'asisten_praktikum',
      'asisten_praktikum_aktif',
      'koordinator_praktikum',
    ]);
    expect(getAllowedRoles('/practicum-operational-sessions/:id/start', 'post')).toEqual([
      'asisten_praktikum',
      'asisten_praktikum_aktif',
    ]);
    expect(
      getAllowedRoles('/practicum-operational-sessions/:id/complete', 'post')
    ).toEqual(['asisten_praktikum', 'asisten_praktikum_aktif']);
    expect(
      getAllowedRoles('/practicum-operational-sessions/:id/activation-qr', 'get')
    ).toEqual(['asisten_praktikum', 'asisten_praktikum_aktif']);
    expect(
      getAllowedRoles('/practicum-operational-sessions/:id/attendance-qr/generate', 'post')
    ).toEqual(['asisten_praktikum', 'asisten_praktikum_aktif']);
    expect(
      getAllowedRoles('/practicum-operational-sessions/:id/attendance-qr/active', 'get')
    ).toEqual(['asisten_praktikum', 'asisten_praktikum_aktif']);
    expect(
      getAllowedRoles('/practicum-operational-sessions/:id/attendance/check-in', 'post')
    ).toEqual(['mahasiswa']);
    expect(
      getAllowedRoles('/practicum-operational-sessions/attendance/me', 'get')
    ).toEqual(['mahasiswa']);
    expect(
      getAllowedRoles('/practicum-operational-sessions/:id/attendance', 'get')
    ).toEqual(['asisten_praktikum', 'asisten_praktikum_aktif', 'koordinator_praktikum', 'mahasiswa']);
    expect(
      getAllowedRoles('/practicum-operational-sessions/:id/bap/incident', 'patch')
    ).toEqual(['asisten_praktikum', 'asisten_praktikum_aktif']);
    expect(
      getAllowedRoles('/practicum-operational-sessions/:id/bap/laboran-review', 'patch')
    ).toEqual(['laboran', 'kaur_lab']);
    expect(
      getAllowedRoles('/practicum-operational-sessions/:id/bap/signature/generate-qr', 'post')
    ).toEqual(['asisten_praktikum', 'asisten_praktikum_aktif', 'koordinator_praktikum', 'laboran', 'kaur_lab']);
    expect(
      getAllowedRoles('/practicum-operational-sessions/:id/bap/signature/active-qr', 'get')
    ).toEqual(['asisten_praktikum', 'asisten_praktikum_aktif', 'koordinator_praktikum', 'laboran', 'kaur_lab']);
    expect(
      getAllowedRoles('/practicum-operational-sessions/:id/bap/signature/scan', 'post')
    ).toEqual(['dosen']);
    expect(
      getAllowedRoles('/practicum-operational-sessions/:id/bap/export-csv', 'get')
    ).toEqual(['koordinator_praktikum', 'asisten_praktikum', 'asisten_praktikum_aktif', 'dosen', 'laboran', 'kaur_lab']);
    expect(
      getAllowedRoles('/practicum-operational-sessions/:id/bap/export-pdf', 'get')
    ).toEqual(['koordinator_praktikum', 'asisten_praktikum', 'asisten_praktikum_aktif', 'dosen', 'laboran', 'kaur_lab']);
  });

  test('should not register legacy QR attendance routes', () => {
    expect(findRoute('/qr-attendance/generate', 'post')).toBeUndefined();
    expect(findRoute('/qr-attendance/active/:jadwalId', 'get')).toBeUndefined();
    expect(findRoute('/qr-attendance/scan', 'post')).toBeUndefined();
    expect(findRoute('/qr-attendance/history/:jadwalId', 'get')).toBeUndefined();
    expect(findRoute('/qr-attendance/:attendanceId/checkout', 'post')).toBeUndefined();
    expect(findRoute('/attendance/status/:jadwalId', 'get')).toBeUndefined();
    expect(findRoute('/attendance/history', 'get')).toBeUndefined();
  });

  test('should register BAP lecturer signature routes once', () => {
    expect(
      countRoutes('/practicum-operational-sessions/:id/bap/signature/generate-qr', 'post')
    ).toBe(1);
    expect(
      countRoutes('/practicum-operational-sessions/:id/bap/signature/active-qr', 'get')
    ).toBe(1);
    expect(
      countRoutes('/practicum-operational-sessions/:id/bap/signature/scan', 'post')
    ).toBe(1);
  });
});
