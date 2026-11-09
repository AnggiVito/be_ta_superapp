import express from 'express';
import * as ctrl from '../controllers/practicumModuleController.js';
import { requirePracticumModuleAccess } from '../middleware/practicumModuleAuth.js';

const router = express.Router({ mergeParams: true });

// List modules (optionally filtered by practicum via nested param or query)
// Accessible by all authenticated users
router.get('/', ctrl.list);
router.get('/:id', requirePracticumModuleAccess(), ctrl.getById);

// Create / Update / Delete
// Restricted to kaur_lab, laboran, and koordinator praktikum (asisten_praktikum_aktif yang juga koordinator)
router.post('/', requirePracticumModuleAccess(), ctrl.create);
router.put('/:id', requirePracticumModuleAccess(), ctrl.update);
router.delete('/:id', requirePracticumModuleAccess(), ctrl.remove);

export default router;
