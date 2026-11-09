import * as scheduleSlotModel from '../models/scheduleSlotModel.js';
import * as scheduleModel from '../models/scheduleModel.js';
import * as practicumModuleModel from '../models/practicumModuleModel.js';
import { logger } from '../../../core/utils/logger.js';
import { formatSlotsWithWIB } from '../utils/timezoneHelper.js';

/**
 * Generate slots for a schedule based on module configuration
 * @param {string} scheduleId - Schedule ID
 */
export async function generateSlotsForSchedule(scheduleId) {
  try {
    // Get schedule with module info
    const schedule = await scheduleModel.findById(scheduleId);
    if (!schedule) {
      throw new Error('Schedule tidak ditemukan');
    }
    
    // Get module info
    const module = await practicumModuleModel.findById(schedule.module_id);
    if (!module) {
      throw new Error('Module tidak ditemukan');
    }
    
    // Check if module is individual mentoring
    if (!module.is_individual_mentoring) {
      logger.info('Module is not individual mentoring, skipping slot generation');
      return [];
    }
    
    if (!module.mentoring_duration_minutes) {
      throw new Error('Module tidak memiliki durasi mentoring yang ditentukan');
    }
    
    if (!schedule.start_time || !schedule.end_time) {
      throw new Error('Schedule harus memiliki start_time dan end_time');
    }
    
    // Calculate slots
    // Pastikan waktu dalam WIB (karena database timezone sudah Asia/Jakarta)
    // schedule.start_time dan schedule.end_time dari database sudah dalam format yang benar
    const startTime = new Date(schedule.start_time);
    const endTime = new Date(schedule.end_time);
    const durationMinutes = module.mentoring_duration_minutes;
    
    logger.info('Generating slots - schedule times:', {
      scheduleId,
      startTimeOriginal: schedule.start_time,
      startTimeParsed: startTime.toISOString(),
      endTimeOriginal: schedule.end_time,
      endTimeParsed: endTime.toISOString()
    });
    
    // Calculate total duration in minutes
    const totalMinutes = (endTime - startTime) / (1000 * 60);
    const roundsPossible = Math.floor(totalMinutes / durationMinutes);

    if (roundsPossible <= 0) {
      throw new Error('Durasi schedule terlalu pendek untuk membuat slot');
    }

    // Determine number of assistants assigned to this schedule
    const assistants = schedule.assistants || [];
    const assistantsCount = Math.max(1, assistants.length);

    // Get number of enrolled students for the practicum (module.practicum_id)
    const numStudents = await practicumModuleModel && module.practicum_id
      ? await (await import('../models/practicumModel.js')).countEnrollments(module.practicum_id)
      : 0;

    // Business rule: one assistant can handle at most 6 students in total
    const MAX_PER_ASSISTANT = 6;

    // Rounds required to serve all students given number of assistants (one student per assistant per round)
    const requiredRounds = Math.ceil((numStudents || 0) / assistantsCount);

    // Cap rounds per assistant by MAX_PER_ASSISTANT
    const roundsDueToAssistantLimit = Math.min(requiredRounds, MAX_PER_ASSISTANT);

    // Use the number of rounds we can actually schedule (cannot exceed roundsPossible)
    const roundsToUse = Math.min(roundsPossible, roundsDueToAssistantLimit);

    // Total slots we can create (each round can serve up to assistantsCount students)
    const totalSlotsCapacity = roundsToUse * assistantsCount;

    // We don't want more slots than students (avoid empty slots)
    const slotsToCreate = Math.min(totalSlotsCapacity, numStudents || totalSlotsCapacity);

    // Delete existing slots first
    await scheduleSlotModel.deleteBySchedule(scheduleId);
    
    // Generate slots
    // Gunakan format yang konsisten dengan timezone WIB (+07:00)
    // Jangan gunakan toISOString() karena akan mengkonversi ke UTC
    // Format waktu dengan timezone +07:00 (WIB) untuk konsistensi
    // PostgreSQL akan mengkonversi ke UTC secara internal, tapi kita pastikan input dalam WIB
    const formatWIBTime = (date) => {
      // Get WIB time components dari Date object
      // Date object sudah dalam timezone lokal (server), jadi kita ambil komponennya langsung
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const seconds = String(date.getSeconds()).padStart(2, '0');
      return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}+07:00`;
    };
    
    const slots = [];
    for (let i = 0; i < slotsToCreate; i++) {
      const slotStartTime = new Date(startTime);
      slotStartTime.setMinutes(slotStartTime.getMinutes() + (i * durationMinutes));
      
      const slotEndTime = new Date(slotStartTime);
      slotEndTime.setMinutes(slotEndTime.getMinutes() + durationMinutes);
      
      const slotStartWIB = formatWIBTime(slotStartTime);
      const slotEndWIB = formatWIBTime(slotEndTime);
      
      slots.push({
        schedule_id: scheduleId,
        slot_number: i + 1,
        start_time: slotStartWIB,
        end_time: slotEndWIB,
        status: 'available',
      });
    }
    
    logger.info('Generated slots with WIB format:', {
      scheduleId,
      numberOfSlots: slots.length,
      firstSlot: slots[0] ? { start: slots[0].start_time, end: slots[0].end_time } : null,
      lastSlot: slots[slots.length - 1] ? { start: slots[slots.length - 1].start_time, end: slots[slots.length - 1].end_time } : null
    });
    
    // Create slots in database
    const createdSlots = await scheduleSlotModel.createMany(slots);
    
    logger.info('Slots generated for schedule:', { 
      scheduleId, 
      numberOfSlots: createdSlots.length 
    });
    
    return createdSlots;
  } catch (error) {
    logger.error('Error generating slots:', error);
    throw error;
  }
}

/**
 * Get slots for a schedule
 */
export async function getSlotsBySchedule(scheduleId) {
  try {
    const slots = await scheduleSlotModel.findBySchedule(scheduleId);
    // Format waktu ke WIB sebelum dikirim ke FE
    return formatSlotsWithWIB(slots);
  } catch (error) {
    logger.error('Error getting slots by schedule:', error);
    throw error;
  }
}

/**
 * Get available slots for a schedule
 */
export async function getAvailableSlotsBySchedule(scheduleId) {
  try {
    const slots = await scheduleSlotModel.findAvailableBySchedule(scheduleId);
    // Format waktu ke WIB sebelum dikirim ke FE
    return formatSlotsWithWIB(slots);
  } catch (error) {
    logger.error('Error getting available slots:', error);
    throw error;
  }
}

