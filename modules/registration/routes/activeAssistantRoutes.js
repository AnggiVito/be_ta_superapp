import express from 'express';
import * as ctrl from '../controllers/activeAssistantController.js';
import { requireRole } from '../../user-management/middleware/roleValidator.js';

const router = express.Router();

const manageRoles = ['kaur_lab', 'laboran'];

async function ensureMulter(req, res, next) {
  try {
    const multerMod = await import('multer').then((m) => m.default || m);
    const storage = multerMod.memoryStorage();
    const upload = multerMod({ storage, limits: { fileSize: 10 * 1024 * 1024 } });
    return upload.single('assistant_file')(req, res, next);
  } catch (err) {
    err.message = err.message || 'Upload handler gagal diinisialisasi';
    return next(err);
  }
}

router.get('/template/download', requireRole(...manageRoles), ctrl.downloadTemplate);
router.get('/', requireRole(...manageRoles), ctrl.listActiveAssistants);
router.post(
  '/import',
  requireRole(...manageRoles),
  ensureMulter,
  ctrl.importActiveAssistants
);

export default router;
