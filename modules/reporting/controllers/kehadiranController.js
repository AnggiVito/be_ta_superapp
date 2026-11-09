/**
 * Kehadiran (BAP) reporting — read-only dari modul conduct.
 */

import { logger } from '../../../core/utils/logger.js';
import * as kehadiranService from '../services/kehadiranService.js';
import { normalizeKehadiranViewMode } from '../services/kehadiranScopeService.js';

function parseFilters(req) {
  const q = req.query || {};
  const lecturerSignedRaw = q.lecturer_signed ?? q.lecturerSigned;
  let lecturerSigned;
  if (lecturerSignedRaw === 'true') lecturerSigned = true;
  else if (lecturerSignedRaw === 'false') lecturerSigned = false;

  const inboxRaw = q.inbox ? String(q.inbox).trim().toLowerCase() : 'all';
  const inbox = [
    'all',
    'needs_review',
    'low_attendance',
    'awaiting_lecturer',
    'approved',
    'pending',
  ].includes(inboxRaw)
    ? inboxRaw
    : 'all';

  return {
    status: q.status ? String(q.status).trim() : undefined,
    incidentOnly:
      q.incident_only === 'true' || q.incidentOnly === 'true',
    tpaReviewStatus:
      q.tpa_review_status || q.tpaReviewStatus
        ? String(q.tpa_review_status || q.tpaReviewStatus).trim()
        : undefined,
    lecturerSigned,
    dateFrom: q.date_from || q.dateFrom || undefined,
    dateTo: q.date_to || q.dateTo || undefined,
    semesterCode: q.semester_code || q.semesterCode || 'active',
    practicumName: q.practicum_name || q.practicumName || undefined,
    limit: q.limit ? parseInt(String(q.limit), 10) : undefined,
    inbox,
    viewMode: normalizeKehadiranViewMode(q.view_mode || q.viewMode) || undefined,
  };
}

function isClientError(message) {
  const msg = String(message || '');
  return (
    msg.includes('wajib diisi') ||
    msg.includes('tidak ditemukan') ||
    msg.includes('belum completed') ||
    msg.includes('belum tersedia')
  );
}

export async function listSessions(req, res, next) {
  try {
    const filters = parseFilters(req);
    const data = await kehadiranService.listSessions(filters, req.user);
    return res.status(200).json({
      success: true,
      data,
      message: 'Daftar sesi kehadiran berhasil diambil',
    });
  } catch (error) {
    logger.error('Error in kehadiran listSessions:', error);
    const msg = String(error?.message || error);
    if (isClientError(msg)) {
      return res.status(400).json({ success: false, message: msg });
    }
    return next(error);
  }
}

export async function getSessionDetail(req, res, next) {
  try {
    const sessionId = req.params.operationalSessionId;
    const filters = parseFilters(req);
    const data = await kehadiranService.getSessionDetail(sessionId, req.user, {
      viewMode: filters.viewMode,
    });
    return res.status(200).json({
      success: true,
      data,
      message: 'Detail sesi kehadiran berhasil diambil',
    });
  } catch (error) {
    logger.error('Error in kehadiran getSessionDetail:', error);
    const msg = String(error?.message || error);
    if (isClientError(msg)) {
      return res.status(400).json({ success: false, message: msg });
    }
    return next(error);
  }
}

export async function getSummary(req, res, next) {
  try {
    const data = await kehadiranService.getSummary(parseFilters(req), req.user);
    return res.status(200).json({
      success: true,
      data,
      message: 'Ringkasan kehadiran berhasil diambil',
    });
  } catch (error) {
    logger.error('Error in kehadiran getSummary:', error);
    const msg = String(error?.message || error);
    if (isClientError(msg)) {
      return res.status(400).json({ success: false, message: msg });
    }
    return next(error);
  }
}
