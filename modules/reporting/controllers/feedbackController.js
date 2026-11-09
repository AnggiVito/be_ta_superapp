/**
 * Feedback Controller — laporan feedback dari conduct (exit survey).
 */

import * as feedbackConductReportService from '../services/feedbackConductReportService.js';
import * as feedbackMemberReportService from '../services/feedbackMemberReportService.js';
import { logger } from '../../../core/utils/logger.js';

function parseConductFilters(req) {
  return {
    semesterCode:
      req.query.semester_code || req.query.semesterCode || 'active',
    dateFrom: req.query.date_from || req.query.dateFrom || null,
    dateTo: req.query.date_to || req.query.dateTo || null,
    practicumName:
      req.query.practicum_name ||
      req.query.practicumName ||
      req.query.nama_praktikum ||
      null,
    moduleId: req.query.module_id || req.query.moduleId || null,
  };
}

/** GET /api/reporting/feedback/my-summary */
export async function getMemberSummary(req, res) {
  try {
    const data = await feedbackMemberReportService.getMemberSummary(
      parseConductFilters(req),
      req.user
    );
    return res.json({
      success: true,
      message: 'Ringkasan feedback mahasiswa berhasil diambil',
      data,
    });
  } catch (error) {
    logger.error('Error in getMemberSummary controller:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error getting member feedback summary',
    });
  }
}

/** GET /api/reporting/feedback/my-responses */
export async function listMemberResponses(req, res) {
  try {
    const data = await feedbackMemberReportService.listMemberResponses(
      parseConductFilters(req),
      req.user
    );
    return res.json({
      success: true,
      message: 'Daftar feedback mahasiswa berhasil diambil',
      data,
    });
  } catch (error) {
    logger.error('Error in listMemberResponses controller:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error getting member feedback list',
    });
  }
}

/** GET /api/reporting/feedback/my-responses/:operationalSessionId */
export async function getMemberResponseDetail(req, res) {
  try {
    const data = await feedbackMemberReportService.getMemberResponseDetail(
      req.params.operationalSessionId,
      parseConductFilters(req),
      req.user
    );
    return res.json({
      success: true,
      message: 'Detail feedback mahasiswa berhasil diambil',
      data,
    });
  } catch (error) {
    logger.error('Error in getMemberResponseDetail controller:', error);
    const msg = String(error?.message || error);
    const status = msg.includes('tidak ditemukan') || msg.includes('akses ditolak') ? 400 : 500;
    res.status(status).json({
      success: false,
      message: msg || 'Error getting member feedback detail',
    });
  }
}

/** GET /api/reporting/feedback/praktikum-stats */
export async function getPraktikumStats(req, res) {
  try {
    const result = await feedbackConductReportService.getFeedbackPraktikumStats(
      parseConductFilters(req)
    );
    return res.json({
      success: true,
      message: 'Statistik feedback per praktikum berhasil diambil',
      data: {
        stats: result.stats,
        active_survey: result.active_survey,
        period: result.period,
      },
      count: result.stats.length,
    });
  } catch (error) {
    logger.error('Error in getPraktikumStats controller:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error getting praktikum stats',
    });
  }
}

/** GET /api/reporting/feedback/modules */
export async function getFeedbackModules(req, res) {
  try {
    const filters = parseConductFilters(req);
    if (!filters.practicumName) {
      return res.status(400).json({
        success: false,
        message: 'practicum_name atau nama_praktikum wajib diisi',
      });
    }
    const modules = await feedbackConductReportService.getFeedbackModules(
      filters
    );
    return res.json({
      success: true,
      message: 'Daftar modul feedback berhasil diambil',
      data: { modules },
      count: modules.length,
    });
  } catch (error) {
    logger.error('Error in getFeedbackModules controller:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error getting feedback modules',
    });
  }
}

/** GET /api/reporting/feedback/reviews/top-worst */
export async function getTopAndWorstReviews(req, res) {
  try {
    const result = await feedbackConductReportService.getFeedbackReviewsTopWorst({
      ...parseConductFilters(req),
      practicumName:
        req.query.nama_praktikum ||
        req.query.practicum_name ||
        req.query.practicumName ||
        null,
    });
    return res.json(result);
  } catch (error) {
    logger.error('Error in getTopAndWorstReviews controller:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error getting top and worst reviews',
    });
  }
}
