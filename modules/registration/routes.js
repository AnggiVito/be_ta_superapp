import express from 'express';
import { validateJWT } from '../../core/auth/jwt-validator.js';
import studyProgramRoutes from './routes/studyProgramRoutes.js';
import laboratoryRoutes from './routes/laboratoryRoutes.js';
import practicumRoutes from './routes/practicumRoutes.js';
import scheduleRoutes from './routes/scheduleRoutes.js';
import ksmRoutes from './routes/ksmRoutes.js';
import enrollmentRoutes from './routes/enrollmentRoutes.js';
import operationalSettingsRoutes from './routes/operationalSettingsRoutes.js';
import activePeriodeRoutes from './routes/activePeriodeRoutes.js';
import activeAssistantRoutes from './routes/activeAssistantRoutes.js';
import roomCategoryRoutes from './routes/roomCategoryRoutes.js';
import * as practicumModuleCtrl from './controllers/practicumModuleController.js';

const router = express.Router();

/**
 * Modul Registrasi Routes
 * Source of truth untuk master data (Lab, Prodi, Praktikum, Jadwal)
 */

// Health check untuk modul
router.get('/health', (req, res) => {
  res.json({
    success: true,
    module: 'registration',
    message: 'Registration module is running',
  });
});

// Protected routes
router.get('/required-room-categories', validateJWT, practicumModuleCtrl.listRequiredRoomCategories);
router.use('/room-categories', validateJWT, roomCategoryRoutes);
router.use('/study-programs', validateJWT, studyProgramRoutes);
router.use('/laboratories', validateJWT, laboratoryRoutes);
router.use('/practicums', validateJWT, practicumRoutes);
router.use('/schedules', validateJWT, scheduleRoutes);

// Tambahan fitur
router.use('/ksm', validateJWT, ksmRoutes);
router.use('/enrollments', validateJWT, enrollmentRoutes);
router.use('/operational-settings', validateJWT, operationalSettingsRoutes);
router.use('/periode/active', validateJWT, activePeriodeRoutes);
router.use('/active-assistants', validateJWT, activeAssistantRoutes);

// TODO: Implement other routes (students...)

export default router;