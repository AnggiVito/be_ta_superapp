import { logger } from '../../../core/utils/logger.js';
import * as activityLogService from '../../activity-log/services/activityLogService.js';
import * as attendanceService from '../services/practicumOperationalSessionAttendanceService.js';

function badRequest(res, message) {
  return res.status(400).json({ success: false, message });
}

function isClientError(message) {
  return (
    message.includes('required') ||
    message.includes('not authenticated') ||
    message.includes('not found') ||
    message.includes('ongoing') ||
    message.includes('expired') ||
    message.includes('not active') ||
    message.includes('plot') ||
    message.includes('session PIC') ||
    message.includes('grade has already been submitted') ||
    message.includes('Student attendance') ||
    message.includes('Target assistant') ||
    message.includes('At least one attendance_id') ||
    message.includes('One or more student attendances') ||
    message.includes('All selected students') ||
    message.includes('reason')
  );
}

export async function checkInOperationalSessionAttendance(req, res, next) {
  try {
    const requesterUserId = req.user?.id;
    const qrToken = req.body?.qr_token || req.body?.qrToken;
    const attendance = await attendanceService.checkInOperationalSessionAttendance({
      operationalSessionId: req.params.id,
      requesterUserId,
      qrToken,
    });

    activityLogService.createActivityLog({
      user_id: requesterUserId || null,
      action: 'CHECK_IN_OPERATIONAL_SESSION_ATTENDANCE',
      method: req.method,
      endpoint: req.path,
      ip_address: req.ip || req.connection?.remoteAddress,
      user_agent: req.get('user-agent'),
      request_body: { qr_token: qrToken },
      response_status: 200,
      response_body: null,
      affected_table: 'practicum_operational_session_attendances',
      affected_record_id: attendance.id,
      metadata: {
        operational_session_id: attendance.operational_session_id,
        student_user_id: requesterUserId,
        qr_session_id: attendance.qr_session_id,
        attendance_time: attendance.attendance_time,
        already_checked_in: attendance.already_checked_in,
      },
    });

    return res.status(200).json({
      success: true,
      message: attendance.already_checked_in
        ? 'You have already checked in for this session'
        : 'Practicum session check-in successful',
      data: attendance,
    });
  } catch (error) {
    logger.error('Error in checkInOperationalSessionAttendance controller:', error);
    const msg = String(error?.message || error);
    if (isClientError(msg)) return badRequest(res, msg);
    next(error);
  }
}

export async function listMyOperationalSessionAttendances(req, res, next) {
  try {
    const rows = await attendanceService.listMyOperationalSessionAttendances(req.user?.id);
    return res.status(200).json({ success: true, data: rows });
  } catch (error) {
    logger.error('Error in listMyOperationalSessionAttendances controller:', error);
    const msg = String(error?.message || error);
    if (isClientError(msg)) return badRequest(res, msg);
    next(error);
  }
}

export async function listOperationalSessionAttendances(req, res, next) {
  try {
    const rows = await attendanceService.listOperationalSessionAttendances(req.params.id);
    return res.status(200).json({ success: true, data: rows });
  } catch (error) {
    logger.error('Error in listOperationalSessionAttendances controller:', error);
    const msg = String(error?.message || error);
    if (isClientError(msg)) return badRequest(res, msg);
    next(error);
  }
}

export async function listOperationalSessionAttendancePlotHistory(req, res, next) {
  try {
    const rows = await attendanceService.listOperationalSessionAttendancePlotHistory({
      operationalSessionId: req.params.id,
      attendanceId: req.params.attendanceId,
      requesterUserId: req.user?.id,
    });
    return res.status(200).json({ success: true, data: rows });
  } catch (error) {
    logger.error('Error in listOperationalSessionAttendancePlotHistory controller:', error);
    const msg = String(error?.message || error);
    if (isClientError(msg)) return badRequest(res, msg);
    next(error);
  }
}

export async function reassignOperationalSessionAttendancePlot(req, res, next) {
  try {
    const row = await attendanceService.reassignOperationalSessionAttendancePlot({
      operationalSessionId: req.params.id,
      attendanceId: req.params.attendanceId,
      targetAssistantUserId: req.body?.target_assistant_user_id ?? req.body?.targetAssistantUserId,
      requesterUserId: req.user?.id,
      reason: req.body?.reason,
    });

    activityLogService.createActivityLog({
      user_id: req.user?.id || null,
      action: 'REASSIGN_OPERATIONAL_SESSION_ATTENDANCE_PLOT',
      method: req.method,
      endpoint: req.path,
      ip_address: req.ip || req.connection?.remoteAddress,
      user_agent: req.get('user-agent'),
      request_body: {
        attendance_id: req.params.attendanceId,
        target_assistant_user_id: req.body?.target_assistant_user_id ?? req.body?.targetAssistantUserId,
        reason: req.body?.reason,
      },
      response_status: 200,
      response_body: null,
      affected_table: 'practicum_operational_session_attendances',
      affected_record_id: row.id,
      metadata: {
        operational_session_id: req.params.id,
        student_user_id: row.user_id,
        assigned_assistant_user_id: row.assigned_assistant_user_id,
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Student plot updated successfully',
      data: row,
    });
  } catch (error) {
    logger.error('Error in reassignOperationalSessionAttendancePlot controller:', error);
    const msg = String(error?.message || error);
    if (isClientError(msg)) return badRequest(res, msg);
    next(error);
  }
}

export async function bulkReassignOperationalSessionAttendancePlot(req, res, next) {
  try {
    const attendanceIds =
      req.body?.attendance_ids ?? req.body?.attendanceIds ?? req.body?.attendance_id_list;
    const result = await attendanceService.bulkReassignOperationalSessionAttendancePlot({
      operationalSessionId: req.params.id,
      attendanceIds,
      targetAssistantUserId: req.body?.target_assistant_user_id ?? req.body?.targetAssistantUserId,
      requesterUserId: req.user?.id,
      reason: req.body?.reason,
    });

    activityLogService.createActivityLog({
      user_id: req.user?.id || null,
      action: 'BULK_REASSIGN_OPERATIONAL_SESSION_ATTENDANCE_PLOT',
      method: req.method,
      endpoint: req.path,
      ip_address: req.ip || req.connection?.remoteAddress,
      user_agent: req.get('user-agent'),
      request_body: {
        attendance_ids: attendanceIds,
        target_assistant_user_id: req.body?.target_assistant_user_id ?? req.body?.targetAssistantUserId,
        reason: req.body?.reason,
      },
      response_status: 200,
      response_body: null,
      affected_table: 'practicum_operational_session_attendances',
      affected_record_id: null,
      metadata: {
        operational_session_id: req.params.id,
        updated_count: result.updated_count,
        skipped_count: result.skipped_count,
      },
    });

    return res.status(200).json({
      success: true,
      message: `${result.updated_count} student plot(s) updated successfully`,
      data: result,
    });
  } catch (error) {
    logger.error('Error in bulkReassignOperationalSessionAttendancePlot controller:', error);
    const msg = String(error?.message || error);
    if (isClientError(msg)) return badRequest(res, msg);
    next(error);
  }
}
