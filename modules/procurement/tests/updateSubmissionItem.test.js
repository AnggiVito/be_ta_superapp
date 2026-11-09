/**
 * Unit tests untuk updateSubmissionItem controller.
 * - Mock service layer sehingga tidak menyentuh DB.
 * - Sesuaikan dengan response shape di controller (error: "...", success: true).
 *
 * Run:
 * node --experimental-vm-modules ./node_modules/jest/bin/jest.js modules/procurement/tests/updateSubmissionItem.test.js --runInBand --verbose
 */
import { jest } from '@jest/globals';

jest.unstable_mockModule('../services/submissionService.js', () => ({
  getItemById: jest.fn(),
  getSubmissionById: jest.fn(),
  updateItem: jest.fn()
}));

const svc = await import('../services/submissionService.js');
const controller = await import('../controllers/submissionController.js');

function makeReq({ params = {}, body = {}, user = null } = {}) {
  return { params, body, user, headers: {} };
}
function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}
function makeNext() { return jest.fn(); }

describe('updateSubmissionItem controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('200 - success when item pending and requester is owner', async () => {
    const req = makeReq({
      params: { itemId: 'i1' },
      body: { quantity: 3, unit_price: 6000 },
      user: { id: 'user-1' }
    });
    const res = makeRes();
    const next = makeNext();

  svc.getItemById.mockResolvedValue({ id: 'i1', status: 'pending', unit_price: 5000, quantity: 2, submission_id: 'p1' });
  svc.getSubmissionById.mockResolvedValue({ id: 'p1', requester_id: 'user-1' });
    svc.updateItem.mockResolvedValue({ id: 'i1', quantity: 3, unit_price: 6000, total_price: 18000 });

  await controller.updateSubmissionItem(req, res, next);

    expect(svc.getItemById).toHaveBeenCalledWith('i1');
  expect(svc.getSubmissionById).toHaveBeenCalledWith('p1');
    expect(svc.updateItem).toHaveBeenCalledWith('i1', expect.objectContaining({ quantity: 3, unit_price: 6000 }));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: expect.objectContaining({ id: 'i1' }) }));
    expect(next).not.toHaveBeenCalled();
  });

  test('400 - validation fails when body has no editable fields', async () => {
    const req = makeReq({ params: { itemId: 'i1' }, body: {}, user: { id: 'user-1' } });
    const res = makeRes();
    const next = makeNext();

  await controller.updateSubmissionItem(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
    expect(svc.getItemById).not.toHaveBeenCalled();
  });

  test('404 - item not found', async () => {
    const req = makeReq({ params: { itemId: 'missing' }, body: { quantity: 1 }, user: { id: 'user-1' } });
    const res = makeRes();
    const next = makeNext();

    svc.getItemById.mockResolvedValue(null);

  await controller.updateSubmissionItem(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });

  test('409 - cannot update when status not pending', async () => {
    const req = makeReq({ params: { itemId: 'i2' }, body: { quantity: 1 }, user: { id: 'user-1' } });
    const res = makeRes();
    const next = makeNext();

  svc.getItemById.mockResolvedValue({ id: 'i2', status: 'approved', submission_id: 'p1' });
  svc.getSubmissionById.mockResolvedValue({ id: 'p1', requester_id: 'user-1' });

  await controller.updateSubmissionItem(req, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
    expect(svc.updateItem).not.toHaveBeenCalled();
  });

  test('403 - forbidden when requester_id does not match', async () => {
    const req = makeReq({ params: { itemId: 'i3' }, body: { unit_price: 1000 }, user: { id: 'other-user' } });
    const res = makeRes();
    const next = makeNext();

  svc.getItemById.mockResolvedValue({ id: 'i3', status: 'pending', submission_id: 'p2' });
  svc.getSubmissionById.mockResolvedValue({ id: 'p2', requester_id: 'owner-user' });

  await controller.updateSubmissionItem(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
    expect(svc.updateItem).not.toHaveBeenCalled();
  });

  test('401 - unauthorized when no user', async () => {
    const req = makeReq({ params: { itemId: 'i4' }, body: { quantity: 2 }, user: null });
    const res = makeRes();
    const next = makeNext();

  await controller.updateSubmissionItem(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(svc.getItemById).not.toHaveBeenCalled();
  });

  test('next called when service.updateItem throws (internal error)', async () => {
    const req = makeReq({ params: { itemId: 'i5' }, body: { quantity: 2 }, user: { id: 'user-1' } });
    const res = makeRes();
    const next = makeNext();

  svc.getItemById.mockResolvedValue({ id: 'i5', status: 'pending', unit_price: 1000, quantity: 1, submission_id: 'p1' });
  svc.getSubmissionById.mockResolvedValue({ id: 'p1', requester_id: 'user-1' });
    const testErr = new Error('DB error');
    svc.updateItem.mockRejectedValue(testErr);

  await controller.updateSubmissionItem(req, res, next);

    expect(next).toHaveBeenCalledWith(testErr);
  });
});
