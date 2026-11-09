/**
 * Unit tests for getAllSubmissionsForTPA controller.
 * - Mocks service layer so tests don't touch DB.
 */
import { jest } from '@jest/globals';

jest.unstable_mockModule('../services/submissionService.js', () => ({
  getAllSubmissions: jest.fn()
}));

const svc = await import('../services/submissionService.js');
const controller = await import('../controllers/submissionController.js');

function makeReq({ query = {}, user = null } = {}) {
  return { query, user };
}
function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}
function makeNext() { return jest.fn(); }

describe('getAllSubmissionsForTPA controller', () => {
  beforeEach(() => jest.clearAllMocks());

  test('403 - forbidden when user not TPA', async () => {
    const req = makeReq({ user: { id: 'u1', role: 'dosen' } });
    const res = makeRes();
    const next = makeNext();

    await controller.getAllSubmissionsForTPA(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('200 - returns paginated submissions for TPA (default limit 10)', async () => {
    const req = makeReq({ user: { id: 'tpa-1', role: 'tpa' } });
    const res = makeRes();
    const next = makeNext();

    svc.getAllSubmissions.mockResolvedValue([
      { id: 'p1', status: 'submitted', items: [{ id: 'i1', status: 'pending' }] }
    ]);

    await controller.getAllSubmissionsForTPA(req, res, next);

    expect(svc.getAllSubmissions).toHaveBeenCalledWith({ limit: 10, offset: 0 });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('parses items when service returns JSON string', async () => {
    const req = makeReq({ user: { id: 'tpa-2', role: 'tpa' } });
    const res = makeRes();
    const next = makeNext();

    svc.getAllSubmissions.mockResolvedValue([
      { id: 'p2', status: 'draft', items: JSON.stringify([{ id: 'i2', status: 'approved' }]) }
    ]);

    await controller.getAllSubmissionsForTPA(req, res, next);

    const called = res.json.mock.calls[0][0];
    expect(Array.isArray(called.data)).toBe(true);
    expect(called.data[0].items).toBeInstanceOf(Array);
    expect(called.data[0].items[0].status).toBe('approved');
  });

  test('pagination params respected', async () => {
    const req = makeReq({ query: { page: '2', limit: '5' }, user: { id: 'tpa-3', role: 'tpa' } });
    const res = makeRes();
    const next = makeNext();

    svc.getAllSubmissions.mockResolvedValue([]);

    await controller.getAllSubmissionsForTPA(req, res, next);

    expect(svc.getAllSubmissions).toHaveBeenCalledWith({ limit: 5, offset: 5 });
  });

  test('401 - unauthorized when no user', async () => {
    const req = makeReq({ user: null });
    const res = makeRes();
    const next = makeNext();

    await controller.getAllSubmissionsForTPA(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('next called on service error', async () => {
    const req = makeReq({ user: { id: 'tpa-4', role: 'tpa' } });
    const res = makeRes();
    const next = makeNext();

    const err = new Error('boom');
    svc.getAllSubmissions.mockRejectedValue(err);

    await controller.getAllSubmissionsForTPA(req, res, next);

    expect(next).toHaveBeenCalledWith(err);
  });
});
