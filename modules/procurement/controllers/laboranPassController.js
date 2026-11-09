import fs from 'fs';
import path from 'path';
import multer from 'multer';
import {
  displayNameFromJwtPayload,
  mergeGatewayJwtUserPayload,
} from '../../../core/utils/jwtIdentityFromPayload.js';
import * as laboranPassSvc from '../services/laboranPassService.js';
import { laboranPassUploadDir } from '../services/laboranPassService.js';

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, laboranPassUploadDir),
  filename: (req, file, cb) => {
    const ts = Date.now();
    const safe = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    cb(null, `${ts}_${safe}`);
  },
});
export const uploadManyMiddleware = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
}).array('files', 20);

function _userHasRole(user, roleName) {
  if (!user) return false;
  const rn = String(roleName).toLowerCase().trim();
  const norm = (v) => {
    const s = String(v).toLowerCase().trim();
    if (s === 'kaur' || s === 'kaur-lab' || s === 'kaur lab') return 'kaur_lab';
    return s;
  };
  if (user.role && norm(user.role) === norm(rn)) return true;
  if (Array.isArray(user.roles)) {
    return user.roles.some((r) => {
      const v = typeof r === 'string' ? r : r?.role || r?.name;
      return v && norm(v) === norm(rn);
    });
  }
  return false;
}

function _displayName(req) {
  const merged = mergeGatewayJwtUserPayload(req.user, req);
  return displayNameFromJwtPayload(merged) || req.user?.full_name || req.user?.name || null;
}

/** POST /submission/:id/laboran-pass — TPA uploads proof and advances status. */
export async function submitLaboranPass(req, res, next) {
  try {
    if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
    if (!_userHasRole(req.user, 'tpa') && !_userHasRole(req.user, 'admin')) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { id } = req.params;
    const passKind = req.body?.pass_kind || req.body?.passKind;
    const notes = (req.body?.notes || '').toString().trim() || null;
    const recipientUserId =
      req.body?.recipient_user_id || req.body?.recipientUserId || null;
    const files = Array.isArray(req.files) ? req.files : [];
    if (!passKind) return res.status(400).json({ error: 'Missing pass_kind' });
    if (!recipientUserId) {
      return res.status(422).json({ error: 'recipient_user_id is required' });
    }
    if (files.length === 0) return res.status(422).json({ error: 'At least one proof photo is required' });

    const filePayload = files.map((f) => ({
      filePath: f.path,
      fileName: f.originalname,
      mimeType: f.mimetype,
    }));

    const result = await laboranPassSvc.submitLaboranPass({
      submissionId: id,
      passKind,
      uploadedBy: req.user.id,
      uploaderName: _displayName(req),
      notes,
      files: filePayload,
      actorName: _displayName(req),
      recipientUserId,
    });

    return res.status(201).json({ success: true, data: result });
  } catch (err) {
    if (err?.code === 'INVALID') return res.status(422).json({ error: err.message });
    if (err?.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    next(err);
  }
}

/** GET /submission/laboran-pass-recipients?kind=kaur|kaprodi — TPA picks Kaur/Kaprodi on handover. */
export async function listLaboranPassRecipients(req, res, next) {
  try {
    if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
    if (!_userHasRole(req.user, 'tpa') && !_userHasRole(req.user, 'admin')) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const kind = String(req.query?.kind || req.query?.pass_kind || '').toLowerCase().trim();
    if (kind !== 'kaur' && kind !== 'kaprodi') {
      return res.status(400).json({ error: 'Query kind must be kaur or kaprodi' });
    }
    const studyProgramId =
      req.query?.study_program_id || req.query?.studyProgramId || null;
    const rows = await laboranPassSvc.listPassRecipients(kind, { studyProgramId });
    return res.status(200).json({ success: true, data: rows });
  } catch (err) {
    if (err?.code === 'INVALID') return res.status(422).json({ error: err.message });
    next(err);
  }
}

/** GET /submission/laboran-pass-logs?kind=kaur|kaprodi */
export async function listLaboranPassLogs(req, res, next) {
  try {
    if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });

    const kind = String(req.query?.kind || '').toLowerCase().trim();
    if (kind !== 'kaur' && kind !== 'kaprodi') {
      return res.status(400).json({ error: 'Query kind must be kaur or kaprodi' });
    }

    const isKaur = _userHasRole(req.user, 'kaur_lab') || _userHasRole(req.user, 'kaur');
    const isKaprodi = _userHasRole(req.user, 'kaprodi');
    const isTpa = _userHasRole(req.user, 'tpa') || _userHasRole(req.user, 'admin');

    if (kind === 'kaur' && !isKaur && !isTpa) return res.status(403).json({ error: 'Forbidden' });
    if (kind === 'kaprodi' && !isKaprodi && !isTpa) return res.status(403).json({ error: 'Forbidden' });

    let studyProgramId = null;
    if (kind === 'kaprodi' && isKaprodi) {
      studyProgramId = req.query?.study_program_id || req.user?.study_program_id || null;
    }

    const limit = Math.min(Number(req.query?.limit) || 100, 200);
    const offset = Number(req.query?.offset) || 0;
    const rows = await laboranPassSvc.listPassLogs({
      passKind: kind,
      studyProgramId,
      limit,
      offset,
    });
    return res.status(200).json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
}

/** GET /submission/:id/laboran-pass-logs */
export async function listLaboranPassLogsForSubmission(req, res, next) {
  try {
    if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
    const { id } = req.params;
    const rows = await laboranPassSvc.listPassLogsForSubmission(id);
    return res.status(200).json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
}

/** GET /submission/laboran-pass-logs/:logId */
export async function getLaboranPassLogDetail(req, res, next) {
  try {
    if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
    const log = await laboranPassSvc.getPassLogDetail(req.params.logId);
    if (!log) return res.status(404).json({ error: 'Log not found' });
    return res.status(200).json({ success: true, data: log });
  } catch (err) {
    next(err);
  }
}

/** GET /submission/laboran-pass-logs/:logId/photos/:photoId/file */
export async function downloadLaboranPassPhoto(req, res, next) {
  try {
    if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
    const photo = await laboranPassSvc.getPhotoById(req.params.photoId);
    if (!photo || String(photo.pass_log_id) !== String(req.params.logId)) {
      return res.status(404).json({ error: 'Photo not found' });
    }
    const abs = path.resolve(photo.file_path);
    if (!fs.existsSync(abs)) return res.status(404).json({ error: 'File not found' });
    const fileName = photo.file_name || `pass_photo_${photo.id}`;
    return res.download(abs, fileName);
  } catch (err) {
    next(err);
  }
}
