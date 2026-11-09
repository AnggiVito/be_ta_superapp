import express from 'express';
import * as ctrl from '../controllers/scheduleController.js';
import * as bookingCtrl from '../controllers/scheduleBookingController.js';
import * as importCtrl from '../controllers/scheduleImportController.js';
import { requireRole } from '../../user-management/middleware/roleValidator.js';

const router = express.Router();

// Multer middleware for Excel file upload (memory storage)
async function ensureMulter(req, res, next) {
  try {
    const multerMod = await import('multer').then(m => m.default || m);
    const storage = multerMod.memoryStorage();
    const upload = multerMod({ storage, limits: { fileSize: 10 * 1024 * 1024 } });
    return upload.single('schedule_file')(req, res, next);
  } catch (err) {
    err.message = err.message || 'Upload handler gagal diinisialisasi';
    return next(err);
  }
}

// Schedule template & import routes - must be before /:id routes
router.get('/template/download', importCtrl.downloadTemplate);
router.post(
  '/import',
  requireRole('kaur_lab', 'laboran', 'asisten_praktikum_aktif'),
  ensureMulter,
  importCtrl.importSchedule
);

// Get available assistants (helper endpoint) - must be before /:id routes
router.get('/assistants', ctrl.getAvailableAssistants);

// Booking routes - must be before /:id routes
router.get('/bookings/my-bookings', bookingCtrl.getMyBookings);
router.get('/bookings/my-assigned-schedules', requireRole('asisten_praktikum_aktif'), bookingCtrl.getMyAssignedSchedules);
router.get('/bookings/:bookingId', bookingCtrl.getBookingById);
router.delete('/bookings/:bookingId', bookingCtrl.cancelBooking);

// Schedule slot routes - must be before /:id routes
router.get('/:scheduleId/slots/available', bookingCtrl.getAvailableSlots);
router.get('/:scheduleId/slots', bookingCtrl.getScheduleWithSlots);
// Create booking - restricted to mahasiswa only
router.post('/:scheduleId/slots/:slotId/book', requireRole('mahasiswa'), bookingCtrl.bookSlot);

// List schedules (optionally filtered by module_id via query)
// Accessible by all authenticated users
router.get('/', ctrl.list);

// Create schedule
// Restricted to kaur_lab, laboran, and asisten_praktikum_aktif
router.post('/', requireRole('kaur_lab', 'laboran', 'asisten_praktikum_aktif'), ctrl.create);

// Get schedule by id - must be after all specific routes
// Restricted to kaur_lab, laboran, and asisten_praktikum_aktif
router.get('/:id', requireRole('kaur_lab', 'laboran', 'asisten_praktikum_aktif'), ctrl.getById);

// Update schedule
// Restricted to kaur_lab, laboran, and asisten_praktikum_aktif
router.put('/:id', requireRole('kaur_lab', 'laboran', 'asisten_praktikum_aktif'), ctrl.update);

// Delete schedule
// Restricted to kaur_lab, laboran, and asisten_praktikum_aktif
router.delete('/:id', requireRole('kaur_lab', 'laboran', 'asisten_praktikum_aktif'), ctrl.remove);

export default router;

