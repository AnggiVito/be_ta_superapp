import express from 'express';
import { validateJWT } from '../../core/auth/jwt-validator.js';
import { requireRole } from '../user-management/middleware/roleValidator.js';
import * as permitController from './controllers/permitController.js';
import * as simulationController from './controllers/simulationController.js';
import * as registrationMasterDataController from './controllers/registrationMasterDataController.js';
import * as practicumOperationalSessionController from './controllers/practicumOperationalSessionController.js';
import * as practicumOperationalSessionQrController from './controllers/practicumOperationalSessionQrController.js';
import * as practicumOperationalSessionAttendanceController from './controllers/practicumOperationalSessionAttendanceController.js';
import * as practicumAssessmentController from './controllers/practicumAssessmentController.js';
import * as practicumBapController from './controllers/practicumBapController.js';
import * as registrationPlotScheduleController from './controllers/registrationPlotScheduleController.js';
import * as exitSurveyController from './controllers/exitSurveyController.js';
import path from 'path';
import fs from 'fs';

function buildDiskUpload({ subdir, maxSizeBytes, maxFiles, requestKey }) {
  return async function uploadMiddleware(req, _res, next) {
    try {
      const multerMod = await import('multer').then(m => m.default || m);
      const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
      const destDir = path.join(uploadDir, subdir);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      const storage = multerMod.diskStorage({
        destination: (_req, _file, cb) => cb(null, destDir),
        filename: (_req, file, cb) => {
          const safe = (file.originalname || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
          cb(null, `${Date.now()}-${safe}`);
        },
      });

      const upload = multerMod({
        storage,
        limits: { fileSize: maxSizeBytes, files: maxFiles },
        fileFilter: (_req, file, cb) => {
          const allowed = ['image/png', 'image/jpeg', 'application/pdf'];
          if (!allowed.includes(file.mimetype)) {
            return cb(new Error('Unsupported file type. Only png/jpg/jpeg/pdf are allowed'));
          }
          cb(null, true);
        },
      });

      req[requestKey] = upload;
      next();
    } catch (err) {
      next(err);
    }
  };
}

const ensureMulter = buildDiskUpload({
  subdir: 'simulation_results',
  maxSizeBytes: 10 * 1024 * 1024,
  maxFiles: 3,
  requestKey: '_simulationResultUpload',
});


const router = express.Router();

/**
 * Modul Conduct (Pelaksanaan) Routes
 * Consumer + Writer:
 * - Read: Mengakses data dari registration_db (lab, prodi, praktikum, jadwal)
 * - Write: Menyimpan data kehadiran ke conduct_db
 */

// Health check untuk modul
router.get('/health', (_req, res) => {
  res.json({
    success: true,
    module: 'conduct',
    message: 'Conduct module is running',
  });
});

// Exit Survey Routes (#44)
router.get(
  '/exit-surveys/student/active',
  validateJWT,
  requireRole('mahasiswa'),
  exitSurveyController.getStudentActiveExitSurvey
);
router.get(
  '/exit-surveys/student/responses/:operationalSessionId',
  validateJWT,
  requireRole('mahasiswa'),
  exitSurveyController.getMyExitSurveyResponse
);
router.post(
  '/exit-surveys/student/responses',
  validateJWT,
  requireRole('mahasiswa'),
  exitSurveyController.submitExitSurveyResponse
);
router.post(
  '/exit-surveys',
  validateJWT,
  requireRole('laboran'),
  exitSurveyController.createExitSurvey
);
router.get(
  '/exit-surveys',
  validateJWT,
  requireRole('laboran'),
  exitSurveyController.listExitSurveys
);
router.get(
  '/exit-surveys/:id',
  validateJWT,
  requireRole('laboran'),
  exitSurveyController.getExitSurveyDetail
);
router.put(
  '/exit-surveys/:id',
  validateJWT,
  requireRole('laboran'),
  exitSurveyController.updateExitSurvey
);
router.delete(
  '/exit-surveys/:id',
  validateJWT,
  requireRole('laboran'),
  exitSurveyController.deleteExitSurvey
);
router.post(
  '/exit-surveys/:id/activate',
  validateJWT,
  requireRole('laboran'),
  exitSurveyController.activateExitSurvey
);
router.post(
  '/exit-surveys/:id/archive',
  validateJWT,
  requireRole('laboran'),
  exitSurveyController.archiveExitSurvey
);
router.get(
  '/exit-surveys/:id/sections',
  validateJWT,
  requireRole('laboran'),
  exitSurveyController.listExitSurveySections
);
router.post(
  '/exit-surveys/:id/sections',
  validateJWT,
  requireRole('laboran'),
  exitSurveyController.createExitSurveySection
);
router.put(
  '/exit-surveys/:id/builder/reorder',
  validateJWT,
  requireRole('laboran'),
  exitSurveyController.reorderExitSurveyBuilderItems
);
router.put(
  '/exit-surveys/:id/sections/reorder',
  validateJWT,
  requireRole('laboran'),
  exitSurveyController.reorderExitSurveySections
);
router.put(
  '/exit-surveys/:id/sections/:sectionId',
  validateJWT,
  requireRole('laboran'),
  exitSurveyController.updateExitSurveySection
);
router.delete(
  '/exit-surveys/:id/sections/:sectionId',
  validateJWT,
  requireRole('laboran'),
  exitSurveyController.deleteExitSurveySection
);
router.get(
  '/exit-surveys/:id/questions',
  validateJWT,
  requireRole('laboran'),
  exitSurveyController.listExitSurveyQuestions
);
router.post(
  '/exit-surveys/:id/questions',
  validateJWT,
  requireRole('laboran'),
  exitSurveyController.createExitSurveyQuestion
);
router.put(
  '/exit-surveys/:id/questions/reorder',
  validateJWT,
  requireRole('laboran'),
  exitSurveyController.reorderExitSurveyQuestions
);
router.put(
  '/exit-surveys/:id/questions/:questionId',
  validateJWT,
  requireRole('laboran'),
  exitSurveyController.updateExitSurveyQuestion
);
router.delete(
  '/exit-surveys/:id/questions/:questionId',
  validateJWT,
  requireRole('laboran'),
  exitSurveyController.deleteExitSurveyQuestion
);

// Permit Routes (#32 - Praktikan mengajukan izin tidak hadir)
router.post(
  '/permits',
  validateJWT,
  requireRole('mahasiswa', 'asisten_praktikum', 'asisten_praktikum_aktif'),
  permitController.submitPermit
);
router.post(
  '/permits/assistant',
  validateJWT,
  requireRole('asisten_praktikum', 'asisten_praktikum_aktif'),
  permitController.submitAssistantPermit
);
router.get(
  '/permits/pic/submissions',
  validateJWT,
  requireRole('pic', 'koordinator_praktikum', 'kaur_lab', 'asisten_praktikum_aktif'),
  permitController.getPraktikanPermitsForPic
);
router.get(
  '/permits/assistant/submissions',
  validateJWT,
  requireRole('pic', 'koordinator_praktikum'),
  permitController.getAssistantPermitsForCoordinator
);
router.patch(
  '/permits/assistant/:permitId/review',
  validateJWT,
  requireRole('pic', 'koordinator_praktikum'),
  permitController.reviewAssistantPermit
);
router.get(
  '/permits/statistics',
  validateJWT,
  requireRole('laboran'),
  permitController.getPermitStatisticsForLaboran
);
router.get('/permits/my-permits', validateJWT, permitController.getMyPermits);
router.patch(
  '/permits/:permitId/review',
  validateJWT,
  requireRole('pic', 'koordinator_praktikum', 'kaur_lab', 'asisten_praktikum_aktif'),
  permitController.reviewPermit
);

// Simulation Routes (#48 - Asisten pengurus membuat simulasi dan assign PIC)
router.post(
  '/simulations',
  validateJWT,
  requireRole('koordinator_praktikum', 'koordinator_asisten'),
  simulationController.createSimulation
);
router.get(
  '/simulations',
  validateJWT,
  requireRole('koordinator_praktikum', 'koordinator_asisten', 'asisten_praktikum_aktif'),
  simulationController.listSimulations
);
router.get(
  '/simulations/:simulationId',
  validateJWT,
  requireRole('koordinator_praktikum', 'koordinator_asisten', 'asisten_praktikum_aktif'),
  simulationController.getSimulationDetail
);
router.patch(
  '/simulations/:simulationId',
  validateJWT,
  requireRole('koordinator_praktikum', 'koordinator_asisten'),
  simulationController.updateSimulation
);
router.put(
  '/simulations/:simulationId',
  validateJWT,
  requireRole('koordinator_praktikum', 'koordinator_asisten'),
  simulationController.updateSimulation
);
router.delete(
  '/simulations/:simulationId',
  validateJWT,
  requireRole('koordinator_praktikum', 'koordinator_asisten'),
  simulationController.deleteSimulation
);
router.patch(
  '/simulations/:simulationId/open',
  validateJWT,
  requireRole('koordinator_praktikum'),
  simulationController.openSimulationSession
);
router.patch(
  '/simulations/:simulationId/close',
  validateJWT,
  requireRole('koordinator_praktikum'),
  simulationController.closeSimulationSession
);
router.post(
  '/simulations/:simulationId/result',
  validateJWT,
  requireRole('koordinator_praktikum'),
  ensureMulter,
  (req, res, next) => req._simulationResultUpload.array('attachments', 3)(req, res, next),
  simulationController.submitSimulationResult
);

router.delete(
  '/simulations/:simulationId/result/attachments/:attachmentId',
  validateJWT,
  requireRole('koordinator_praktikum'),
  simulationController.deleteSimulationResultAttachment
);
router.post(
  '/simulations/:simulationId/attendance-qr/generate',
  validateJWT,
  requireRole('koordinator_praktikum'),
  simulationController.generateSimulationAttendanceQR
);
/**
 * GET /simulations/:simulationId/attendance-qr/active
 * Ambil QR yang sedang aktif (tanpa generate baru).
 * Berguna saat halaman di-refresh dan koordinator ingin melihat QR yang masih berlaku.
 */
router.get(
  '/simulations/:simulationId/attendance-qr/active',
  validateJWT,
  requireRole('koordinator_praktikum'),
  simulationController.getActiveSimulationQrHandler
);
/**
 * GET /simulations/:simulationId/attendance-qr/stream
 * Server-Sent Events: QR berubah otomatis setiap 15 detik tanpa perlu polling dari frontend.
 * Koordinator buka halaman ini â†’ QR langsung muncul dan terus berputar selama koneksi aktif.
 */
router.get(
  '/simulations/:simulationId/attendance-qr/stream',
  validateJWT,
  requireRole('koordinator_praktikum'),
  simulationController.rollingQrStream
);
router.post(
  '/simulations/:simulationId/attendance/scan',
  validateJWT,
  requireRole('asisten_praktikum_aktif'),
  simulationController.scanSimulationAttendance
);
router.get(
  '/simulations/:simulationId/attendance',
  validateJWT,
  requireRole('koordinator_praktikum', 'kaur_lab', 'laboran'),
  simulationController.getSimulationAttendanceList
);

// Practicum Session Management (#19)
// Asisten Praktikum membuat jadwal sesi praktikum dan request approval ke Dosen.
// Registration master data helpers (hybrid design)
router.get(
  '/registration/practicums',
  validateJWT,
  requireRole('asisten_praktikum', 'asisten_praktikum_aktif', 'koordinator_praktikum', 'laboran', 'kaur_lab'),
  registrationMasterDataController.listRegistrationPracticums
);
router.get(
  '/registration/modules',
  validateJWT,
  requireRole('asisten_praktikum', 'asisten_praktikum_aktif', 'koordinator_praktikum', 'laboran', 'kaur_lab'),
  registrationMasterDataController.listRegistrationPracticumModules
);

router.get(
  '/registration/schedules',
  validateJWT,
  requireRole('asisten_praktikum', 'asisten_praktikum_aktif', 'koordinator_praktikum', 'laboran', 'kaur_lab'),
  registrationMasterDataController.listRegistrationSchedules
);

// Dummy integration: plotted practicum schedules from Registration module
router.get(
  '/registration/plot-schedules',
  validateJWT,
  requireRole(
    'koordinator_praktikum',
    'asisten_praktikum',
    'asisten_praktikum_aktif',
    'dosen',
    'laboran',
    'mahasiswa'
  ),
  registrationPlotScheduleController.listPlottedPracticumSchedules
);

// Practicum Operational Sessions (#19)
router.post(
  '/practicum-operational-sessions',
  validateJWT,
  requireRole('asisten_praktikum'),
  practicumOperationalSessionController.createOperationalSession
);
router.get(
  '/practicum-operational-sessions',
  validateJWT,
  requireRole(
    'koordinator_praktikum',
    'asisten_praktikum',
    'asisten_praktikum_aktif',
    'dosen',
    'laboran',
    'mahasiswa'
  ),
  practicumOperationalSessionController.listOperationalSessions
);
router.get(
  '/practicum-operational-sessions/grading/assistant',
  validateJWT,
  requireRole('asisten_praktikum', 'asisten_praktikum_aktif'),
  practicumAssessmentController.listAssistantGradingSessions
);
router.get(
  '/practicum-operational-sessions/:id/grading/students',
  validateJWT,
  requireRole('asisten_praktikum', 'asisten_praktikum_aktif'),
  practicumAssessmentController.listGradingStudents
);
router.get(
  '/practicum-operational-sessions/:id/grading/students/:studentUserId',
  validateJWT,
  requireRole('asisten_praktikum', 'asisten_praktikum_aktif'),
  practicumAssessmentController.getGradingForm
);
router.post(
  '/practicum-operational-sessions/:id/grading/students/:studentUserId',
  validateJWT,
  requireRole('asisten_praktikum', 'asisten_praktikum_aktif'),
  practicumAssessmentController.submitStudentGrade
);
router.get(
  '/practicum-grades/reporting',
  validateJWT,
  requireRole('koordinator_praktikum', 'asisten_praktikum', 'asisten_praktikum_aktif', 'dosen', 'laboran', 'kaur_lab'),
  practicumAssessmentController.listGradesForReporting
);
router.get(
  '/practicum-baps',
  validateJWT,
  requireRole('koordinator_praktikum', 'asisten_praktikum', 'asisten_praktikum_aktif', 'dosen', 'laboran', 'kaur_lab'),
  practicumBapController.listBaps
);
router.get(
  '/practicum-operational-sessions/:id/bap',
  validateJWT,
  requireRole('koordinator_praktikum', 'asisten_praktikum', 'asisten_praktikum_aktif', 'dosen', 'laboran', 'kaur_lab'),
  practicumBapController.getBapBySession
);
router.post(
  '/practicum-operational-sessions/:id/bap/generate',
  validateJWT,
  requireRole('koordinator_praktikum', 'asisten_praktikum', 'asisten_praktikum_aktif', 'laboran', 'kaur_lab'),
  practicumBapController.generateBapForSession
);
router.post(
  '/practicum-operational-sessions/:id/bap/signature-snapshots/refresh',
  validateJWT,
  requireRole('koordinator_praktikum', 'asisten_praktikum', 'asisten_praktikum_aktif', 'laboran', 'kaur_lab'),
  practicumBapController.refreshSignatureSnapshots
);
router.get(
  '/practicum-operational-sessions/:id/bap/export-excel',
  validateJWT,
  requireRole('koordinator_praktikum', 'asisten_praktikum', 'asisten_praktikum_aktif', 'dosen', 'laboran', 'kaur_lab'),
  practicumBapController.exportBapExcel
);
router.patch(
  '/practicum-operational-sessions/:id/bap/incident',
  validateJWT,
  requireRole('asisten_praktikum', 'asisten_praktikum_aktif'),
  practicumBapController.updateIncidentNotes
);
router.post(
  '/practicum-operational-sessions/:id/bap/signature/generate-qr',
  validateJWT,
  requireRole('asisten_praktikum', 'asisten_praktikum_aktif', 'koordinator_praktikum', 'laboran', 'kaur_lab'),
  practicumBapController.generateLecturerSignatureQr
);
router.get(
  '/practicum-operational-sessions/:id/bap/signature/active-qr',
  validateJWT,
  requireRole('asisten_praktikum', 'asisten_praktikum_aktif', 'koordinator_praktikum', 'laboran', 'kaur_lab'),
  practicumBapController.getActiveLecturerSignatureQr
);
router.post(
  '/practicum-operational-sessions/:id/bap/signature/scan',
  validateJWT,
  requireRole('dosen'),
  practicumBapController.signBapByLecturer
);
router.get(
  '/practicum-operational-sessions/:id/bap/export-csv',
  validateJWT,
  requireRole('koordinator_praktikum', 'asisten_praktikum', 'asisten_praktikum_aktif', 'dosen', 'laboran', 'kaur_lab'),
  practicumBapController.exportBapCsv
);
router.get(
  '/practicum-operational-sessions/:id/bap/export-pdf',
  validateJWT,
  requireRole('koordinator_praktikum', 'asisten_praktikum', 'asisten_praktikum_aktif', 'dosen', 'laboran', 'kaur_lab'),
  practicumBapController.exportBapPdf
);
router.patch(
  '/practicum-operational-sessions/:id/bap/incident',
  validateJWT,
  requireRole('asisten_praktikum', 'asisten_praktikum_aktif'),
  practicumBapController.updateIncidentNotes
);
router.patch(
  '/practicum-operational-sessions/:id/bap/laboran-review',
  validateJWT,
  requireRole('laboran', 'kaur_lab'),
  practicumBapController.reviewByLaboran
);
router.get(
  '/practicum-operational-sessions/:id',
  validateJWT,
  requireRole(
    'koordinator_praktikum',
    'asisten_praktikum',
    'asisten_praktikum_aktif',
    'dosen',
    'laboran',
    'mahasiswa'
  ),
  practicumOperationalSessionController.getOperationalSessionDetail
);
router.post(
  '/practicum-operational-sessions/:id/join',
  validateJWT,
  requireRole('asisten_praktikum', 'asisten_praktikum_aktif'),
  practicumOperationalSessionController.joinOperationalSessionViaQr
);
router.patch(
  '/practicum-operational-sessions/:id/status',
  validateJWT,
  requireRole('asisten_praktikum', 'asisten_praktikum_aktif', 'koordinator_praktikum'),
  practicumOperationalSessionController.updateOperationalSessionStatus
);
router.post(
  '/practicum-operational-sessions/:id/start',
  validateJWT,
  requireRole('asisten_praktikum', 'asisten_praktikum_aktif'),
  practicumOperationalSessionController.startOperationalSession
);
router.post(
  '/practicum-operational-sessions/:id/complete',
  validateJWT,
  requireRole('asisten_praktikum', 'asisten_praktikum_aktif'),
  practicumOperationalSessionController.completeOperationalSession
);
router.get(
  '/practicum-operational-sessions/:id/activation-qr',
  validateJWT,
  requireRole('asisten_praktikum', 'asisten_praktikum_aktif'),
  practicumOperationalSessionQrController.generateOperationalSessionActivationQr
);
router.post(
  '/practicum-operational-sessions/:id/attendance-qr/generate',
  validateJWT,
  requireRole('asisten_praktikum', 'asisten_praktikum_aktif'),
  practicumOperationalSessionQrController.generateOperationalSessionQr
);
router.get(
  '/practicum-operational-sessions/:id/attendance-qr/active',
  validateJWT,
  requireRole('asisten_praktikum', 'asisten_praktikum_aktif'),
  practicumOperationalSessionQrController.getActiveOperationalSessionQr
);
router.post(
  '/practicum-operational-sessions/:id/attendance/check-in',
  validateJWT,
  requireRole('mahasiswa'),
  practicumOperationalSessionAttendanceController.checkInOperationalSessionAttendance
);
router.get(
  '/practicum-operational-sessions/attendance/me',
  validateJWT,
  requireRole('mahasiswa'),
  practicumOperationalSessionAttendanceController.listMyOperationalSessionAttendances
);
router.get(
  '/practicum-operational-sessions/:id/attendance/:attendanceId/plot/history',
  validateJWT,
  requireRole('asisten_praktikum', 'asisten_praktikum_aktif'),
  practicumOperationalSessionAttendanceController.listOperationalSessionAttendancePlotHistory
);
router.patch(
  '/practicum-operational-sessions/:id/attendance/plot/bulk',
  validateJWT,
  requireRole('asisten_praktikum', 'asisten_praktikum_aktif'),
  practicumOperationalSessionAttendanceController.bulkReassignOperationalSessionAttendancePlot
);
router.patch(
  '/practicum-operational-sessions/:id/attendance/:attendanceId/plot',
  validateJWT,
  requireRole('asisten_praktikum', 'asisten_praktikum_aktif'),
  practicumOperationalSessionAttendanceController.reassignOperationalSessionAttendancePlot
);
router.get(
  '/practicum-operational-sessions/:id/attendance',
  validateJWT,
  requireRole('asisten_praktikum', 'asisten_praktikum_aktif', 'koordinator_praktikum', 'mahasiswa'),
  practicumOperationalSessionAttendanceController.listOperationalSessionAttendances
);

// Deprecated: practicum-sessions (jadwal dibuat di Conduct) has been removed.

export default router;

