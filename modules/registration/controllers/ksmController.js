import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';
import { createKsmImport, processKsmStub } from '../services/ksmService.js';
import { logger } from '../../../core/utils/logger.js';
import { registrationDb } from '../../../config/databases.js';

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

function isValidUuid(v) {
  if (!v || typeof v !== 'string') return false;
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(v);
}

function userHasAnyRole(user, allowedRoles = []) {
  if (!user) return false;
  // roles may be an array or a single role string or object
  try {
    const normalize = (val) => {
      if (!val && val !== 0) return [];
      // array of values
      if (Array.isArray(val)) return val.flat().map(v => (typeof v === 'string' ? v : (v && v.name) ? String(v.name) : String(v)).toLowerCase());
      // object with name
      if (typeof val === 'object') {
        if (val.name) return [String(val.name).toLowerCase()];
        // maybe roles inside object
        if (val.roles && Array.isArray(val.roles)) return val.roles.map(r => (typeof r === 'string' ? r : (r && r.name) ? r.name : String(r)).toLowerCase());
        return Object.values(val).map(v => String(v).toLowerCase());
      }
      // string: possibly comma separated
      if (typeof val === 'string') return val.split(/[,;\s]+/).map(s => s.toLowerCase()).filter(Boolean);
      return [String(val).toLowerCase()];
    };

    const userRoles = new Set();
    // collect from possible places
    const fromRoles = normalize(user.roles);
    fromRoles.forEach(r => userRoles.add(r));
    const fromRole = normalize(user.role);
    fromRole.forEach(r => userRoles.add(r));
    const fromRoleName = normalize(user.roleName || user.role_name || user.roleName);
    fromRoleName.forEach(r => userRoles.add(r));

    const allowedNormalized = allowedRoles.map(r => String(r).toLowerCase());
    return allowedNormalized.some(ar => userRoles.has(ar));
  } catch (e) {
    // Fallback conservative false if any issue
    return false;
  }
}

function isDevBypassAllowed(req) {
  try {
    // Explicit env flag
    const devFlag = String(process.env.DEV_ALLOW_ALL_IMPORTS || '').toLowerCase() === 'true';
    // Trusted emails CSV
    const trustedCsv = process.env.DEV_TRUSTED_EMAILS || '';
    const trustedEmails = trustedCsv.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    const trustedIdsCsv = process.env.DEV_TRUSTED_USER_IDS || '';
    const trustedIds = trustedIdsCsv.split(',').map(s => s.trim()).filter(Boolean);
    const userEmail = (req.user?.email || '').toString().toLowerCase();
    const userId = (req.user?.id || '').toString();
    // Non-production by default allow for local testing
    const nonProd = (process.env.NODE_ENV || '').toLowerCase() !== 'production';
    if (devFlag) return true;
    if (nonProd) return true;
    if (trustedEmails.length > 0 && userEmail && trustedEmails.includes(userEmail)) return true;
    if (trustedIds.length > 0 && userId && trustedIds.includes(userId)) return true;
    return false;
  } catch (e) {
    return false;
  }
}

export async function uploadKsmHandler(req, res, next) {
  try {
    // Only allow certain roles to upload KSM
    const allowed = ['mahasiswa', 'asisten_praktikum', 'asisten_praktikum_aktif'];
    if (!userHasAnyRole(req.user, allowed)) {
      return res.status(403).json({ success: false, message: 'Only mahasiswa or asisten roles can upload KSM' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'File KSM tidak ditemukan' });
    }

    // Ensure directory
    const ksmDir = path.join(UPLOAD_DIR, 'ksm');
    await fs.mkdir(ksmDir, { recursive: true });

    const timestamp = Date.now();
    const uploaderNameRaw = req.user?.full_name || req.user?.username || req.user?.name || req.user?.id || 'user';
    const uploaderName = String(uploaderNameRaw).replace(/[^a-zA-Z0-9_-]/g, '_');
    const ext = path.extname(req.file.originalname) || '';
    const filename = `ksm_${uploaderName}_${timestamp}${ext}`.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filepath = path.join(ksmDir, filename);

    // Save file from buffer
    await fs.writeFile(filepath, req.file.buffer);

    const uploadedBy = req.user?.id || null;
    // Allow client to optionally include module_id (practicum module) in the multipart form
    const moduleId = req.body?.module_id || null;
    // Store only the filename in DB; processing uses full file path
    const createRes = await createKsmImport(uploadedBy, filename, req.file.originalname, moduleId);
    const importId = createRes?.id || null;

    // If replaced an existing import, delete previous file
    if (createRes?.replaced && createRes.previousFilename) {
      try {
        const oldPath = path.join(ksmDir, createRes.previousFilename);
        if (fsSync.existsSync(oldPath) && createRes.previousFilename !== filename) await fs.unlink(oldPath);
      } catch (e) {
        logger.warn('Failed to delete previous KSM file after replace', { err: e, file: createRes.previousFilename });
      }
    }

    // Process asynchronously (stub)
    processKsmStub(importId, filepath, uploadedBy).catch(err => logger.error('Background KSM processing failed', { err, importId }));

    return res.json({ success: true, importId, message: 'File diterima dan sedang diproses' });
  } catch (error) {
    logger.error('Error in uploadKsmHandler:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

// GET /api/registration/ksm/:importId/file
export async function getKsmFileHandler(req, res) {
  try {
    const importId = req.params.importId;
    const q = `SELECT uploaded_by, filename, module_id FROM ksm_imports WHERE id = $1`;
    const r = await registrationDb.query(q, [importId]);
    if (!r.rows.length) return res.status(404).json({ success: false, message: 'Import not found' });

    const { uploaded_by, filename, module_id } = r.rows[0];
    const requester = String(req.user?.id || '');

    // Owner allowed
    if (uploaded_by && requester === String(uploaded_by)) {
      return streamFile(res, filename);
    }

    // If module_id present, check if requester is assistant on any schedule for that module
    if (module_id) {
      const checkSql = `SELECT 1 FROM schedule_assistants sa JOIN schedules s ON sa.schedule_id = s.id WHERE s.module_id = $1 AND sa.user_id = $2 LIMIT 1`;
      const checkRes = await registrationDb.query(checkSql, [module_id, requester]);
      if (checkRes.rows.length > 0) {
        return streamFile(res, filename);
      }
    }

    // Allow dev bypass (e.g., DEV_ALLOW_ALL_IMPORTS or local dev) to stream files
    if (isDevBypassAllowed(req)) {
      logger.warn('getKsmFileHandler: dev bypass allowed streaming file', { importId, requester });
      return streamFile(res, filename);
    }

    return res.status(403).json({ success: false, message: 'Access denied' });
  } catch (err) {
    logger.error('Error in getKsmFileHandler:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

// GET /api/registration/ksm/imports/me
export async function getMyKsmImportHandler(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const q = `SELECT id, uploaded_by, filename, original_filename, status FROM ksm_imports WHERE uploaded_by = $1 ORDER BY created_at DESC LIMIT 1`;
    const r = await registrationDb.query(q, [userId]);
    const row = r.rows[0] || null;
    const result = row ? {
      id: row.id,
      uploaded_by: row.uploaded_by || null,
      filename: row.filename || null,
      original_filename: row.original_filename || null,
      status: row.status || null,
    } : null;
    return res.json({ success: true, import: result });
  } catch (err) {
    logger.error('Error in getMyKsmImportHandler:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

// GET /api/registration/ksm/imports?moduleId=xxx
export async function listKsmImportsHandler(req, res) {
  try {
    const moduleId = req.query.moduleId || null;
    const requester = String(req.user?.id || '');

    if (!moduleId) {
      // If no module specified, return imports uploaded by requester
      const q = `SELECT id, uploaded_by, original_filename, status, module_id, created_at FROM ksm_imports WHERE uploaded_by = $1 ORDER BY created_at DESC`;
      const r = await registrationDb.query(q, [requester]);
      return res.json({ success: true, imports: r.rows });
    }

    // Verify requester is assistant on this module
    const checkSql = `SELECT 1 FROM schedule_assistants sa JOIN schedules s ON sa.schedule_id = s.id WHERE s.module_id = $1 AND sa.user_id = $2 LIMIT 1`;
    const checkRes = await registrationDb.query(checkSql, [moduleId, requester]);
    if (checkRes.rows.length === 0) {
      // allow dev bypass for module listing
      if (!isDevBypassAllowed(req)) return res.status(403).json({ success: false, message: 'Access denied' });
      logger.warn('listKsmImportsHandler: dev bypass allowed module listing', { moduleId, requester });
    }

    const q = `SELECT k.id, k.uploaded_by, u.email as uploader_email, u.full_name as uploader_name, u.role as uploader_role, u.roles as uploader_roles, k.original_filename, k.status, k.created_at FROM ksm_imports k LEFT JOIN users u ON u.id = k.uploaded_by WHERE k.module_id = $1 ORDER BY k.created_at DESC`;
    const r = await registrationDb.query(q, [moduleId]);
    return res.json({ success: true, imports: r.rows });
  } catch (err) {
    logger.error('Error in listKsmImportsHandler:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

  // GET /api/registration/ksm/imports/module/:moduleId
  export async function listKsmImportsByModuleHandler(req, res) {
    try {
      const moduleId = req.params.moduleId || null;
      const requester = String(req.user?.id || '');

      if (!moduleId) return res.status(400).json({ success: false, message: 'moduleId required' });

      // Allow if requester has assistant role (role-based) OR is an assistant on schedule
      const assistantRoles = ['asisten_praktikum', 'asisten_praktikum_aktif'];
      let allowed = false;
      if (userHasAnyRole(req.user, assistantRoles)) {
        allowed = true;
      } else {
        // fallback: check schedule_assistants
        const checkSql = `SELECT 1 FROM schedule_assistants sa JOIN schedules s ON sa.schedule_id = s.id WHERE s.module_id = $1 AND sa.user_id = $2 LIMIT 1`;
        const checkRes = await registrationDb.query(checkSql, [moduleId, requester]);
        if (checkRes.rows.length > 0) allowed = true;
      }

      if (!allowed) return res.status(403).json({ success: false, message: 'Access denied' });

      const q = `SELECT k.id, k.uploaded_by, u.email as uploader_email, u.full_name as uploader_name, u.role as uploader_role, u.roles as uploader_roles, k.original_filename, k.status, k.created_at FROM ksm_imports k LEFT JOIN users u ON u.id = k.uploaded_by WHERE k.module_id = $1 ORDER BY k.created_at DESC`;
      const r = await registrationDb.query(q, [moduleId]);
      return res.json({ success: true, imports: r.rows });
    } catch (err) {
      logger.error('Error in listKsmImportsByModuleHandler:', err);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

// GET /api/registration/ksm/imports/:id
export async function getKsmImportHandler(req, res) {
  try {
    const importId = req.params.id;
    if (!isValidUuid(importId)) return res.status(400).json({ success: false, message: 'Invalid import id' });
    // Return only the DB columns needed: id, uploaded_by, filename, original_filename, status
    const q = `SELECT id, uploaded_by, filename, original_filename, status FROM ksm_imports WHERE id = $1`;
    const r = await registrationDb.query(q, [importId]);
    if (!r.rows.length) return res.status(404).json({ success: false, message: 'Import not found' });

    const row = r.rows[0];
    // Ensure keys exist and return minimal payload
    const result = {
      id: row.id,
      uploaded_by: row.uploaded_by || null,
      filename: row.filename || null,
      original_filename: row.original_filename || null,
      status: row.status || null,
    };
    return res.json({ success: true, import: result });
  } catch (err) {
    logger.error('Error in getKsmImportHandler:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

// GET /api/registration/ksm/imports/all
export async function listAllKsmImportsHandler(req, res) {
  try {
    // Debug: log requester role shape to help diagnose access issues
    try {
      logger.debug('listAllKsmImportsHandler: requester info', {
        userId: req.user?.id,
        role: req.user?.role,
        roles: req.user?.roles,
        rawKeys: req.user ? Object.keys(req.user) : null
      });
    } catch (e) {
      // ignore logging errors
    }

    // Only allow assistant roles to fetch all imports
    const assistantRoles = ['asisten_praktikum', 'asisten_praktikum_aktif'];
    let allowed = userHasAnyRole(req.user, assistantRoles);

    // Development / debug bypass: allow when DEV_ALLOW_ALL_IMPORTS=true
    // or when user's email is in DEV_TRUSTED_EMAILS (comma-separated env var)
    try {
      const devBypass = String(process.env.DEV_ALLOW_ALL_IMPORTS || '').toLowerCase() === 'true';
      const trustedCsv = process.env.DEV_TRUSTED_EMAILS || '';
      const trusted = trustedCsv.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      const userEmail = (req.user?.email || '').toString().toLowerCase();
      if (!allowed && devBypass) {
        logger.warn('listAllKsmImportsHandler: dev bypass enabled, allowing access', { userId: req.user?.id });
        allowed = true;
      }
      if (!allowed && trusted.length > 0 && userEmail && trusted.includes(userEmail)) {
        logger.warn('listAllKsmImportsHandler: trusted email matched, allowing access', { userId: req.user?.id, userEmail });
        allowed = true;
      }
    } catch (e) {
      // ignore env parse errors
    }

      if (!allowed) {
      // final check: allow dev bypass
      if (isDevBypassAllowed(req)) {
        logger.warn('listAllKsmImportsHandler: dev bypass enabling access', { userId: req.user?.id });
        allowed = true;
      }
    }
    if (!allowed) {
      logger.info('listAllKsmImportsHandler: access denied due to missing assistant role', { userId: req.user?.id, roles: req.user?.roles, role: req.user?.role });
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const q = `SELECT k.id, k.uploaded_by, u.email as uploader_email, u.full_name as uploader_name, u.role as uploader_role, u.roles as uploader_roles, k.original_filename, k.status, k.module_id, k.created_at FROM ksm_imports k LEFT JOIN users u ON u.id = k.uploaded_by ORDER BY k.created_at DESC`;
    const r = await registrationDb.query(q, []);
    return res.json({ success: true, imports: r.rows });
  } catch (err) {
    logger.error('Error in listAllKsmImportsHandler:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

// GET /api/registration/ksm/imports/public
// Public-facing list of KSM imports uploaded by mahasiswa or asisten roles.
// Accessible to any authenticated user; only returns entries where uploader role indicates mahasiswa/asisten.
export async function listPublicKsmImportsHandler(req, res) {
  try {
    const q = `SELECT k.id, k.uploaded_by, u.email as uploader_email, u.full_name as uploader_name, u.role as uploader_role, u.roles as uploader_roles, k.original_filename, k.status, k.module_id, k.created_at FROM ksm_imports k LEFT JOIN users u ON u.id = k.uploaded_by WHERE (COALESCE(u.role::text, '') ILIKE '%mahasiswa%' OR COALESCE(u.role::text, '') ILIKE '%asisten%' OR COALESCE(u.roles::text, '') ILIKE '%mahasiswa%' OR COALESCE(u.roles::text, '') ILIKE '%asisten%') ORDER BY k.created_at DESC`;
    try {
      const r = await registrationDb.query(q, []);
      return res.json({ success: true, imports: r.rows });
    } catch (innerErr) {
      // If users table doesn't exist in this DB (e.g., different schema), fallback to returning ksm_imports rows only
      try {
        const msg = (innerErr && innerErr.message) ? innerErr.message.toString().toLowerCase() : '';
        if (msg.includes('relation "users" does not exist') || msg.includes('unknown table') || msg.includes('no such table')) {
          logger.warn('listPublicKsmImportsHandler: users table missing, falling back to ksm_imports-only query');
          const fallback = `SELECT id, uploaded_by, original_filename, status, module_id, created_at FROM ksm_imports ORDER BY created_at DESC`;
          const fr = await registrationDb.query(fallback, []);
          return res.json({ success: true, imports: fr.rows });
        }
      } catch (fbErr) {
        logger.error('listPublicKsmImportsHandler fallback error:', fbErr);
      }
      throw innerErr;
    }
  } catch (err) {
    logger.error('Error in listPublicKsmImportsHandler:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

// PUT /api/registration/ksm/imports/:id
export async function updateKsmImportHandler(req, res, next) {
  try {
    const importId = req.params.id;
    if (!isValidUuid(importId)) return res.status(400).json({ success: false, message: 'Invalid import id' });
    // fetch existing
    const q = `SELECT id, uploaded_by, filename FROM ksm_imports WHERE id = $1`;
    const r = await registrationDb.query(q, [importId]);
    if (!r.rows.length) return res.status(404).json({ success: false, message: 'Import not found' });
    const existing = r.rows[0];
    const requester = String(req.user?.id || '');
    if (!existing.uploaded_by || requester !== String(existing.uploaded_by)) {
      return res.status(403).json({ success: false, message: 'Only uploader can update this import' });
    }

    // For PUT we only accept replacing the KSM file. Ignore other fields.
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file provided to replace' });
    }

    // save new file to disk with uploader-based name
    const uploadDir = UPLOAD_DIR || path.join(process.cwd(), 'uploads');
    const ksmDir = path.join(uploadDir, 'ksm');
    await fs.mkdir(ksmDir, { recursive: true });
    const timestamp = Date.now();
    const uploaderNameRaw = req.user?.full_name || req.user?.username || req.user?.name || req.user?.id || 'user';
    const uploaderName = String(uploaderNameRaw).replace(/[^a-zA-Z0-9_-]/g, '_');
    const ext = path.extname(req.file.originalname) || '';
    const newFilename = `ksm_${uploaderName}_${timestamp}${ext}`.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filepath = path.join(ksmDir, newFilename);
    await fs.writeFile(filepath, req.file.buffer);

    // Update DB with new filename only
    const updateSql = `UPDATE ksm_imports SET filename = $1, original_filename = $2 WHERE id = $3 RETURNING id, uploaded_by, filename, original_filename, status`;
    const updateRes = await registrationDb.query(updateSql, [newFilename, req.file.originalname, importId]);
    const updated = updateRes.rows[0];

    // remove old file
    if (existing.filename) {
      try {
        const oldPath = path.join(uploadDir, 'ksm', existing.filename);
        if (fsSync.existsSync(oldPath)) await fs.unlink(oldPath);
      } catch (e) {
        logger.warn('Failed to delete old KSM file', { err: e, file: existing.filename });
      }
    }

    return res.json({ success: true, import: { id: updated.id, uploaded_by: updated.uploaded_by, filename: updated.filename, original_filename: updated.original_filename || null, status: updated.status || null } });
  } catch (err) {
    logger.error('Error in updateKsmImportHandler:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

// PUT /api/registration/ksm/imports/me - replace current user's KSM
export async function updateMyKsmImportHandler(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    // find latest import for user
    const q = `SELECT id, uploaded_by, filename FROM ksm_imports WHERE uploaded_by = $1 ORDER BY created_at DESC LIMIT 1`;
    const r = await registrationDb.query(q, [userId]);
    if (!r.rows.length) return res.status(404).json({ success: false, message: 'Import not found' });
    const existing = r.rows[0];

    // same replacement logic as updateKsmImportHandler
    if (!req.file) return res.status(400).json({ success: false, message: 'No file provided to replace' });

    const uploadDir = UPLOAD_DIR || path.join(process.cwd(), 'uploads');
    const ksmDir = path.join(uploadDir, 'ksm');
    await fs.mkdir(ksmDir, { recursive: true });
    const timestamp = Date.now();
    const uploaderNameRaw = req.user?.full_name || req.user?.username || req.user?.name || req.user?.id || 'user';
    const uploaderName = String(uploaderNameRaw).replace(/[^a-zA-Z0-9_-]/g, '_');
    const ext = path.extname(req.file.originalname) || '';
    const newFilename = `ksm_${uploaderName}_${timestamp}${ext}`.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filepath = path.join(ksmDir, newFilename);
    await fs.writeFile(filepath, req.file.buffer);

    const updateSql = `UPDATE ksm_imports SET filename = $1, original_filename = $2 WHERE id = $3 RETURNING id, uploaded_by, filename, original_filename, status`;
    const updateRes = await registrationDb.query(updateSql, [newFilename, req.file.originalname, existing.id]);
    const updated = updateRes.rows[0];

    // remove old file
    if (existing.filename) {
      try {
        const oldPath = path.join(uploadDir, 'ksm', existing.filename);
        if (fsSync.existsSync(oldPath)) await fs.unlink(oldPath);
      } catch (e) {
        logger.warn('Failed to delete old KSM file', { err: e, file: existing.filename });
      }
    }

    return res.json({ success: true, import: { id: updated.id, uploaded_by: updated.uploaded_by, filename: updated.filename, original_filename: updated.original_filename || null, status: updated.status || null } });
  } catch (err) {
    logger.error('Error in updateMyKsmImportHandler:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

// DELETE /api/registration/ksm/imports/me - delete current user's KSM
export async function deleteMyKsmImportHandler(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    // Delete all imports belonging to this user (ensure fully removed)
    const q = `SELECT id, filename FROM ksm_imports WHERE uploaded_by = $1`;
    const r = await registrationDb.query(q, [userId]);
    if (!r.rows.length) return res.status(404).json({ success: false, message: 'Import not found' });

    const ids = r.rows.map(row => row.id);
    try {
      await registrationDb.query(`DELETE FROM ksm_imports WHERE id = ANY($1::uuid[])`, [ids]);
    } catch (e) {
      logger.error('Failed to delete ksm_imports rows for user', { err: e, userId, ids });
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }

    // delete all files on disk
    try {
      const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
      for (const row of r.rows) {
        if (!row.filename) continue;
        const filePath = path.join(uploadDir, 'ksm', row.filename);
        if (fsSync.existsSync(filePath)) {
          try { await fs.unlink(filePath); } catch (e) { logger.warn('Failed to delete KSM file during import delete', { err: e, file: row.filename }); }
        }
      }
    } catch (e) {
      logger.warn('Error while deleting KSM files for user', { err: e, userId });
    }

    return res.json({ success: true, message: 'Import deleted' });
  } catch (err) {
    logger.error('Error in deleteMyKsmImportHandler:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

// DELETE /api/registration/ksm/imports/:id
export async function deleteKsmImportHandler(req, res) {
  try {
    const importId = req.params.id;
    if (!isValidUuid(importId)) return res.status(400).json({ success: false, message: 'Invalid import id' });
    const q = `SELECT id, uploaded_by, filename FROM ksm_imports WHERE id = $1`;
    const r = await registrationDb.query(q, [importId]);
    if (!r.rows.length) return res.status(404).json({ success: false, message: 'Import not found' });
    const existing = r.rows[0];
    const requester = String(req.user?.id || '');
    if (!existing.uploaded_by || requester !== String(existing.uploaded_by)) {
      return res.status(403).json({ success: false, message: 'Only uploader can delete this import' });
    }

    // delete DB row
    await registrationDb.query(`DELETE FROM ksm_imports WHERE id = $1`, [importId]);

    // delete file from disk
    try {
      const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
      const filePath = path.join(uploadDir, 'ksm', existing.filename);
      if (fsSync.existsSync(filePath)) await fs.unlink(filePath);
    } catch (e) {
      logger.warn('Failed to delete KSM file during import delete', { err: e, file: existing.filename });
    }

    return res.json({ success: true, message: 'Import deleted' });
  } catch (err) {
    logger.error('Error in deleteKsmImportHandler:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

function streamFile(res, filename) {
  const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
  const filePath = path.join(uploadDir, 'ksm', filename);
  const normalized = path.normalize(filePath);
  const normalizedUploadDir = path.normalize(path.join(uploadDir));

  if (!normalized.startsWith(normalizedUploadDir)) {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }
  if (!fsSync.existsSync(normalized)) return res.status(404).json({ success: false, message: 'File not found' });

  const ext = path.extname(normalized).toLowerCase();
  const contentTypes = {
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xls': 'application/vnd.ms-excel',
  };
  const contentType = contentTypes[ext] || 'application/octet-stream';
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `inline; filename="${path.basename(normalized)}"`);

  const stream = fsSync.createReadStream(normalized);
  stream.pipe(res);
  stream.on('error', () => { if (!res.headersSent) res.status(500).end(); });
}
