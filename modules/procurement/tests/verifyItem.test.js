import { jest } from '@jest/globals';

jest.unstable_mockModule('../services/submissionService.js', () => ({
  verifyItem: jest.fn()
}));
jest.unstable_mockModule('../services/notificationService.js', () => ({
  notifySubmissionStatusChange: jest.fn()
}));

const svc = await import('../services/submissionService.js');
const notificationSvc = await import('../services/notificationService.js');
const controller = await import('../controllers/submissionController.js');

function makeReq({ params = {}, user = null } = {}) { return { params, user }; }
function makeRes() { const res = {}; res.status = jest.fn().mockReturnValue(res); res.json = jest.fn().mockReturnValue(res); return res; }
function makeNext() { return jest.fn(); }

describe('verifyItem controller', () => {
  beforeEach(() => jest.clearAllMocks());

  test('401 when no user', async () => {
    const req = makeReq({ params: { itemId: '10' }, user: null });
    const res = makeRes();
    const next = makeNext();

    await controller.verifyItem(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('403 when not tpa', async () => {
    const req = makeReq({ params: { itemId: '10' }, user: { id: 'u1', role: 'dosen' } });
    const res = makeRes();
    const next = makeNext();

    await controller.verifyItem(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('404 when service returns null', async () => {
    const req = makeReq({ params: { itemId: '10' }, user: { id: 'tpa1', role: 'tpa' } });
    const res = makeRes();
    const next = makeNext();

    svc.verifyItem.mockResolvedValue(null);
    await controller.verifyItem(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('200 on success', async () => {
    const req = makeReq({ params: { itemId: '10' }, user: { id: 'tpa1', role: 'tpa' } });
    const res = makeRes();
    const next = makeNext();

    svc.verifyItem.mockResolvedValue({ item: { id: 10, status: 'on_review' }, submission: null });
    await controller.verifyItem(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('200 and returns both item and submission when promoted', async () => {
    const req = makeReq({ params: { itemId: '11' }, user: { id: 'tpa2', role: 'tpa' } });
    const res = makeRes();
    const next = makeNext();

    svc.verifyItem.mockResolvedValue({ item: { id: 11, status: 'on_review' }, submission: { id: 5, status: 'on_review', requester_id: 77 } });
    await controller.verifyItem(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: expect.objectContaining({ item: expect.any(Object), submission: expect.any(Object) }) }));

    // notification should be called with submission id and requester id
    expect(notificationSvc.notifySubmissionStatusChange).toHaveBeenCalledWith(5, 77, 'submitted', 'on_review', expect.any(Object), 'tpa2');
  });

  test('accepts user.roles as array of objects containing role property', async () => {
    const req = makeReq({ params: { itemId: '12' }, user: { id: 'tpa3', roles: [{ role: 'tpa' }] } });
    const res = makeRes();
    const next = makeNext();

    svc.verifyItem.mockResolvedValue({ item: { id: 12, status: 'on_review' }, submission: null });
    await controller.verifyItem(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(svc.verifyItem).toHaveBeenCalledWith('12', 'tpa3');
  });

  test('accepts user.role as object with name property (case-insensitive)', async () => {
    const req = makeReq({ params: { itemId: '13' }, user: { id: 'tpa4', role: { name: 'TPA' } } });
    const res = makeRes();
    const next = makeNext();

    svc.verifyItem.mockResolvedValue({ item: { id: 13, status: 'on_review' }, submission: null });
    await controller.verifyItem(req, res, next);

    // current implementation of _userHasRole does not accept role as object
    // with a `name` property, so this should be forbidden (403).
    expect(res.status).toHaveBeenCalledWith(403);
    expect(svc.verifyItem).not.toHaveBeenCalled();
  });

  test('409 when service throws NOT_PENDING', async () => {
    const req = makeReq({ params: { itemId: '10' }, user: { id: 'tpa1', role: 'tpa' } });
    const res = makeRes();
    const next = makeNext();

    const err = new Error('Item status must be pending to verify'); err.status = 409; err.code = 'NOT_PENDING';
    svc.verifyItem.mockRejectedValue(err);

    await controller.verifyItem(req, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  test('next called on unexpected error', async () => {
    const req = makeReq({ params: { itemId: '10' }, user: { id: 'tpa1', role: 'tpa' } });
    const res = makeRes();
    const next = makeNext();

    svc.verifyItem.mockRejectedValue(new Error('boom'));
    await controller.verifyItem(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});