import { logger } from '../../../core/utils/logger.js';
import * as bapService from '../services/practicumBapService.js';

function badRequest(res, message) {
  return res.status(400).json({ success: false, message });
}

function isClientError(message) {
  return (
    message.includes('required') ||
    message.includes('not found') ||
    message.includes('not completed') ||
    message.includes('can only') ||
    message.includes('Only the session PIC') ||
    message.includes('maximum') ||
    message.includes('after lecturer signature') ||
    message.includes('after the BAP is approved') ||
    message.includes('Laboratory review status is invalid') ||
    message.includes('Review note is required') ||
    message.includes('PDF generator') ||
    message.includes('not available')
  );
}

export async function listBaps(req, res, next) {
  try {
    const rows = await bapService.listBaps({
      status: req.query?.status,
      incidentOnly: req.query?.incident_only === 'true' || req.query?.incidentOnly === 'true',
      laboranReviewStatus: req.query?.laboran_review_status || req.query?.laboranReviewStatus,
      lecturerSigned: req.query?.lecturer_signed === undefined && req.query?.lecturerSigned === undefined
        ? undefined
        : (req.query?.lecturer_signed ?? req.query?.lecturerSigned) === 'true',
    });
    return res.status(200).json({ success: true, data: rows });
  } catch (error) {
    logger.error('Error in listBaps controller:', error);
    const msg = String(error?.message || error);
    if (isClientError(msg)) return badRequest(res, msg);
    next(error);
  }
}

export async function getBapBySession(req, res, next) {
  try {
    const payload = await bapService.getBapBySession(req.params.id);
    return res.status(200).json({ success: true, data: payload });
  } catch (error) {
    logger.error('Error in getBapBySession controller:', error);
    const msg = String(error?.message || error);
    if (isClientError(msg)) return badRequest(res, msg);
    next(error);
  }
}

export async function generateBapForSession(req, res, next) {
  try {
    const payload = await bapService.generateBapForCompletedSession(req.params.id);
    return res.status(200).json({
      success: true,
      message: 'Practicum BAP generated successfully',
      data: payload,
    });
  } catch (error) {
    logger.error('Error in generateBapForSession controller:', error);
    const msg = String(error?.message || error);
    if (isClientError(msg)) return badRequest(res, msg);
    next(error);
  }
}

export async function refreshSignatureSnapshots(req, res, next) {
  try {
    const data = await bapService.refreshBapSignatureSnapshots(req.params.id);
    return res.status(200).json({
      success: true,
      message: 'BAP signature snapshots refreshed successfully',
      data,
    });
  } catch (error) {
    logger.error('Error in refreshSignatureSnapshots controller:', error);
    const msg = String(error?.message || error);
    if (isClientError(msg) || msg.includes('Signature snapshot')) return badRequest(res, msg);
    next(error);
  }
}

export async function exportBapExcel(req, res, next) {
  try {
    const { buffer, filename } = await bapService.exportBapExcelBySession(req.params.id);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(buffer);
  } catch (error) {
    logger.error('Error in exportBapExcel controller:', error);
    const msg = String(error?.message || error);
    if (isClientError(msg)) return badRequest(res, msg);
    next(error);
  }
}

export async function updateIncidentNotes(req, res, next) {
  try {
    const data = await bapService.updateBapIncidentNotes({
      operationalSessionId: req.params.id,
      requesterUserId: req.user?.id,
      incidentNotes: req.body?.incident_notes ?? req.body?.incidentNotes,
    });
    return res.status(200).json({
      success: true,
      message: 'BAP incident notes saved successfully',
      data,
    });
  } catch (error) {
    logger.error('Error in updateIncidentNotes controller:', error);
    const msg = String(error?.message || error);
    if (isClientError(msg)) return badRequest(res, msg);
    next(error);
  }
}

export async function reviewByLaboran(req, res, next) {
  try {
    const data = await bapService.reviewBapByLaboran({
      operationalSessionId: req.params.id,
      requesterUserId: req.user?.id,
      reviewStatus: req.body?.review_status ?? req.body?.reviewStatus,
      reviewNote: req.body?.review_note ?? req.body?.reviewNote,
    });
    return res.status(200).json({
      success: true,
      message: data.laboran_review_status === 'approved'
        ? 'BAP approved by laboratory staff successfully'
        : 'BAP review saved successfully',
      data,
    });
  } catch (error) {
    logger.error('Error in reviewByLaboran controller:', error);
    const msg = String(error?.message || error);
    if (isClientError(msg)) return badRequest(res, msg);
    next(error);
  }
}

export async function exportBapCsv(req, res, next) {
  try {
    const { buffer, filename } = await bapService.exportBapCsvBySession(req.params.id);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(buffer);
  } catch (error) {
    logger.error('Error in exportBapCsv controller:', error);
    const msg = String(error?.message || error);
    if (isClientError(msg)) return badRequest(res, msg);
    next(error);
  }
}

export async function exportBapPdf(req, res, next) {
  try {
    const { buffer, filename } = await bapService.exportBapPdfBySession(req.params.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(buffer);
  } catch (error) {
    logger.error('Error in exportBapPdf controller:', error);
    const msg = String(error?.message || error);
    if (isClientError(msg)) return badRequest(res, msg);
    next(error);
  }
}

export async function generateLecturerSignatureQr(req, res, next) {
  try {
    const data = await bapService.generateLecturerSignatureQr({
      operationalSessionId: req.params.id,
      requesterUserId: req.user?.id,
    });
    return res.status(201).json({
      success: true,
      message: 'Lecturer signature QR generated successfully',
      data,
    });
  } catch (error) {
    logger.error('Error in generateLecturerSignatureQr controller:', error);
    const msg = String(error?.message || error);
    if (isClientError(msg) || msg.includes('already signed')) return badRequest(res, msg);
    next(error);
  }
}

export async function getActiveLecturerSignatureQr(req, res, next) {
  try {
    const data = await bapService.getActiveLecturerSignatureQr({ operationalSessionId: req.params.id });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    logger.error('Error in getActiveLecturerSignatureQr controller:', error);
    const msg = String(error?.message || error);
    if (isClientError(msg)) return badRequest(res, msg);
    next(error);
  }
}

export async function signBapByLecturer(req, res, next) {
  try {
    const data = await bapService.signBapByLecturer({
      qrToken: req.body?.qr_token || req.body?.qrToken,
      requesterUserId: req.user?.id,
    });
    return res.status(200).json({
      success: true,
      message: 'BAP signed digitally successfully',
      data,
    });
  } catch (error) {
    logger.error('Error in signBapByLecturer controller:', error);
    const msg = String(error?.message || error);
    if (
      isClientError(msg) ||
      msg.includes('QR token') ||
      msg.includes('expired') ||
      msg.includes('no longer active') ||
      msg.includes('already signed')
    ) {
      return badRequest(res, msg);
    }
    next(error);
  }
}
