import * as handoverLogSvc from '../services/handoverLogService.js';

function _userHasRole(user, role) {
  if (!user) return false;
  const want = String(role).toLowerCase();
  const roles = user.roles || user.role || [];
  if (typeof roles === 'string') return roles.toLowerCase().includes(want);
  if (Array.isArray(roles)) {
    return roles.some((r) => {
      const s = typeof r === 'string' ? r : r?.slug || r?.name || '';
      return String(s).toLowerCase().includes(want);
    });
  }
  return String(user.role || '').toLowerCase().includes(want);
}

function _canViewHandoverLogs(user) {
  return (
    _userHasRole(user, 'kaur_lab') ||
    _userHasRole(user, 'kaur') ||
    _userHasRole(user, 'tpa') ||
    _userHasRole(user, 'admin')
  );
}

/** GET /submission/handover-logs — completed item handovers for Kaur review. */
export async function listHandoverLogs(req, res, next) {
  try {
    if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
    if (!_canViewHandoverLogs(req.user)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const limit = Math.min(Number(req.query?.limit) || 100, 200);
    const offset = Number(req.query?.offset) || 0;
    const rows = await handoverLogSvc.listCompletedHandovers({ limit, offset });
    return res.status(200).json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
}

/** GET /submission/:id/handover-logs — event timeline for one submission. */
export async function getHandoverLogForSubmission(req, res, next) {
  try {
    if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
    if (!_canViewHandoverLogs(req.user)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const data = await handoverLogSvc.getHandoverLogForSubmission(req.params.id);
    if (!data) {
      return res.status(404).json({
        error: 'Handover log not found or handover is not completed for this submission.',
      });
    }
    return res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
