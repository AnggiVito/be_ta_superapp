import express from 'express';
import * as ctrl from '../controllers/activePeriodeController.js';
import { requireRole } from '../../user-management/middleware/roleValidator.js';

const router = express.Router();

const writeRoles = ['kaur_lab', 'koordinator_praktikum', 'laboran'];

/** GET — periode yang sedang aktif (semua user dengan JWT valid) */
router.get('/', ctrl.getActivePeriode);

/** PUT — set periode aktif (admin operasional) */
router.put('/', requireRole(...writeRoles), ctrl.setActivePeriode);

export default router;
