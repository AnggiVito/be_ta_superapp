import { logger } from '../../../core/utils/logger.js';
import * as activityLogService from '../../activity-log/services/activityLogService.js';
import * as qrService from '../services/practicumOperationalSessionQrService.js';

function badRequest(res, message) {
  return res.status(400).json({ success: false, message });
}

function isClientError(message) {
  return (
    message.includes('not authenticated') ||
    message.includes('not found') ||
    message.includes('ongoing') ||
    message.includes('Only the session PIC') ||
    message.includes('active assistant') ||
    message.includes('expired')
  );
}

function logQrGeneration(req, action, data) {
  activityLogService.createActivityLog({
    user_id: req.user?.id || null,
    action,
    method: req.method,
    endpoint: req.path,
    ip_address: req.ip || req.connection?.remoteAddress,
    user_agent: req.get('user-agent'),
    request_body: null,
    response_status: 200,
    response_body: null,
    affected_table: 'practicum_operational_session_qr_sessions',
    affected_record_id: data.sessionId || null,
    metadata: {
      operational_session_id: data.operationalSessionId,
      qr_session_id: data.sessionId || null,
      qr_token: data.qrToken,
      assistant_user_id: data.assistantUserId || data.generatedBy || null,
      generated_by: data.generatedBy || null,
      expired_at: data.expiredAt,
      generated_at: data.generatedAt,
    },
  });
}

export async function generateOperationalSessionActivationQr(req, res, next) {
  try {
    const data = await qrService.generateOperationalSessionActivationQr({
      operationalSessionId: req.params.id,
      generatedBy: req.user?.id,
    });
    logQrGeneration(req, 'GENERATE_OPERATIONAL_SESSION_ACTIVATION_QR', data);
    return res.status(200).json({
      success: true,
      message: 'Assistant activation QR generated successfully',
      data,
    });
  } catch (error) {
    logger.error('Error in generateOperationalSessionActivationQr controller:', error);
    const msg = String(error?.message || error);
    if (isClientError(msg) || msg.includes('before the session starts')) {
      return badRequest(res, msg);
    }
    next(error);
  }
}

export async function generateOperationalSessionQr(req, res, next) {
  try {
    const data = await qrService.generateOperationalSessionQr({
      operationalSessionId: req.params.id,
      generatedBy: req.user?.id,
    });
    logQrGeneration(req, 'GENERATE_OPERATIONAL_SESSION_ATTENDANCE_QR', data);
    return res.status(201).json({
      success: true,
      message: 'Session attendance QR generated successfully',
      data,
    });
  } catch (error) {
    logger.error('Error in generateOperationalSessionQr controller:', error);
    const msg = String(error?.message || error);
    if (isClientError(msg)) return badRequest(res, msg);
    next(error);
  }
}

export async function getActiveOperationalSessionQr(req, res, next) {
  try {
    const data = await qrService.getActiveOperationalSessionQr({
      operationalSessionId: req.params.id,
      requesterUserId: req.user?.id,
    });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    logger.error('Error in getActiveOperationalSessionQr controller:', error);
    const msg = String(error?.message || error);
    if (isClientError(msg)) return badRequest(res, msg);
    next(error);
  }
}
