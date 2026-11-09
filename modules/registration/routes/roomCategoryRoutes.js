import express from 'express';
import * as ctrl from '../controllers/roomCategoryController.js';
import { requireRole } from '../../user-management/middleware/roleValidator.js';

const router = express.Router();

const writeRoles = ['kaur_lab', 'laboran'];

router.get('/', ctrl.list);
router.get('/:slug', ctrl.getBySlug);

router.post('/', requireRole(...writeRoles), ctrl.create);
router.put('/:slug', requireRole(...writeRoles), ctrl.update);
router.delete('/:slug', requireRole(...writeRoles), ctrl.remove);

export default router;
