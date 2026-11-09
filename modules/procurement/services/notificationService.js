import { procurementDb } from '../../../config/databases.js';

/**
 * Persist an in-app notification and optionally call external internal endpoint (best-effort)
 * Non-blocking: callers shouldn't await the external notify result.
 */
export async function notifySubmissionStatusChange(submissionId, requesterId, oldStatus, newStatus, meta = {}, actorId = null) {
  const q = `
    INSERT INTO procurement_notifications (user_id, title, message, data, channel)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `;

  const title = 'Status Pengajuan Diubah';
  const message = `Pengajuan #${submissionId} berubah: ${oldStatus} → ${newStatus}`;
  const payload = {
    event: 'submission.status_changed',
    submissionId,
    oldStatus,
    newStatus,
    actorId,
    meta
  };

  const { rows } = await procurementDb.query(q, [requesterId, title, message, payload, 'in_app']);
  const notif = rows[0];

  // best-effort external notify (do not throw)
  (async () => {
    try {
      const USER_MGMT_URL = process.env.USER_MGMT_URL || 'http://user-management:3000';
      if (typeof fetch === 'function') {
        await fetch(`${USER_MGMT_URL}/internal/notifications/submission-status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: `notif_${notif.id}`, ...payload, requesterId, created_at: notif.created_at })
        });
      }
    } catch (e) {
      // swallow
      console.warn('notificationService: external notify failed', e?.message || e);
    }
  })();

  return notif;
}

export async function listNotificationsForUser(userId, { limit = 20, offset = 0 } = {}) {
  const q = `
    SELECT id, user_id, title, message, data, channel, is_read, created_at
    FROM procurement_notifications
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT $2 OFFSET $3
  `;
  const { rows } = await procurementDb.query(q, [userId, limit, offset]);
  return rows;
}

export async function markNotificationRead(notificationId, userId) {
  const q = `
    UPDATE procurement_notifications
    SET is_read = TRUE
    WHERE id = $1 AND user_id = $2
    RETURNING *
  `;
  const { rows } = await procurementDb.query(q, [notificationId, userId]);
  return rows[0] || null;
}

export async function deleteNotification(notificationId, userId) {
  const q = `
    DELETE FROM procurement_notifications
    WHERE id = $1 AND user_id = $2
    RETURNING *
  `;
  const { rows } = await procurementDb.query(q, [notificationId, userId]);
  return rows[0] || null;
}

export default {
  notifySubmissionStatusChange,
  listNotificationsForUser,
  markNotificationRead
  , deleteNotification
};
