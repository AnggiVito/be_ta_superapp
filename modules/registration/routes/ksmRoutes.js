import express from 'express';
import { validateJWT } from '../../../core/auth/jwt-validator.js';
import { uploadKsmHandler, getKsmFileHandler, getMyKsmImportHandler, listKsmImportsHandler, getKsmImportHandler, updateKsmImportHandler, deleteKsmImportHandler, updateMyKsmImportHandler, deleteMyKsmImportHandler, listKsmImportsByModuleHandler, listAllKsmImportsHandler, listPublicKsmImportsHandler } from '../controllers/ksmController.js';

const router = express.Router();

// Dynamic multer import to avoid startup failure if multer not installed
async function ensureMulter(req, res, next) {
  try {
    const multerMod = await import('multer').then(m => m.default || m);
    // store in memory then controller saves to disk
    const storage = multerMod.memoryStorage();
    const upload = multerMod({ storage, limits: { fileSize: 10 * 1024 * 1024 } });
    return upload.single('ksm_file')(req, res, next);
  } catch (err) {
    err.message = err.message || 'Upload handler gagal diinisialisasi';
    return next(err);
  }
}

// POST /api/registration/ksm/upload
router.post('/upload', validateJWT, ensureMulter, uploadKsmHandler);

// GET /api/registration/ksm/:importId/file (protected)
router.get('/:importId/file', validateJWT, getKsmFileHandler);

// GET /api/registration/ksm/imports/me
router.get('/imports/me', validateJWT, getMyKsmImportHandler);
// PUT /api/registration/ksm/imports/me (replace current user's KSM)
router.put('/imports/me', validateJWT, ensureMulter, updateMyKsmImportHandler);
// DELETE /api/registration/ksm/imports/me (delete current user's KSM)
router.delete('/imports/me', validateJWT, deleteMyKsmImportHandler);

// New: GET all imports for a module (role-based for assistants)
router.get('/imports/module/:moduleId', validateJWT, listKsmImportsByModuleHandler);

// New: GET all imports across modules (assistants only)
router.get('/imports/all', validateJWT, listAllKsmImportsHandler);

// New: GET public imports (mahasiswa/asisten) visible to any authenticated user
router.get('/imports/public', validateJWT, listPublicKsmImportsHandler);

// GET /api/registration/ksm/imports/:id
router.get('/imports/:id', validateJWT, getKsmImportHandler);

// PUT /api/registration/ksm/imports/:id (allow file replace)
router.put('/imports/:id', validateJWT, ensureMulter, updateKsmImportHandler);

// DELETE /api/registration/ksm/imports/:id
router.delete('/imports/:id', validateJWT, deleteKsmImportHandler);

// GET /api/registration/ksm/imports?moduleId=xxx
router.get('/imports', validateJWT, listKsmImportsHandler);

// New: GET all imports for a module (role-based for assistants)
router.get('/imports/module/:moduleId', validateJWT, listKsmImportsByModuleHandler);

export default router;
