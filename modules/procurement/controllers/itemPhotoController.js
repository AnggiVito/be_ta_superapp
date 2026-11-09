import fs from 'fs';
import path from 'path';
import multer from 'multer';
import * as submissionSvc from '../services/submissionService.js';
import * as itemPhotoSvc from '../services/itemPhotoService.js';
import { procurementDb } from '../../../config/databases.js';
import { itemIsCustom, itemIsInventoryBacked } from '../utils/itemIsCustom.js';

const uploadDir = path.resolve(process.cwd(), 'uploads', 'item-photos');
fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ts = Date.now();
    const safe = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    cb(null, `${ts}_${safe}`);
  }
});
export const uploadManyMiddleware = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } }).array('files', 30);
export const replaceSingleMiddleware = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } }).single('file');

function parseItemKeterangans(body) {
  const raw = body?.item_keterangans;
  if (raw == null || raw === '') return {};
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out = {};
    for (const [k, v] of Object.entries(parsed)) {
      out[String(k)] = v == null ? '' : String(v);
    }
    return out;
  } catch {
    return {};
  }
}

function filterKeteranganForSubmission(itemIds, keteranganMap) {
  const allowed = new Set(itemIds.map((x) => String(x)));
  const out = {};
  for (const [k, v] of Object.entries(keteranganMap || {})) {
    if (allowed.has(String(k))) out[String(k)] = v;
  }
  return out;
}

export async function uploadSubmissionItemPhotos(req, res, next) {
  try {
    if (!req.user || !req.user.id) return res.status(401).json({ error: 'Unauthorized' });
    const roles = req.user.roles || [];
    if (!roles.includes('tpa') && !roles.includes('admin')) return res.status(403).json({ error: 'Forbidden' });

    const submissionId = req.params.id;
    const submission = await submissionSvc.findByIdWithItems(submissionId);
    if (!submission || !submission.id) return res.status(404).json({ error: 'Submission not found' });

    const files = Array.isArray(req.files) ? req.files : [];
    const itemIds = Array.isArray(req.body.item_ids) ? req.body.item_ids : (req.body.item_ids ? [req.body.item_ids] : []);
    if (files.length > 0 && files.length !== itemIds.length) return res.status(422).json({ error: 'item_ids length must match files length' });

    const items = submission.items || [];
    const customItemIds = items.filter((it) => it && itemIsCustom(it)).map((it) => String(it.id));
    const inventoryItemIds = items.filter((it) => it && itemIsInventoryBacked(it)).map((it) => String(it.id));
    const requestedIds = itemIds.map((x) => String(x));
    // Only validate item_ids when files are uploaded
    if (files.length > 0) {
      if (customItemIds.length === 0) return res.status(422).json({ error: 'No custom items found in this submission' });
      const setCustom = new Set(customItemIds);
      const setRequested = new Set(requestedIds);
      if (setRequested.size !== requestedIds.length) {
        return res.status(422).json({ error: 'item_ids must be unique' });
      }
      if ([...setRequested].some((id) => !setCustom.has(id))) {
        return res.status(422).json({ error: 'item_ids must belong to custom items' });
      }
    }

    let created = [];
    if (files.length > 0) {
      const filesByItem = files.map((f, idx) => ({
        itemId: Number(itemIds[idx]),
        filePath: f.path,
        fileName: f.originalname,
        mimeType: f.mimetype,
      }));
      created = await itemPhotoSvc.replaceItemPhotos({ submissionId, uploadedBy: req.user.id, filesByItem });
    } else {
      created = await itemPhotoSvc.getBySubmission(submissionId);
    }

    const readyItemIdsRaw = Array.isArray(req.body.ready_item_ids)
      ? req.body.ready_item_ids
      : (req.body.ready_item_ids ? [req.body.ready_item_ids] : []);
    const readyItemIds = readyItemIdsRaw.map((x) => String(x));
    const invSet = new Set(inventoryItemIds);
    const readySet = new Set(readyItemIds);
    if ([...readySet].some((id) => !invSet.has(id))) {
      return res.status(422).json({ error: 'ready_item_ids must belong to inventory items' });
    }
    await itemPhotoSvc.upsertItemReadyFlags({
      submissionId,
      itemIds: [...readySet].map((x) => Number(x)),
      markedBy: req.user.id,
    });

    const allItemIds = items.map((it) => String(it.id));
    const keteranganMap = filterKeteranganForSubmission(allItemIds, parseItemKeterangans(req.body));
    await itemPhotoSvc.updateBeritaAcaraKeterangan({ submissionId, keteranganByItemId: keteranganMap });

    const existingPhotos = await itemPhotoSvc.getBySubmission(submissionId);
    const existingCustomIds = new Set(
      existingPhotos
        .map((p) => String(p.submission_item_id || ''))
        .filter((id) => id && customItemIds.includes(id))
    );
    const allCustomDone = customItemIds.length === 0 || existingCustomIds.size === customItemIds.length;
    const allInventoryDone = inventoryItemIds.length === 0 || readySet.size === inventoryItemIds.length;
    const allDone = allCustomDone && allInventoryDone;
    let statusUpdated = false;
    let newStatus = null;
    if (allDone) {
      await procurementDb.query(
        'UPDATE procurement_submission SET status = $1, updated_at = now() WHERE id = $2',
        ['ready_to_pickup', submissionId]
      );
      statusUpdated = true;
      newStatus = 'ready_to_pickup';
    } else {
      const curStatus = submission.status || null;
      // Mixed submission (custom + inventory) or custom-only: if previously ready, move back to on_going
      if (customItemIds.length > 0 && inventoryItemIds.length > 0) {
        if (curStatus === 'ready_to_pickup') {
          await procurementDb.query('UPDATE procurement_submission SET status = $1, updated_at = now() WHERE id = $2', ['on_going', submissionId]);
          statusUpdated = true;
          newStatus = 'on_going';
        }
      } else if (customItemIds.length === 0 && inventoryItemIds.length > 0) {
        // Full-inventory: when not all inventory marked ready, revert to approved_by_kaprodi
        if (curStatus === 'ready_to_pickup') {
          await procurementDb.query('UPDATE procurement_submission SET status = $1, updated_at = now() WHERE id = $2', ['approved_by_kaprodi', submissionId]);
          statusUpdated = true;
          newStatus = 'approved_by_kaprodi';
        }
      } else if (customItemIds.length > 0 && inventoryItemIds.length === 0) {
        // Custom-only submissions: if previously ready, revert to on_going
        if (curStatus === 'ready_to_pickup') {
          await procurementDb.query('UPDATE procurement_submission SET status = $1, updated_at = now() WHERE id = $2', ['on_going', submissionId]);
          statusUpdated = true;
          newStatus = 'on_going';
        }
      }
    }
    return res.status(201).json({ success: true, data: created, status_updated: statusUpdated, new_status: newStatus });
  } catch (err) { next(err); }
}

export async function listSubmissionItemPhotos(req, res, next) {
  try {
    if (!req.user || !req.user.id) return res.status(401).json({ error: 'Unauthorized' });
    const submissionId = req.params.id;
    const submission = await submissionSvc.getSubmissionById(submissionId);
    if (!submission) return res.status(404).json({ error: 'Submission not found' });
    const rows = await itemPhotoSvc.getBySubmission(submissionId);
    const readyFlags = await itemPhotoSvc.getReadyFlagsBySubmission(submissionId);
    return res.status(200).json({ success: true, data: rows, meta: { ready_item_ids: readyFlags.map((r) => r.submission_item_id) } });
  } catch (err) { next(err); }
}

export async function downloadSubmissionItemPhoto(req, res, next) {
  try {
    if (!req.user || !req.user.id) return res.status(401).json({ error: 'Unauthorized' });
    const { id: submissionId, photoId } = req.params;
    const photo = await itemPhotoSvc.getById(photoId);
    if (!photo) return res.status(404).json({ error: 'Item photo not found' });
    if (String(photo.submission_id) !== String(submissionId)) return res.status(400).json({ error: 'Item photo does not belong to submission' });

    const rawPath = String(photo.file_path || '');
    const absPath = path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), rawPath);
    if (!fs.existsSync(absPath)) return res.status(404).json({ error: 'Item photo file not found on server' });

    const fileName = photo.file_name || `item_photo_${photoId}`;
    const mimeType = photo.mime_type || 'application/octet-stream';
    res.setHeader('Content-Type', mimeType);
    return res.download(absPath, fileName);
  } catch (err) { next(err); }
}

export async function deleteSubmissionItemPhoto(req, res, next) {
  try {
    if (!req.user || !req.user.id) return res.status(401).json({ error: 'Unauthorized' });
    const roles = req.user.roles || [];
    if (!roles.includes('tpa') && !roles.includes('admin')) return res.status(403).json({ error: 'Forbidden' });

    const { id: submissionId, photoId } = req.params;
    const photo = await itemPhotoSvc.getById(photoId);
    if (!photo) return res.status(404).json({ error: 'Item photo not found' });
    if (String(photo.submission_id) !== String(submissionId)) return res.status(400).json({ error: 'Item photo does not belong to submission' });

    const deleted = await itemPhotoSvc.deleteById(photoId);
    // attempt to remove file from disk if exists
    try {
      const rawPath = String(deleted.file_path || '');
      const absPath = path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), rawPath);
      if (fs.existsSync(absPath)) fs.unlinkSync(absPath);
    } catch (_) {}

    // After deletion, determine if submission status should be adjusted
    try {
      const submission = await submissionSvc.findByIdWithItems(submissionId);
      if (submission && submission.id) {
        const items = submission.items || [];
        const customItemIds = items.filter((it) => it && itemIsCustom(it)).map((it) => String(it.id));
        const inventoryItemIds = items.filter((it) => it && itemIsInventoryBacked(it)).map((it) => String(it.id));

        const existingPhotos = await itemPhotoSvc.getBySubmission(submissionId);
        const existingCustomIds = new Set(
          existingPhotos
            .map((p) => String(p.submission_item_id || ''))
            .filter((id) => id && customItemIds.includes(id))
        );

        const readyFlags = await itemPhotoSvc.getReadyFlagsBySubmission(submissionId);
        const readySet = new Set((readyFlags || []).map((r) => String(r.submission_item_id)));

        const allCustomDone = customItemIds.length === 0 || existingCustomIds.size === customItemIds.length;
        const allInventoryDone = inventoryItemIds.length === 0 || readySet.size === inventoryItemIds.length;
        const allDone = allCustomDone && allInventoryDone;

        let statusUpdated = false;
        let newStatus = null;
        if (allDone) {
          await procurementDb.query('UPDATE procurement_submission SET status = $1, updated_at = now() WHERE id = $2', ['ready_to_pickup', submissionId]);
          statusUpdated = true;
          newStatus = 'ready_to_pickup';
        } else {
          const curStatus = submission.status || null;
          if (customItemIds.length > 0 && inventoryItemIds.length > 0) {
            if (curStatus === 'ready_to_pickup') {
              await procurementDb.query('UPDATE procurement_submission SET status = $1, updated_at = now() WHERE id = $2', ['on_going', submissionId]);
              statusUpdated = true;
              newStatus = 'on_going';
            }
          } else if (customItemIds.length === 0 && inventoryItemIds.length > 0) {
            if (curStatus === 'ready_to_pickup') {
              await procurementDb.query('UPDATE procurement_submission SET status = $1, updated_at = now() WHERE id = $2', ['approved_by_kaprodi', submissionId]);
              statusUpdated = true;
              newStatus = 'approved_by_kaprodi';
            }
          } else if (customItemIds.length > 0 && inventoryItemIds.length === 0) {
            if (curStatus === 'ready_to_pickup') {
              await procurementDb.query('UPDATE procurement_submission SET status = $1, updated_at = now() WHERE id = $2', ['on_going', submissionId]);
              statusUpdated = true;
              newStatus = 'on_going';
            }
          }
        }

        return res.status(200).json({ success: true, data: deleted, status_updated: statusUpdated, new_status: newStatus });
      }
    } catch (e) {
      // ignore status update failures and just return deleted result
    }

    return res.status(200).json({ success: true, data: deleted });
  } catch (err) { next(err); }
}

export async function replaceSubmissionItemPhoto(req, res, next) {
  try {
    if (!req.user || !req.user.id) return res.status(401).json({ error: 'Unauthorized' });
    const roles = req.user.roles || [];
    if (!roles.includes('tpa') && !roles.includes('admin')) return res.status(403).json({ error: 'Forbidden' });

    const { id: submissionId, photoId } = req.params;
    const photo = await itemPhotoSvc.getById(photoId);
    if (!photo) return res.status(404).json({ error: 'Item photo not found' });
    if (String(photo.submission_id) !== String(submissionId)) return res.status(400).json({ error: 'Item photo does not belong to submission' });

    // support both single-file upload (req.file) and multi (req.files)
    let files = Array.isArray(req.files) ? req.files : [];
    if (req.file) files = [req.file];
    if (files.length !== 1) return res.status(422).json({ error: 'Please upload exactly one file to replace the photo' });
    const f = files[0];

    // replace DB row and remove old file
    const replaced = await itemPhotoSvc.replacePhotoById({ photoId, uploadedBy: req.user.id, filePath: f.path, fileName: f.originalname, mimeType: f.mimetype });
    try {
      const rawPath = String(photo.file_path || '');
      const absPath = path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), rawPath);
      if (fs.existsSync(absPath)) fs.unlinkSync(absPath);
    } catch (_) {}

    return res.status(200).json({ success: true, data: replaced });
  } catch (err) { next(err); }
}
