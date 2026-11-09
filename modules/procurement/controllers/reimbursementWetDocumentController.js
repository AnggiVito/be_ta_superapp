import multer from 'multer';
import * as submissionSvc from '../services/submissionService.js';
import * as wetDocSvc from '../services/reimbursementWetDocumentService.js';

export const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
}).single('file');

function hasRole(user, roleName) {
  if (!user) return false;
  const target = String(roleName).toLowerCase();
  if (user.role && String(user.role).toLowerCase() === target) return true;
  if (Array.isArray(user.roles)) {
    return user.roles.some((r) => {
      if (!r) return false;
      if (typeof r === 'string') return r.toLowerCase() === target;
      const v = r.role || r.name || r.code || null;
      return v && String(v).toLowerCase() === target;
    });
  }
  return false;
}

function canManageWetDocs(user) {
  return hasRole(user, 'tpa') || hasRole(user, 'admin');
}

export async function uploadReimbursementWetDocument(req, res, next) {
  try {
    if (!req.user?.id) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!canManageWetDocs(req.user)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const submissionId = req.params.id;
    const docType = wetDocSvc.normalizeWetDocType(req.params.docType);
    if (!docType) {
      return res.status(400).json({ success: false, message: 'Invalid document type' });
    }

    const submission = await submissionSvc.getSubmissionById(submissionId);
    if (!submission) {
      return res.status(404).json({ success: false, message: 'Submission not found' });
    }

    try {
      wetDocSvc.validateWetDocUpload(submission, docType);
    } catch (err) {
      if (
        err?.code === 'INVALID_STATUS' ||
        err?.code === 'WRONG_SIGNING_MODE' ||
        err?.code === 'JUSTIFICATION_NOT_REQUIRED'
      ) {
        return res.status(400).json({ success: false, message: err.message });
      }
      throw err;
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'File is required (field name: file)' });
    }
    if (!wetDocSvc.isAllowedWetUploadMime(req.file.mimetype, req.file.originalname)) {
      return res.status(422).json({
        success: false,
        message: 'Allowed formats: PDF, JPEG, PNG, or WebP',
      });
    }

    const saved = await wetDocSvc.upsertWetDocument({
      submissionId,
      docType,
      uploadedBy: req.user.id,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      fileData: req.file.buffer,
    });

    return res.status(201).json({ success: true, data: saved });
  } catch (e) {
    next(e);
  }
}

export async function getReimbursementWetDocumentMeta(req, res, next) {
  try {
    if (!req.user?.id) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!canManageWetDocs(req.user)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const submissionId = req.params.id;
    const docType = wetDocSvc.normalizeWetDocType(req.params.docType);
    if (!docType) {
      return res.status(400).json({ success: false, message: 'Invalid document type' });
    }

    const submission = await submissionSvc.getSubmissionById(submissionId);
    if (!submission) {
      return res.status(404).json({ success: false, message: 'Submission not found' });
    }

    const meta = await wetDocSvc.getWetDocumentMeta(submissionId, docType);
    if (!meta) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    return res.status(200).json({ success: true, data: meta });
  } catch (e) {
    next(e);
  }
}

export async function downloadReimbursementWetDocument(req, res, next) {
  try {
    if (!req.user?.id) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!canManageWetDocs(req.user)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const submissionId = req.params.id;
    const docType = wetDocSvc.normalizeWetDocType(req.params.docType);
    if (!docType) {
      return res.status(400).json({ success: false, message: 'Invalid document type' });
    }

    const submission = await submissionSvc.getSubmissionById(submissionId);
    if (!submission) {
      return res.status(404).json({ success: false, message: 'Submission not found' });
    }

    const file = await wetDocSvc.getWetDocumentFile(submissionId, docType);
    if (!file?.fileData) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    const mime = file.mimeType || 'application/octet-stream';
    const fileName = file.fileName || 'document';
    const isPdf = mime.toLowerCase().includes('pdf') || fileName.toLowerCase().endsWith('.pdf');

    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `${isPdf ? 'inline' : 'attachment'}; filename="${fileName}"`);
    return res.status(200).send(file.fileData);
  } catch (e) {
    next(e);
  }
}

export async function deleteReimbursementWetDocument(req, res, next) {
  try {
    if (!req.user?.id) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!canManageWetDocs(req.user)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const submissionId = req.params.id;
    const docType = wetDocSvc.normalizeWetDocType(req.params.docType);
    if (!docType) {
      return res.status(400).json({ success: false, message: 'Invalid document type' });
    }

    const submission = await submissionSvc.getSubmissionById(submissionId);
    if (!submission) {
      return res.status(404).json({ success: false, message: 'Submission not found' });
    }

    const deleted = await wetDocSvc.deleteWetDocument(submissionId, docType);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    return res.status(200).json({ success: true, message: 'Document removed' });
  } catch (e) {
    next(e);
  }
}

export default {
  uploadMiddleware,
  uploadReimbursementWetDocument,
  getReimbursementWetDocumentMeta,
  downloadReimbursementWetDocument,
  deleteReimbursementWetDocument,
};
