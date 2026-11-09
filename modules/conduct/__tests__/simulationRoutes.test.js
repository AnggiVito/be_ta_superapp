import { jest } from '@jest/globals';

const mockValidateJWT = jest.fn((req, res, next) => next());
const mockRequireRole = jest.fn((...roles) => {
  const middleware = (req, res, next) => next();
  middleware.allowedRoles = roles;
  return middleware;
});

const mockQrAttendanceController = {
  generateQRCode: jest.fn(),
  getActiveSession: jest.fn(),
  scanQRCode: jest.fn(),
  getQRHistory: jest.fn(),
  checkOut: jest.fn(),
  getAttendanceStatus: jest.fn(),
  getAttendanceHistory: jest.fn(),
};

const mockPermitController = {
  submitPermit: jest.fn(),
  submitAssistantPermit: jest.fn(),
  getAssistantPermitsForCoordinator: jest.fn(),
  reviewAssistantPermit: jest.fn(),
  getPermitStatisticsForLaboran: jest.fn(),
  getMyPermits: jest.fn(),
  reviewPermit: jest.fn(),
};

const mockSimulationController = {
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
};

jest.unstable_mockModule('../../../core/auth/jwt-validator.js', () => ({
  validateJWT: mockValidateJWT,
}));

jest.unstable_mockModule('../../user-management/middleware/roleValidator.js', () => ({
  requireRole: mockRequireRole,
}));

jest.unstable_mockModule('../controllers/qrAttendanceController.js', () => mockQrAttendanceController);
jest.unstable_mockModule('../controllers/permitController.js', () => mockPermitController);
jest.unstable_mockModule('../controllers/simulationController.js', () => mockSimulationController);

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

describe('Simulation Routes - Task #48', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should allow koordinator and active assistants to view simulation list', () => {
    expect(getAllowedRoles('/simulations', 'get')).toEqual([
      'koordinator_praktikum',
      'asisten_praktikum_aktif',
    ]);
  });

  test('should allow koordinator and active assistants to view simulation detail', () => {
    expect(getAllowedRoles('/simulations/:simulationId', 'get')).toEqual([
      'koordinator_praktikum',
      'asisten_praktikum_aktif',
    ]);
  });

  test('should keep simulation creation restricted to koordinator only', () => {
    expect(getAllowedRoles('/simulations', 'post')).toEqual([
      'koordinator_praktikum',
    ]);
  });

  test('should keep simulation management restricted to koordinator only', () => {
    expect(getAllowedRoles('/simulations/:simulationId', 'patch')).toEqual([
      'koordinator_praktikum',
    ]);
    expect(getAllowedRoles('/simulations/:simulationId', 'put')).toEqual([
      'koordinator_praktikum',
    ]);
    expect(getAllowedRoles('/simulations/:simulationId', 'delete')).toEqual([
      'koordinator_praktikum',
    ]);
  });

  test('should keep open/close session restricted to koordinator only', () => {
    expect(getAllowedRoles('/simulations/:simulationId/open', 'patch')).toEqual([
      'koordinator_praktikum',
    ]);
    expect(getAllowedRoles('/simulations/:simulationId/close', 'patch')).toEqual([
      'koordinator_praktikum',
    ]);
    expect(getAllowedRoles('/simulations/:simulationId/result', 'post')).toEqual([
      'koordinator_praktikum',
    ]);
    expect(
      getAllowedRoles('/simulations/:simulationId/result/attachments/:attachmentId', 'delete')
    ).toEqual([
      'koordinator_praktikum',
    ]);
  });

  test('should register all simulation handlers', () => {
    expect(findRoute('/simulations', 'get')).toBeDefined();
    expect(findRoute('/simulations', 'post')).toBeDefined();
    expect(findRoute('/simulations/:simulationId', 'get')).toBeDefined();
    expect(findRoute('/simulations/:simulationId', 'patch')).toBeDefined();
    expect(findRoute('/simulations/:simulationId', 'put')).toBeDefined();
    expect(findRoute('/simulations/:simulationId', 'delete')).toBeDefined();
    expect(
      findRoute('/simulations/:simulationId/attendance-qr/generate', 'post')
    ).toBeDefined();
    expect(
      findRoute('/simulations/:simulationId/attendance-qr/active', 'get')
    ).toBeDefined();
    expect(
      findRoute('/simulations/:simulationId/attendance-qr/stream', 'get')
    ).toBeDefined();
    expect(
      findRoute('/simulations/:simulationId/attendance/scan', 'post')
    ).toBeDefined();
    expect(findRoute('/simulations/:simulationId/attendance', 'get')).toBeDefined();
    expect(findRoute('/simulations/:simulationId/open', 'patch')).toBeDefined();
    expect(findRoute('/simulations/:simulationId/close', 'patch')).toBeDefined();
    expect(findRoute('/simulations/:simulationId/result', 'post')).toBeDefined();
    expect(
      findRoute('/simulations/:simulationId/result/attachments/:attachmentId', 'delete')
    ).toBeDefined();
  });
});
