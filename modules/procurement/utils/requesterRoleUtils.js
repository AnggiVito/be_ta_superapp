export const SUBMISSION_REQUESTER_ALLOWED = [
  'asisten',
  'asisten_praktikum',
  'dosen',
  'dosen_pembina',
  'koordinator_asisten',
  'laboran',
  'kaur',
  'tpa',
];

export const TPA_LABORAN_DIRECT_SUBMISSION_ROLES = ['tpa', 'laboran'];

export function normalizeSubmissionRequesterRole(raw) {
  if (!raw) return null;
  const r = String(raw).toLowerCase();
  if (r.includes('asisten_praktikum') || r.includes('asisten praktikum') || r.includes('asisten-praktikum')) {
    return 'asisten_praktikum';
  }
  if (r.includes('asisten')) return 'asisten';
  if (r.includes('dosen_pembina') || r.includes('dosen pembina') || r.includes('dosen-pembina')) {
    return 'dosen_pembina';
  }
  if (r.includes('koordinator_asisten') || r.includes('koordinator asisten') || r.includes('koordinator-asisten')) {
    return 'koordinator_asisten';
  }
  if (r.includes('dosen')) return 'dosen';
  if (r.includes('laboran')) return 'laboran';
  if (r.includes('tpa')) return 'tpa';
  if (r.includes('kaur')) return 'kaur';
  return null;
}

export function isTpaLaboranDirectSubmissionRequester(requesterRole) {
  const role = String(requesterRole || '').toLowerCase();
  return TPA_LABORAN_DIRECT_SUBMISSION_ROLES.includes(role);
}

export function resolveInitialSubmissionStatus(action, requesterRole) {
  const act = String(action || 'submit').toLowerCase();
  if (act === 'draft') return 'draft';
  // TPA / laboran: skip KO, pembina, Kaur, and TPA review — already Kaprodi-approved on submit.
  if (isTpaLaboranDirectSubmissionRequester(requesterRole)) return 'approved_by_kaprodi';
  return 'waiting';
}

/** Statuses that write an initial status log when a submission is first created/submitted. */
export function shouldAppendInitialSubmissionStatusLog(status) {
  const s = String(status || '').toLowerCase();
  return s === 'waiting' || s === 'approved_by_tpa' || s === 'approved_by_kaprodi';
}

export function collectUserRoleCandidates(reqUser, fetchedRole, rolesData, activeRoles = []) {
  const out = [];
  const push = (v) => {
    if (v == null) return;
    const s = String(v).trim();
    if (!s) return;
    if (!out.some((x) => String(x).toLowerCase() === s.toLowerCase())) out.push(s);
  };

  push(fetchedRole);

  if (Array.isArray(rolesData)) {
    for (const rr of rolesData) {
      push(typeof rr === 'string' ? rr : (rr.role || rr.name || rr.code || null));
    }
  } else if (typeof rolesData === 'string') {
    push(rolesData);
  }

  if (reqUser?.roles && Array.isArray(reqUser.roles)) {
    for (const r of reqUser.roles) {
      push(typeof r === 'string' ? r : (r.role || r.name || null));
    }
  } else if (reqUser?.role) {
    push(typeof reqUser.role === 'string' ? reqUser.role : (reqUser.role.name || null));
  }

  if (Array.isArray(activeRoles)) {
    for (const ar of activeRoles) {
      push((ar && (ar.role || ar.name)) ? (ar.role || ar.name) : ar);
    }
  }

  return out;
}

/** Prefer tpa/laboran when user holds those roles (direct Kaprodi-approved submission path). */
export function preferTpaLaboranRequesterRole(normalized, roleCandidates = []) {
  if (isTpaLaboranDirectSubmissionRequester(normalized)) return normalized;
  for (const raw of roleCandidates) {
    const n = normalizeSubmissionRequesterRole(raw);
    if (isTpaLaboranDirectSubmissionRequester(n)) return n;
  }
  return normalized;
}

export function pickSubmissionRequesterRole(roleCandidates = []) {
  const allowed = [];
  for (const raw of roleCandidates) {
    const n = normalizeSubmissionRequesterRole(raw);
    if (n && SUBMISSION_REQUESTER_ALLOWED.includes(n) && !allowed.includes(n)) {
      allowed.push(n);
    }
  }
  for (const pref of TPA_LABORAN_DIRECT_SUBMISSION_ROLES) {
    if (allowed.includes(pref)) return pref;
  }
  return allowed[0] || null;
}
