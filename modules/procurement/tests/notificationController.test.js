import { jest } from '@jest/globals';

// Mock the notification service used by the controller
jest.unstable_mockModule('../services/notificationService.js', () => ({
  listNotificationsForUser: jest.fn(),
  markNotificationRead: jest.fn()
}));

const svc = await import('../services/notificationService.js');
const controller = await import('../controllers/notificationController.js');

function makeReq({ user = null, query = {}, params = {} } = {}) { return { user, query, params }; }
function makeRes() { const res = {}; res.status = jest.fn().mockReturnValue(res); res.json = jest.fn().mockReturnValue(res); return res; }
function makeNext() { return jest.fn(); }

describe('notificationController', () => {
  beforeEach(() => jest.clearAllMocks());

  test('401 when no user for list', async () => {
    const req = makeReq({ user: null });
    const res = makeRes();
    const next = makeNext();

    await controller.getNotifications(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('200 returns list and meta', async () => {
    const user = { id: 'user-1' };
    const req = makeReq({ user });
    const res = makeRes();
    const next = makeNext();

    const sample = [
      { id: 1, user_id: 'user-1', title: 'T1', message: 'M1', is_read: false },
      { id: 2, user_id: 'user-1', title: 'T2', message: 'M2', is_read: true }
    ];

    svc.listNotificationsForUser.mockResolvedValue(sample);

    await controller.getNotifications(req, res, next);

    expect(svc.listNotificationsForUser).toHaveBeenCalledWith(user.id, { limit: 20, offset: 0 });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: sample, meta: expect.any(Object) }));
  });

  test('200 respects page & limit query', async () => {
    const user = { id: 'user-2' };
    const req = makeReq({ user, query: { page: '2', limit: '5' } });
    const res = makeRes();
    const next = makeNext();

    svc.listNotificationsForUser.mockResolvedValue([]);

    await controller.getNotifications(req, res, next);

    // page 2 with limit 5 -> offset = 5
    expect(svc.listNotificationsForUser).toHaveBeenCalledWith(user.id, { limit: 5, offset: 5 });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('401 when no user for markAsRead', async () => {
    const req = makeReq({ user: null, params: { id: '1' } });
    const res = makeRes();
    const next = makeNext();

    await controller.markAsRead(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('200 mark as read when found', async () => {
    const user = { id: 'user-3' };
    const req = makeReq({ user, params: { id: '10' } });
    const res = makeRes();
    const next = makeNext();

    const row = { id: 10, user_id: 'user-3', is_read: true };
    svc.markNotificationRead.mockResolvedValue(row);

    await controller.markAsRead(req, res, next);

    expect(svc.markNotificationRead).toHaveBeenCalledWith('10', 'user-3');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: row }));
  });

  test('404 when mark as read not found', async () => {
    const user = { id: 'user-4' };
    const req = makeReq({ user, params: { id: '999' } });
    const res = makeRes();
    const next = makeNext();

    svc.markNotificationRead.mockResolvedValue(null);

    await controller.markAsRead(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});
