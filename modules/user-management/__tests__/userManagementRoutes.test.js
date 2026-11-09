import { jest } from '@jest/globals';

const mockValidateJWT = jest.fn((req, res, next) => next());
const mockRequireRole = jest.fn((...roles) => {
  const middleware = (req, res, next) => next();
  middleware.allowedRoles = roles;
  return middleware;
});
const mockRequireOwnerOrRole = jest.fn((...roles) => {
  const middleware = (req, res, next) => next();
  middleware.allowedRoles = roles;
  return middleware;
});

jest.unstable_mockModule('../../../core/auth/jwt-validator.js', () => ({
  validateJWT: mockValidateJWT,
}));

jest.unstable_mockModule('../middleware/roleValidator.js', () => ({
  requireRole: mockRequireRole,
  requireOwnerOrRole: mockRequireOwnerOrRole,
}));

jest.unstable_mockModule('../middleware/uploadMiddleware.js', () => ({
  uploadTTDMiddleware: jest.fn((req, res, next) => next()),
  handleUploadError: jest.fn((err, req, res, next) => next(err)),
}));

jest.unstable_mockModule('../controllers/profileController.js', () => ({
  getUserProfile: jest.fn(),
  updateUserProfile: jest.fn(),
  listUsersWithAccessCards: jest.fn(),
  getAccessCredentials: jest.fn(),
  updateAccessCredentials: jest.fn(),
  uploadTTD: jest.fn(),
  deleteTTD: jest.fn(),
  updateNoRekening: jest.fn(),
}));

jest.unstable_mockModule('../controllers/roleController.js', () => ({
  getAllUsers: jest.fn(),
  getUserRoles: jest.fn(),
  assignRole: jest.fn(),
  updateRoleStatus: jest.fn(),
  removeRole: jest.fn(),
  getUsersByRole: jest.fn(),
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

describe('User Management Routes', () => {
  test('should allow coordinator, kaur_lab, and laboran to list users', () => {
    expect(getAllowedRoles('/users', 'get')).toEqual([
      'koordinator_praktikum',
      'kaur_lab',
      'laboran',
    ]);
  });

  test('should allow owner, kaur_lab, and laboran to read profile', () => {
    expect(getAllowedRoles('/users/:userId/profile', 'get')).toEqual(['kaur_lab', 'laboran']);
  });

  test('should restrict access-credentials get/put to kaur_lab and laboran only', () => {
    for (const method of ['get', 'put']) {
      const route = findRoute('/users/:userId/profile/access-credentials', method);
      expect(route).toBeDefined();
      const roleMiddleware = route.stack
        .map((layer) => layer.handle)
        .find((handler) => Array.isArray(handler.allowedRoles));
      expect(roleMiddleware.allowedRoles).toEqual(['kaur_lab', 'laboran']);
    }
  });

  test('should allow kaur_lab, laboran, and tpa to list users with access cards', () => {
    expect(getAllowedRoles('/users/with-access-cards', 'get')).toEqual([
      'kaur_lab',
      'laboran',
      'tpa',
    ]);
  });
});
