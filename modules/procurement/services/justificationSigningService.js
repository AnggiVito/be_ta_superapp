import { procurementDb, registrationDb } from '../../../config/databases.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Resolve JWT/name tokens to canonical study_programs.id when possible. */
async function canonicalStudyProgramId(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (UUID_RE.test(s)) return s;
  try {
    const { rows } = await registrationDb.query(
      `SELECT id FROM study_programs
       WHERE lower(trim(name)) = lower(trim($1))
       LIMIT 1`,
      [s],
    );
    return rows[0]?.id ? String(rows[0].id) : s;
  } catch {
    return s;
  }
}

async function laboratoryIdsForStudyProgram(studyProgramId) {
  try {
    const { rows } = await registrationDb.query(
      'SELECT id FROM laboratories WHERE study_program_id = $1',
      [studyProgramId],
    );
    return rows.map((r) => r.id);
  } catch {
    return [];
  }
}

export const JUSTIF_MODE_WET = 'wet';
export const JUSTIF_MODE_DIGITAL = 'digital';
export const JUSTIF_STATUS_PENDING_KAUR = 'pending_kaur';
export const JUSTIF_STATUS_PENDING_KAPRODI = 'pending_kaprodi';
export const JUSTIF_STATUS_SIGNED = 'signed';

/** Minimum total (IDR) for justification signing workflow (≥ Rp 1.000.000). */
export const JUSTIFICATION_AMOUNT_THRESHOLD_IDR = 1_000_000;

export function submissionMeetsJustificationThreshold(submission) {
  const amount = Number(submission?.total_price ?? 0);
  return Number.isFinite(amount) && amount >= JUSTIFICATION_AMOUNT_THRESHOLD_IDR;
}

function normStatus(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s\-–—]+/g, '_');
}

export function justificationKaurSigned(submission) {
  return String(submission?.justification_kaur_signature ?? '').trim() !== '';
}

export function justificationKaprodiSigned(submission) {
  return String(submission?.justification_kaprodi_signature ?? '').trim() !== '';
}

export function justificationDigitallyFullySigned(submission) {
  return (
    normStatus(submission?.justification_digital_status) === JUSTIF_STATUS_SIGNED ||
    (justificationKaurSigned(submission) && justificationKaprodiSigned(submission))
  );
}

async function columnExists(client, name) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_name = 'procurement_submission' AND column_name = $1`,
    [name],
  );
  return rows.length > 0;
}

async function assertJustificationSigningColumns(client) {
  const ok = await columnExists(client, 'justification_signing_mode');
  if (!ok) {
    const err = new Error(
      'Justification signing columns missing. Run procurement migrations.',
    );
    err.code = 'NO_JUSTIF_SIGNING_COLUMN';
    throw err;
  }
}

export async function setJustificationSigningMode(submissionId, mode) {
  if (mode !== JUSTIF_MODE_WET && mode !== JUSTIF_MODE_DIGITAL) {
    const err = new Error('signing_mode must be wet or digital');
    err.code = 'INVALID_MODE';
    throw err;
  }
  const client = await procurementDb.connect();
  try {
    await client.query('BEGIN');
    await assertJustificationSigningColumns(client);
    const cur = await client.query(
      'SELECT * FROM procurement_submission WHERE id = $1 FOR UPDATE',
      [submissionId],
    );
    if (cur.rowCount === 0) {
      await client.query('ROLLBACK');
      return null;
    }
    const row = cur.rows[0];
    if (normStatus(row.status) !== 'completed') {
      const err = new Error('Justification is only for completed submissions.');
      err.code = 'INVALID_STATUS';
      throw err;
    }
    if (!submissionMeetsJustificationThreshold(row)) {
      const err = new Error(
        'Justification signing is only for totals of Rp 1,000,000 or more.',
      );
      err.code = 'BELOW_THRESHOLD';
      throw err;
    }
    const forwarded = row.justification_forwarded_at != null;
    const dig = normStatus(row.justification_digital_status);
    if (forwarded && dig && dig !== JUSTIF_STATUS_SIGNED) {
      const err = new Error(
        'Signing mode cannot be changed after forwarding to Kaur Lab/Kaprodi.',
      );
      err.code = 'ALREADY_FORWARDED';
      throw err;
    }
    const digitalStatus =
      mode === JUSTIF_MODE_DIGITAL ? null : null;
    const { rows } = await client.query(
      `UPDATE procurement_submission
       SET justification_signing_mode = $1,
           justification_digital_status = $2,
           updated_at = now()
       WHERE id = $3
       RETURNING *`,
      [mode, digitalStatus, submissionId],
    );
    await client.query('COMMIT');
    return rows[0] || null;
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {}
    throw e;
  } finally {
    client.release();
  }
}

export async function forwardJustificationDigital(submissionId) {
  const client = await procurementDb.connect();
  try {
    await client.query('BEGIN');
    await assertJustificationSigningColumns(client);
    const cur = await client.query(
      'SELECT * FROM procurement_submission WHERE id = $1 FOR UPDATE',
      [submissionId],
    );
    if (cur.rowCount === 0) {
      await client.query('ROLLBACK');
      return null;
    }
    const row = cur.rows[0];
    if (normStatus(row.status) !== 'completed') {
      const err = new Error('Hanya submission completed.');
      err.code = 'INVALID_STATUS';
      throw err;
    }
    if (!submissionMeetsJustificationThreshold(row)) {
      const err = new Error(
        'Justification signing is only for totals of Rp 1,000,000 or more.',
      );
      err.code = 'BELOW_THRESHOLD';
      throw err;
    }
    if (normStatus(row.justification_signing_mode) !== JUSTIF_MODE_DIGITAL) {
      const err = new Error('Set digital signing mode first.');
      err.code = 'NOT_DIGITAL_MODE';
      throw err;
    }
    const dig = normStatus(row.justification_digital_status);
    if (dig === JUSTIF_STATUS_SIGNED) {
      const err = new Error('Justification is already signed by Kaur Lab and Kaprodi.');
      err.code = 'ALREADY_SIGNED';
      throw err;
    }
    const { rows } = await client.query(
      `UPDATE procurement_submission
       SET justification_digital_status = $1,
           justification_forwarded_at = COALESCE(justification_forwarded_at, now()),
           updated_at = now()
       WHERE id = $2
       RETURNING *`,
      [JUSTIF_STATUS_PENDING_KAUR, submissionId],
    );
    await client.query('COMMIT');
    return rows[0] || null;
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {}
    throw e;
  } finally {
    client.release();
  }
}

async function updateJustifSignature(submissionId, role, actorUserId, signatureDataUri, signerFromJwt) {
  const isKaur = role === 'kaur';
  const prefix = isKaur ? 'justification_kaur' : 'justification_kaprodi';
  const client = await procurementDb.connect();
  try {
    await client.query('BEGIN');
    await assertJustificationSigningColumns(client);
    const cur = await client.query(
      'SELECT * FROM procurement_submission WHERE id = $1 FOR UPDATE',
      [submissionId],
    );
    if (cur.rowCount === 0) {
      await client.query('ROLLBACK');
      return null;
    }
    const row = cur.rows[0];
    if (normStatus(row.status) !== 'completed') {
      const err = new Error('Submission harus completed.');
      err.code = 'INVALID_STATUS';
      throw err;
    }
    if (normStatus(row.justification_signing_mode) !== JUSTIF_MODE_DIGITAL) {
      const err = new Error('Not a digital Justification signing workflow.');
      err.code = 'NOT_DIGITAL_MODE';
      throw err;
    }
    const dig = normStatus(row.justification_digital_status);
    if (isKaur) {
      if (dig !== JUSTIF_STATUS_PENDING_KAUR) {
        const err = new Error('Waiting for Kaur Lab signature on Justification.');
        err.code = 'WRONG_QUEUE';
        throw err;
      }
    } else if (dig !== JUSTIF_STATUS_PENDING_KAPRODI) {
      const err = new Error('Waiting for Kaprodi signature on Justification.');
      err.code = 'WRONG_QUEUE';
      throw err;
    }

    const sets = [`${prefix}_signature = $1`];
    const vals = [signatureDataUri];
    sets.push(`${prefix}_signed_by = $${vals.length + 1}`);
    vals.push(actorUserId == null ? null : String(actorUserId));
    sets.push(`${prefix}_signed_at = now()`);
    if (signerFromJwt && typeof signerFromJwt === 'object') {
      sets.push(`${prefix}_signer_name = $${vals.length + 1}`);
      vals.push(
        signerFromJwt.name != null ? String(signerFromJwt.name).trim() || null : null,
      );
      sets.push(`${prefix}_signer_nipnim = $${vals.length + 1}`);
      vals.push(
        signerFromJwt.nipnim != null ? String(signerFromJwt.nipnim).trim() || null : null,
      );
    }
    const nextStatus = isKaur ? JUSTIF_STATUS_PENDING_KAPRODI : JUSTIF_STATUS_SIGNED;
    sets.push(`justification_digital_status = $${vals.length + 1}`);
    vals.push(nextStatus);
    vals.push(submissionId);
    const sql = `UPDATE procurement_submission SET ${sets.join(', ')}, updated_at = now() WHERE id = $${vals.length} RETURNING *`;
    const { rows } = await client.query(sql, vals);
    await client.query('COMMIT');
    return rows[0] || null;
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {}
    throw e;
  } finally {
    client.release();
  }
}

export async function setJustificationKaurSignature(
  submissionId,
  actorUserId,
  signatureDataUri,
  signerFromJwt = null,
) {
  return updateJustifSignature(
    submissionId,
    'kaur',
    actorUserId,
    signatureDataUri,
    signerFromJwt,
  );
}

export async function setJustificationKaprodiSignature(
  submissionId,
  actorUserId,
  signatureDataUri,
  signerFromJwt = null,
) {
  return updateJustifSignature(
    submissionId,
    'kaprodi',
    actorUserId,
    signatureDataUri,
    signerFromJwt,
  );
}

const SQL_JUSTIF_AMOUNT = `COALESCE(s.total_price, 0) >= ${JUSTIFICATION_AMOUNT_THRESHOLD_IDR}`;

const SQL_JUSTIF_PENDING_KAUR = `
  lower(COALESCE(s.status, '')) = 'completed'
  AND ${SQL_JUSTIF_AMOUNT}
  AND lower(COALESCE(s.justification_signing_mode, '')) = 'digital'
  AND lower(COALESCE(s.justification_digital_status, '')) = 'pending_kaur'
  AND (s.justification_kaur_signature IS NULL OR trim(COALESCE(s.justification_kaur_signature, '')) = '')
`;

const SQL_JUSTIF_PENDING_KAPRODI = `
  lower(COALESCE(s.status, '')) = 'completed'
  AND ${SQL_JUSTIF_AMOUNT}
  AND lower(COALESCE(s.justification_signing_mode, '')) = 'digital'
  AND lower(COALESCE(s.justification_digital_status, '')) = 'pending_kaprodi'
  AND trim(COALESCE(s.justification_kaur_signature, '')) <> ''
  AND (s.justification_kaprodi_signature IS NULL OR trim(COALESCE(s.justification_kaprodi_signature, '')) = '')
`;

export async function getJustificationPendingKaurStats() {
  const { rows } = await procurementDb.query(
    `SELECT COUNT(*)::int AS waiting FROM procurement_submission s WHERE ${SQL_JUSTIF_PENDING_KAUR}`,
  );
  return rows[0] || { waiting: 0 };
}

function sqlJustifKaprodiStudyProgramFilter(paramIndex, labIdsParamIndex) {
  if (labIdsParamIndex != null) {
    return `(
      s.study_program_id::text = $${paramIndex}::text
      OR (
        s.study_program_id IS NULL
        AND s.lab_id IS NOT NULL
        AND s.lab_id = ANY($${labIdsParamIndex}::uuid[])
      )
    )`;
  }
  return `s.study_program_id::text = $${paramIndex}::text`;
}

export async function getJustificationPendingKaprodiStats(studyProgramId) {
  const spId = await canonicalStudyProgramId(studyProgramId);
  if (!spId) return { waiting: 0 };
  const labIds = await laboratoryIdsForStudyProgram(spId);
  const params = [spId];
  let labClause = '';
  if (labIds.length > 0) {
    params.push(labIds);
    labClause = ` AND ${sqlJustifKaprodiStudyProgramFilter(1, 2)}`;
  } else {
    labClause = ` AND ${sqlJustifKaprodiStudyProgramFilter(1, null)}`;
  }
  const { rows } = await procurementDb.query(
    `SELECT COUNT(*)::int AS waiting FROM procurement_submission s
     WHERE ${SQL_JUSTIF_PENDING_KAPRODI}${labClause}`,
    params,
  );
  return rows[0] || { waiting: 0 };
}

export async function listJustificationPendingKaur({ limit = 200, offset = 0 } = {}) {
  const { rows } = await procurementDb.query(
    `SELECT s.* FROM procurement_submission s
     WHERE ${SQL_JUSTIF_PENDING_KAUR}
     ORDER BY s.justification_forwarded_at DESC NULLS LAST, s.updated_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  return rows;
}

function hasJustificationSigningMode(submission) {
  return String(submission?.justification_signing_mode ?? '').trim() !== '';
}

export async function submissionInKaurJustificationQueue(submissionId) {
  const { rows } = await procurementDb.query(
    `SELECT 1 FROM procurement_submission s
     WHERE s.id = $1 AND ${SQL_JUSTIF_PENDING_KAUR} LIMIT 1`,
    [submissionId],
  );
  return rows.length > 0;
}

export async function submissionInKaprodiJustificationQueue(
  submissionId,
  studyProgramIdRaw,
) {
  const spId = await canonicalStudyProgramId(studyProgramIdRaw);
  if (!spId) return false;
  const labIds = await laboratoryIdsForStudyProgram(spId);
  const params = [submissionId, spId];
  let labClause = '';
  if (labIds.length > 0) {
    params.push(labIds);
    labClause = ` AND ${sqlJustifKaprodiStudyProgramFilter(2, 3)}`;
  } else {
    labClause = ` AND ${sqlJustifKaprodiStudyProgramFilter(2, null)}`;
  }
  const { rows } = await procurementDb.query(
    `SELECT 1 FROM procurement_submission s
     WHERE s.id = $1 AND ${SQL_JUSTIF_PENDING_KAPRODI}${labClause} LIMIT 1`,
    params,
  );
  return rows.length > 0;
}

export async function submissionBelongsToKaprodiStudyProgram(submission, studyProgramIdRaw) {
  const spId = await canonicalStudyProgramId(studyProgramIdRaw);
  if (!spId || !submission) return false;
  const subSp = await canonicalStudyProgramId(
    submission.study_program_id || submission.studyProgramId,
  );
  if (subSp && String(subSp) === String(spId)) return true;
  if (!submission.lab_id) return false;
  const labIds = await laboratoryIdsForStudyProgram(spId);
  return labIds.some((id) => String(id) === String(submission.lab_id));
}

/** PDF options for preview download (unsigned / partial signatures). */
export function resolveJustificationPdfRenderOptions(submission, wantSigned) {
  if (wantSigned) {
    return { includeSignatures: true, previewRole: null };
  }
  const dig = normStatus(submission?.justification_digital_status);
  if (
    dig === JUSTIF_STATUS_PENDING_KAPRODI &&
    justificationKaurSigned(submission)
  ) {
    return { includeSignatures: false, previewRole: 'kaprodi' };
  }
  return { includeSignatures: false, previewRole: 'kaur' };
}

/** Kaur/Kaprodi may open submission detail for completed financial-proposal signing. */
export async function userMayViewJustificationSubmission(
  req,
  submission,
  submissionId,
  roleHints = {},
) {
  if (!submission) return false;
  const JustifMode = String(submission?.justification_signing_mode ?? '').trim();
  if (normStatus(submission.status) !== 'completed' || !JustifMode) return false;
  if (!submissionMeetsJustificationThreshold(submission)) return false;

  const isKaur = roleHints.isKaur === true || (await _reqUserIsKaurLab(req));
  const isKaprodi = roleHints.isKaprodi === true || _reqUserHasKaprodi(req);

  if (isKaur) {
    if (await submissionInKaurJustificationQueue(submissionId)) return true;
    return true;
  }

  if (isKaprodi) {
    const spId =
      roleHints.kaprodiStudyProgramId ||
      req.query?.study_program_id ||
      req.query?.studyProgramId ||
      req.body?.study_program_id ||
      req.body?.studyProgramId ||
      submission.study_program_id ||
      submission.studyProgramId;
    if (await submissionInKaprodiJustificationQueue(submissionId, spId)) return true;
    if (await kaprodiMaySignJustification(submission, spId)) return true;
    if (await submissionBelongsToKaprodiStudyProgram(submission, spId)) return true;
  }

  return false;
}

export async function userMayDownloadJustification(
  req,
  submission,
  wantSigned,
  roleHints = {},
) {
  const isTpa = roleHints.isTpa === true || _reqUserHasTpa(req);
  const isKaur = roleHints.isKaur === true || (await _reqUserIsKaurLab(req));
  const isKaprodi = roleHints.isKaprodi === true || _reqUserHasKaprodi(req);
  if (!submission) return { allowed: false, reason: 'Submission not found' };
  const stKey = normStatus(submission.status);
  if (stKey !== 'completed' && stKey !== 'closed') {
    return { allowed: false, reason: 'Justification is only for completed submissions.' };
  }
  if (!submissionMeetsJustificationThreshold(submission)) {
    return {
      allowed: false,
      reason: 'Justification signing is only for totals of Rp 1,000,000 or more.',
    };
  }
  const mode = normStatus(submission.justification_signing_mode);
  if (!mode) {
    return { allowed: false, reason: 'Select a signing mode (wet or digital) first.' };
  }

  if (isTpa) return { allowed: true };

  if (wantSigned) {
    if (mode !== JUSTIF_MODE_DIGITAL) {
      return { allowed: false, reason: 'Signed PDF is only available in digital signing mode.' };
    }
    if (!justificationDigitallyFullySigned(submission)) {
      return {
        allowed: false,
        reason: 'Signed PDF can be downloaded after Kaur Lab and Kaprodi have signed.',
      };
    }
    if (isTpa || isKaur) {
      return { allowed: true };
    }
    if (isKaprodi) {
      const spId =
        roleHints.kaprodiStudyProgramId ||
        req.query?.study_program_id ||
        req.query?.studyProgramId ||
        submission.study_program_id ||
        submission.studyProgramId;
      if (await submissionBelongsToKaprodiStudyProgram(submission, spId)) {
        return { allowed: true };
      }
      return { allowed: false, reason: 'Forbidden' };
    }
    return { allowed: false, reason: 'Forbidden' };
  }

  const dig = normStatus(submission.justification_digital_status);

  if (isKaur) {
    if (await submissionInKaurJustificationQueue(submission.id)) {
      return { allowed: true };
    }
    if (justificationKaurSigned(submission) && hasJustificationSigningMode(submission)) {
      return { allowed: true };
    }
    if (mode === JUSTIF_MODE_WET) {
      return { allowed: true };
    }
    if (mode === JUSTIF_MODE_DIGITAL) {
      if (!submission.justification_forwarded_at) {
        return { allowed: false, reason: 'Justification has not been forwarded yet.' };
      }
      if (
        dig === JUSTIF_STATUS_PENDING_KAUR ||
        dig === JUSTIF_STATUS_PENDING_KAPRODI ||
        dig === JUSTIF_STATUS_SIGNED
      ) {
        return { allowed: true };
      }
      return { allowed: false, reason: 'Not in Kaur Lab Justification queue.' };
    }
    return { allowed: true };
  }

  if (isKaprodi) {
    const spId =
      roleHints.kaprodiStudyProgramId ||
      req.query?.study_program_id ||
      req.query?.studyProgramId ||
      req.body?.study_program_id ||
      req.body?.studyProgramId ||
      submission.study_program_id ||
      submission.studyProgramId;
    if (await submissionInKaprodiJustificationQueue(submission.id, spId)) {
      return { allowed: true };
    }
    if (await kaprodiMaySignJustification(submission, spId)) {
      return { allowed: true };
    }
    if (mode === JUSTIF_MODE_WET) {
      if (await submissionBelongsToKaprodiStudyProgram(submission, spId)) {
        return { allowed: true };
      }
      return { allowed: false, reason: 'Forbidden' };
    }
    if (mode === JUSTIF_MODE_DIGITAL) {
      if (dig === JUSTIF_STATUS_PENDING_KAPRODI) {
        if (await submissionBelongsToKaprodiStudyProgram(submission, spId)) {
          return { allowed: true };
        }
      }
      if (dig === JUSTIF_STATUS_SIGNED && justificationDigitallyFullySigned(submission)) {
        if (await submissionBelongsToKaprodiStudyProgram(submission, spId)) {
          return { allowed: true };
        }
      }
      return { allowed: false, reason: 'Not in Kaprodi Justification queue.' };
    }
    if (await submissionBelongsToKaprodiStudyProgram(submission, spId)) {
      return { allowed: true };
    }
    return { allowed: false, reason: 'Forbidden' };
  }

  return { allowed: false, reason: 'Forbidden' };
}

async function _reqUserIsKaurLab(req) {
  if (!req.user?.id) return false;
  const roles = req.user.roles || [];
  if (Array.isArray(roles)) {
    if (roles.some((r) => String(r).toLowerCase().includes('kaur'))) return true;
  }
  const role = String(req.user.role ?? '').toLowerCase();
  if (role === 'kaur_lab' || role === 'kaur') return true;
  try {
    const roleSvc = await import('../../user-management/services/roleService.js');
    if (await roleSvc.userHasRole(String(req.user.id), 'kaur_lab')) return true;
    if (await roleSvc.userHasRole(String(req.user.id), 'kaur')) return true;
  } catch {
    /* ignore */
  }
  return false;
}

function _reqUserHasKaprodi(req) {
  const roles = req.user?.roles || [];
  if (Array.isArray(roles) && roles.some((r) => String(r).toLowerCase() === 'kaprodi')) {
    return true;
  }
  return String(req.user?.role ?? '').toLowerCase() === 'kaprodi';
}

function _reqUserHasTpa(req) {
  const roles = req.user?.roles || [];
  if (Array.isArray(roles) && roles.some((r) => String(r).toLowerCase() === 'tpa')) {
    return true;
  }
  return String(req.user?.role ?? '').toLowerCase() === 'tpa';
}

export async function kaprodiMaySignJustification(submission, studyProgramIdRaw) {
  if (!submission) return false;
  if (normStatus(submission.status) !== 'completed') return false;
  if (normStatus(submission.justification_signing_mode) !== JUSTIF_MODE_DIGITAL) {
    return false;
  }
  if (normStatus(submission.justification_digital_status) !== JUSTIF_STATUS_PENDING_KAPRODI) {
    return false;
  }
  if (!justificationKaurSigned(submission)) return false;
  if (justificationKaprodiSigned(submission)) return false;

  const spRaw =
    studyProgramIdRaw ||
    submission.study_program_id ||
    submission.studyProgramId;
  if (!spRaw) return false;
  return submissionBelongsToKaprodiStudyProgram(submission, spRaw);
}

export async function listJustificationPendingKaprodi(studyProgramId, { limit = 200, offset = 0 } = {}) {
  const spId = await canonicalStudyProgramId(studyProgramId);
  if (!spId) return [];
  const labIds = await laboratoryIdsForStudyProgram(spId);
  const params = [spId];
  let labClause = '';
  if (labIds.length > 0) {
    params.push(labIds);
    labClause = ` AND ${sqlJustifKaprodiStudyProgramFilter(1, 2)}`;
  } else {
    labClause = ` AND ${sqlJustifKaprodiStudyProgramFilter(1, null)}`;
  }
  params.push(limit, offset);
  const { rows } = await procurementDb.query(
    `SELECT s.* FROM procurement_submission s
     WHERE ${SQL_JUSTIF_PENDING_KAPRODI}${labClause}
     ORDER BY s.justification_kaur_signed_at DESC NULLS LAST, s.updated_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return rows;
}

/** Map reimbursement justification signatures onto proposal PDF signer slots. */
export function mapSubmissionForJustificationReimbPdf(submission, renderOptions = {}) {
  if (!submission) return submission;
  const includeSignatures = renderOptions.includeSignatures === true;
  const previewRole = renderOptions.previewRole || null;
  const showKaur = includeSignatures || previewRole === 'kaprodi';
  const showKap = includeSignatures;
  return {
    ...submission,
    kaur_lab_signature: showKaur ? submission.justification_kaur_signature : null,
    kaur_lab_signed_at: showKaur ? submission.justification_kaur_signed_at : null,
    kaprodi_signature: showKap ? submission.justification_kaprodi_signature : null,
    kaprodi_signed_at: showKap ? submission.justification_kaprodi_signed_at : null,
  };
}

export function buildJustificationReimbSignerProfiles(submission, baseProfiles = {}) {
  const kaur = baseProfiles.kaur_lab || {};
  const kaprodi = baseProfiles.kaprodi || {};
  return {
    ...baseProfiles,
    kaur_lab: {
      name:
        submission?.justification_kaur_signer_name ||
        kaur.name ||
        submission?.kaur_lab_signer_name ||
        '',
      nipnim:
        submission?.justification_kaur_signer_nipnim ||
        kaur.nipnim ||
        submission?.kaur_lab_signer_nipnim ||
        '',
    },
    kaprodi: {
      name:
        submission?.justification_kaprodi_signer_name ||
        kaprodi.name ||
        submission?.kaprodi_signer_name ||
        '',
      nipnim:
        submission?.justification_kaprodi_signer_nipnim ||
        kaprodi.nipnim ||
        submission?.kaprodi_signer_nipnim ||
        '',
    },
  };
}
