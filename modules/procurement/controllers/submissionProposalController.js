import multer from 'multer';
import * as submissionSvc from '../services/submissionService.js';
import * as proposalSvc from '../services/submissionProposalService.js';

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

function canViewSubmission(user, submission) {
  if (!user || !submission) return false;
  if (String(submission.requester_id) === String(user.id)) return true;
  if (hasRole(user, 'tpa') || hasRole(user, 'admin')) return true;
  // Allow Kaur Lab users to view proposal metadata/download when the
  // submission has been approved by TPA and forwarded to Kaur Lab.
  // This grants read-only access for review purposes without exposing
  // proposals for arbitrary submissions.
  const st = String(submission.status || '').toLowerCase();
  if ((hasRole(user, 'kaur_lab') || hasRole(user, 'kaur')) && st === 'approved_by_tpa') return true;
  return false;
}

async function supervisedLabProcurementReviewerProposalAccess(user, submission) {
  if (!user?.id || !submission) return false;
  const st = String(submission.status || '').trim().toLowerCase();
  let isPembina = hasRole(user, 'dosen_pembina');
  let isKa = hasRole(user, 'koordinator_asisten');
  if (!isPembina && !isKa) {
    try {
      const roleSvc = await import('../../user-management/services/roleService.js');
      isPembina = await roleSvc.userHasRole(String(user.id), 'dosen_pembina');
      isKa = await roleSvc.userHasRole(String(user.id), 'koordinator_asisten');
    } catch {
      return false;
    }
  }
  if (!isPembina && !isKa) return false;
  const resolved = await submissionSvc.resolveDosenPembinaLabContext(String(user.id));
  if (!resolved.labId) return false;
  if (String(submission.lab_id ?? '') !== String(resolved.labId)) return false;
  // KO asisten: proposals while submission is `waiting`. Pembina: after KO approval.
  if (isKa && st === 'waiting') return true;
  if (isPembina && st === 'approved_by_kordas') return true;
  return false;
}

async function canAccessProposal(req, submission) {
  if (canViewSubmission(req.user, submission)) return true;
  return supervisedLabProcurementReviewerProposalAccess(req.user, submission);
}

function canModifySubmissionProposal(user, submission) {
  if (!user || !submission) return false;
  if (hasRole(user, 'admin') || hasRole(user, 'tpa')) return true;
  // requester can modify while still editable
  const editableStatuses = ['draft', 'waiting', 'submitted', 'on_review', 'approved_by_dosen_pembina', 'approved_by_kordas'];
  if (String(submission.requester_id) === String(user.id)) {
    return editableStatuses.includes(String(submission.status || '').toLowerCase());
  }
  return false;
}

export async function uploadSubmissionProposal(req, res, next) {
  try {
    if (!req.user || !req.user.id) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const submissionId = req.params.id;
    const submission = await submissionSvc.getSubmissionById(submissionId);
    if (!submission) return res.status(404).json({ success: false, message: 'Submission not found' });
    if (!canModifySubmissionProposal(req.user, submission)) return res.status(403).json({ success: false, message: 'Forbidden' });

    if (!req.file) return res.status(400).json({ success: false, message: 'File is required (field name: file)' });
    const name = (req.file.originalname || '').toLowerCase();
    if (!name.endsWith('.pdf') && !name.endsWith('.docx')) {
      return res.status(422).json({ success: false, message: 'Only PDF and DOCX files are allowed' });
    }

    const saved = await proposalSvc.upsertProposalForSubmission({
      submissionId,
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

export async function getSubmissionProposalMeta(req, res, next) {
  try {
    if (!req.user || !req.user.id) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const submissionId = req.params.id;
    const submission = await submissionSvc.getSubmissionById(submissionId);
    if (!submission) return res.status(404).json({ success: false, message: 'Submission not found' });
    if (!(await canAccessProposal(req, submission))) return res.status(403).json({ success: false, message: 'Forbidden' });

    const meta = await proposalSvc.getProposalMetaBySubmissionId(submissionId);
    if (!meta) return res.status(404).json({ success: false, message: 'Proposal file not found' });

    return res.status(200).json({ success: true, data: meta });
  } catch (e) {
    next(e);
  }
}

export async function downloadSubmissionProposalFile(req, res, next) {
  try {
    if (!req.user || !req.user.id) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const submissionId = req.params.id;
    const submission = await submissionSvc.getSubmissionById(submissionId);
    if (!submission) return res.status(404).json({ success: false, message: 'Submission not found' });
    if (!(await canAccessProposal(req, submission))) return res.status(403).json({ success: false, message: 'Forbidden' });

    const file = await proposalSvc.getProposalFileBySubmissionId(submissionId);
    if (!file || !file.fileData) return res.status(404).json({ success: false, message: 'Proposal file not found' });

    const mime = file.mimeType || 'application/octet-stream';
    const fileName = file.fileName || 'proposal_file';
    const isPdf = mime.toLowerCase().includes('pdf') || fileName.toLowerCase().endsWith('.pdf');

    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `${isPdf ? 'inline' : 'attachment'}; filename="${fileName}"`);
    return res.status(200).send(file.fileData);
  } catch (e) {
    next(e);
  }
}

export async function deleteSubmissionProposal(req, res, next) {
  try {
    if (!req.user || !req.user.id) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const submissionId = req.params.id;
    const submission = await submissionSvc.getSubmissionById(submissionId);
    if (!submission) return res.status(404).json({ success: false, message: 'Submission not found' });
    if (!canModifySubmissionProposal(req.user, submission)) return res.status(403).json({ success: false, message: 'Forbidden' });

    const deleted = await proposalSvc.deleteProposalBySubmissionId(submissionId);
    if (!deleted) return res.status(404).json({ success: false, message: 'Proposal file not found' });

    return res.status(200).json({ success: true, message: 'Proposal file removed' });
  } catch (e) {
    next(e);
  }
}

export default {
  uploadMiddleware,
  uploadSubmissionProposal,
  getSubmissionProposalMeta,
  downloadSubmissionProposalFile,
  deleteSubmissionProposal,
};
