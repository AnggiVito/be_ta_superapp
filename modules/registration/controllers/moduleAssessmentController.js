import * as moduleAssessmentService from '../services/moduleAssessmentService.js';

export async function getConfig(req, res, next) {
  try {
    const { practicumId } = req.params;
    const data = await moduleAssessmentService.getModuleAssessmentConfig(practicumId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function putConfig(req, res, next) {
  try {
    const { practicumId } = req.params;
    const data = await moduleAssessmentService.putModuleAssessmentConfig(practicumId, req.body);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
