import { jest } from '@jest/globals';

jest.unstable_mockModule('../services/submissionService.js', () => ({
  getSubmissionById: jest.fn(),
  getItemsBySubmissionId: jest.fn()
}));
jest.unstable_mockModule('../services/pdfService.js', () => ({
  renderSubmissionProposalPdf: jest.fn(),
  submittedDateForPdf: jest.fn((s) => {
    const raw = s?.submitted_at || s?.applied_at || s?.diajukan_at || s?.created_at;
    if (!raw) return null;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }),
}));

const svc = await import('../services/submissionService.js');
const pdfService = await import('../services/pdfService.js');
const controller = await import('../controllers/submissionController.js');

function makeReq({ params = {}, user = null, headers = {} } = {}) { return { params, user, headers }; }
function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn();
  res.send = jest.fn().mockReturnValue(res);
  return res;
}
function makeNext() { return jest.fn(); }

const approvedKaprodiSubmission = {
  id: 41,
  status: 'approved_by_kaprodi',
  department: 'Teknik Informatika',
  lab: 'lab integra',
  study_program_id: '00000000-0000-4000-8000-000000000001',
  lab_id: '00000000-0000-4000-8000-000000000002',
  requester_id: 'student-1',
  created_at: new Date('2025-11-18T08:26:48.622Z'),
};

describe('downloadSubmissionProposal controller', () => {
  beforeEach(() => jest.clearAllMocks());

  test('401 when no user', async () => {
    const req = makeReq({ params: { id: '41' }, user: null });
    const res = makeRes();
    const next = makeNext();

    await controller.downloadSubmissionProposal(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('403 when neither TPA nor requester owner', async () => {
    const req = makeReq({ params: { id: '41' }, user: { id: 'other', role: 'dosen' } });
    const res = makeRes();
    const next = makeNext();

    svc.getSubmissionById.mockResolvedValue({ ...approvedKaprodiSubmission, requester_id: 'student-1' });
    await controller.downloadSubmissionProposal(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('404 when submission not found', async () => {
    const req = makeReq({ params: { id: '999' }, user: { id: 'tpa1', role: 'tpa' } });
    const res = makeRes();
    const next = makeNext();

    svc.getSubmissionById.mockResolvedValue(null);
    await controller.downloadSubmissionProposal(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('400 when submission status before Kaprodi approval', async () => {
    const req = makeReq({ params: { id: '41' }, user: { id: 'tpa1', role: 'tpa' } });
    const res = makeRes();
    const next = makeNext();

    svc.getSubmissionById.mockResolvedValue({ id: 41, status: 'draft', department: 'TI', lab: 'lab integra', created_at: new Date(), requester_id: 'x' });
    await controller.downloadSubmissionProposal(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('502 when pdfService returns non-PDF buffer', async () => {
    const req = makeReq({ params: { id: '41' }, user: { id: 'tpa1', role: 'tpa' } });
    const res = makeRes();
    const next = makeNext();

    svc.getSubmissionById.mockResolvedValue({ ...approvedKaprodiSubmission });
    svc.getItemsBySubmissionId.mockResolvedValue([{ id: 1, item_name: 'Kertas' }]);
    pdfService.renderSubmissionProposalPdf.mockResolvedValue(Buffer.from('<html></html>'));

    await controller.downloadSubmissionProposal(req, res, next);

    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });

  test('200 and sends PDF when TPA and status approved_by_kaprodi', async () => {
    const createdAt = new Date('2025-11-18T08:26:48.622Z');
    const req = makeReq({ params: { id: '41' }, user: { id: 'tpa1', role: 'tpa' } });
    const res = makeRes();
    const next = makeNext();

    svc.getSubmissionById.mockResolvedValue({ ...approvedKaprodiSubmission, created_at: createdAt });
    svc.getItemsBySubmissionId.mockResolvedValue([{ id: 1, item_name: 'Kertas' }]);
    const pdfBuf = Buffer.from('%PDF-1.4\n%âãÏÓ');
    pdfService.renderSubmissionProposalPdf.mockResolvedValue(pdfBuf);

    await controller.downloadSubmissionProposal(req, res, next);

    expect(pdfService.renderSubmissionProposalPdf).toHaveBeenCalled();
    const callArgs = pdfService.renderSubmissionProposalPdf.mock.calls[0];
    expect(callArgs.length).toBeGreaterThanOrEqual(2);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', expect.stringContaining('Proposal_'));
    expect(res.send).toHaveBeenCalledWith(pdfBuf);
  });

  test('200 when requester owns submission and status approved_by_kaprodi', async () => {
    const req = makeReq({ params: { id: '41' }, user: { id: 'student-1', role: 'mahasiswa' } });
    const res = makeRes();
    const next = makeNext();

    svc.getSubmissionById.mockResolvedValue({ ...approvedKaprodiSubmission, requester_id: 'student-1' });
    svc.getItemsBySubmissionId.mockResolvedValue([]);
    const pdfBuf = Buffer.from('%PDF-1.4\n%âãÏÓ');
    pdfService.renderSubmissionProposalPdf.mockResolvedValue(pdfBuf);

    await controller.downloadSubmissionProposal(req, res, next);

    expect(res.send).toHaveBeenCalledWith(pdfBuf);
  });
});
