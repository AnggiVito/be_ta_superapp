import * as enrollmentService from '../services/enrollmentService.js';
import { logger } from '../../../core/utils/logger.js';

export async function enroll(req, res) {
  try {
    const practicumId = req.body.practicum_id || req.params.practicumId;
    if (!practicumId) {
      return res.status(400).json({ success: false, message: 'practicum_id is required' });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    // Role is determined from the user's assigned roles (role service).
    // Clients should only provide `practicum_id`; role field is ignored.
    const enrollment = await enrollmentService.enroll(practicumId, userId);
    return res.status(201).json({ success: true, data: enrollment });
  } catch (error) {
    logger.error('enroll controller error:', error);
    return res.status(400).json({ success: false, message: error.message || 'Enrollment failed' });
  }
}

export async function enrollWithPracticumId(req, res) {
  // support mounting under /practicums/:practicumId/enroll
  req.params.practicumId = req.params.practicumId || req.params.id || req.params.practicumId;
  return enroll(req, res);
}

export async function listMyEnrollments(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const enrollments = await enrollmentService.getUserEnrollments(userId);
    return res.json({ success: true, data: enrollments });
  } catch (error) {
    logger.error('listMyEnrollments error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Failed to get enrollments' });
  }
}

/**
 * GET /api/registration/practicums/:practicumId/enrollments
 * List all enrollments for a practicum (admin view after Excel import).
 */
export async function listByPracticum(req, res) {
  try {
    const practicumId = req.params.practicumId;
    if (!practicumId) {
      return res.status(400).json({ success: false, message: 'practicum_id wajib diisi' });
    }

    const role = req.query?.role ? String(req.query.role).trim() : undefined;
    const enrollments = await enrollmentService.getPracticumEnrollments(practicumId, { role });
    return res.json({ success: true, data: enrollments });
  } catch (error) {
    logger.error('listByPracticum error:', error);
    const status = error.message === 'Practicum tidak ditemukan' ? 404 : 500;
    return res.status(status).json({ success: false, message: error.message || 'Failed to get enrollments' });
  }
}

export async function cancel(req, res) {
  try {
    const enrollmentId = req.params.id;
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    await enrollmentService.cancelEnrollment(enrollmentId, userId);
    return res.json({ success: true, message: 'Enrollment cancelled' });
  } catch (error) {
    logger.error('cancel enrollment error:', error);
    return res.status(400).json({ success: false, message: error.message || 'Failed to cancel enrollment' });
  }
}
