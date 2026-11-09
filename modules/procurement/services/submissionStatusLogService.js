import { procurementDb } from '../../../config/databases.js';

const STATUS_LABELS = {
  draft: 'Saved as draft',
  waiting: 'Submitted — awaiting review',
  submitted: 'Submitted',
  on_review: 'Under review',
  approved_by_kordas: 'Approved — Koordinator Asisten',
  approved_by_koordinator_asisten: 'Approved — Koordinator Asisten',
  approved_by_dosen_pembina: 'Approved — Dosen Pembina',
  approved_by_tpa: 'Approved — Laboran (TPA)',
  approved_by_kaur: 'Approved — Kaur Lab',
  approved_by_kaprodi: 'Approved — Kaprodi',
  on_going: 'Procurement in progress',
  ready_to_pickup: 'Ready to pick up',
  completed: 'Completed',
  closed: 'Closed',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

let _tableReady = null;

async function statusLogTableExists() {
  if (_tableReady !== null) return _tableReady;
  const { rowCount } = await procurementDb.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'procurement_submission_status_logs'
     LIMIT 1`
  );
  _tableReady = rowCount > 0;
  return _tableReady;
}

export function statusDisplayLabel(status) {
  const key = String(status || '')
    .trim()
    .toLowerCase()
    .replace(/[\s\-–—]+/g, '_')
    .replace(/_+/g, '_');
  return STATUS_LABELS[key] || key.replace(/_/g, ' ');
}

/**
 * @param {import('pg').PoolClient} [client]
 */
export async function appendStatusLog(
  {
    submissionId,
    fromStatus = null,
    toStatus,
    actorUserId = null,
    actorName = null,
    actorRole = null,
    note = null,
  },
  client = null
) {
  if (!(await statusLogTableExists())) return null;
  const db = client || procurementDb;
  const q = `INSERT INTO procurement_submission_status_logs
    (submission_id, from_status, to_status, actor_user_id, actor_name, actor_role, note, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, now())
    RETURNING *`;
  const vals = [
    submissionId,
    fromStatus,
    toStatus,
    actorUserId,
    actorName,
    actorRole,
    note,
  ];
  const { rows } = await db.query(q, vals);
  return rows[0] || null;
}

export async function listStatusLogs(submissionId) {
  if (!(await statusLogTableExists())) return [];
  const { rows } = await procurementDb.query(
    `SELECT * FROM procurement_submission_status_logs
     WHERE submission_id = $1
     ORDER BY created_at ASC, id ASC`,
    [submissionId]
  );
  return rows;
}

function parseTs(v) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function pushDerived(events, seen, { at, toStatus, title, actorName, actorRole, note }) {
  const ts = parseTs(at);
  if (!ts) return;
  const statusKey = String(toStatus || '').toLowerCase();
  if (seen.has(`status|${statusKey}`)) return;
  const key = `${statusKey}|${ts.toISOString().slice(0, 16)}`;
  if (seen.has(key)) return;
  seen.add(key);
  seen.add(`status|${statusKey}`);
  events.push({
    at: ts.toISOString(),
    to_status: toStatus,
    from_status: null,
    title: title || statusDisplayLabel(toStatus),
    actor_name: actorName || null,
    actor_role: actorRole || null,
    note: note || null,
    source: 'derived',
  });
}

/**
 * Merge persisted logs with signature / timestamp fields on the submission row.
 */
export async function buildSubmissionTimeline(submission) {
  if (!submission) return [];

  const logs = await listStatusLogs(submission.id);
  const events = [];
  const seen = new Set();

  for (const row of logs) {
    const at = parseTs(row.created_at);
    if (!at) continue;
    const toStatus = String(row.to_status || '').toLowerCase();
    const key = `log|${row.id}`;
    seen.add(key);
    seen.add(`status|${toStatus}`);
    events.push({
      at: at.toISOString(),
      to_status: toStatus,
      from_status: row.from_status ? String(row.from_status).toLowerCase() : null,
      title: statusDisplayLabel(toStatus),
      actor_name: row.actor_name || null,
      actor_role: row.actor_role || null,
      note: row.note || null,
      source: 'log',
    });
  }

  const s = submission;
  const requesterName = s.requester_name || s.request_name || null;

  pushDerived(events, seen, {
    at: s.created_at,
    toStatus: 'waiting',
    title: 'Submitted — awaiting review',
    actorName: requesterName,
    actorRole: 'requester',
  });

  if (s.kordas_signature || s.kordas_signed_at) {
    pushDerived(events, seen, {
      at: s.kordas_signed_at || s.updated_at,
      toStatus: 'approved_by_kordas',
      actorName: s.kordas_signer_name,
      actorRole: 'koordinator_asisten',
    });
  }

  if (s.dosen_pembina_signature || s.dosen_pembina_signed_at) {
    pushDerived(events, seen, {
      at: s.dosen_pembina_signed_at || s.updated_at,
      toStatus: 'approved_by_dosen_pembina',
      actorName: s.dosen_pembina_signer_name,
      actorRole: 'dosen_pembina',
    });
  }

  if (s.kaur_lab_signature || s.kaur_lab_signed_at) {
    pushDerived(events, seen, {
      at: s.kaur_lab_signed_at || s.updated_at,
      toStatus: 'approved_by_kaur',
      actorName: s.kaur_lab_signer_name,
      actorRole: 'kaur_lab',
    });
  }

  if (s.kaprodi_signature || s.kaprodi_signed_at) {
    pushDerived(events, seen, {
      at: s.kaprodi_signed_at || s.updated_at,
      toStatus: 'approved_by_kaprodi',
      actorName: s.kaprodi_signer_name,
      actorRole: 'kaprodi',
    });
  }

  if (s.requester_handover_signature || s.requester_handover_signed_at) {
    pushDerived(events, seen, {
      at: s.requester_handover_signed_at || s.updated_at,
      toStatus: 'ready_to_pickup',
      title: 'Handover — receipt signed by requester',
      actorName: requesterName,
      actorRole: 'requester',
    });
  }

  if (s.tpa_handover_signature || s.tpa_handover_signed_at) {
    pushDerived(events, seen, {
      at: s.tpa_handover_signed_at || s.updated_at,
      toStatus: 'completed',
      title: 'Handover — verified by Laboran',
      actorRole: 'tpa',
    });
  }

  const curStatus = String(s.status || '').toLowerCase();
  const milestoneStatuses = [
    'approved_by_tpa',
    'on_going',
    'ready_to_pickup',
    'completed',
    'rejected',
    'cancelled',
  ];
  if (milestoneStatuses.includes(curStatus)) {
    const hasLogForStatus = events.some((e) => e.to_status === curStatus);
    if (!hasLogForStatus && curStatus !== 'waiting') {
      pushDerived(events, seen, {
        at: s.updated_at,
        toStatus: curStatus,
        title: statusDisplayLabel(curStatus),
      });
    }
  }

  events.sort((a, b) => new Date(a.at) - new Date(b.at));
  return events;
}

export function actorRoleForStatus(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'waiting' || s === 'cancelled') return 'requester';
  if (s.includes('kordas') || s.includes('koordinator')) return 'koordinator_asisten';
  if (s.includes('dosen') && s.includes('pembina')) return 'dosen_pembina';
  if (s.includes('tpa') || s === 'on_going' || s === 'ready_to_pickup' || s === 'closed') return 'tpa';
  if (s.includes('kaur')) return 'kaur_lab';
  if (s.includes('kaprodi')) return 'kaprodi';
  return null;
}
