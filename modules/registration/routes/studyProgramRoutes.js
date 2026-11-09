import express from 'express';
import * as ctrl from '../controllers/studyProgramController.js';
// Role requirement temporarily removed to allow Swagger create testing

const router = express.Router();

/**
 * @openapi
 * /api/registration/study-programs:
 *   get:
 *     tags: [Registration]
 *     summary: List study programs
 *     responses:
 *       200:
 *         description: OK
 */
router.get('/', ctrl.list);

router.get('/:id', ctrl.getById);

// protected: only admin or staff (adjust roles as needed)
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);

export default router;
