import { logger } from '../../../core/utils/logger.js';
import * as activityLogService from '../../activity-log/services/activityLogService.js';
import * as operationalService from '../services/practicumOperationalSessionService.js';
import { enrichOperationalSessionDetailContext } from '../services/practicumOperationalSessionAttendanceContextService.js';
import { generateBapForCompletedSession } from '../services/practicumBapService.js';

function badRequest(res, message) {
  return res.status(400).json({ success: false, message });
}

export async function createOperationalSession(req, res, next) {
  try {
    const creatorUserId = req.user?.id;
    const session = await operationalService.createOperationalSession({
      creatorUserId,
      payload: req.body || {},
    });
    return res.status(201).json({
      success: true,
      message: 'Operational session created successfully',
      data: session,
    });
  } catch (error) {
    logger.error('Error in createOperationalSession controller:', error);
    const msg = String(error?.message || error);
    if (
      msg.includes('required') ||
      msg.includes('uuid') ||
      msg.includes('already exists') ||
      msg.includes('Registration schedule') ||
      msg.includes('not authenticated')
    ) {
      return badRequest(res, msg);
    }
    next(error);
  }
}

export async function listOperationalSessions(req, res, next) {
  try {
    const mineRaw = req.query?.mine;
    const mine = mineRaw === true || mineRaw === 'true' || mineRaw === '1';
    const registrationScheduleId = req.query?.registration_schedule_id;

    const rows = await operationalService.listOperationalSessions({
      assistantUserId: mine ? req.user?.id : undefined,
      registrationScheduleId: registrationScheduleId
        ? String(registrationScheduleId).trim()
        : undefined,
    });
    return res.status(200).json({ success: true, data: rows });
  } catch (error) {
    logger.error('Error in listOperationalSessions controller:', error);
    next(error);
  }
}

export async function getOperationalSessionDetail(req, res, next) {
  try {
    const { id } = req.params;
    const row = await operationalService.getOperationalSessionById(id);
    const activeAssistants = await operationalService.listSessionActiveAssistants(id);
    const reassessedAssistants =
      await operationalService.reassessAndPersistActiveAssistantAttendanceStatuses(row, activeAssistants);
    const qrAuditLogs = await operationalService.listOperationalSessionQrAuditLogs(id);
    const context = await enrichOperationalSessionDetailContext(row, reassessedAssistants);
    return res.status(200).json({
      success: true,
      data: {
        ...row,
        ...context,
        qr_audit_logs: qrAuditLogs,
      },
    });
  } catch (error) {
    logger.error('Error in getOperationalSessionDetail controller:', error);
    const msg = String(error?.message || error);
    if (msg.includes('not found')) {
      return res.status(404).json({ success: false, message: msg });
    }
    next(error);
  }
}

export async function joinOperationalSessionViaQr(req, res, next) {
  try {
    const requesterUserId = req.user?.id;
    const { id } = req.params;
    const qrToken = req.body?.qr_token || req.body?.qrToken;
    const row = await operationalService.joinOperationalSessionViaQr({
      id,
      requesterUserId,
      qrToken,
    });
    activityLogService.createActivityLog({
      user_id: req.user?.id || null,
      action: 'SCAN_OPERATIONAL_SESSION_ACTIVATION_QR',
      method: req.method,
      endpoint: req.path,
      ip_address: req.ip || req.connection?.remoteAddress,
      user_agent: req.get('user-agent'),
      request_body: { qr_token: qrToken },
      response_status: 200,
      response_body: null,
      affected_table: 'practicum_operational_session_active_assistants',
      affected_record_id: row.id,
      metadata: {
        operational_session_id: row.id,
        registration_schedule_id: row.registration_schedule_id,
        assistant_user_id: requesterUserId,
        activation_method: 'qr_scan',
      },
    });
    return res.status(200).json({
      success: true,
      message: 'Joined as an active session assistant',
      data: row,
    });
  } catch (error) {
    logger.error('Error in joinOperationalSessionViaQr controller:', error);
    const msg = String(error?.message || error);
    if (
      msg.includes('not authenticated') ||
      msg.includes('Only assistants') ||
      msg.includes('not found') ||
      msg.includes('status') ||
      msg.includes('qr_token') ||
      msg.includes('Activation QR token')
    ) {
      return badRequest(res, msg);
    }
    next(error);
  }
}

async function logLifecycleStatusChange(req, row, oldStatus, newStatus, reason, notes) {
  activityLogService.createActivityLog({
    user_id: req.user?.id || null,
    action: 'UPDATE_PRACTICUM_OPERATIONAL_SESSION_STATUS',
    method: req.method,
    endpoint: req.path,
    ip_address: req.ip || req.connection?.remoteAddress,
    user_agent: req.get('user-agent'),
    request_body: { status: newStatus, reason: reason || null, notes: notes || null },
    response_status: 200,
    response_body: null,
    affected_table: 'practicum_operational_sessions',
    affected_record_id: row.id,
    metadata: {
      session_id: row.id,
      registration_schedule_id: row.registration_schedule_id,
      old_status: oldStatus,
      new_status: row.session_status,
      changed_by: row.status_changed_by,
      changed_at: row.status_changed_at,
      reason: row.cancellation_reason || reason || null,
      notes: row.cancellation_notes || notes || null,
      cancelled_by: row.cancelled_by || null,
    },
  });
}

export async function updateOperationalSessionStatus(req, res, next) {
  try {
    const requesterUserId = req.user?.id;
    const { id } = req.params;
    const current = await operationalService.getOperationalSessionById(id);
    const row = await operationalService.updateOperationalSessionStatus({
      id,
      requesterUserId,
      targetStatus: req.body?.status,
    });
    logLifecycleStatusChange(
      req,
      row,
      current.session_status,
      req.body?.status,
      null,
      null
    );
    return res.status(200).json({
      success: true,
      message: 'Session status updated successfully',
      data: row,
    });
  } catch (error) {
    logger.error('Error in updateOperationalSessionStatus controller:', error);
    const msg = String(error?.message || error);
    if (
      msg.includes('transition') ||
      msg.includes('status must') ||
      msg.includes('cancel_reason') ||
      msg.includes('cancellation_reason') ||
      msg.includes('not authenticated') ||
      msg.includes('not found')
    ) {
      return badRequest(res, msg);
    }
    next(error);
  }
}

export async function startOperationalSession(req, res, next) {
  try {
    const requesterUserId = req.user?.id;
    const { id } = req.params;
    const row = await operationalService.startOperationalSession({ id, requesterUserId });
    return res.status(200).json({ success: true, message: 'Session started', data: row });
  } catch (error) {
    logger.error('Error in startOperationalSession controller:', error);
    const msg = String(error?.message || error);
    if (msg.includes('not owned') || msg.includes('status') || msg.includes('not authenticated')) {
      return badRequest(res, msg);
    }
    next(error);
  }
}

export async function completeOperationalSession(req, res, next) {
  try {
    const requesterUserId = req.user?.id;
    const { id } = req.params;
    const row = await operationalService.completeOperationalSession({ id, requesterUserId });
    await generateBapForCompletedSession(row.id);
    return res.status(200).json({ success: true, message: 'Session completed', data: row });
  } catch (error) {
    logger.error('Error in completeOperationalSession controller:', error);
    const msg = String(error?.message || error);
    if (msg.includes('not owned') || msg.includes('status') || msg.includes('not authenticated')) {
      return badRequest(res, msg);
    }
    next(error);
  }
}

