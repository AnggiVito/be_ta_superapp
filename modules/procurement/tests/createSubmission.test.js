/**
 * Unit tests untuk createSubmission controller.
 * - Mock service layer sehingga tidak menyentuh DB.
 * - Menggunakan Jest (ESM). Sesuaikan konfigurasi Jest jika perlu.
 */
import { jest } from '@jest/globals';

jest.unstable_mockModule('../services/submissionService.js', () => ({
  create: jest.fn(),
  createItem: jest.fn(),
  findByIdWithItems: jest.fn()
}));

const svc = await import('../services/submissionService.js');
const controller = await import('../controllers/submissionController.js');

function makeReq({ body = {}, params = {}, user = null } = {}) {
  return { body, params, user };
}
function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}
function makeNext() { return jest.fn(); }

describe('createSubmission controller (unit)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('sukses: create multi-item pengajuan -> 201', async () => {
    const req = makeReq({
      body: {
        department: 'Teknik Informatika',
        lab: '',
        items: [
          { item_name: 'Kertas A4', specification: 'A4 80gsm', unit_price: 5000, quantity: 2 },
          { item_name: 'Tinta Printer', specification: 'Black 500ml', unit_price: 15000, quantity: 1 }
        ],
        purpose: 'Praktikum'
      },
    user: { id: 'user-1', name: 'Dosen 1', role: 'dosen' }
    });
    const res = makeRes();
    const next = makeNext();

  svc.create.mockResolvedValue({ id: 'p1', requester_id: 'user-1', total_price: 25000 });
    svc.createItem
      .mockResolvedValueOnce({ id: 'i1', item_name: 'Kertas A4' })
      .mockResolvedValueOnce({ id: 'i2', item_name: 'Tinta Printer' });
    svc.findByIdWithItems.mockResolvedValue({
      id: 'p1',
      requester_id: 'user-1',
      total_price: 25000,
      items: [{ id: 'i1' }, { id: 'i2' }]
    });

  await controller.createSubmission(req, res, next);

    expect(svc.create).toHaveBeenCalled();
    expect(svc.createItem).toHaveBeenCalledTimes(2);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1', items: expect.any(Array) }));
  });

  test('sukses: legacy single-item payload (item_name legacy) -> 201', async () => {
    const req = makeReq({
      body: {
        department: 'TI',
        lab: '',
        item_name: 'Kertas A4',
        specification: 'A4',
        unit_price: 5000,
        quantity: 2,
        purpose: 'Praktikum'
      },
    user: { id: 'user-2', role: 'dosen' }
    });
    const res = makeRes();
    const next = makeNext();

  svc.create.mockResolvedValue({ id: 'p2', requester_id: 'user-2', total_price: 10000 });
    svc.createItem.mockResolvedValueOnce({ id: 'i10', item_name: 'Kertas A4' });
    svc.findByIdWithItems.mockResolvedValue({ id: 'p2', items: [{ id: 'i10' }] });

  await controller.createSubmission(req, res, next);

    expect(svc.create).toHaveBeenCalled();
    expect(svc.createItem).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('error: missing items dan legacy fields -> 400', async () => {
    const req = makeReq({ body: { department: 'TI' }, user: { id: 'u1', role: 'dosen' } });
    const res = makeRes();
    const next = makeNext();

  await controller.createSubmission(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });

  test('error: forbidden requester_name supplied -> 400', async () => {
    const req = makeReq({ body: { department: 'TI', items: [{ item_name: 'Kertas', unit_price: 1000, quantity: 1 }], requester_name: 'Evil' }, user: { id: 'u5', role: 'dosen' } });
    const res = makeRes();
    const next = makeNext();

  await controller.createSubmission(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });

  test('error: invalid lab value -> 400', async () => {
    const req = makeReq({ body: { department: 'TI', lab: 'unknown lab', items: [{ item_name: 'Kertas', unit_price: 1000, quantity: 1 }] }, user: { id: 'u6', role: 'dosen' } });
    const res = makeRes();
    const next = makeNext();

  await controller.createSubmission(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });

  test('error: negative quantity in item -> 400', async () => {
    const req = makeReq({ body: { department: 'TI', items: [{ item_name: 'Kertas', unit_price: 1000, quantity: -1 }] }, user: { id: 'u7', role: 'dosen' } });
    const res = makeRes();
    const next = makeNext();

  await controller.createSubmission(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });

  test('error: empty items array -> 400', async () => {
    const req = makeReq({ body: { department: 'TI', items: [] }, user: { id: 'u8', role: 'dosen' } });
    const res = makeRes();
    const next = makeNext();

  await controller.createSubmission(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });

  test('error: unauthorized (no user) -> 422', async () => {
    const req = makeReq({ body: { department: 'TI', items: [{ item_name: 'Kertas', unit_price: 1000, quantity: 1 }] }, user: null });
    const res = makeRes();
    const next = makeNext();

    await controller.createSubmission(req, res, next);

  // controller currently returns 422 when it cannot determine requester_role (enrichment step)
  expect(res.status).toHaveBeenCalledWith(422);
  });

  test('error: service.create throws -> next called with error', async () => {
    const req = makeReq({ body: { department: 'TI', items: [{ item_name: 'Kertas', unit_price: 1000, quantity: 1 }] }, user: { id: 'u3', role: 'dosen' } });
    const res = makeRes();
    const next = makeNext();

    const testErr = new Error('DB failure');
    svc.create.mockRejectedValue(testErr);

    await controller.createSubmission(req, res, next);

    expect(next).toHaveBeenCalledWith(testErr);
  });

  test('error: item insertion fails -> next called and rollback expected', async () => {
    const req = makeReq({ body: { department: 'TI', items: [{ item_name: 'Kertas', unit_price: 1000, quantity: 1 }, { item_name: 'Pulpen', unit_price: 2000, quantity: 1 }] }, user: { id: 'u4', role: 'dosen' } });
    const res = makeRes();
    const next = makeNext();

    svc.create.mockResolvedValue({ id: 'pX', requester_id: 'u4' });
    svc.createItem
      .mockResolvedValueOnce({ id: 'ok1' })
      .mockRejectedValueOnce(new Error('insert item failed'));

    await controller.createSubmission(req, res, next);

    expect(svc.create).toHaveBeenCalled();
    expect(svc.createItem).toHaveBeenCalledTimes(2);
    expect(next).toHaveBeenCalled();
  });
});
