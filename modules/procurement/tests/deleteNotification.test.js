import { jest } from '@jest/globals';

jest.unstable_mockModule('../services/notificationService.js', () => ({
  deleteNotification: jest.fn()
}));

const svc = await import('../services/notificationService.js');
const controller = await import('../controllers/notificationController.js');

function makeReq({ params = {}, user = null } = {}) { return { params, user }; }
function makeRes() { const res = {}; res.status = jest.fn().mockReturnValue(res); res.json = jest.fn().mockReturnValue(res); return res; }
function makeNext() { return jest.fn(); }

describe('deleteNotif controller', () => {
  beforeEach(() => jest.clearAllMocks());

  test('401 when no user', async () => {
    const req = makeReq({ params: { id: '10' }, user: null });
    const res = makeRes();
    const next = makeNext();

    await controller.deleteNotif(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('404 when service returns null', async () => {
    const req = makeReq({ params: { id: '99' }, user: { id: 'u1' } });
    const res = makeRes();
    const next = makeNext();

    svc.deleteNotification.mockResolvedValue(null);
    await controller.deleteNotif(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('200 on success and returns deleted notification', async () => {
    const req = makeReq({ params: { id: '5' }, user: { id: 'user-123' } });
    const res = makeRes();
    const next = makeNext();

    const deleted = { id: 5, user_id: 'user-123', title: 'Test' };
    svc.deleteNotification.mockResolvedValue(deleted);

    await controller.deleteNotif(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: deleted }));
  });
});
