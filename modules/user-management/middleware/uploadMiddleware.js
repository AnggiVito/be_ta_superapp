/**
 * Upload Middleware
 * Handle file upload dengan multer untuk TTD
 */

import { getAllowedMimeTypes, validateMimeType } from '../services/fileStorageService.js';

// NOTE: multer is an optional runtime dependency for file uploads. Import it lazily
// so the application can still start even if multer isn't installed in the image.
let cachedUploadMiddleware = null;

// File filter untuk validasi MIME type
const fileFilter = (req, file, cb) => {
  if (validateMimeType(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type tidak didukung. Format yang didukung: PNG, JPG, JPEG, PDF`), false);
  }
};

async function ensureUploadMiddleware() {
  if (cachedUploadMiddleware) return cachedUploadMiddleware;

  // dynamic import
  const multerMod = await import('multer').then(m => m.default || m);
  const storage = multerMod.memoryStorage();
  const uploadInstance = multerMod({
    storage,
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 },
  });

  cachedUploadMiddleware = uploadInstance.single('ttd');
  return cachedUploadMiddleware;
}

/**
 * Middleware wrapper yang memastikan multer di-import secara dinamis.
 * Jika multer tidak tersedia, middleware akan memanggil next dengan error.
 */
export const uploadTTDMiddleware = (req, res, next) => {
  ensureUploadMiddleware()
    .then(fn => fn(req, res, next))
    .catch(err => {
      // jika multer tidak ter-install, kirim 500 dengan pesan informatif
      err.message = err.message || 'Upload handler gagal diinisialisasi';
      next(err);
    });
};

/**
 * Error handler untuk multer errors
 */
export function handleUploadError(err, req, res, next) {
  if (!err) {
    return next();
  }

  // Handle multer errors
  if (err.name === 'MulterError' || err.code === 'LIMIT_FILE_SIZE') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ 
        success: false, 
        message: 'File terlalu besar. Maksimal 5MB' 
      });
    }
    return res.status(400).json({ 
      success: false, 
      message: err.message || 'Error uploading file' 
    });
  }

  // Handle file filter errors (from fileFilter callback)
  if (err.message && err.message.includes('File type tidak didukung')) {
    return res.status(400).json({ 
      success: false, 
      message: err.message 
    });
  }

  // Pass other errors to next error handler
  next(err);
}

