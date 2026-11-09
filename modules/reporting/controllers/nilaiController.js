/**
 * Nilai reporting — read-only dari modul conduct.
 */

import { logger } from '../../../core/utils/logger.js';
import * as nilaiService from '../services/nilaiService.js';
import { normalizeNilaiViewMode } from '../services/nilaiScopeService.js';

function parseFilters(req) {
  const q = req.query || {};
  return {
    semesterCode: q.semester_code || q.semesterCode || 'active',
    practicumName: q.practicum_name || q.practicumName || undefined,
    studentUserId: q.student_user_id || q.studentUserId || undefined,
    limit: q.limit ? parseInt(String(q.limit), 10) : undefined,
    viewMode: normalizeNilaiViewMode(q.view_mode || q.viewMode) || undefined,
  };
}

function isClientError(message) {
  const msg = String(message || '');
  return (
    msg.includes('wajib diisi') ||
    msg.includes('tidak ditemukan') ||
    msg.includes('akses ditolak') ||
    msg.includes('tidak tersedia')
  );
}

export async function listGrades(req, res, next) {
  try {
    const data = await nilaiService.listGrades(parseFilters(req), req.user);
    return res.status(200).json({
      success: true,
      data,
      message: 'Daftar nilai berhasil diambil',
    });
  } catch (error) {
    logger.error('Error in nilai listGrades:', error);
    const msg = String(error?.message || error);
    if (isClientError(msg)) {
      return res.status(400).json({ success: false, message: msg });
    }
    return next(error);
  }
}

export async function getSummary(req, res, next) {
  try {
    const data = await nilaiService.getSummary(parseFilters(req), req.user);
    return res.status(200).json({
      success: true,
      data,
      message: 'Ringkasan nilai berhasil diambil',
    });
  } catch (error) {
    logger.error('Error in nilai getSummary:', error);
    const msg = String(error?.message || error);
    if (isClientError(msg)) {
      return res.status(400).json({ success: false, message: msg });
    }
    return next(error);
  }
}

export async function listModules(req, res, next) {
  try {
    const data = await nilaiService.listModuleReports(parseFilters(req), req.user);
    return res.status(200).json({
      success: true,
      data,
      message: 'Daftar modul nilai berhasil diambil',
    });
  } catch (error) {
    logger.error('Error in nilai listModules:', error);
    const msg = String(error?.message || error);
    if (isClientError(msg)) {
      return res.status(400).json({ success: false, message: msg });
    }
    return next(error);
  }
}

export async function getModuleDetail(req, res, next) {
  try {
    const moduleId = req.params.moduleId;
    const data = await nilaiService.getModuleDetail(
      moduleId,
      parseFilters(req),
      req.user
    );
    return res.status(200).json({
      success: true,
      data,
      message: 'Detail modul nilai berhasil diambil',
    });
  } catch (error) {
    logger.error('Error in nilai getModuleDetail:', error);
    const msg = String(error?.message || error);
    if (isClientError(msg)) {
      return res.status(400).json({ success: false, message: msg });
    }
    return next(error);
  }
}

export async function getGradeDetail(req, res, next) {
  try {
    const gradeId = req.params.gradeId;
    const filters = parseFilters(req);
    const data = await nilaiService.getGradeDetail(gradeId, req.user, {
      viewMode: filters.viewMode,
    });
    return res.status(200).json({
      success: true,
      data,
      message: 'Detail nilai berhasil diambil',
    });
  } catch (error) {
    logger.error('Error in nilai getGradeDetail:', error);
    const msg = String(error?.message || error);
    if (isClientError(msg)) {
      return res.status(400).json({ success: false, message: msg });
    }
    return next(error);
  }
}
