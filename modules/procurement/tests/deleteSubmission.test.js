/**
 * Unit tests untuk deleteSubmissionItem & deleteSubmission controller.
 * - Mock service layer sehingga tidak menyentuh DB.
 * - Meniru gaya test lain di folder yang sama.
 */
import { jest } from '@jest/globals';

jest.unstable_mockModule('../services/submissionService.js', () => ({
  getItemById: jest.fn(),
  deleteItem: jest.fn(),
  getSubmissionById: jest.fn(),
  deleteSubmission: jest.fn()
}));

const svc = await import('../services/submissionService.js');
const controller = await import('../controllers/submissionController.js');

function makeReq({ params = {}, user = null } = {}) {
  return { params, user };
}
function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}
function makeNext() { return jest.fn(); }

describe('deleteSubmissionItem controller', () => {
  beforeEach(() => jest.clearAllMocks());

  test('200 - success when item pending and owner', async () => {
    const req = makeReq({ params: { itemId: 'i1' }, user: { id: 'owner-1' } });
    const res = makeRes();
    const next = makeNext();

    svc.getItemById.mockResolvedValue({ id: 'i1', submission_id: 'p1', status: 'pending' });
    svc.deleteItem.mockResolvedValue({ id: 'i1', item_name: 'Kertas A4' });

    await controller.deleteSubmissionItem(req, res, next);

    expect(svc.getItemById).toHaveBeenCalledWith('i1');
    expect(svc.deleteItem).toHaveBeenCalledWith('i1', 'owner-1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: expect.objectContaining({ id: 'i1' }) }));
  });

  test('401 - unauthorized when no user', async () => {
    const req = makeReq({ params: { itemId: 'i2' }, user: null });
    const res = makeRes();
    const next = makeNext();

    await controller.deleteSubmissionItem(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(svc.getItemById).not.toHaveBeenCalled();
  });

  test('404 - item not found', async () => {
    const req = makeReq({ params: { itemId: 'missing' }, user: { id: 'u1' } });
    const res = makeRes();
    const next = makeNext();

    svc.getItemById.mockResolvedValue(null);

    await controller.deleteSubmissionItem(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('409 - not pending', async () => {
    const req = makeReq({ params: { itemId: 'i3' }, user: { id: 'u1' } });
    const res = makeRes();
    const next = makeNext();

    svc.getItemById.mockResolvedValue({ id: 'i3', submission_id: 'p1', status: 'approved' });
    // service will still be called but throw NOT_PENDING when controller calls deleteItem
    svc.deleteItem.mockRejectedValue({ code: 'NOT_PENDING' });

    await controller.deleteSubmissionItem(req, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  test('403 - forbidden when service throws FORBIDDEN', async () => {
    const req = makeReq({ params: { itemId: 'i4' }, user: { id: 'u2' } });
    const res = makeRes();
    const next = makeNext();

    svc.getItemById.mockResolvedValue({ id: 'i4', submission_id: 'p2', status: 'pending' });
    svc.deleteItem.mockRejectedValue({ code: 'FORBIDDEN' });

    await controller.deleteSubmissionItem(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('next called when deleteItem throws unexpected error', async () => {
    const req = makeReq({ params: { itemId: 'i5' }, user: { id: 'u3' } });
    const res = makeRes();
    const next = makeNext();

    svc.getItemById.mockResolvedValue({ id: 'i5', submission_id: 'p3', status: 'pending' });
    const err = new Error('boom');
    svc.deleteItem.mockRejectedValue(err);

    await controller.deleteSubmissionItem(req, res, next);

    expect(next).toHaveBeenCalledWith(err);
  });
});

describe('deleteSubmission controller', () => {
  beforeEach(() => jest.clearAllMocks());

  test('200 - success when owner and all items pending', async () => {
    const req = makeReq({ params: { id: 'p1' }, user: { id: 'owner-1' } });
    const res = makeRes();
    const next = makeNext();

    svc.getSubmissionById.mockResolvedValue({ id: 'p1', requester_id: 'owner-1' });
    svc.deleteSubmission.mockResolvedValue({ id: 'p1' });

    await controller.deleteSubmission(req, res, next);

    expect(svc.getSubmissionById).toHaveBeenCalledWith('p1');
    expect(svc.deleteSubmission).toHaveBeenCalledWith('p1', 'owner-1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: expect.objectContaining({ id: 'p1' }) }));
  });

  test('401 - unauthorized when no user', async () => {
    const req = makeReq({ params: { id: 'p2' }, user: null });
    const res = makeRes();
    const next = makeNext();

    await controller.deleteSubmission(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(svc.getSubmissionById).not.toHaveBeenCalled();
  });

  test('404 - submission not found', async () => {
    const req = makeReq({ params: { id: 'missing' }, user: { id: 'u1' } });
    const res = makeRes();
    const next = makeNext();

    svc.getSubmissionById.mockResolvedValue(null);

    await controller.deleteSubmission(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('409 - not pending items', async () => {
    const req = makeReq({ params: { id: 'p3' }, user: { id: 'u1' } });
    const res = makeRes();
    const next = makeNext();

    svc.getSubmissionById.mockResolvedValue({ id: 'p3', requester_id: 'u1' });
    svc.deleteSubmission.mockRejectedValue({ code: 'NOT_PENDING_ITEMS' });

    await controller.deleteSubmission(req, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  test('403 - forbidden when service throws FORBIDDEN', async () => {
    const req = makeReq({ params: { id: 'p4' }, user: { id: 'u2' } });
    const res = makeRes();
    const next = makeNext();

    svc.getSubmissionById.mockResolvedValue({ id: 'p4', requester_id: 'owner-x' });
    svc.deleteSubmission.mockRejectedValue({ code: 'FORBIDDEN' });

    await controller.deleteSubmission(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('next called when deleteSubmission throws unexpected error', async () => {
    const req = makeReq({ params: { id: 'p5' }, user: { id: 'u3' } });
    const res = makeRes();
    const next = makeNext();

    svc.getSubmissionById.mockResolvedValue({ id: 'p5', requester_id: 'u3' });
    const err = new Error('fatal');
    svc.deleteSubmission.mockRejectedValue(err);

    await controller.deleteSubmission(req, res, next);

    expect(next).toHaveBeenCalledWith(err);
  });
});
