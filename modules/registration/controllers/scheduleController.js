import * as scheduleService from '../services/scheduleService.js';
import { logger } from '../../../core/utils/logger.js';

/**
 * Schedule Controller
 * Handle HTTP requests untuk schedule management
 */

/**
 * List schedules
 * GET /schedules?module_id=xxx&filter_by_me=true
 * Access control: 
 * - If user only has asisten_praktikum or asisten_praktikum_aktif role, they can only see schedules where they are assigned as assistant
 * - If filter_by_me=true, all users (including koordinator) will only see schedules related to them (as assistant or with booking)
 */
export async function list(req, res, next) {
  try {
    const { module_id, filter_by_me, periode } = req.query;
    const userId = req.user?.id ? String(req.user.id) : null;
    const periodeFilter = periode != null && String(periode).trim() !== ''
      ? String(periode).trim()
      : 'active';
    
    // If filter_by_me is true, always filter by user
    // Otherwise, use role-based filtering logic
    const shouldFilterByUser = filter_by_me === 'true' || filter_by_me === '1';
    
    const schedules = await scheduleService.getAllSchedules({
      moduleId: module_id,
      userId,
      forceFilterByUser: shouldFilterByUser,
      periode: periodeFilter,
    });
    res.json({ success: true, data: schedules });
  } catch (err) {
    if (err.code === 'ACTIVE_PERIODE_NOT_CONFIGURED') {
      return res.status(400).json({ success: false, message: err.message });
    }
    logger.error('Error in schedule list controller:', err);
    next(err);
  }
}

/**
 * Get schedule by id
 * GET /schedules/:id
 */
export async function getById(req, res, next) {
  try {
    const { id } = req.params;
    const schedule = await scheduleService.getScheduleById(id);
    res.json({ success: true, data: schedule });
  } catch (err) {
    if (err.message === 'Schedule tidak ditemukan') {
      return res.status(404).json({ success: false, message: err.message });
    }
    logger.error('Error in schedule getById controller:', err);
    next(err);
  }
}

/**
 * Create schedule
 * POST /schedules
 * Body: { module_id, start_time, end_time, venue?, assistants[] }
 */
export async function create(req, res, next) {
  try {
    const { module_id, start_time, end_time, venue, assistants } = req.body;
    
    // Validation
    if (!module_id) {
      return res.status(400).json({ 
        success: false, 
        message: 'module_id is required' 
      });
    }
    
    if (!start_time) {
      return res.status(400).json({ 
        success: false, 
        message: 'start_time is required' 
      });
    }
    
    if (!end_time) {
      return res.status(400).json({ 
        success: false, 
        message: 'end_time is required' 
      });
    }
    
    if (!Array.isArray(assistants)) {
      return res.status(400).json({ 
        success: false, 
        message: 'assistants must be an array' 
      });
    }
    
    // Get user ID from request (user yang membuat schedule)
    const createdBy = req.user?.id ? String(req.user.id) : null;
    
    const schedule = await scheduleService.createSchedule({
      module_id,
      start_time,
      end_time,
      venue,
      assistants: assistants || [],
      createdBy, // Pass creator for individual mentoring auto-assignment
    });
    
    res.status(201).json({ success: true, data: schedule });
  } catch (err) {
    if (err.message.includes('tidak ditemukan') || 
        err.message.includes('tidak memiliki role') ||
        err.message.includes('bukan asisten aktif terdaftar') ||
        err.message.includes('harus diisi') ||
        err.message.includes('harus setelah') ||
        err.message.includes('tidak boleh dibuat pada hari Minggu') ||
        err.message.includes('tidak boleh dimulai sebelum jam 6 pagi') ||
        err.message.includes('tidak boleh berakhir setelah jam 8 malam') ||
        err.message.includes('tidak boleh dimulai setelah jam 8 malam')) {
      return res.status(400).json({ success: false, message: err.message });
    }
    logger.error('Error in schedule create controller:', err);
    next(err);
  }
}

/**
 * Update schedule
 * PUT /schedules/:id
 * Body: { module_id?, start_time?, end_time?, venue?, week_number?, assistants[]? }
 */
export async function update(req, res, next) {
  try {
    const { id } = req.params;
    const { module_id, start_time, end_time, venue, week_number, assistants } = req.body;
    
    // Validation
    if (assistants !== undefined && !Array.isArray(assistants)) {
      return res.status(400).json({ 
        success: false, 
        message: 'assistants must be an array' 
      });
    }
    
    const updatedBy = req.user?.id ? String(req.user.id) : null;

    const schedule = await scheduleService.updateSchedule(id, {
      module_id,
      start_time,
      end_time,
      venue,
      week_number,
      assistants,
      updatedBy,
    });
    
    res.json({ success: true, data: schedule });
  } catch (err) {
    if (err.message === 'Schedule tidak ditemukan' || 
        err.message.includes('tidak memiliki role') ||
        err.message.includes('tidak bisa diupdate') ||
        err.message.includes('harus setelah') ||
        err.message.includes('tidak boleh dibuat pada hari Minggu') ||
        err.message.includes('tidak boleh dimulai sebelum jam 6 pagi') ||
        err.message.includes('tidak boleh berakhir setelah jam 8 malam') ||
        err.message.includes('tidak boleh dimulai setelah jam 8 malam')) {
      return res.status(400).json({ success: false, message: err.message });
    }
    logger.error('Error in schedule update controller:', err);
    next(err);
  }
}

/**
 * Delete schedule
 * DELETE /schedules/:id
 */
export async function remove(req, res, next) {
  try {
    const { id } = req.params;
    await scheduleService.deleteSchedule(id);
    res.json({ success: true, message: 'Schedule deleted successfully' });
  } catch (err) {
    if (err.message === 'Schedule tidak ditemukan') {
      return res.status(404).json({ success: false, message: err.message });
    }
    if (err.message.includes('tidak bisa dihapus')) {
      return res.status(400).json({ success: false, message: err.message });
    }
    logger.error('Error in schedule remove controller:', err);
    next(err);
  }
}

/**
 * Get available assistants
 * GET /schedules/assistants
 * Helper endpoint untuk mendapatkan daftar asisten yang tersedia
 */
export async function getAvailableAssistants(req, res, next) {
  try {
    const practicumId = req.query?.practicum_id;
    if (!practicumId) {
      return res.status(400).json({
        success: false,
        message: 'practicum_id wajib diisi',
      });
    }

    const assistants = await scheduleService.getAvailableAssistants(practicumId);
    res.json({ success: true, data: assistants });
  } catch (err) {
    logger.error('Error in getAvailableAssistants controller:', err);
    next(err);
  }
}

