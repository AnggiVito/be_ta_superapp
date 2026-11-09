import express from 'express';
import * as ctrl from '../controllers/enrollmentController.js';

const router = express.Router({ mergeParams: true });

/**
 * POST /api/registration/enrollments
 * Body: { practicum_id, role? }
 */
router.post('/', ctrl.enroll);

/**
 * GET /api/registration/enrollments
 * List current user's enrollments
 */
router.get('/', ctrl.listMyEnrollments);

/**
 * DELETE /api/registration/enrollments/:id
 * Cancel enrollment (only owner)
 */
router.delete('/:id', ctrl.cancel);

export default router;
