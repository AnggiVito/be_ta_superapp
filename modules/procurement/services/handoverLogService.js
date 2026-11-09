import { procurementDb } from '../../../config/databases.js';

const EVENT_LABELS = {
  requester_receipt_signed: 'Recipient signed receipt',
  tpa_delivery_signed: 'Laboran verified delivery',
  handover_completed: 'Handover completed',
};

function hasSignature(val) {
  return val != null && String(val).trim() !== '';
}

/**
 * @param {import('pg').PoolClient} [client]
 */
export async function appendHandoverEvent(
  {
    submissionId,
    eventType,
    actorUserId = null,
    actorName = null,
    actorRole = null,
    actorNipnim = null,
    submissionStatus = null,
    notes = null,
  },
  client = null,
) {
  const db = client || procurementDb;
  const { rows } = await db.query(
    `INSERT INTO procurement_submission_handover_event_logs
      (submission_id, event_type, actor_user_id, actor_name, actor_role, actor_nipnim, submission_status, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      submissionId,
      eventType,
      actorUserId == null ? null : String(actorUserId),
      actorName,
      actorRole,
      actorNipnim,
      submissionStatus,
      notes,
    ],
  );
  return rows[0] || null;
}

function mapEventRow(row) {
  if (!row) return null;
  const type = String(row.event_type || '');
  return {
    ...row,
    event_label: EVENT_LABELS[type] || type.replace(/_/g, ' '),
  };
}

function deriveEventsFromSubmission(s) {
  if (!s) return [];
  const events = [];
  const requesterName =
    s.requester_handover_signer_name || s.requester_name || s.requester_id || 'Requester';

  if (hasSignature(s.requester_handover_signature)) {
    events.push({
      id: `derived-req-${s.id}`,
      submission_id: s.id,
      event_type: 'requester_receipt_signed',
      event_label: EVENT_LABELS.requester_receipt_signed,
      actor_name: requesterName,
      actor_role: 'requester',
      actor_nipnim: s.requester_handover_signer_nipnim || null,
      submission_status: 'ready_to_pickup',
      created_at: s.requester_handover_signed_at || s.updated_at,
      derived: true,
    });
  }

  if (hasSignature(s.tpa_handover_signature)) {
    events.push({
      id: `derived-tpa-${s.id}`,
      submission_id: s.id,
      event_type: 'tpa_delivery_signed',
      event_label: EVENT_LABELS.tpa_delivery_signed,
      actor_name: s.tpa_handover_signer_name || 'Laboran',
      actor_role: 'tpa',
      actor_nipnim: s.tpa_handover_signer_nipnim || null,
      submission_status: 'completed',
      created_at: s.tpa_handover_signed_at || s.updated_at,
      derived: true,
    });
  }

  if (
    hasSignature(s.requester_handover_signature) &&
    hasSignature(s.tpa_handover_signature)
  ) {
    const at = s.tpa_handover_signed_at || s.requester_handover_signed_at || s.updated_at;
    events.push({
      id: `derived-done-${s.id}`,
      submission_id: s.id,
      event_type: 'handover_completed',
      event_label: EVENT_LABELS.handover_completed,
      actor_name: null,
      actor_role: null,
      submission_status: 'completed',
      created_at: at,
      derived: true,
    });
  }

  return events;
}

/** Submissions where both parties signed handover (serah terima selesai). */
export async function listCompletedHandovers({ limit = 100, offset = 0 } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 100, 1), 200);
  const off = Math.max(Number(offset) || 0, 0);

  const q = `
    SELECT
      s.id AS submission_id,
      s.submission_reference,
      s.purpose,
      s.status AS submission_status,
      s.study_program_id,
      s.lab_id,
      s.requester_name,
      s.requester_handover_signer_name,
      s.requester_handover_signer_nipnim,
      s.tpa_handover_signer_name,
      s.tpa_handover_signer_nipnim,
      s.requester_handover_signed_at,
      s.tpa_handover_signed_at,
      GREATEST(
        COALESCE(s.tpa_handover_signed_at, s.requester_handover_signed_at),
        COALESCE(s.requester_handover_signed_at, s.tpa_handover_signed_at)
      ) AS handover_completed_at,
      (
        SELECT COUNT(*)::int
        FROM procurement_submission_handover_event_logs e
        WHERE e.submission_id = s.id
      ) AS event_count
    FROM procurement_submission s
    WHERE NULLIF(TRIM(COALESCE(s.requester_handover_signature, '')), '') IS NOT NULL
      AND NULLIF(TRIM(COALESCE(s.tpa_handover_signature, '')), '') IS NOT NULL
    ORDER BY handover_completed_at DESC NULLS LAST, s.id DESC
    LIMIT $1 OFFSET $2
  `;
  const { rows } = await procurementDb.query(q, [lim, off]);
  return rows;
}

export async function getHandoverLogForSubmission(submissionId) {
  const subRes = await procurementDb.query(
    `SELECT *
     FROM procurement_submission
     WHERE id = $1`,
    [submissionId],
  );
  const submission = subRes.rows[0] || null;
  if (!submission) return null;

  if (
    !hasSignature(submission.requester_handover_signature) ||
    !hasSignature(submission.tpa_handover_signature)
  ) {
    return null;
  }

  let events = [];
  try {
    const evRes = await procurementDb.query(
      `SELECT *
       FROM procurement_submission_handover_event_logs
       WHERE submission_id = $1
       ORDER BY created_at ASC, id ASC`,
      [submissionId],
    );
    events = evRes.rows.map(mapEventRow);
  } catch (_) {
    events = [];
  }

  if (events.length === 0) {
    events = deriveEventsFromSubmission(submission);
  }

  return {
    submission_id: submission.id,
    submission_reference: submission.submission_reference,
    purpose: submission.purpose,
    submission_status: submission.status,
    study_program_id: submission.study_program_id,
    lab_id: submission.lab_id,
    requester_name: submission.requester_name,
    requester_handover_signer_name: submission.requester_handover_signer_name,
    requester_handover_signer_nipnim: submission.requester_handover_signer_nipnim,
    tpa_handover_signer_name: submission.tpa_handover_signer_name,
    tpa_handover_signer_nipnim: submission.tpa_handover_signer_nipnim,
    requester_handover_signed_at: submission.requester_handover_signed_at,
    tpa_handover_signed_at: submission.tpa_handover_signed_at,
    handover_completed_at:
      submission.tpa_handover_signed_at ||
      submission.requester_handover_signed_at ||
      submission.updated_at,
    events,
  };
}
