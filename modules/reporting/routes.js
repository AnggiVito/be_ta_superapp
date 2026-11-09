import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { validateJWT } from '../../core/auth/jwt-validator.js';
import * as feedbackController from './controllers/feedbackController.js';
import * as keuanganController from './controllers/keuanganController.js';
import * as laboranKeuanganController from './controllers/laboranKeuanganController.js';
import * as kehadiranController from './controllers/kehadiranController.js';
import * as nilaiController from './controllers/nilaiController.js';

import { 
  requireViewReportAccess,
  requireKehadiranReportAccess,
  requireNilaiReportAccess,
  requireKeuanganReportAccess,
  requireManageReportAccess,
  filterByRole,
  requireKpaKaurTpaDeleteAccess,
} from './middleware/roleAuthMiddleware.js';
import { attachKeuanganAccessScope } from './middleware/keuanganScopeMiddleware.js';

const router = express.Router();

/**
 * Modul Reporting Routes
 */

// Health check untuk modul
router.get('/health', (req, res) => {
  res.json({
    success: true,
    module: 'reporting',
    message: 'Reporting module is running',
  });
});

// ==================== Feedback (conduct exit survey) ====================

/** GET /api/reporting/feedback/my-summary */
router.get(
  '/feedback/my-summary',
  validateJWT,
  requireViewReportAccess,
  feedbackController.getMemberSummary
);

/** GET /api/reporting/feedback/my-responses */
router.get(
  '/feedback/my-responses',
  validateJWT,
  requireViewReportAccess,
  feedbackController.listMemberResponses
);

/** GET /api/reporting/feedback/my-responses/:operationalSessionId */
router.get(
  '/feedback/my-responses/:operationalSessionId',
  validateJWT,
  requireViewReportAccess,
  feedbackController.getMemberResponseDetail
);

/** GET /api/reporting/feedback/praktikum-stats */
router.get(
  '/feedback/praktikum-stats',
  validateJWT,
  requireViewReportAccess,
  filterByRole,
  feedbackController.getPraktikumStats
);

/** GET /api/reporting/feedback/modules */
router.get(
  '/feedback/modules',
  validateJWT,
  requireViewReportAccess,
  filterByRole,
  feedbackController.getFeedbackModules
);

/** GET /api/reporting/feedback/reviews/top-worst */
router.get(
  '/feedback/reviews/top-worst',
  validateJWT,
  requireViewReportAccess,
  filterByRole,
  feedbackController.getTopAndWorstReviews
);

// ==================== Keuangan (KPA) Routes ====================

// Configure multer for KPA uploads
const kpaUploadDir = 'uploads/kpa';
if (!fs.existsSync(kpaUploadDir)) fs.mkdirSync(kpaUploadDir, { recursive: true });

const kpaStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, kpaUploadDir),
  filename: (req, file, cb) => {
    const suffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `kpa-${suffix}${path.extname(file.originalname)}`);
  },
});
const kpaUpload = multer({
  storage: kpaStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!['.xlsx', '.xls'].includes(ext)) return cb(new Error('Only Excel files allowed'));
    cb(null, true);
  },
});

/** GET  /api/reporting/keuangan/periods */
router.get('/keuangan/periods', validateJWT, requireKeuanganReportAccess, attachKeuanganAccessScope, keuanganController.getPeriods);

/** POST /api/reporting/keuangan/periods */
router.post('/keuangan/periods', validateJWT, requireManageReportAccess, keuanganController.createNewPeriod);

/** POST /api/reporting/keuangan/upload */
router.post('/keuangan/upload', validateJWT, requireManageReportAccess, kpaUpload.single('file'), keuanganController.uploadKpaFile);

/** GET  /api/reporting/keuangan/uploads — all uploads (picker / riwayat) */
router.get('/keuangan/uploads', validateJWT, requireKeuanganReportAccess, attachKeuanganAccessScope, keuanganController.listAllUploads);

/** DELETE /api/reporting/keuangan/uploads/:id — hapus file & data terkait (KAUR, TPA) */
router.delete('/keuangan/uploads/:id', validateJWT, requireKpaKaurTpaDeleteAccess, keuanganController.deleteKpaUpload);

/** POST /api/reporting/keuangan/reprocess — parse ulang file yang sudah diunggah */
router.post('/keuangan/reprocess', validateJWT, requireManageReportAccess, keuanganController.reprocessKpa);

/** GET  /api/reporting/keuangan/periods/:id/summary */
router.get('/keuangan/periods/:id/summary', validateJWT, requireKeuanganReportAccess, attachKeuanganAccessScope, keuanganController.getPeriodSummaryHandler);

/** GET  /api/reporting/keuangan/periods/:id/prodi */
router.get('/keuangan/periods/:id/prodi', validateJWT, requireKeuanganReportAccess, attachKeuanganAccessScope, keuanganController.getProdiBudgets);

/** GET  /api/reporting/keuangan/periods/:id/transactions */
router.get('/keuangan/periods/:id/transactions', validateJWT, requireKeuanganReportAccess, attachKeuanganAccessScope, keuanganController.getTransactions);

/** GET  /api/reporting/keuangan/periods/:id/uploads */
router.get('/keuangan/periods/:id/uploads', validateJWT, requireKeuanganReportAccess, attachKeuanganAccessScope, keuanganController.getUploads);

/** POST /api/reporting/keuangan/prodi-budgets */
router.post('/keuangan/prodi-budgets', validateJWT, requireManageReportAccess, keuanganController.createProdiBudget);

/** PUT  /api/reporting/keuangan/prodi-budgets/:id */
router.put('/keuangan/prodi-budgets/:id', validateJWT, requireManageReportAccess, keuanganController.updateProdiBudgetHandler);

/** GET  /api/reporting/keuangan/prodi-budgets/:id/summary — laporan satu file / satu PP */
router.get('/keuangan/prodi-budgets/:id/summary', validateJWT, requireKeuanganReportAccess, attachKeuanganAccessScope, keuanganController.getBudgetSummaryHandler);

/** GET  /api/reporting/keuangan/prodi-budgets/:id */
router.get('/keuangan/prodi-budgets/:id', validateJWT, requireKeuanganReportAccess, attachKeuanganAccessScope, keuanganController.getProdiBudgetDetail);

// ========== Laboran keuangan upload & compare vs procurement (KPA sistem) ==========

const laboranUploadDir = 'uploads/laboran-keuangan';
if (!fs.existsSync(laboranUploadDir)) fs.mkdirSync(laboranUploadDir, { recursive: true });

const laboranStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, laboranUploadDir),
  filename: (req, file, cb) => {
    const suffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `laboran-${suffix}${path.extname(file.originalname)}`);
  },
});
const laboranUpload = multer({
  storage: laboranStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!['.xlsx', '.xls'].includes(ext)) return cb(new Error('Only Excel files allowed'));
    cb(null, true);
  },
});

/** POST /api/reporting/keuangan/laboran/upload — multi-sheet laporan laboran */
router.post(
  '/keuangan/laboran/upload',
  validateJWT,
  requireManageReportAccess,
  laboranUpload.single('file'),
  laboranKeuanganController.uploadLaboranKeuangan
);

/** GET /api/reporting/keuangan/laboran/uploads */
router.get(
  '/keuangan/laboran/uploads',
  validateJWT,
  requireKeuanganReportAccess,
  attachKeuanganAccessScope,
  laboranKeuanganController.listLaboranKeuanganUploads
);

/** GET /api/reporting/keuangan/laboran/uploads/:uploadId */
router.get(
  '/keuangan/laboran/uploads/:uploadId',
  validateJWT,
  requireKeuanganReportAccess,
  attachKeuanganAccessScope,
  laboranKeuanganController.getLaboranKeuanganUpload
);

/** POST /api/reporting/keuangan/compare — jalankan compare untuk upload laboran */
router.post(
  '/keuangan/compare',
  validateJWT,
  requireKeuanganReportAccess,
  attachKeuanganAccessScope,
  laboranKeuanganController.runKeuanganCompare
);

/** POST /api/reporting/keuangan/laboran/uploads/:uploadId/compare */
router.post(
  '/keuangan/laboran/uploads/:uploadId/compare',
  validateJWT,
  requireKeuanganReportAccess,
  attachKeuanganAccessScope,
  laboranKeuanganController.runKeuanganCompare
);

/** GET /api/reporting/keuangan/compare/latest — compare upload laboran terbaru */
router.get(
  '/keuangan/compare/latest',
  validateJWT,
  requireKeuanganReportAccess,
  attachKeuanganAccessScope,
  laboranKeuanganController.getLatestKeuanganCompare
);

/** GET /api/reporting/keuangan/compare/:runId/overview */
router.get(
  '/keuangan/compare/:runId/overview',
  validateJWT,
  requireKeuanganReportAccess,
  attachKeuanganAccessScope,
  laboranKeuanganController.getKeuanganCompareOverview
);

/** GET /api/reporting/keuangan/compare/:runId/prodi/:kodePP */
router.get(
  '/keuangan/compare/:runId/prodi/:kodePP',
  validateJWT,
  requireKeuanganReportAccess,
  attachKeuanganAccessScope,
  laboranKeuanganController.getKeuanganCompareProdiDetail
);

// ========== Kehadiran (BAP dari modul conduct, read-only) ==========

/** GET /api/reporting/kehadiran/sessions */
router.get('/kehadiran/sessions', validateJWT, requireKehadiranReportAccess, kehadiranController.listSessions);

/** GET /api/reporting/kehadiran/summary */
router.get('/kehadiran/summary', validateJWT, requireKehadiranReportAccess, kehadiranController.getSummary);

/** GET /api/reporting/kehadiran/sessions/:operationalSessionId */
router.get(
  '/kehadiran/sessions/:operationalSessionId',
  validateJWT,
  requireKehadiranReportAccess,
  kehadiranController.getSessionDetail
);

// ========== Nilai (grades dari modul conduct, read-only) ==========

/** GET /api/reporting/nilai/grades */
router.get('/nilai/grades', validateJWT, requireNilaiReportAccess, nilaiController.listGrades);

/** GET /api/reporting/nilai/summary */
router.get('/nilai/summary', validateJWT, requireNilaiReportAccess, nilaiController.getSummary);

/** GET /api/reporting/nilai/modules */
router.get('/nilai/modules', validateJWT, requireNilaiReportAccess, nilaiController.listModules);

/** GET /api/reporting/nilai/modules/:moduleId */
router.get(
  '/nilai/modules/:moduleId',
  validateJWT,
  requireNilaiReportAccess,
  nilaiController.getModuleDetail
);

/** GET /api/reporting/nilai/grades/:gradeId */
router.get(
  '/nilai/grades/:gradeId',
  validateJWT,
  requireNilaiReportAccess,
  nilaiController.getGradeDetail
);

export default router;
