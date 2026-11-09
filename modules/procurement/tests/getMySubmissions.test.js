/**
 * Unit tests for getMySubmissions controller.
 * - Mocks service layer so tests don't touch DB.
 */
import { jest } from '@jest/globals';

jest.unstable_mockModule('../services/submissionService.js', () => ({
  getSubmissionsByRequester: jest.fn()
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

describe('getMySubmissions controller', () => {
  beforeEach(() => jest.clearAllMocks());

  test('200 - default page size 10 and returns submissions', async () => {
    const req = makeReq({ user: { id: 'user-1' } });
    const res = makeRes();
    const next = makeNext();

    svc.getSubmissionsByRequester.mockResolvedValue([
      { id: 'p1', status: 'submitted', items: [{ id: 'i1', status: 'pending' }] }
    ]);

    await controller.getMySubmissions(req, res, next);

    expect(svc.getSubmissionsByRequester).toHaveBeenCalledWith('user-1', { limit: 10, offset: 0 });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, meta: expect.objectContaining({ limit: 10 }) }));
  });

  test('200 - parses items when returned as JSON string', async () => {
    const req = makeReq({ user: { id: 'user-2' } });
    const res = makeRes();
    const next = makeNext();

    svc.getSubmissionsByRequester.mockResolvedValue([
      { id: 'p2', status: 'draft', items: JSON.stringify([{ id: 'i2', status: 'approved' }]) }
    ]);

    await controller.getMySubmissions(req, res, next);

    const calledJson = res.json.mock.calls[0][0];
    expect(Array.isArray(calledJson.data)).toBe(true);
    expect(calledJson.data[0].items).toBeInstanceOf(Array);
    expect(calledJson.data[0].items[0].status).toBe('approved');
  });

  test('pagination params are respected', async () => {
    const req = makeReq({ query: { page: '2', limit: '5' }, user: { id: 'user-3' } });
    const res = makeRes();
    const next = makeNext();

    svc.getSubmissionsByRequester.mockResolvedValue([]);

    await controller.getMySubmissions(req, res, next);

    expect(svc.getSubmissionsByRequester).toHaveBeenCalledWith('user-3', { limit: 5, offset: 5 });
  });

  test('401 - unauthorized when no user', async () => {
    const req = makeReq({ user: null });
    const res = makeRes();
    const next = makeNext();

    await controller.getMySubmissions(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(svc.getSubmissionsByRequester).not.toHaveBeenCalled();
  });

  test('next called on service error', async () => {
    const req = makeReq({ user: { id: 'user-4' } });
    const res = makeRes();
    const next = makeNext();

    const err = new Error('boom');
    svc.getSubmissionsByRequester.mockRejectedValue(err);

    await controller.getMySubmissions(req, res, next);

    expect(next).toHaveBeenCalledWith(err);
  });
});
