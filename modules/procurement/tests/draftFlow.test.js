import { jest } from '@jest/globals';

jest.unstable_mockModule('../services/draftService.js', () => ({
  createDraft: jest.fn(),
  getDraftsByUser: jest.fn(),
  getDraftById: jest.fn(),
  updateDraftMerged: jest.fn(),
  deleteDraft: jest.fn(),
}));

jest.unstable_mockModule('../services/submissionService.js', () => ({
  create: jest.fn(),
  createItem: jest.fn(),
  findByIdWithItems: jest.fn()
}));

const draftSvc = await import('../services/draftService.js');
const submissionSvc = await import('../services/submissionService.js');
const controller = await import('../controllers/draftController.js');

function makeReq({ body = {}, params = {}, user = null, query = {} } = {}) {
  return { body, params, user, query };
}
function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}
function makeNext() { return jest.fn(); }

describe('Draft controller (unit) flows', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('createDraft -> 201', async () => {
    const req = makeReq({ body: { title: 'Draft 1', department: 'TI' }, user: { id: 'u1' } });
    const res = makeRes();
    const next = makeNext();

    draftSvc.createDraft.mockResolvedValue({ id: 10, user_id: 'u1', title: 'Draft 1', data: { department: 'TI' } });

    await controller.createDraft(req, res, next);

    expect(draftSvc.createDraft).toHaveBeenCalledWith('u1', expect.objectContaining({ department: 'TI' }), 'Draft 1');
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: expect.objectContaining({ id: 10 }) }));
  });

  test('getDraft -> returns stored data', async () => {
    const req = makeReq({ params: { id: '10' }, user: { id: 'u1' } });
    const res = makeRes();
    const next = makeNext();

    draftSvc.getDraftById.mockResolvedValue({ id: 10, user_id: 'u1', title: 'Draft 1', data: { department: 'TI', items: [] }, version: 1 });

    await controller.getDraft(req, res, next);

    expect(draftSvc.getDraftById).toHaveBeenCalledWith('10');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: expect.objectContaining({ data: expect.objectContaining({ department: 'TI' }) }) }));
  });

  test('updateDraft -> merges and returns updated', async () => {
    const req = makeReq({ params: { id: '10' }, body: { purpose: 'Updated purpose' }, user: { id: 'u1' } });
    const res = makeRes();
    const next = makeNext();

    // existing draft returned by getDraftById
    draftSvc.getDraftById.mockResolvedValue({ id: 10, user_id: 'u1', title: 'Draft 1', data: { department: 'TI', items: [] }, version: 1 });
    draftSvc.updateDraftMerged.mockResolvedValue({ id: 10, user_id: 'u1', title: 'Draft 1', data: { department: 'TI', items: [], purpose: 'Updated purpose' }, version: 2 });

    await controller.updateDraft(req, res, next);

    expect(draftSvc.getDraftById).toHaveBeenCalledWith('10');
    expect(draftSvc.updateDraftMerged).toHaveBeenCalledWith('10', 'u1', expect.objectContaining({ purpose: 'Updated purpose' }), null);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: expect.objectContaining({ version: 2, data: expect.objectContaining({ purpose: 'Updated purpose' }) }) }));
  });

  test('deleteDraft -> 200', async () => {
    const req = makeReq({ params: { id: '10' }, user: { id: 'u1' } });
    const res = makeRes();
    const next = makeNext();

    draftSvc.getDraftById.mockResolvedValue({ id: 10, user_id: 'u1' });
    draftSvc.deleteDraft.mockResolvedValue({ id: 10, user_id: 'u1' });

    await controller.deleteDraft(req, res, next);

    expect(draftSvc.deleteDraft).toHaveBeenCalledWith('10', 'u1');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('submitDraft -> creates submission and removes draft', async () => {
    const req = makeReq({ params: { id: '10' }, user: { id: 'u1', full_name: 'User 1', roles: ['dosen'] } });
    const res = makeRes();
    const next = makeNext();

    const draftData = { items: [{ item_name: 'Kertas A4', unit_price: 5000, quantity: 2 }], department: 'TI', purpose: 'Praktikum' };
    draftSvc.getDraftById.mockResolvedValue({ id: 10, user_id: 'u1', data: draftData });

    submissionSvc.create.mockResolvedValue({ id: 99, requester_id: 'u1', total_price: 10000 });
    submissionSvc.createItem.mockResolvedValueOnce({ id: 'i1' });
    submissionSvc.findByIdWithItems.mockResolvedValue({ id: 99, items: [{ id: 'i1' }], total_price: 10000 });
    draftSvc.deleteDraft.mockResolvedValue({ id: 10 });

    await controller.submitDraft(req, res, next);

    expect(submissionSvc.create).toHaveBeenCalled();
    expect(submissionSvc.createItem).toHaveBeenCalledTimes(1);
    expect(draftSvc.deleteDraft).toHaveBeenCalledWith('10', 'u1');
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('submitDraft invalid -> 400', async () => {
    const req = makeReq({ params: { id: '11' }, user: { id: 'u2', roles: ['dosen'] } });
    const res = makeRes();
    const next = makeNext();

    draftSvc.getDraftById.mockResolvedValue({ id: 11, user_id: 'u2', data: { department: 'TI' } }); // missing items

    await controller.submitDraft(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('Draft invalid for submission') }));
  });

  // --- Error scenarios ---
  test('createDraft unauthorized -> 401', async () => {
    const req = makeReq({ body: { title: 'x' }, user: null });
    const res = makeRes();
    const next = makeNext();

    await controller.createDraft(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Unauthorized' }));
  });

  test('getDraft forbidden -> 403', async () => {
    const req = makeReq({ params: { id: '20' }, user: { id: 'u9' } });
    const res = makeRes();
    const next = makeNext();

    draftSvc.getDraftById.mockResolvedValue({ id: 20, user_id: 'other-user' });

    await controller.getDraft(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Forbidden' }));
  });

  test('getDraft not found -> 404', async () => {
    const req = makeReq({ params: { id: '999' }, user: { id: 'u9' } });
    const res = makeRes();
    const next = makeNext();

    draftSvc.getDraftById.mockResolvedValue(null);

    await controller.getDraft(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Draft not found' }));
  });

  test('updateDraft validation error -> 400', async () => {
    const req = makeReq({ params: { id: '10' }, body: { items: [{ quantity: 0 }] }, user: { id: 'u1' } });
    const res = makeRes();
    const next = makeNext();

    // This should be rejected by Joi because unit_price missing and quantity < 1
    draftSvc.getDraftById.mockResolvedValue({ id: 10, user_id: 'u1' });

    await controller.updateDraft(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('deleteDraft forbidden -> 403', async () => {
    const req = makeReq({ params: { id: '30' }, user: { id: 'u1' } });
    const res = makeRes();
    const next = makeNext();

    draftSvc.getDraftById.mockResolvedValue({ id: 30, user_id: 'owner-other' });

    await controller.deleteDraft(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('submitDraft missing role -> 422', async () => {
    const req = makeReq({ params: { id: '40' }, user: { id: 'u4', roles: [] } });
    const res = makeRes();
    const next = makeNext();

    draftSvc.getDraftById.mockResolvedValue({ id: 40, user_id: 'u4', data: { items: [{ item_name: 'A', quantity: 1, unit_price: 1000 }] } });

    await controller.submitDraft(req, res, next);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('Gagal menentukan role') }));
  });

  test('submitDraft submission service error -> next(err)', async () => {
    const req = makeReq({ params: { id: '50' }, user: { id: 'u5', roles: ['dosen'], full_name: 'U5' } });
    const res = makeRes();
    const next = makeNext();

    draftSvc.getDraftById.mockResolvedValue({ id: 50, user_id: 'u5', data: { items: [{ item_name: 'B', quantity: 1, unit_price: 2000 }] } });
    submissionSvc.create.mockRejectedValue(new Error('DB failure'));

    await controller.submitDraft(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  test('createDraft service error -> next(err)', async () => {
    const req = makeReq({ body: { title: 'x' }, user: { id: 'u1' } });
    const res = makeRes();
    const next = makeNext();

    draftSvc.createDraft.mockRejectedValue(new Error('db down'));

    await controller.createDraft(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

});
