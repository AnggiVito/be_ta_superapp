import * as submissionSvc from '../services/submissionService.js';
import * as vendorPurchaseSvc from '../services/vendorPurchaseService.js';
import * as vendorBastPdf from '../services/vendorBastPdf.js';
import { resolveVendorBastSignerFromRequest } from '../services/vendorBastSigner.js';

function isProcurementVendorStaff(req) {
  const roles = req.user?.roles ?? [];
  const norm = (r) => String(r).toLowerCase();
  if (Array.isArray(roles) && roles.some((r) => norm(r) === 'tpa' || norm(r) === 'laboran')) {
    return true;
  }
  const role = norm(req.user?.role ?? '');
  return role === 'tpa' || role === 'laboran';
}

export async function getVendorPurchase(req, res, next) {
  try {
    if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
    if (!isProcurementVendorStaff(req)) return res.status(403).json({ error: 'Forbidden' });

    const { id } = req.params;
    const data = await vendorPurchaseSvc.getVendorPurchaseContext(id);
    if (!data) return res.status(404).json({ error: 'Submission not found' });

    return res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function saveVendorPurchase(req, res, next) {
  try {
    if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
    if (!isProcurementVendorStaff(req)) return res.status(403).json({ error: 'Forbidden' });

    const { id } = req.params;
    const title = req.body.title ?? '';
    const partnerName = req.body.partner_name ?? req.body.partnerName ?? '';
    const lines = req.body.lines ?? req.body.items ?? [];

    const data = await vendorPurchaseSvc.saveVendorPurchase(id, req.user.id, {
      title,
      partnerName,
      lines,
    });
    if (!data) return res.status(404).json({ error: 'Submission not found' });

    return res.status(200).json({ success: true, data });
  } catch (err) {
    if (err?.code === 'VALIDATION') {
      return res.status(422).json({ error: err.message });
    }
    next(err);
  }
}

/**
 * GET /submission/:id/vendor-bast — BAST PDF for saved vendor purchase.
 */
export async function downloadVendorBast(req, res, next) {
  try {
    if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
    if (!isProcurementVendorStaff(req)) return res.status(403).json({ error: 'Forbidden' });

    const { id } = req.params;
    const submission = await submissionSvc.findByIdWithItems(id);
    if (!submission) return res.status(404).json({ error: 'Submission not found' });

    const vendorBundle = await vendorPurchaseSvc.getVendorPurchaseForBast(id);
    if (!vendorBundle) {
      return res.status(400).json({
        error: 'Complete vendor purchase data before generating BAST PDF.',
      });
    }

    const signer = await resolveVendorBastSignerFromRequest(req);
    const pdfBuf = await vendorBastPdf.renderVendorBastPdf(submission, vendorBundle, signer);
    const isPdf =
      Buffer.isBuffer(pdfBuf) && pdfBuf.length > 4 && pdfBuf.slice(0, 4).toString('utf8') === '%PDF';
    if (!isPdf) {
      return res.status(502).json({ error: 'PDF generator unavailable or produced invalid PDF' });
    }

    const filename = vendorBastPdf.buildVendorBastPdfFilename(submission);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(pdfBuf);
  } catch (err) {
    next(err);
  }
}
