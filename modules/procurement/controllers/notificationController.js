import * as svc from '../services/notificationService.js';

export async function getNotifications(req, res, next) {
  try {
    if (!req.user || !req.user.id) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    const items = await svc.listNotificationsForUser(req.user.id, { limit, offset });
    return res.status(200).json({ success: true, data: items, meta: { page, limit, count: items.length } });
  } catch (err) {
    next(err);
  }
}

export async function markAsRead(req, res, next) {
  try {
    if (!req.user || !req.user.id) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const { id } = req.params;
    const notif = await svc.markNotificationRead(id, req.user.id);
    if (!notif) return res.status(404).json({ success: false, message: 'Not found' });
    return res.status(200).json({ success: true, data: notif });
  } catch (err) {
    next(err);
  }
}

export async function deleteNotif(req, res, next) {
  try {
    if (!req.user || !req.user.id) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const { id } = req.params;
    const deleted = await svc.deleteNotification(id, req.user.id);
    if (!deleted) return res.status(404).json({ success: false, message: 'Not found or not permitted' });
    return res.status(200).json({ success: true, data: deleted });
  } catch (err) {
    next(err);
  }
}

export default { getNotifications, markAsRead, deleteNotif };
