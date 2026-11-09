import express from 'express';
import * as ctrl from '../controllers/registrationOperationalSettingsController.js';
import { requireRole } from '../../user-management/middleware/roleValidator.js';

const router = express.Router();

const writeRoles = ['kaur_lab', 'koordinator_praktikum', 'laboran'];

router.get('/', ctrl.getBundle);

router.put('/settings/:key', requireRole(...writeRoles), ctrl.upsertSetting);
router.delete('/settings/:key', requireRole(...writeRoles), ctrl.removeSetting);

router.get('/holidays', ctrl.listHolidays);
router.post('/holidays', requireRole(...writeRoles), ctrl.createHoliday);
router.delete('/holidays/:id', requireRole(...writeRoles), ctrl.removeHoliday);

export default router;
