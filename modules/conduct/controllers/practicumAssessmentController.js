import { logger } from '../../../core/utils/logger.js';
import * as assessmentService from '../services/practicumAssessmentService.js';

function badRequest(res, message) {
  return res.status(400).json({ success: false, message });
}

function isClientError(message) {
  return (
    message.includes('required') ||
    message.includes('not authenticated') ||
    message.includes('not found') ||
    message.includes('not checked in') ||
    message.includes('not allowed') ||
    message.includes('can only') ||
    message.includes('must be a number') ||
    message.includes('cannot exceed') ||
    message.includes('rubric weight total') ||
    message.includes('assessment component configuration')
  );
}

export async function listAssistantGradingSessions(req, res, next) {
  try {
    const rows = await assessmentService.listAssistantGradingSessions(req.user?.id);
    return res.status(200).json({ success: true, data: rows });
  } catch (error) {
    logger.error('Error in listAssistantGradingSessions controller:', error);
    const msg = String(error?.message || error);
    if (isClientError(msg)) return badRequest(res, msg);
    next(error);
  }
}

export async function listGradingStudents(req, res, next) {
  try {
    const rows = await assessmentService.listGradingStudents({
      operationalSessionId: req.params.id,
      requesterUserId: req.user?.id,
    });
    return res.status(200).json({ success: true, data: rows });
  } catch (error) {
    logger.error('Error in listGradingStudents controller:', error);
    const msg = String(error?.message || error);
    if (isClientError(msg)) return badRequest(res, msg);
    next(error);
  }
}

export async function getGradingForm(req, res, next) {
  try {
    const payload = await assessmentService.getGradingForm({
      operationalSessionId: req.params.id,
      studentUserId: req.params.studentUserId,
      requesterUserId: req.user?.id,
    });
    return res.status(200).json({ success: true, data: payload });
  } catch (error) {
    logger.error('Error in getGradingForm controller:', error);
    const msg = String(error?.message || error);
    if (isClientError(msg)) return badRequest(res, msg);
    next(error);
  }
}

export async function submitStudentGrade(req, res, next) {
  try {
    const payload = await assessmentService.submitStudentGrade({
      operationalSessionId: req.params.id,
      studentUserId: req.params.studentUserId,
      requesterUserId: req.user?.id,
      components: req.body?.components,
    });
    return res.status(200).json({
      success: true,
      message: 'Student grade saved successfully',
      data: payload,
    });
  } catch (error) {
    logger.error('Error in submitStudentGrade controller:', error);
    const msg = String(error?.message || error);
    if (isClientError(msg)) return badRequest(res, msg);
    next(error);
  }
}

export async function listGradesForReporting(req, res, next) {
  try {
    const rows = await assessmentService.listGradesForReporting({
      operationalSessionId: req.query?.operational_session_id,
      registrationScheduleId: req.query?.registration_schedule_id,
      studentUserId: req.query?.student_user_id,
    });
    return res.status(200).json({ success: true, data: rows });
  } catch (error) {
    logger.error('Error in listGradesForReporting controller:', error);
    const msg = String(error?.message || error);
    if (isClientError(msg)) return badRequest(res, msg);
    next(error);
  }
}
