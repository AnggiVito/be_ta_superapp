import { procurementDb } from '../../../config/databases.js';

/**
 * Lab slug for reference codes: letters, numbers, underscore; spaces → underscore.
 */
export function slugifyLaboratoryName(name) {
  const raw = String(name || 'lab')
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');
  const slug = raw
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return slug || 'lab';
}

/**
 * BHP_{lab}_{d/m/Y}_{increment} — increment resets per calendar year per laboratory.
 */
export function formatSubmissionReference({ labName, at = new Date(), sequence }) {
  const slug = slugifyLaboratoryName(labName);
  const d = at.getDate();
  const m = at.getMonth() + 1;
  const y = at.getFullYear();
  const seq = Math.max(1, Number(sequence) || 1);
  return `BHP_${slug}_${d}/${m}/${y}_${seq}`;
}

/**
 * Allocate next sequence under row lock (call inside transaction when possible).
 * @param {import('pg').PoolClient} [client]
 */
export async function allocateSubmissionReference({ labId, labName, at = new Date() }, client = null) {
  if (!labId) {
    const err = new Error('Laboratory is required to generate submission reference');
    err.code = 'LAB_REQUIRED';
    throw err;
  }

  const db = client || procurementDb;
  const year = at.getFullYear();

  const countQ = `
    SELECT COUNT(*)::int AS c
    FROM procurement_submission
    WHERE lab_id = $1
      AND EXTRACT(YEAR FROM created_at) = $2
      AND lower(trim(COALESCE(status, ''))) NOT IN ('draft', 'drafted', 'cancelled')
  `;
  const { rows } = await db.query(countQ, [labId, year]);
  const nextSeq = (Number(rows[0]?.c) || 0) + 1;
  return formatSubmissionReference({ labName, at, sequence: nextSeq });
}

/**
 * Transactional create helper: locks lab submissions for the year then allocates reference.
 */
/**
 * Safe segment for PDF download filenames (slashes → hyphen for OS compatibility).
 */
export function sanitizePdfFilenameSegment(part) {
  return String(part ?? '')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\//g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parse BHP_{lab}_{d/m/Y}_{seq} reference.
 * @returns {{ labSlug: string, datePart: string|null, sequence: number|null }|null}
 */
export function parseSubmissionReference(ref) {
  const s = String(ref || '').trim();
  if (!s) return null;

  const full = /^BHP_(.+)_(\d{1,2}\/\d{1,2}\/\d{4})_(\d+)$/i.exec(s);
  if (full) {
    return {
      labSlug: full[1],
      datePart: full[2],
      sequence: Math.max(1, parseInt(full[3], 10) || 1),
    };
  }

  const labOnly = /^BHP_([A-Za-z0-9_]+)$/i.exec(s);
  if (labOnly) {
    return {
      labSlug: labOnly[1],
      datePart: null,
      sequence: null,
    };
  }

  return null;
}

/**
 * PDF / surat label: "BHP DASPRO 3" (spasi + increment, tanpa tanggal).
 */
export function resolveSubmissionDisplayLabel(submission, enrich = {}) {
  const ref = resolveSubmissionReferenceBase(submission, enrich);
  const parsed = parseSubmissionReference(ref);
  if (parsed?.labSlug) {
    const labDisplay = parsed.labSlug.replace(/_/g, ' ').trim().toUpperCase();
    const seq =
      parsed.sequence ??
      Math.max(1, Number(submission?.id) || 1);
    return `BHP ${labDisplay} ${seq}`;
  }

  const labName =
    enrich.labName ||
    submission?._laboratory_name ||
    submission?.lab ||
    'lab';
  const labDisplay = slugifyLaboratoryName(labName).replace(/_/g, ' ').trim().toUpperCase();
  const seq = Math.max(1, Number(submission?.id) || 1);
  return `BHP ${labDisplay} ${seq}`;
}

/**
 * BHP_{lab}_{d/m/Y}_{seq} from DB or rebuilt for legacy rows.
 */
export function resolveSubmissionReferenceBase(submission, enrich = {}) {
  const ref = (submission?.submission_reference ?? '').toString().trim();
  if (ref) return ref;
  const labName =
    enrich.labName ||
    submission?._laboratory_name ||
    submission?.lab ||
    'lab';
  const at = enrich.createdAt
    ? new Date(enrich.createdAt)
    : submission?.created_at
      ? new Date(submission.created_at)
      : new Date();
  const seq = submission?.id ?? 1;
  return formatSubmissionReference({ labName, at, sequence: seq });
}

/** Proposal_BHP_{lab}_{d-m-Y}_{increment}.pdf */
export function buildProposalPdfFilename(submission, enrich = {}) {
  const base = sanitizePdfFilenameSegment(resolveSubmissionReferenceBase(submission, enrich));
  return `Proposal_${base}.pdf`;
}

/** ProposalKeuangan_BHP_{lab}_{d-m-Y}_{increment}.pdf */
export function buildFinancialProposalPdfFilename(submission, enrich = {}) {
  const base = sanitizePdfFilenameSegment(resolveSubmissionReferenceBase(submission, enrich));
  return `ProposalKeuangan_${base}.pdf`;
}

/** Justifikasi_BHP_{lab}_{d-m-Y}_{increment}.pdf */
export function buildJustificationPdfFilename(submission, enrich = {}) {
  const base = sanitizePdfFilenameSegment(resolveSubmissionReferenceBase(submission, enrich));
  return `Justifikasi_${base}.pdf`;
}

/** Bukti Penerimaaan_BHP_{lab}_{d-m-Y}_{increment}.pdf */
export function buildHandoverBeritaAcaraPdfFilename(submission, enrich = {}) {
  const base = sanitizePdfFilenameSegment(resolveSubmissionReferenceBase(submission, enrich));
  return `Bukti Penerimaaan_${base}.pdf`;
}

export async function allocateSubmissionReferenceTransactional({ labId, labName, at = new Date() }) {
  const client = await procurementDb.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `SELECT id FROM procurement_submission
       WHERE lab_id = $1 AND EXTRACT(YEAR FROM created_at) = $2
       FOR UPDATE`,
      [labId, at.getFullYear()],
    );
    const ref = await allocateSubmissionReference({ labId, labName, at }, client);
    await client.query('COMMIT');
    return ref;
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {}
    throw e;
  } finally {
    client.release();
  }
}
