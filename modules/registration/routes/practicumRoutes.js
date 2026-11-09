import express from 'express';
import * as ctrl from '../controllers/practicumController.js';
import * as enrollmentCtrl from '../controllers/enrollmentController.js';
import * as enrollmentImportCtrl from '../controllers/enrollmentImportController.js';
import * as moduleAssessmentCtrl from '../controllers/moduleAssessmentController.js';
import { requireKoordinatorPraktikum } from '../middleware/practicumModuleAuth.js';
import { requireRole } from '../../user-management/middleware/roleValidator.js';
import moduleRoutes from './practicumModuleRoutes.js';
const router = express.Router({ mergeParams: true });

async function ensureMulter(req, res, next) {
  try {
    const multerMod = await import('multer').then((m) => m.default || m);
    const storage = multerMod.memoryStorage();
    const upload = multerMod({ storage, limits: { fileSize: 10 * 1024 * 1024 } });
    return upload.single('enrollment_file')(req, res, next);
  } catch (err) {
    err.message = err.message || 'Upload handler gagal diinisialisasi';
    return next(err);
  }
}

/**
 * @openapi
 * /api/registration/practicums:
 *   get:
 *     tags: [Registration]
 *     summary: List practicums
 *     parameters:
 *       - in: query
 *         name: laboratory_id
 *         schema:
 *           type: string
 *         description: Filter by laboratory id
 *       - in: query
 *         name: periode
 *         schema:
 *           type: string
 *         description: |
 *           Filter by periode label (mis. 2526-2). Tanpa parameter = semua periode.
 *           Nilai khusus `active` memakai periode aktif dari GET /periode/active.
 *     responses:
 *       200:
 *         description: OK
 */
router.get('/', ctrl.list);
router.get(
  '/enrollments/template/download',
  requireRole('kaur_lab', 'laboran', 'koordinator_praktikum'),
  enrollmentImportCtrl.downloadTemplate
);
router.get('/:id', ctrl.getById);

router.post('/', ctrl.create);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);

// Enroll current user to a practicum (POST /practicums/:id/enroll)
router.post('/:practicumId/enroll', enrollmentCtrl.enrollWithPracticumId);
router.get(
  '/:practicumId/enrollments',
  requireRole('kaur_lab', 'laboran', 'koordinator_praktikum'),
  enrollmentCtrl.listByPracticum
);
router.post(
  '/:practicumId/enrollments/import',
  requireRole('kaur_lab', 'laboran', 'koordinator_praktikum'),
  ensureMulter,
  enrollmentImportCtrl.importEnrollments
);

// Komponen penilaian (bobot per modul) — hanya koordinator_praktikum (GET + PUT)
router.get(
  '/:practicumId/module-assessment-config',
  requireKoordinatorPraktikum(),
  moduleAssessmentCtrl.getConfig
);
router.put(
  '/:practicumId/module-assessment-config',
  requireKoordinatorPraktikum(),
  moduleAssessmentCtrl.putConfig
);

// Mount module routes under /practicums/:practicumId/modules
router.use('/:practicumId/modules', moduleRoutes);

export default router;
