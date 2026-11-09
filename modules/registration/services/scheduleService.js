import * as scheduleModel from '../models/scheduleModel.js';
import * as practicumModuleModel from '../models/practicumModuleModel.js';
import * as scheduleSlotService from './scheduleSlotService.js';
import { resolveListPeriodeFilter } from './practicumService.js';
import {
  assertUsersAreRegisteredActiveAssistants,
  listAvailableActiveAssistantsForAssignment,
} from './activeAssistantService.js';
import { logger } from '../../../core/utils/logger.js';
import { formatScheduleWithWIB, formatSchedulesWithWIB } from '../utils/timezoneHelper.js';
import { validateWeekNumber } from '../utils/weekNumberValidation.js';
import * as roleModel from '../../user-management/models/roleModel.js';

/**
 * Schedule Service
 * Business logic untuk schedule; asisten harus terdaftar di registry asisten aktif praktikum terpilih.
 */

/**
 * Validate that module exists
 */
async function validateModule(moduleId) {
  const module = await practicumModuleModel.findById(moduleId);
  if (!module) {
    throw new Error('Module tidak ditemukan');
  }
  return module;
}

/**
 * Validate assistants against registry asisten aktif praktikum terpilih.
 */
async function validateAssistants(assistantIds, practicumId) {
  await assertUsersAreRegisteredActiveAssistants(assistantIds, practicumId);
}

/**
 * Validate schedule time constraints
 * - Must be between 6 AM (06:00) and 8 PM (20:00)
 * - Cannot be on Sunday
 */
function validateScheduleTime(start, end) {
  // Check if start or end is on Sunday (day 0)
  const startDay = start.getDay();
  const endDay = end.getDay();
  
  if (startDay === 0 || endDay === 0) {
    throw new Error('Schedule tidak boleh dibuat pada hari Minggu');
  }
  
  // Get hours and minutes for start and end times
  const startHours = start.getHours();
  const startMinutes = start.getMinutes();
  const endHours = end.getHours();
  const endMinutes = end.getMinutes();
  
  // Convert to minutes for easier comparison
  const startTotalMinutes = startHours * 60 + startMinutes;
  const endTotalMinutes = endHours * 60 + endMinutes;
  
  // 6 AM = 6 * 60 = 360 minutes
  // 8 PM = 20 * 60 = 1200 minutes
  const minAllowedMinutes = 6 * 60; // 6 AM
  const maxAllowedMinutes = 20 * 60; // 8 PM (20:00)
  
  if (startTotalMinutes < minAllowedMinutes) {
    throw new Error('Schedule tidak boleh dimulai sebelum jam 6 pagi');
  }
  
  if (endTotalMinutes > maxAllowedMinutes) {
    throw new Error('Schedule tidak boleh berakhir setelah jam 8 malam');
  }
  
  // Also check if start time is after 8 PM (should not start after 8 PM)
  if (startTotalMinutes > maxAllowedMinutes) {
    throw new Error('Schedule tidak boleh dimulai setelah jam 8 malam');
  }
}

/**
 * Get all schedules
 * @param {Object|string|null} options - Filter options or legacy module_id
 * @param {string} options.moduleId - Optional filter by module_id
 * @param {string} options.userId - Optional user ID for access control
 * @param {boolean} options.forceFilterByUser - If true, always filter by user (for query parameter filter_by_me)
 * @param {string} options.periode - Optional periode filter; supports "active"
 */
export async function getAllSchedules(options = {}, legacyUserId = null, legacyForceFilterByUser = false) {
  try {
    const normalizedOptions = typeof options === 'object' && options !== null
      ? options
      : {
          moduleId: options,
          userId: legacyUserId,
          forceFilterByUser: legacyForceFilterByUser,
        };
    const {
      moduleId = null,
      userId = null,
      forceFilterByUser = false,
      periode,
    } = normalizedOptions;
    const { filter: periodeFilter } = await resolveListPeriodeFilter(periode);

    // If userId is provided, check if user should only see their own schedules
    let filterByUserId = null;
    
    if (userId) {
      // If forceFilterByUser is true, always filter (for query parameter filter_by_me)
      if (forceFilterByUser) {
        filterByUserId = userId;
      } else {
        // Get active roles for user
        const activeRoles = await roleModel.getActiveUserRoles(userId);
        const userRoles = activeRoles.map(role => role.role);
        
        // Check if user has only asisten_praktikum or asisten_praktikum_aktif (without higher roles)
        const hasAsistenPraktikum = userRoles.includes('asisten_praktikum');
        const hasAsistenPraktikumAktif = userRoles.includes('asisten_praktikum_aktif');
        const hasKoordinator =
          userRoles.includes('koordinator_praktikum') || userRoles.includes('koordinator_asisten');
        const hasKaurLab = userRoles.includes('kaur_lab');
        const hasLaboran = userRoles.includes('laboran');
        
        // If user has asisten_praktikum or asisten_praktikum_aktif but NOT any higher roles,
        // restrict to only schedules where user is assistant
        const hasAsistenRole = hasAsistenPraktikum || hasAsistenPraktikumAktif;
        const hasHigherRole = hasKoordinator || hasKaurLab || hasLaboran;
        
        const shouldRestrict = hasAsistenRole && !hasHigherRole;
        
        if (shouldRestrict) {
          filterByUserId = userId;
        }
      }
    }
    
    let schedules;
    if (moduleId) {
      schedules = await scheduleModel.findByModule(moduleId, filterByUserId, { periode: periodeFilter });
    } else {
      schedules = await scheduleModel.findAll(null, filterByUserId, { periode: periodeFilter });
    }
    
    // Format waktu ke WIB sebelum dikirim ke FE
    return formatSchedulesWithWIB(schedules);
  } catch (error) {
    logger.error('Error in getAllSchedules service:', error);
    throw error;
  }
}

/**
 * Get schedule by id
 */
export async function getScheduleById(id) {
  try {
    const schedule = await scheduleModel.findById(id);
    if (!schedule) {
      throw new Error('Schedule tidak ditemukan');
    }
    // Format waktu ke WIB sebelum dikirim ke FE
    return formatScheduleWithWIB(schedule);
  } catch (error) {
    logger.error('Error in getScheduleById service:', error);
    throw error;
  }
}

/**
 * Create schedule with validation
 * @param {Object} data - Schedule data
 * @param {string} data.module_id - Module ID
 * @param {string} data.start_time - Start datetime
 * @param {string} data.end_time - End datetime
 * @param {string} data.venue - Venue location (optional)
 * @param {string[]} data.assistants - Array of user_id (asisten)
 * @param {string} data.createdBy - User ID yang membuat schedule (untuk individual mentoring, akan otomatis ditambahkan sebagai assistant)
 */
export async function createSchedule({ module_id, start_time, end_time, venue, assistants = [], createdBy = null }) {
  try {
    // Validate module exists
    const module = await validateModule(module_id);
    
    // For individual mentoring: automatically add creator as assistant if not already in list
    let finalAssistants = [...assistants];
    if (module.is_individual_mentoring && createdBy) {
      // Check if creator is already in assistants list
      if (!finalAssistants.includes(createdBy)) {
        try {
          await assertUsersAreRegisteredActiveAssistants([createdBy], module.practicum_id);
          finalAssistants.push(createdBy);
          logger.info('Individual mentoring: Auto-adding schedule creator as assistant:', {
            createdBy,
            moduleId: module_id,
            isIndividualMentoring: module.is_individual_mentoring
          });
        } catch (err) {
          logger.warn('Individual mentoring: Creator is not a registered active assistant, skipping auto-add:', {
            createdBy,
            moduleId: module_id,
            message: err.message,
          });
        }
      } else {
        logger.info('Individual mentoring: Creator already in assistants list:', {
          createdBy,
          moduleId: module_id
        });
      }
    }
    
    // Validate assistants have correct role
    await validateAssistants(finalAssistants, module.practicum_id);
    
    // Validate time
    if (!start_time || !end_time) {
      throw new Error('start_time dan end_time harus diisi');
    }
    
    const start = new Date(start_time);
    const end = new Date(end_time);
    
    if (end <= start) {
      throw new Error('end_time harus setelah start_time');
    }
    
    // Validate time constraints (6 AM - 8 PM, no Sunday)
    validateScheduleTime(start, end);
    
    // Create schedule
    const schedule = await scheduleModel.create({
      module_id,
      start_time,
      end_time,
      venue,
      assistants: finalAssistants,
    });
    
    // Generate slots if module is individual mentoring
    if (module.is_individual_mentoring) {
      await scheduleSlotService.generateSlotsForSchedule(schedule.id);
    }
    
    logger.info('Schedule created:', { 
      scheduleId: schedule.id, 
      moduleId: module_id,
      isIndividualMentoring: module.is_individual_mentoring,
      assistants: finalAssistants,
      createdBy
    });
    // Format waktu ke WIB sebelum dikirim ke FE
    return formatScheduleWithWIB(schedule);
  } catch (error) {
    logger.error('Error in createSchedule service:', error);
    throw error;
  }
}

/**
 * Update schedule with validation
 * @param {string} id - Schedule ID
 * @param {Object} data - Update data
 */
export async function updateSchedule(id, { module_id, start_time, end_time, venue, assistants, week_number, updatedBy = null }) {
  try {
    // Check if schedule exists
    const existingSchedule = await scheduleModel.findById(id);
    if (!existingSchedule) {
      throw new Error('Schedule tidak ditemukan');
    }
    
    // Check if schedule has active bookings
    const hasBookings = await scheduleModel.hasActiveBookings(id);
    if (hasBookings) {
      throw new Error('Schedule tidak bisa diupdate karena masih ada booking aktif. Silakan cancel booking terlebih dahulu');
    }
    
    // Validate module if provided
    let module = existingSchedule.module_id ? await practicumModuleModel.findById(existingSchedule.module_id) : null;
    if (module_id !== undefined) {
      module = await validateModule(module_id);
    }

    const targetModuleId = module_id !== undefined ? module_id : existingSchedule.module_id;
    if (week_number !== undefined) {
      const weekCheck = validateWeekNumber(week_number, { required: true });
      if (!weekCheck.ok) {
        throw new Error(weekCheck.message);
      }
      if (!targetModuleId) {
        throw new Error('Tidak dapat mengubah week_number tanpa module_id pada jadwal');
      }
      await practicumModuleModel.update(targetModuleId, { week_number: weekCheck.value });
      if (module?.id === targetModuleId) {
        module = { ...module, week_number: weekCheck.value };
      } else if (targetModuleId) {
        module = await practicumModuleModel.findById(targetModuleId);
      }
    }
    
    // Validate assistants if provided
    if (assistants !== undefined) {
      const targetModule = module || await practicumModuleModel.findById(targetModuleId);
      if (!targetModule?.practicum_id) {
        throw new Error('Module tidak ditemukan untuk validasi asisten');
      }
      await validateAssistants(assistants, targetModule.practicum_id);
    }
    
    // Validate time if provided
    if (start_time !== undefined || end_time !== undefined) {
      const start = start_time ? new Date(start_time) : new Date(existingSchedule.start_time);
      const end = end_time ? new Date(end_time) : new Date(existingSchedule.end_time);
      
      if (end <= start) {
        throw new Error('end_time harus setelah start_time');
      }
      
      // Validate time constraints (6 AM - 8 PM, no Sunday)
      validateScheduleTime(start, end);
    }
    
    // Update schedule
    const schedule = await scheduleModel.update(id, {
      module_id,
      start_time,
      end_time,
      venue,
      assistants,
    });
    
    // Regenerate slots if module is individual mentoring and time changed
    const finalModule = module || await practicumModuleModel.findById(schedule.module_id);
    if (finalModule && finalModule.is_individual_mentoring) {
      const timeChanged = (start_time !== undefined && start_time !== existingSchedule.start_time) ||
                         (end_time !== undefined && end_time !== existingSchedule.end_time);
      
      if (timeChanged || module_id !== undefined) {
        await scheduleSlotService.generateSlotsForSchedule(schedule.id);
      }
    }
    
    logger.info('Schedule updated:', { scheduleId: id });
    // Format waktu ke WIB sebelum dikirim ke FE
    return formatScheduleWithWIB(schedule);
  } catch (error) {
    logger.error('Error in updateSchedule service:', error);
    throw error;
  }
}

/**
 * Delete schedule
 */
export async function deleteSchedule(id) {
  try {
    const schedule = await scheduleModel.findById(id);
    if (!schedule) {
      throw new Error('Schedule tidak ditemukan');
    }
    
    // Check if schedule has active bookings
    const hasBookings = await scheduleModel.hasActiveBookings(id);
    if (hasBookings) {
      throw new Error('Schedule tidak bisa dihapus karena masih ada booking aktif. Silakan cancel booking terlebih dahulu');
    }
    
    await scheduleModel.remove(id);
    logger.info('Schedule deleted:', { scheduleId: id });
    return true;
  } catch (error) {
    logger.error('Error in deleteSchedule service:', error);
    throw error;
  }
}

/**
 * Get registered active assistants for a practicum (assignment reference).
 */
export async function getAvailableAssistants(practicumId) {
  try {
    return await listAvailableActiveAssistantsForAssignment(practicumId);
  } catch (error) {
    logger.error('Error in getAvailableAssistants service:', error);
    throw error;
  }
}

