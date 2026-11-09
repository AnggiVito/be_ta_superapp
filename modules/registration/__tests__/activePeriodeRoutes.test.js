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

jest.unstable_mockModule('../controllers/activePeriodeController.js', () => ({
  getActivePeriode: jest.fn(),
  setActivePeriode: jest.fn(),
}));

const { default: activePeriodeRoutes } = await import('../routes/activePeriodeRoutes.js');

function findRoute(method) {
  return activePeriodeRoutes.stack.find(
    (layer) => layer.route?.path === '/' && layer.route?.methods?.[method]
  )?.route;
}

function getPutRoles() {
  const route = findRoute('put');
  const roleMiddleware = route?.stack
    .map((layer) => layer.handle)
    .find((handler) => Array.isArray(handler.allowedRoles));
  return roleMiddleware?.allowedRoles ?? [];
}

describe('activePeriodeRoutes', () => {
  test('PUT requires kaur_lab, koordinator_praktikum, or laboran', () => {
    expect(getPutRoles()).toEqual(['kaur_lab', 'koordinator_praktikum', 'laboran']);
  });

  test('GET has no role restriction beyond JWT', () => {
    const route = findRoute('get');
    const hasRoleMiddleware = route?.stack.some((layer) =>
      Array.isArray(layer.handle?.allowedRoles)
    );
    expect(hasRoleMiddleware).toBe(false);
  });
});
