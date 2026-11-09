import * as Model from '../models/practicumModuleModel.js';
import * as scheduleModel from '../models/scheduleModel.js';
import * as scheduleSlotService from '../services/scheduleSlotService.js';
import { logger } from '../../../core/utils/logger.js';
import * as roomCategoryService from '../services/roomCategoryService.js';
import { validateWeekNumber } from '../utils/weekNumberValidation.js';

export async function listRequiredRoomCategories(req, res, next) {
  try {
    const data = await roomCategoryService.listRequiredRoomCategoryOptions();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function list(req, res, next) {
  try {
    const { practicumId } = req.params;
    const { practicum_id: qPracticumId } = req.query;
    let rows;
    // support both /practicums/:practicumId/modules and /practicum-modules?practicum_id=
    const filterPracticum = practicumId || qPracticumId;
    if (filterPracticum) rows = await Model.findByPracticum(filterPracticum);
    else rows = await Model.findAll();
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
}

export async function getById(req, res, next) {
  try {
    const { id } = req.params;
    const row = await Model.findById(id);
    if (!row) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: row });
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const { practicumId } = req.params;
    const payload = req.body;
    // if nested under practicum route, ensure practicum_id set
    if (practicumId) payload.practicum_id = practicumId;
    // Basic validation
    if (!payload || !payload.practicum_id || !payload.code || !payload.name) {
      return res.status(400).json({
        success: false,
        message:
          'practicum_id, code, name, required_room_category, and week_number are required',
      });
    }

    const categoryCheck = await roomCategoryService.validateRequiredRoomCategory(
      payload.required_room_category,
      { required: true }
    );
    if (!categoryCheck.ok) {
      return res.status(400).json({ success: false, message: categoryCheck.message });
    }
    payload.required_room_category = categoryCheck.value;

    const weekCheck = validateWeekNumber(payload.week_number, { required: true });
    if (!weekCheck.ok) {
      return res.status(400).json({ success: false, message: weekCheck.message });
    }
    payload.week_number = weekCheck.value;

    const created = await Model.create(payload);
    if (!created) return res.status(400).json({ success: false, message: 'Unable to create module' });
    res.status(201).json({ success: true, data: created });
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const { id, practicumId } = req.params;
    const payload = req.body;
    if (practicumId) payload.practicum_id = practicumId;
    
    // Get module before update to check if it's becoming individual mentoring
    const oldModule = await Model.findById(id);
    if (!oldModule) {
      return res.status(404).json({ success: false, message: 'Module tidak ditemukan' });
    }

    if (payload.required_room_category !== undefined) {
      const categoryCheck = await roomCategoryService.validateRequiredRoomCategory(
        payload.required_room_category,
        { required: true }
      );
      if (!categoryCheck.ok) {
        return res.status(400).json({ success: false, message: categoryCheck.message });
      }
      payload.required_room_category = categoryCheck.value;
    } else if (!oldModule.required_room_category) {
      return res.status(400).json({
        success: false,
        message:
          'required_room_category wajib diisi untuk modul yang belum memiliki kategori ruangan',
      });
    }

    if (payload.week_number !== undefined) {
      const weekCheck = validateWeekNumber(payload.week_number, { required: true });
      if (!weekCheck.ok) {
        return res.status(400).json({ success: false, message: weekCheck.message });
      }
      payload.week_number = weekCheck.value;
    } else if (oldModule.week_number == null) {
      return res.status(400).json({
        success: false,
        message: 'week_number wajib diisi untuk modul yang belum memiliki minggu pelaksanaan',
      });
    }

    const updated = await Model.update(id, payload);
    
    // Auto-generate slots if module is updated to individual mentoring
    // Check if module is becoming or already is individual mentoring after update
    const wasIndividualMentoring = oldModule.is_individual_mentoring === true;
    const isNowIndividualMentoring = updated.is_individual_mentoring === true;
    const hasDuration = updated.mentoring_duration_minutes && updated.mentoring_duration_minutes > 0;
    
    // Check if duration was changed
    const durationChanged = payload.mentoring_duration_minutes !== undefined && 
                           payload.mentoring_duration_minutes !== oldModule.mentoring_duration_minutes;
    
    // Generate slots if:
    // 1. Module is now individual mentoring with valid duration
    // 2. AND (module wasn't individual mentoring before OR duration was changed)
    const shouldGenerateSlots = isNowIndividualMentoring && hasDuration && 
                                (!wasIndividualMentoring || durationChanged);
    
    if (shouldGenerateSlots) {
      try {
        // Find all schedules that use this module
        const schedules = await scheduleModel.findByModule(id);
        
        logger.info(`Auto-generating slots for ${schedules.length} schedule(s) after module update`, {
          moduleId: id,
          scheduleCount: schedules.length
        });
        
        // Generate slots for each schedule that doesn't have active bookings
        for (const schedule of schedules) {
          try {
            const hasBookings = await scheduleModel.hasActiveBookings(schedule.id);
            
            if (!hasBookings) {
              // Generate slots for schedule without active bookings
              await scheduleSlotService.generateSlotsForSchedule(schedule.id);
              logger.info('Slots generated for schedule', {
                scheduleId: schedule.id,
                moduleId: id
              });
            } else {
              logger.info('Skipping slot generation for schedule with active bookings', {
                scheduleId: schedule.id,
                moduleId: id
              });
            }
          } catch (slotError) {
            // Log error but don't fail the update
            logger.error('Error generating slots for schedule', {
              scheduleId: schedule.id,
              moduleId: id,
              error: slotError.message
            });
          }
        }
      } catch (error) {
        // Log error but don't fail the update
        logger.error('Error auto-generating slots after module update', {
          moduleId: id,
          error: error.message
        });
      }
    }
    
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    const { id } = req.params;
    const existing = await Model.findById(id);
    if (!existing) return res.status(404).json({ success: false, message: 'Module tidak ditemukan' });

    await Model.remove(id);
    res.json({ success: true, message: 'Deleted' });
  } catch (err) {
    next(err);
  }
}
