import express from 'express';
import * as controller from './controllers/submissionController.js';
import * as draftController from './controllers/draftController.js';
import * as notificationController from './controllers/notificationController.js';
import * as receiptController from './controllers/receiptController.js';
import * as masterController from './controllers/masterController.js';
import * as inventoryController from './controllers/inventoryController.js';
import * as itemPhotoController from './controllers/itemPhotoController.js';
import * as templateController from './controllers/templateController.js';
import * as submissionProposalController from './controllers/submissionProposalController.js';
import * as handoverController from './controllers/handoverController.js';
import * as laboranPassController from './controllers/laboranPassController.js';
import * as handoverLogController from './controllers/handoverLogController.js';
import * as vendorPurchaseController from './controllers/vendorPurchaseController.js';
import * as reimbursementWetDocumentController from './controllers/reimbursementWetDocumentController.js';
import { validateJWT } from '../../core/auth/jwt-validator.js';

const router = express.Router();

// POST /api/procurement/submission - create submission BHP
router.post('/', validateJWT, controller.createSubmission);
// GET /api/procurement/submission - list current user's submissions
router.get('/', validateJWT, controller.getMySubmissions);
// GET /api/procurement/submission/all - list all submissions (TPA only)
router.get('/all', validateJWT, controller.getAllSubmissionsForTPA);
// GET /api/procurement/stats - aggregated counts for dashboard (TPA only)
router.get('/stats', validateJWT, controller.getTpaStats);
// GET /api/procurement/stats/kaur-lab - aggregated counts for kaur_lab dashboard
router.get('/stats/kaur-lab', validateJWT, controller.getKaurLabStats);
// GET /api/procurement/stats/kaur-lab/submissions - submissions approved by TPA for Kaur Lab
router.get('/stats/kaur-lab/submissions', validateJWT, controller.getKaurLabApprovedSubmissions);
// GET /api/procurement/stats/kaprodi - aggregated counts for Kaprodi dashboard
router.get('/stats/kaprodi', validateJWT, controller.getKaprodiStats);
// GET /api/procurement/stats/kaprodi/submissions - submissions approved by Kaur for Kaprodi's study program
router.get('/stats/kaprodi/submissions', validateJWT, controller.getKaprodiApprovedSubmissions);
// GET /api/procurement/stats/dosen-pembina — lab-scoped waiting queue for supervising lecturer
router.get('/stats/dosen-pembina', validateJWT, controller.getDosenPembinaLabStats);
// GET /api/procurement/stats/dosen-pembina/submissions — submissions for supervised lab (same scope as stats)
router.get('/stats/dosen-pembina/submissions', validateJWT, controller.getDosenPembinaLabSubmissions);
router.get('/stats/koordinator-asisten', validateJWT, controller.getKoordinatorAsistenLabStats);
router.get('/stats/koordinator-asisten/submissions', validateJWT, controller.getKoordinatorAsistenLabSubmissions);
// GET /api/procurement/stats/me - aggregated counts for current user
router.get('/stats/me', validateJWT, controller.getUserStats);
// Dev-only: apakah JWT sampai ke procurement dengan employee/student_detail/nipnim (set PROCUREMENT_DEBUG_SIGNER_JWT=1)
router.get('/debug/jwt-signer-claims', validateJWT, controller.debugProcurementSignerJwt);
// Public stats endpoint for development/testing. Returns same data as /stats
// but does not require authentication. This endpoint is disabled in production
// to avoid exposing counts publicly.
router.get('/stats/public', controller.getTpaStatsPublic);
// verify single item (TPA)
router.post('/items/:itemId/verify', validateJWT, controller.verifyItem);
router.put('/items/:itemId', validateJWT, controller.updateSubmissionItem);
router.delete('/items/:itemId', validateJWT, controller.deleteSubmissionItem);
// PUT /api/procurement/submission/:id - update a draft submission (requester only, status must be 'draft')
router.put('/:id', validateJWT, controller.updateSubmission);
// POST /api/procurement/:id/cancel - allow requester to cancel a waiting submission
router.post('/:id/cancel', validateJWT, controller.cancelSubmission);

// Laboran handover proof (TPA → Kaur / Kaprodi with photos)
router.get(
  '/laboran-pass-recipients',
  validateJWT,
  laboranPassController.listLaboranPassRecipients,
);
router.get('/handover-logs', validateJWT, handoverLogController.listHandoverLogs);
router.get('/laboran-pass-logs', validateJWT, laboranPassController.listLaboranPassLogs);
router.get('/laboran-pass-logs/:logId', validateJWT, laboranPassController.getLaboranPassLogDetail);
router.get(
  '/laboran-pass-logs/:logId/photos/:photoId/file',
  validateJWT,
  laboranPassController.downloadLaboranPassPhoto,
);
router.post(
  '/:id/laboran-pass',
  validateJWT,
  laboranPassController.uploadManyMiddleware,
  laboranPassController.submitLaboranPass,
);
router.get('/:id/laboran-pass-logs', validateJWT, laboranPassController.listLaboranPassLogsForSubmission);

// POST /api/procurement/submission/:id/reimbursement-status — TPA: completed ↔ closed
router.post('/:id/reimbursement-status', validateJWT, controller.changeReimbursementStatus);
// POST /api/procurement/:id/change-status - allow TPA to change submission status manually
router.post('/:id/change-status', validateJWT, controller.changeSubmissionStatus);

// POST /api/procurement/:id/dosen-pembina/signature - dosen pembina saves drawn signature
router.post('/:id/dosen-pembina/signature', validateJWT, controller.submitDosenPembinaSignature);
// POST /api/procurement/:id/kordas/signature - koordinator asisten saves drawn signature
router.post('/:id/kordas/signature', validateJWT, controller.submitKordasSignature);
// POST /api/procurement/:id/kaur-lab/signature - Kaur Lab saves drawn signature (while approved_by_tpa)
router.post('/:id/kaur-lab/signature', validateJWT, controller.submitKaurLabSignature);
// POST /api/procurement/:id/kaprodi/signature - Kaprodi saves drawn signature (while approved_by_kaur)
router.post('/:id/kaprodi/signature', validateJWT, controller.submitKaprodiSignature);

// POST /api/procurement/:id/set-funding - store funding choice (TPA/kaprodi)
router.post('/:id/set-funding', validateJWT, controller.setFundingChoice);

// Download generated proposal PDF (TPA or requester; after Kaprodi approval)
router.get('/:id/proposal', validateJWT, controller.downloadSubmissionProposal);

// Proposal keuangan (reimbursement; TPA; completed) — template terpisah dari proposal pengajuan
router.post('/:id/financial-proposal/signing-mode', validateJWT, controller.setFinancialProposalSigningMode);
router.post('/:id/financial-proposal/forward-digital', validateJWT, controller.forwardFinancialProposalDigital);
router.get('/:id/financial-proposal', validateJWT, controller.downloadSubmissionFinancialProposal);
router.post('/:id/financial-proposal/kaur-lab/signature', validateJWT, controller.submitFinancialProposalKaurSignature);
router.post('/:id/financial-proposal/kaprodi/signature', validateJWT, controller.submitFinancialProposalKaprodiSignature);
router.get('/financial-proposal/pending/kaur-lab/stats', validateJWT, controller.getFinancialProposalKaurPendingStats);
router.get('/financial-proposal/pending/kaur-lab', validateJWT, controller.getFinancialProposalKaurPendingList);
router.get('/financial-proposal/pending/kaprodi/stats', validateJWT, controller.getFinancialProposalKaprodiPendingStats);
router.get('/financial-proposal/pending/kaprodi', validateJWT, controller.getFinancialProposalKaprodiPendingList);

// Justifikasi (reimbursement ≥ Rp 1jt) — proses tanda tangan sama proposal keuangan
router.post('/:id/justification/signing-mode', validateJWT, controller.setJustificationSigningMode);
router.post('/:id/justification/forward-digital', validateJWT, controller.forwardJustificationDigital);
router.get('/:id/justification', validateJWT, controller.downloadSubmissionJustification);
router.post('/:id/justification/kaur-lab/signature', validateJWT, controller.submitJustificationKaurSignature);
router.post('/:id/justification/kaprodi/signature', validateJWT, controller.submitJustificationKaprodiSignature);
router.get('/justification/pending/kaur-lab/stats', validateJWT, controller.getJustificationKaurPendingStats);
router.get('/justification/pending/kaur-lab', validateJWT, controller.getJustificationKaurPendingList);
router.get('/justification/pending/kaprodi/stats', validateJWT, controller.getJustificationKaprodiPendingStats);
router.get('/justification/pending/kaprodi', validateJWT, controller.getJustificationKaprodiPendingList);

// Wet-signed scans + optional BAST (reimbursement process documents; TPA)
router.post(
  '/:id/reimbursement-documents/:docType',
  validateJWT,
  reimbursementWetDocumentController.uploadMiddleware,
  reimbursementWetDocumentController.uploadReimbursementWetDocument,
);
router.get(
  '/:id/reimbursement-documents/:docType/meta',
  validateJWT,
  reimbursementWetDocumentController.getReimbursementWetDocumentMeta,
);
router.get(
  '/:id/reimbursement-documents/:docType/file',
  validateJWT,
  reimbursementWetDocumentController.downloadReimbursementWetDocument,
);
router.delete(
  '/:id/reimbursement-documents/:docType',
  validateJWT,
  reimbursementWetDocumentController.deleteReimbursementWetDocument,
);

// Requester-uploaded proposal file for submission (viewable by requester and TPA/admin)
router.post('/:id/proposal-file', validateJWT, submissionProposalController.uploadMiddleware, submissionProposalController.uploadSubmissionProposal);
router.get('/:id/proposal-file/meta', validateJWT, submissionProposalController.getSubmissionProposalMeta);
router.get('/:id/proposal-file', validateJWT, submissionProposalController.downloadSubmissionProposalFile);
router.delete('/:id/proposal-file', validateJWT, submissionProposalController.deleteSubmissionProposal);

// Notifications (in-app)
router.get('/notifications', validateJWT, notificationController.getNotifications);
router.post('/notifications/:id/read', validateJWT, notificationController.markAsRead);
router.delete('/notifications/:id', validateJWT, notificationController.deleteNotif);

// Drafts: save incomplete submissions, list, get, submit-from-draft
router.post('/drafts', validateJWT, draftController.createDraft);
router.get('/drafts', validateJWT, draftController.listDrafts);
router.get('/drafts/:id', validateJWT, draftController.getDraft);
router.put('/drafts/:id', validateJWT, draftController.updateDraft);
router.delete('/drafts/:id', validateJWT, draftController.deleteDraft);
router.post('/drafts/:id/submit', validateJWT, draftController.submitDraft);

// Receipts: upload/list/get/patch
router.post('/:id/receipts', validateJWT, receiptController.uploadMiddleware, receiptController.uploadReceipt);
// Invoices: structured metadata + invoice/payment-proof files, then mark submission as on_going
router.get('/:id/invoices', validateJWT, receiptController.getInvoiceDetails);
router.post('/:id/invoices', validateJWT, receiptController.uploadInvoicePackageMiddleware, receiptController.saveInvoices);
router.get('/:id/vendor-purchase', validateJWT, vendorPurchaseController.getVendorPurchase);
router.put('/:id/vendor-purchase', validateJWT, vendorPurchaseController.saveVendorPurchase);
router.get('/:id/vendor-bast', validateJWT, vendorPurchaseController.downloadVendorBast);
router.post('/:id/item-photos', validateJWT, itemPhotoController.uploadManyMiddleware, itemPhotoController.uploadSubmissionItemPhotos);
router.get('/:id/item-photos', validateJWT, itemPhotoController.listSubmissionItemPhotos);
router.get('/:id/item-photos/:photoId/file', validateJWT, itemPhotoController.downloadSubmissionItemPhoto);
router.delete('/:id/item-photos/:photoId', validateJWT, itemPhotoController.deleteSubmissionItemPhoto);
router.post('/:id/item-photos/:photoId', validateJWT, itemPhotoController.replaceSingleMiddleware, itemPhotoController.replaceSubmissionItemPhoto);
router.get('/:id/receipts', validateJWT, receiptController.listReceipts);
router.get('/:id/receipts/:rid', validateJWT, receiptController.getReceipt);
router.get('/:id/receipts/:rid/file', validateJWT, receiptController.downloadReceiptFile);
router.patch('/:id/receipts/:rid', validateJWT, receiptController.patchReceipt);

// Non-blockchain handover (signatures for berita acara)
router.post('/:id/handover-receipt/signature', validateJWT, controller.submitRequesterHandoverReceiptSignature);
router.post('/:id/handover-delivery/signature', validateJWT, controller.submitTpaHandoverDeliverySignature);
router.get('/:id/handover-berita-acara', validateJWT, controller.downloadHandoverBeritaAcara);
router.get('/:id/handover-logs', validateJWT, handoverLogController.getHandoverLogForSubmission);

// Hybrid Blockchain Handover
router.post('/:id/handover/confirm-receipt', validateJWT, handoverController.confirmReceipt);
router.post('/:id/handover/verify-code', validateJWT, handoverController.verifyCode);
router.post('/:id/handover/submit-signature', validateJWT, handoverController.submitSignature);
router.get('/:id/handover/proof', validateJWT, handoverController.getProof);
router.get('/handover/laborans', validateJWT, handoverController.listAuthorizedLaborans);
router.post('/handover/laborans', validateJWT, handoverController.authorizeLaboran);
router.delete('/handover/laborans/:wallet', validateJWT, handoverController.revokeLaboran);

// Master data proxy (registration module read-only)
router.get('/master/study-programs', validateJWT, masterController.listStudyPrograms);
router.get('/master/laboratories', validateJWT, masterController.listLaboratories);

// Inventory CRUD (procurement module)
router.post('/inventory', validateJWT, inventoryController.createInventory);
router.get('/inventory', validateJWT, inventoryController.listInventory);
router.get('/inventory/logs', validateJWT, inventoryController.listAllInventoryLogs);
// Quarterly report generation (per-item, include logs)
router.post('/inventory/reports/quarterly', validateJWT, inventoryController.quarterlyReportCtrl);
// low-stock check (items with stock <= minimum_quantity and minimum_quantity > 0)
router.get('/inventory/low-stock', validateJWT, inventoryController.listLowStockInventory);
router.get('/inventory/:id', validateJWT, inventoryController.getInventory);
router.get('/inventory/:id/logs', validateJWT, inventoryController.listInventoryLogs);
router.put('/inventory/:id', validateJWT, inventoryController.updateInventoryCtrl);
router.delete('/inventory/:id', validateJWT, inventoryController.deleteInventoryCtrl);

// Template upload/download (TPA uploads, authenticated users can download)
router.post('/template', validateJWT, templateController.uploadMiddleware, templateController.uploadTemplate);
router.get('/template', validateJWT, templateController.downloadTemplate);
router.get('/template/meta', validateJWT, templateController.getTemplateMeta);
router.delete('/template', validateJWT, templateController.deleteTemplate);

// Keep generic :id delete below explicit template route to avoid route collision
router.delete('/:id', validateJWT, controller.deleteSubmission);

// GET /api/procurement/:id - get single submission (owner or TPA)
router.get('/:id/timeline', validateJWT, controller.getSubmissionTimeline);
router.get('/:id', validateJWT, controller.getSubmissionById);

export default router;
