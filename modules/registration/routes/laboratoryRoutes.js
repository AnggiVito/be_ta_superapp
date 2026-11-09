import express from 'express';
import * as ctrl from '../controllers/laboratoryController.js';
const router = express.Router();

/**
 * @openapi
 * /api/registration/laboratories:
 *   get:
 *     tags: [Registration]
 *     summary: List laboratories
 *     parameters:
 *       - in: query
 *         name: study_program_id
 *         schema:
 *           type: string
 *         description: Filter by study program id
 *     responses:
 *       200:
 *         description: OK
 */
router.get('/', ctrl.list);
router.get('/:id', ctrl.getById);

router.post('/', ctrl.create);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);

export default router;
