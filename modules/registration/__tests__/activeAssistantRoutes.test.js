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

jest.unstable_mockModule('../controllers/activeAssistantController.js', () => ({
  downloadTemplate: jest.fn(),
  importActiveAssistants: jest.fn(),
  listActiveAssistants: jest.fn(),
}));

const { default: activeAssistantRoutes } = await import('../routes/activeAssistantRoutes.js');

function findRoute(path, method) {
  return activeAssistantRoutes.stack.find(
    (layer) => layer.route?.path === path && layer.route?.methods?.[method]
  )?.route;
}

function getRouteRoles(path, method) {
  const route = findRoute(path, method);
  const roleMiddleware = route?.stack
    .map((layer) => layer.handle)
    .find((handler) => Array.isArray(handler.allowedRoles));
  return roleMiddleware?.allowedRoles ?? [];
}

describe('activeAssistantRoutes', () => {
  test('import requires kaur_lab or laboran', () => {
    expect(getRouteRoles('/import', 'post')).toEqual(['kaur_lab', 'laboran']);
  });

  test('list requires kaur_lab or laboran', () => {
    expect(getRouteRoles('/', 'get')).toEqual(['kaur_lab', 'laboran']);
  });

  test('template download requires kaur_lab or laboran', () => {
    expect(getRouteRoles('/template/download', 'get')).toEqual(['kaur_lab', 'laboran']);
  });
});
