import fs from 'fs';
import path from 'path';
import { procurementDb, userManagementDb } from '../../../config/databases.js';
import * as submissionSvc from './submissionService.js';
import * as submissionStatusLogSvc from './submissionStatusLogService.js';

const PASS_KINDS = new Set(['kaur', 'kaprodi']);

function normalizeKind(raw) {
  const k = String(raw || '').toLowerCase().trim();
  if (k === 'kaur_lab' || k === 'kaur-lab') return 'kaur';
  return k;
}

function targetStatusForKind(kind) {
  return kind === 'kaur' ? 'approved_by_kaur' : 'approved_by_kaprodi';
}

function requiredFromStatusForKind(kind) {
  return kind === 'kaur' ? 'approved_by_tpa' : 'approved_by_kaur';
}

function rolesForPassKind(kind) {
  return kind === 'kaur' ? ['kaur_lab', 'kaur'] : ['kaprodi'];
}

/** Users eligible as bypass recipient (Kaur Lab / Kaprodi). */
export async function listPassRecipients(passKind, { studyProgramId = null } = {}) {
  const kind = normalizeKind(passKind);
  if (!PASS_KINDS.has(kind)) {
    const err = new Error('Invalid pass_kind');
    err.code = 'INVALID';
    throw err;
  }
  const roles = rolesForPassKind(kind);
  const placeholders = roles.map((_, i) => `$${i + 1}`).join(', ');
  const params = [...roles];
  // Kaprodi: studyProgramId filter disabled until user_profiles.study_program_id exists in DB
  const { rows } = await userManagementDb.query(
    `SELECT ur.user_id,
            MAX(up.name) AS name,
            MAX(up.nipnim) AS nipnim,
            COALESCE(MAX(up.name), ur.user_id::text) AS sort_name
     FROM user_roles ur
     LEFT JOIN user_profiles up ON up.user_id = ur.user_id AND up.deleted_at IS NULL
     WHERE ur.deleted_at IS NULL
       AND ur.is_active = true
       AND ur.role IN (${placeholders})
     GROUP BY ur.user_id
     ORDER BY sort_name ASC`,
    params,
  );
  return rows.map((r) => ({
    user_id: String(r.user_id),
    name: r.name ? String(r.name).trim() : null,
    nipnim: r.nipnim ? String(r.nipnim).trim() : null,
    display_label: [r.name, r.nipnim].filter(Boolean).join(' — ') || String(r.user_id),
  }));
}

async function _profileSnapshotForRecipient(userId) {
  const { rows } = await userManagementDb.query(
    `SELECT name, nipnim FROM user_profiles
     WHERE user_id = $1 AND deleted_at IS NULL LIMIT 1`,
    [String(userId)],
  );
  return rows[0] || { name: null, nipnim: null };
}

async function _assertRecipientHasRole(recipientUserId, kind) {
  const roles = rolesForPassKind(kind);
  const placeholders = roles.map((_, i) => `$${i + 2}`).join(', ');
  const { rows } = await userManagementDb.query(
    `SELECT 1 FROM user_roles
     WHERE user_id = $1 AND deleted_at IS NULL AND is_active = true
       AND role IN (${placeholders})
     LIMIT 1`,
    [String(recipientUserId), ...roles],
  );
  if (!rows.length) {
    const err = new Error('Selected user does not have the required role for this handover');
    err.code = 'INVALID';
    throw err;
  }
}

export async function getRecipientUserIdFromPassLog(submissionId, kind) {
  const log = await getLatestPassLog(submissionId, kind);
  return log?.recipient_user_id ? String(log.recipient_user_id) : null;
}

export async function hasPassLog(submissionId, kind) {
  const k = normalizeKind(kind);
  const { rows } = await procurementDb.query(
    `SELECT 1 FROM procurement_submission_laboran_pass_logs
     WHERE submission_id = $1 AND pass_kind = $2 LIMIT 1`,
    [submissionId, k],
  );
  return rows.length > 0;
}

export async function getLatestPassLog(submissionId, kind) {
  const k = normalizeKind(kind);
  const { rows } = await procurementDb.query(
    `SELECT * FROM procurement_submission_laboran_pass_logs
     WHERE submission_id = $1 AND pass_kind = $2
     ORDER BY created_at DESC LIMIT 1`,
    [submissionId, k],
  );
  if (!rows[0]) return null;
  const photos = await getPhotosForLog(rows[0].id);
  return { ...rows[0], photos };
}

export async function getPhotosForLog(passLogId) {
  const { rows } = await procurementDb.query(
    `SELECT id, pass_log_id, file_path, file_name, mime_type, created_at
     FROM procurement_submission_laboran_pass_photos
     WHERE pass_log_id = $1
     ORDER BY id ASC`,
    [passLogId],
  );
  return rows;
}

export async function getPhotoById(photoId) {
  const { rows } = await procurementDb.query(
    `SELECT p.*, l.submission_id, l.pass_kind
     FROM procurement_submission_laboran_pass_photos p
     JOIN procurement_submission_laboran_pass_logs l ON l.id = p.pass_log_id
     WHERE p.id = $1`,
    [photoId],
  );
  return rows[0] || null;
}

/**
 * TPA records handover to Kaur/Kaprodi with photos and advances status.
 */
export async function submitLaboranPass({
  submissionId,
  passKind,
  uploadedBy,
  uploaderName,
  notes,
  files,
  actorName,
  recipientUserId,
}) {
  const kind = normalizeKind(passKind);
  if (!PASS_KINDS.has(kind)) {
    const err = new Error('Invalid pass_kind');
    err.code = 'INVALID';
    throw err;
  }
  if (!Array.isArray(files) || files.length === 0) {
    const err = new Error('At least one proof photo is required');
    err.code = 'INVALID';
    throw err;
  }

  const submission = await submissionSvc.getSubmissionById(submissionId);
  if (!submission) {
    const err = new Error('Submission not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const fromSt = String(submission.status || '').toLowerCase().trim();
  const needFrom = requiredFromStatusForKind(kind);
  if (fromSt !== needFrom) {
    const err = new Error(
      kind === 'kaur'
        ? 'Submission must be approved by laboran (TPA) before passing to Kaur'
        : 'Submission must be approved by Kaur before passing to Kaprodi',
    );
    err.code = 'INVALID';
    throw err;
  }

  if (kind === 'kaprodi' && fromSt !== 'approved_by_kaur') {
    const err = new Error('Submission must be approved by Kaur before passing to Kaprodi');
    err.code = 'INVALID';
    throw err;
  }

  if (await hasPassLog(submissionId, kind)) {
    const err = new Error('Handover proof for this stage already exists');
    err.code = 'INVALID';
    throw err;
  }

  const recipientId = recipientUserId ? String(recipientUserId).trim() : '';
  if (!recipientId) {
    const err = new Error('recipient_user_id is required — select who you are handing over to');
    err.code = 'INVALID';
    throw err;
  }
  await _assertRecipientHasRole(recipientId, kind);
  const recipientSnap = await _profileSnapshotForRecipient(recipientId);

  const toStatus = targetStatusForKind(kind);
  const client = await procurementDb.connect();
  try {
    await client.query('BEGIN');

    const logRes = await client.query(
      `INSERT INTO procurement_submission_laboran_pass_logs
        (submission_id, pass_kind, notes, from_status, to_status, uploaded_by, uploader_name,
         recipient_user_id, recipient_name, recipient_nipnim)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        submissionId,
        kind,
        notes || null,
        fromSt,
        toStatus,
        uploadedBy,
        uploaderName || null,
        recipientId,
        recipientSnap.name || null,
        recipientSnap.nipnim || null,
      ],
    );
    const log = logRes.rows[0];

    const photos = [];
    for (const f of files) {
      const pr = await client.query(
        `INSERT INTO procurement_submission_laboran_pass_photos
          (pass_log_id, file_path, file_name, mime_type)
         VALUES ($1, $2, $3, $4)
         RETURNING id, pass_log_id, file_path, file_name, mime_type, created_at`,
        [log.id, f.filePath, f.fileName, f.mimeType],
      );
      photos.push(pr.rows[0]);
    }

    await client.query(
      `UPDATE procurement_submission SET status = $1, updated_at = now() WHERE id = $2`,
      [toStatus, submissionId],
    );

    await client.query('COMMIT');

    try {
      await submissionStatusLogSvc.appendStatusLog({
        submissionId,
        fromStatus: fromSt,
        toStatus,
        actorUserId: uploadedBy,
        actorName: actorName || uploaderName || null,
        actorRole: 'tpa',
        note: notes || null,
      });
    } catch (_) {}

    const updated = await submissionSvc.getSubmissionById(submissionId);

    return {
      log: { ...log, photos },
      submission: updated,
    };
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {}
    throw e;
  } finally {
    client.release();
  }
}

export async function listPassLogs({ passKind, studyProgramId, limit = 100, offset = 0 } = {}) {
  const kind = normalizeKind(passKind);
  const params = [kind];
  let spFilter = '';
  if (studyProgramId) {
    params.push(studyProgramId);
    spFilter = ` AND s.study_program_id = $${params.length}`;
  }
  params.push(limit, offset);

  const q = `
    SELECT
      l.*,
      s.id AS submission_id,
      s.submission_reference,
      s.purpose,
      s.status AS submission_status,
      s.study_program_id,
      s.lab_id,
      s.created_at AS submission_created_at,
      (SELECT COUNT(*)::int FROM procurement_submission_laboran_pass_photos p WHERE p.pass_log_id = l.id) AS photo_count,
      COALESCE(
        (
          SELECT json_agg(
            json_build_object('id', p.id, 'file_name', p.file_name, 'mime_type', p.mime_type)
            ORDER BY p.id
          )
          FROM procurement_submission_laboran_pass_photos p
          WHERE p.pass_log_id = l.id
        ),
        '[]'::json
      ) AS photos
    FROM procurement_submission_laboran_pass_logs l
    JOIN procurement_submission s ON s.id = l.submission_id
    WHERE l.pass_kind = $1${spFilter}
    ORDER BY l.created_at DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `;
  const { rows } = await procurementDb.query(q, params);
  return rows;
}

export async function getPassLogDetail(logId) {
  const { rows } = await procurementDb.query(
    `SELECT l.*, s.submission_reference, s.purpose, s.status AS submission_status,
            s.study_program_id, s.lab_id, s.requester_name
     FROM procurement_submission_laboran_pass_logs l
     JOIN procurement_submission s ON s.id = l.submission_id
     WHERE l.id = $1`,
    [logId],
  );
  if (!rows[0]) return null;
  const photos = await getPhotosForLog(logId);
  return { ...rows[0], photos };
}

export async function listPassLogsForSubmission(submissionId) {
  const { rows } = await procurementDb.query(
    `SELECT * FROM procurement_submission_laboran_pass_logs
     WHERE submission_id = $1 ORDER BY created_at ASC`,
    [submissionId],
  );
  const out = [];
  for (const row of rows) {
    const photos = await getPhotosForLog(row.id);
    out.push({ ...row, photos });
  }
  return out;
}

export const laboranPassUploadDir = path.resolve(process.cwd(), 'uploads', 'laboran-pass-photos');
fs.mkdirSync(laboranPassUploadDir, { recursive: true });
