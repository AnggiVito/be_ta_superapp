import multer from 'multer';
import templateSvc from '../services/templateService.js';

// Store uploaded file in memory, then persist to procurement DB (bytea)
export const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
}).single('file');

export async function uploadTemplate(req, res, next) {
  try {
    if (!req.user || !req.user.id) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const roles = req.user.roles || [];
    if (!roles.includes('tpa') && !roles.includes('admin')) return res.status(403).json({ success: false, message: 'Forbidden' });

    if (!req.file) return res.status(400).json({ success: false, message: 'File is required (field name: file)' });
    // only accept pdf/docx
    const name = (req.file.originalname || '').toLowerCase();
    if (!name.endsWith('.pdf') && !name.endsWith('.docx')) {
      return res.status(422).json({ success: false, message: 'Only PDF and DOCX files are allowed' });
    }

    // single-file policy: reject if existing template exists; user must delete first
    const existing = await templateSvc.readMetadata();
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'Template already exists. Please delete existing template before uploading a new one.'
      });
    }

    const meta = await templateSvc.saveMetadata({
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      fileData: req.file.buffer,
      uploadedBy: req.user.id
    });

    return res.status(201).json({ success: true, data: meta });
  } catch (e) { next(e); }
}

export async function downloadTemplate(req, res, next) {
  try {
    // allow authenticated users to download template
    if (!req.user || !req.user.id) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const tpl = await templateSvc.readTemplateFile();
    if (!tpl || !tpl.fileData) return res.status(404).json({ success: false, message: 'Template not found' });

    const mime = tpl.mimeType || 'application/octet-stream';
    const fileName = tpl.fileName || 'proposal_template';
    const isPdf = mime.toLowerCase().includes('pdf') || fileName.toLowerCase().endsWith('.pdf');

    res.setHeader('Content-Type', mime);
    // Inline for PDF (view in browser), attachment for others (download)
    res.setHeader('Content-Disposition', `${isPdf ? 'inline' : 'attachment'}; filename="${fileName}"`);
    return res.status(200).send(tpl.fileData);
  } catch (e) { next(e); }
}

export async function getTemplateMeta(req, res, next) {
  try {
    if (!req.user || !req.user.id) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const meta = await templateSvc.readMetadata();
    if (!meta) return res.status(404).json({ success: false, message: 'Template not found' });
    return res.status(200).json({ success: true, data: meta });
  } catch (e) { next(e); }
}

export async function deleteTemplate(req, res, next) {
  try {
    if (!req.user || !req.user.id) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const roles = req.user.roles || [];
    if (!roles.includes('tpa') && !roles.includes('admin')) return res.status(403).json({ success: false, message: 'Forbidden' });
    await templateSvc.removeMetadata();
    return res.status(200).json({ success: true, message: 'Template removed' });
  } catch (e) { next(e); }
}

export default { uploadTemplate, downloadTemplate, deleteTemplate, uploadMiddleware };
