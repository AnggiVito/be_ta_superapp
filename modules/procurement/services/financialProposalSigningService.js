import { procurementDb, registrationDb } from '../../../config/databases.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Resolve JWT/name tokens to canonical study_programs.id when possible. */
export async function canonicalStudyProgramId(raw) {
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

export const FIN_PROP_MODE_WET = 'wet';
export const FIN_PROP_MODE_DIGITAL = 'digital';
export const FIN_PROP_STATUS_PENDING_KAUR = 'pending_kaur';
export const FIN_PROP_STATUS_PENDING_KAPRODI = 'pending_kaprodi';
export const FIN_PROP_STATUS_SIGNED = 'signed';

function normStatus(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s\-–—]+/g, '_');
}

export function financialProposalKaurSigned(submission) {
  return String(submission?.financial_proposal_kaur_signature ?? '').trim() !== '';
}

export function financialProposalKaprodiSigned(submission) {
  return String(submission?.financial_proposal_kaprodi_signature ?? '').trim() !== '';
}

export function financialProposalDigitallyFullySigned(submission) {
  return (
    normStatus(submission?.financial_proposal_digital_status) === FIN_PROP_STATUS_SIGNED ||
    (financialProposalKaurSigned(submission) && financialProposalKaprodiSigned(submission))
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

async function assertSigningColumns(client) {
  const ok = await columnExists(client, 'financial_proposal_signing_mode');
  if (!ok) {
    const err = new Error(
      'Financial proposal signing columns missing. Run procurement migrations.',
    );
    err.code = 'NO_FIN_PROP_SIGNING_COLUMN';
    throw err;
  }
}

export async function setFinancialProposalSigningMode(submissionId, mode) {
  if (mode !== FIN_PROP_MODE_WET && mode !== FIN_PROP_MODE_DIGITAL) {
    const err = new Error('signing_mode must be wet or digital');
    err.code = 'INVALID_MODE';
    throw err;
  }
  const client = await procurementDb.connect();
  try {
    await client.query('BEGIN');
    await assertSigningColumns(client);
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
      const err = new Error('Financial proposal is only for completed submissions.');
      err.code = 'INVALID_STATUS';
      throw err;
    }
    const forwarded = row.financial_proposal_forwarded_at != null;
    const dig = normStatus(row.financial_proposal_digital_status);
    if (forwarded && dig && dig !== FIN_PROP_STATUS_SIGNED) {
      const err = new Error(
        'Signing mode cannot be changed after forwarding to Kaur Lab/Kaprodi.',
      );
      err.code = 'ALREADY_FORWARDED';
      throw err;
    }
    const digitalStatus =
      mode === FIN_PROP_MODE_DIGITAL ? null : null;
    const { rows } = await client.query(
      `UPDATE procurement_submission
       SET financial_proposal_signing_mode = $1,
           financial_proposal_digital_status = $2,
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

export async function forwardFinancialProposalDigital(submissionId) {
  const client = await procurementDb.connect();
  try {
    await client.query('BEGIN');
    await assertSigningColumns(client);
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
    if (normStatus(row.financial_proposal_signing_mode) !== FIN_PROP_MODE_DIGITAL) {
      const err = new Error('Set digital signing mode first.');
      err.code = 'NOT_DIGITAL_MODE';
      throw err;
    }
    const dig = normStatus(row.financial_proposal_digital_status);
    if (dig === FIN_PROP_STATUS_SIGNED) {
      const err = new Error('Financial proposal is already signed by Kaur Lab and Kaprodi.');
      err.code = 'ALREADY_SIGNED';
      throw err;
    }
    const { rows } = await client.query(
      `UPDATE procurement_submission
       SET financial_proposal_digital_status = $1,
           financial_proposal_forwarded_at = COALESCE(financial_proposal_forwarded_at, now()),
           updated_at = now()
       WHERE id = $2
       RETURNING *`,
      [FIN_PROP_STATUS_PENDING_KAUR, submissionId],
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

async function updateFinPropSignature(submissionId, role, actorUserId, signatureDataUri, signerFromJwt) {
  const isKaur = role === 'kaur';
  const prefix = isKaur ? 'financial_proposal_kaur' : 'financial_proposal_kaprodi';
  const client = await procurementDb.connect();
  try {
    await client.query('BEGIN');
    await assertSigningColumns(client);
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
    if (normStatus(row.financial_proposal_signing_mode) !== FIN_PROP_MODE_DIGITAL) {
      const err = new Error('Not a digital financial proposal signing workflow.');
      err.code = 'NOT_DIGITAL_MODE';
      throw err;
    }
    const dig = normStatus(row.financial_proposal_digital_status);
    if (isKaur) {
      if (dig !== FIN_PROP_STATUS_PENDING_KAUR) {
        const err = new Error('Waiting for Kaur Lab signature on financial proposal.');
        err.code = 'WRONG_QUEUE';
        throw err;
      }
    } else if (dig !== FIN_PROP_STATUS_PENDING_KAPRODI) {
      const err = new Error('Waiting for Kaprodi signature on financial proposal.');
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
    const nextStatus = isKaur ? FIN_PROP_STATUS_PENDING_KAPRODI : FIN_PROP_STATUS_SIGNED;
    sets.push(`financial_proposal_digital_status = $${vals.length + 1}`);
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

export async function setFinancialProposalKaurSignature(
  submissionId,
  actorUserId,
  signatureDataUri,
  signerFromJwt = null,
) {
  return updateFinPropSignature(
    submissionId,
    'kaur',
    actorUserId,
    signatureDataUri,
    signerFromJwt,
  );
}

export async function setFinancialProposalKaprodiSignature(
  submissionId,
  actorUserId,
  signatureDataUri,
  signerFromJwt = null,
) {
  return updateFinPropSignature(
    submissionId,
    'kaprodi',
    actorUserId,
    signatureDataUri,
    signerFromJwt,
  );
}

const SQL_FIN_PROP_PENDING_KAUR = `
  lower(COALESCE(s.status, '')) = 'completed'
  AND lower(COALESCE(s.financial_proposal_signing_mode, '')) = 'digital'
  AND lower(COALESCE(s.financial_proposal_digital_status, '')) = 'pending_kaur'
  AND (s.financial_proposal_kaur_signature IS NULL OR trim(COALESCE(s.financial_proposal_kaur_signature, '')) = '')
`;

const SQL_FIN_PROP_PENDING_KAPRODI = `
  lower(COALESCE(s.status, '')) = 'completed'
  AND lower(COALESCE(s.financial_proposal_signing_mode, '')) = 'digital'
  AND lower(COALESCE(s.financial_proposal_digital_status, '')) = 'pending_kaprodi'
  AND trim(COALESCE(s.financial_proposal_kaur_signature, '')) <> ''
  AND (s.financial_proposal_kaprodi_signature IS NULL OR trim(COALESCE(s.financial_proposal_kaprodi_signature, '')) = '')
`;

export async function getFinancialProposalPendingKaurStats() {
  const { rows } = await procurementDb.query(
    `SELECT COUNT(*)::int AS waiting FROM procurement_submission s WHERE ${SQL_FIN_PROP_PENDING_KAUR}`,
  );
  return rows[0] || { waiting: 0 };
}

function sqlFinPropKaprodiStudyProgramFilter(paramIndex, labIdsParamIndex) {
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

export async function getFinancialProposalPendingKaprodiStats(studyProgramId) {
  const spId = await canonicalStudyProgramId(studyProgramId);
  if (!spId) return { waiting: 0 };
  const labIds = await laboratoryIdsForStudyProgram(spId);
  const params = [spId];
  let labClause = '';
  if (labIds.length > 0) {
    params.push(labIds);
    labClause = ` AND ${sqlFinPropKaprodiStudyProgramFilter(1, 2)}`;
  } else {
    labClause = ` AND ${sqlFinPropKaprodiStudyProgramFilter(1, null)}`;
  }
  const { rows } = await procurementDb.query(
    `SELECT COUNT(*)::int AS waiting FROM procurement_submission s
     WHERE ${SQL_FIN_PROP_PENDING_KAPRODI}${labClause}`,
    params,
  );
  return rows[0] || { waiting: 0 };
}

export async function listFinancialProposalPendingKaur({ limit = 200, offset = 0 } = {}) {
  const { rows } = await procurementDb.query(
    `SELECT s.* FROM procurement_submission s
     WHERE ${SQL_FIN_PROP_PENDING_KAUR}
     ORDER BY s.financial_proposal_forwarded_at DESC NULLS LAST, s.updated_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  return rows;
}

function hasFinancialProposalSigningMode(submission) {
  return String(submission?.financial_proposal_signing_mode ?? '').trim() !== '';
}

export async function submissionInKaurFinancialProposalQueue(submissionId) {
  const { rows } = await procurementDb.query(
    `SELECT 1 FROM procurement_submission s
     WHERE s.id = $1 AND ${SQL_FIN_PROP_PENDING_KAUR} LIMIT 1`,
    [submissionId],
  );
  return rows.length > 0;
}

export async function submissionInKaprodiFinancialProposalQueue(
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
    labClause = ` AND ${sqlFinPropKaprodiStudyProgramFilter(2, 3)}`;
  } else {
    labClause = ` AND ${sqlFinPropKaprodiStudyProgramFilter(2, null)}`;
  }
  const { rows } = await procurementDb.query(
    `SELECT 1 FROM procurement_submission s
     WHERE s.id = $1 AND ${SQL_FIN_PROP_PENDING_KAPRODI}${labClause} LIMIT 1`,
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
export function resolveFinancialProposalPdfRenderOptions(submission, wantSigned) {
  if (wantSigned) {
    return { includeSignatures: true, previewRole: null };
  }
  const dig = normStatus(submission?.financial_proposal_digital_status);
  if (
    dig === FIN_PROP_STATUS_PENDING_KAPRODI &&
    financialProposalKaurSigned(submission)
  ) {
    return { includeSignatures: false, previewRole: 'kaprodi' };
  }
  return { includeSignatures: false, previewRole: 'kaur' };
}

/** Kaur/Kaprodi may open submission detail for completed financial-proposal signing. */
export async function userMayViewFinancialProposalSubmission(
  req,
  submission,
  submissionId,
  roleHints = {},
) {
  if (!submission) return false;
  const finPropMode = String(submission?.financial_proposal_signing_mode ?? '').trim();
  if (normStatus(submission.status) !== 'completed' || !finPropMode) return false;

  const isKaur = roleHints.isKaur === true || (await _reqUserIsKaurLab(req));
  const isKaprodi = roleHints.isKaprodi === true || _reqUserHasKaprodi(req);

  if (isKaur) {
    if (await submissionInKaurFinancialProposalQueue(submissionId)) return true;
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
    if (await submissionInKaprodiFinancialProposalQueue(submissionId, spId)) return true;
    if (await kaprodiMaySignFinancialProposal(submission, spId)) return true;
    if (await submissionBelongsToKaprodiStudyProgram(submission, spId)) return true;
  }

  return false;
}

export async function userMayDownloadFinancialProposal(
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
    return { allowed: false, reason: 'Financial proposal is only for completed submissions.' };
  }
  const mode = normStatus(submission.financial_proposal_signing_mode);
  if (!mode) {
    return { allowed: false, reason: 'Select a signing mode (wet or digital) first.' };
  }

  if (isTpa) return { allowed: true };

  if (wantSigned) {
    if (mode !== FIN_PROP_MODE_DIGITAL) {
      return { allowed: false, reason: 'Signed PDF is only available in digital signing mode.' };
    }
    if (!financialProposalDigitallyFullySigned(submission)) {
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

  const dig = normStatus(submission.financial_proposal_digital_status);

  if (isKaur) {
    if (await submissionInKaurFinancialProposalQueue(submission.id)) {
      return { allowed: true };
    }
    if (financialProposalKaurSigned(submission) && hasFinancialProposalSigningMode(submission)) {
      return { allowed: true };
    }
    if (mode === FIN_PROP_MODE_WET) {
      return { allowed: true };
    }
    if (mode === FIN_PROP_MODE_DIGITAL) {
      if (!submission.financial_proposal_forwarded_at) {
        return { allowed: false, reason: 'Financial proposal has not been forwarded yet.' };
      }
      if (
        dig === FIN_PROP_STATUS_PENDING_KAUR ||
        dig === FIN_PROP_STATUS_PENDING_KAPRODI ||
        dig === FIN_PROP_STATUS_SIGNED
      ) {
        return { allowed: true };
      }
      return { allowed: false, reason: 'Not in Kaur Lab financial proposal queue.' };
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
    if (await submissionInKaprodiFinancialProposalQueue(submission.id, spId)) {
      return { allowed: true };
    }
    if (await kaprodiMaySignFinancialProposal(submission, spId)) {
      return { allowed: true };
    }
    if (mode === FIN_PROP_MODE_WET) {
      if (await submissionBelongsToKaprodiStudyProgram(submission, spId)) {
        return { allowed: true };
      }
      return { allowed: false, reason: 'Forbidden' };
    }
    if (mode === FIN_PROP_MODE_DIGITAL) {
      if (dig === FIN_PROP_STATUS_PENDING_KAPRODI) {
        if (await submissionBelongsToKaprodiStudyProgram(submission, spId)) {
          return { allowed: true };
        }
      }
      if (dig === FIN_PROP_STATUS_SIGNED && financialProposalDigitallyFullySigned(submission)) {
        if (await submissionBelongsToKaprodiStudyProgram(submission, spId)) {
          return { allowed: true };
        }
      }
      return { allowed: false, reason: 'Not in Kaprodi financial proposal queue.' };
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

export async function kaprodiMaySignFinancialProposal(submission, studyProgramIdRaw) {
  if (!submission) return false;
  if (normStatus(submission.status) !== 'completed') return false;
  if (normStatus(submission.financial_proposal_signing_mode) !== FIN_PROP_MODE_DIGITAL) {
    return false;
  }
  if (normStatus(submission.financial_proposal_digital_status) !== FIN_PROP_STATUS_PENDING_KAPRODI) {
    return false;
  }
  if (!financialProposalKaurSigned(submission)) return false;
  if (financialProposalKaprodiSigned(submission)) return false;

  const spRaw =
    studyProgramIdRaw ||
    submission.study_program_id ||
    submission.studyProgramId;
  if (!spRaw) return false;
  return submissionBelongsToKaprodiStudyProgram(submission, spRaw);
}

export async function listFinancialProposalPendingKaprodi(studyProgramId, { limit = 200, offset = 0 } = {}) {
  const spId = await canonicalStudyProgramId(studyProgramId);
  if (!spId) return [];
  const labIds = await laboratoryIdsForStudyProgram(spId);
  const params = [spId];
  let labClause = '';
  if (labIds.length > 0) {
    params.push(labIds);
    labClause = ` AND ${sqlFinPropKaprodiStudyProgramFilter(1, 2)}`;
  } else {
    labClause = ` AND ${sqlFinPropKaprodiStudyProgramFilter(1, null)}`;
  }
  params.push(limit, offset);
  const { rows } = await procurementDb.query(
    `SELECT s.* FROM procurement_submission s
     WHERE ${SQL_FIN_PROP_PENDING_KAPRODI}${labClause}
     ORDER BY s.financial_proposal_kaur_signed_at DESC NULLS LAST, s.updated_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return rows;
}
