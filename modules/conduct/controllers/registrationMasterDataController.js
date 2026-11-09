import { logger } from '../../../core/utils/logger.js';
import * as registrationDataService from '../services/registrationDataService.js';

export async function listRegistrationPracticums(req, res, next) {
  try {
    const studyProgramId = req.query?.study_program_id;
    const periode = req.query?.periode;
    const periodeFilter = periode != null && String(periode).trim() !== ''
      ? String(periode).trim()
      : 'active';
    const practicums = await registrationDataService.listPracticums({
      studyProgramId: studyProgramId ? String(studyProgramId).trim() : undefined,
      periode: periodeFilter,
    });

    return res.status(200).json({
      success: true,
      data: practicums,
    });
  } catch (error) {
    if (error.code === 'ACTIVE_PERIODE_NOT_CONFIGURED') {
      return res.status(400).json({ success: false, message: error.message });
    }
    logger.error('Error in listRegistrationPracticums controller:', error);
    next(error);
  }
}

export async function listRegistrationPracticumModules(req, res, next) {
  try {
    const practicumId = req.query?.practicum_id;
    const periode = req.query?.periode;
    const periodeFilter = periode != null && String(periode).trim() !== ''
      ? String(periode).trim()
      : 'active';
    const modules = await registrationDataService.listPracticumModules({
      practicumId: practicumId ? String(practicumId).trim() : undefined,
      periode: periodeFilter,
    });

    return res.status(200).json({
      success: true,
      data: modules,
    });
  } catch (error) {
    if (error.code === 'ACTIVE_PERIODE_NOT_CONFIGURED') {
      return res.status(400).json({ success: false, message: error.message });
    }
    logger.error('Error in listRegistrationPracticumModules controller:', error);
    next(error);
  }
}

export async function listRegistrationSchedules(req, res, next) {
  try {
    const moduleId = req.query?.module_id;
    const periode = req.query?.periode;
    const periodeFilter = periode != null && String(periode).trim() !== ''
      ? String(periode).trim()
      : 'active';
    const mineRaw = req.query?.mine;
    const mine = mineRaw === true || mineRaw === 'true' || mineRaw === '1';
    const assistantUserId = mine ? req.user?.id : undefined;

    const schedules = await registrationDataService.listSchedules({
      moduleId: moduleId ? String(moduleId).trim() : undefined,
      periode: periodeFilter,
      assistantUserId,
    });

    return res.status(200).json({
      success: true,
      data: schedules,
    });
  } catch (error) {
    if (error.code === 'ACTIVE_PERIODE_NOT_CONFIGURED') {
      return res.status(400).json({ success: false, message: error.message });
    }
    logger.error('Error in listRegistrationSchedules controller:', error);
    next(error);
  }
}
