/**
 * Unit tests for receiptController (uploadReceipt and patchReceipt)
 * - Mocks service layers to avoid DB and filesystem side-effects
 * - Follows existing test patterns in the procurement tests folder
 */
import { jest } from '@jest/globals';

jest.unstable_mockModule('../services/receiptService.js', () => ({
  prepareLocalFile: jest.fn(),
  createReceipt: jest.fn(),
  getReceiptsBySubmission: jest.fn(),
  getReceiptById: jest.fn(),
  updateReceipt: jest.fn()
}));

jest.unstable_mockModule('../services/submissionService.js', () => ({
  getSubmissionById: jest.fn()
}));

const receiptSvc = await import('../services/receiptService.js');
const submissionSvc = await import('../services/submissionService.js');
const controller = await import('../controllers/receiptController.js');

function makeReq({ body = {}, params = {}, user = null, file = undefined } = {}) {
  return { body, params, user, file };
}
function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}
function makeNext() { return jest.fn(); }

describe('receiptController - uploadReceipt (unit)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('sukses: TPA uploads file with realized_price -> 201', async () => {
    const req = makeReq({
      params: { id: '10' },
      user: { id: 'u1', roles: ['tpa'] },
      file: { originalname: 'photo.jpg', mimetype: 'image/jpeg', path: '/tmp/photo.jpg', size: 1234 }
    });
    const res = makeRes();
    const next = makeNext();

    submissionSvc.getSubmissionById.mockResolvedValue({ id: 10, status: 'pending' });
    receiptSvc.prepareLocalFile.mockReturnValue({ filePath: '/uploads/receipts/ts_photo.jpg', fileName: 'ts_photo.jpg', mimeType: 'image/jpeg' });
    receiptSvc.createReceipt.mockResolvedValue({ id: 5, submission_id: 10, realized_price: 10000 });

    req.body.realized_price = '10000';

    await controller.uploadReceipt(req, res, next);

    expect(submissionSvc.getSubmissionById).toHaveBeenCalledWith('10');
    expect(receiptSvc.prepareLocalFile).toHaveBeenCalledWith(req.file);
    expect(receiptSvc.createReceipt).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: expect.objectContaining({ id: 5 }) }));
  });

  test('error: unauthorized (no user) -> 401', async () => {
    const req = makeReq({ params: { id: '10' }, user: null });
    const res = makeRes();
    const next = makeNext();

    await controller.uploadReceipt(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('error: forbidden (not tpa/admin) -> 403', async () => {
    const req = makeReq({ params: { id: '10' }, user: { id: 'u2', roles: ['user'] } });
    const res = makeRes();
    const next = makeNext();

    await controller.uploadReceipt(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('error: submission not found -> 404', async () => {
    const req = makeReq({ params: { id: '999' }, user: { id: 'u3', roles: ['tpa'] }, file: { originalname: 'a' } });
    const res = makeRes();
    const next = makeNext();

    submissionSvc.getSubmissionById.mockResolvedValue(null);

    await controller.uploadReceipt(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('error: missing file -> 400', async () => {
    const req = makeReq({ params: { id: '10' }, user: { id: 'u4', roles: ['tpa'] }, file: undefined });
    const res = makeRes();
    const next = makeNext();

    submissionSvc.getSubmissionById.mockResolvedValue({ id: 10 });

    await controller.uploadReceipt(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('error: invalid realized_price (non-numeric) -> 422', async () => {
    const req = makeReq({ params: { id: '10' }, user: { id: 'u5', roles: ['tpa'] }, file: { originalname: 'p' } });
    const res = makeRes();
    const next = makeNext();

    submissionSvc.getSubmissionById.mockResolvedValue({ id: 10 });
    req.body.realized_price = 'not-a-number';

    await controller.uploadReceipt(req, res, next);

    expect(res.status).toHaveBeenCalledWith(422);
  });

  test('error: receipt service throws -> next called', async () => {
    const req = makeReq({ params: { id: '10' }, user: { id: 'u6', roles: ['tpa'] }, file: { originalname: 'p' } });
    const res = makeRes();
    const next = makeNext();

    submissionSvc.getSubmissionById.mockResolvedValue({ id: 10 });
    receiptSvc.prepareLocalFile.mockReturnValue({ filePath: '/x', fileName: 'x', mimeType: 'image/png' });
    const err = new Error('boom');
    receiptSvc.createReceipt.mockRejectedValue(err);

    await controller.uploadReceipt(req, res, next);

    expect(next).toHaveBeenCalledWith(err);
  });
});

describe('receiptController - patchReceipt (unit)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('sukses: admin patches realized_price -> 200', async () => {
    const req = makeReq({ params: { id: '10', rid: '50' }, user: { id: 'admin1', roles: ['admin'] }, body: { realized_price: '12345' } });
    const res = makeRes();
    const next = makeNext();

    receiptSvc.getReceiptById.mockResolvedValue({ id: 50, submission_id: 10, realized_price: 100 });
    receiptSvc.updateReceipt.mockResolvedValue({ id: 50, submission_id: 10, realized_price: 12345 });

    await controller.patchReceipt(req, res, next);

    expect(receiptSvc.getReceiptById).toHaveBeenCalledWith('50');
    expect(receiptSvc.updateReceipt).toHaveBeenCalledWith('50', expect.objectContaining({ realizedPrice: 12345 }));
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('error: unauthorized -> 401', async () => {
    const req = makeReq({ params: { id: '10', rid: '50' }, user: null, body: {} });
    const res = makeRes();
    const next = makeNext();

    await controller.patchReceipt(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('error: forbidden (non-admin) -> 403', async () => {
    const req = makeReq({ params: { id: '10', rid: '50' }, user: { id: 'u1', roles: ['tpa'] }, body: {} });
    const res = makeRes();
    const next = makeNext();

    await controller.patchReceipt(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('error: receipt not found -> 404', async () => {
    const req = makeReq({ params: { id: '10', rid: '500' }, user: { id: 'admin1', roles: ['admin'] }, body: {} });
    const res = makeRes();
    const next = makeNext();

    receiptSvc.getReceiptById.mockResolvedValue(null);

    await controller.patchReceipt(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('error: receipt belongs to different submission -> 400', async () => {
    const req = makeReq({ params: { id: '10', rid: '51' }, user: { id: 'admin1', roles: ['admin'] }, body: {} });
    const res = makeRes();
    const next = makeNext();

    receiptSvc.getReceiptById.mockResolvedValue({ id: 51, submission_id: 999 });

    await controller.patchReceipt(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('error: invalid realized_price -> 422', async () => {
    const req = makeReq({ params: { id: '10', rid: '52' }, user: { id: 'admin1', roles: ['admin'] }, body: { realized_price: '-5' } });
    const res = makeRes();
    const next = makeNext();

    receiptSvc.getReceiptById.mockResolvedValue({ id: 52, submission_id: 10 });

    await controller.patchReceipt(req, res, next);

    expect(res.status).toHaveBeenCalledWith(422);
  });

  test('error: update throws -> next called', async () => {
    const req = makeReq({ params: { id: '10', rid: '53' }, user: { id: 'admin1', roles: ['admin'] }, body: { notes: 'ok' } });
    const res = makeRes();
    const next = makeNext();

    receiptSvc.getReceiptById.mockResolvedValue({ id: 53, submission_id: 10 });
    const err = new Error('update failed');
    receiptSvc.updateReceipt.mockRejectedValue(err);

    await controller.patchReceipt(req, res, next);

    expect(next).toHaveBeenCalledWith(err);
  });
});
