import * as exitSurveyService from '../services/exitSurveyService.js';

export async function getStudentActiveExitSurvey(req, res, next) {
  try {
    const data = await exitSurveyService.getActiveExitSurveyForStudent({
      requesterUserId: req.user?.id,
      operationalSessionId: req.query?.operational_session_id ?? req.query?.operationalSessionId,
    });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function getMyExitSurveyResponse(req, res, next) {
  try {
    const data = await exitSurveyService.getMyExitSurveyResponse({
      requesterUserId: req.user?.id,
      operationalSessionId: req.params.operationalSessionId,
    });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function submitExitSurveyResponse(req, res, next) {
  try {
    const data = await exitSurveyService.submitExitSurveyResponse({
      requesterUserId: req.user?.id,
      operationalSessionId: req.body?.operational_session_id ?? req.body?.operationalSessionId,
      answers: req.body?.answers,
    });
    return res.status(201).json({ success: true, message: 'Exit survey submitted successfully', data });
  } catch (error) {
    next(error);
  }
}

export async function createExitSurvey(req, res, next) {
  try {
    const data = await exitSurveyService.createExitSurvey({
      requesterUserId: req.user?.id,
      payload: req.body,
    });
    return res.status(201).json({
      success: true,
      message: 'Exit survey created successfully',
      data,
    });
  } catch (error) {
    next(error);
  }
}

export async function listExitSurveys(req, res, next) {
  try {
    const includeArchivedRaw = req.query?.include_archived;
    const includeArchived = includeArchivedRaw === undefined ||
      includeArchivedRaw === true ||
      includeArchivedRaw === 'true' ||
      includeArchivedRaw === '1';
    const data = await exitSurveyService.listExitSurveys({ includeArchived });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function getExitSurveyDetail(req, res, next) {
  try {
    const data = await exitSurveyService.getExitSurveyById(req.params.id);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function activateExitSurvey(req, res, next) {
  try {
    const data = await exitSurveyService.activateExitSurvey({
      id: req.params.id,
      requesterUserId: req.user?.id,
    });
    return res.status(200).json({
      success: true,
      message: 'Exit survey activated successfully',
      data,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateExitSurvey(req, res, next) {
  try {
    const data = await exitSurveyService.updateExitSurvey({
      id: req.params.id,
      requesterUserId: req.user?.id,
      payload: req.body,
    });
    return res.status(200).json({
      success: true,
      message: 'Exit survey updated successfully',
      data,
    });
  } catch (error) {
    next(error);
  }
}

export async function archiveExitSurvey(req, res, next) {
  try {
    const data = await exitSurveyService.archiveExitSurvey({
      id: req.params.id,
      requesterUserId: req.user?.id,
    });
    return res.status(200).json({
      success: true,
      message: 'Exit survey archived successfully',
      data,
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteExitSurvey(req, res, next) {
  try {
    const data = await exitSurveyService.deleteExitSurvey({
      id: req.params.id,
      requesterUserId: req.user?.id,
    });
    return res.status(200).json({
      success: true,
      message: 'Exit survey deleted successfully',
      data,
    });
  } catch (error) {
    next(error);
  }
}

export async function listExitSurveySections(req, res, next) {
  try {
    const data = await exitSurveyService.listExitSurveySections({ surveyId: req.params.id });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function createExitSurveySection(req, res, next) {
  try {
    const data = await exitSurveyService.createExitSurveySection({
      surveyId: req.params.id,
      requesterUserId: req.user?.id,
      payload: req.body,
    });
    return res.status(201).json({ success: true, message: 'Exit survey section created successfully', data });
  } catch (error) {
    next(error);
  }
}

export async function updateExitSurveySection(req, res, next) {
  try {
    const data = await exitSurveyService.updateExitSurveySection({
      surveyId: req.params.id,
      sectionId: req.params.sectionId,
      requesterUserId: req.user?.id,
      payload: req.body,
    });
    return res.status(200).json({ success: true, message: 'Exit survey section updated successfully', data });
  } catch (error) {
    next(error);
  }
}

export async function deleteExitSurveySection(req, res, next) {
  try {
    const data = await exitSurveyService.deleteExitSurveySection({
      surveyId: req.params.id,
      sectionId: req.params.sectionId,
      requesterUserId: req.user?.id,
    });
    return res.status(200).json({ success: true, message: 'Exit survey section deleted successfully', data });
  } catch (error) {
    next(error);
  }
}

export async function reorderExitSurveySections(req, res, next) {
  try {
    const data = await exitSurveyService.reorderExitSurveySections({
      surveyId: req.params.id,
      requesterUserId: req.user?.id,
      sectionIds: req.body?.section_ids ?? req.body?.sectionIds,
    });
    return res.status(200).json({ success: true, message: 'Exit survey section order updated successfully', data });
  } catch (error) {
    next(error);
  }
}

export async function reorderExitSurveyBuilderItems(req, res, next) {
  try {
    const data = await exitSurveyService.reorderExitSurveyBuilderItems({
      surveyId: req.params.id,
      requesterUserId: req.user?.id,
      items: req.body?.items,
    });
    return res.status(200).json({ success: true, message: 'Exit survey builder order updated successfully', data });
  } catch (error) {
    next(error);
  }
}

export async function listExitSurveyQuestions(req, res, next) {
  try {
    const data = await exitSurveyService.listExitSurveyQuestions({
      surveyId: req.params.id,
    });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function createExitSurveyQuestion(req, res, next) {
  try {
    const data = await exitSurveyService.createExitSurveyQuestion({
      surveyId: req.params.id,
      requesterUserId: req.user?.id,
      payload: req.body,
    });
    return res.status(201).json({
      success: true,
      message: 'Exit survey question created successfully',
      data,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateExitSurveyQuestion(req, res, next) {
  try {
    const data = await exitSurveyService.updateExitSurveyQuestion({
      surveyId: req.params.id,
      questionId: req.params.questionId,
      requesterUserId: req.user?.id,
      payload: req.body,
    });
    return res.status(200).json({
      success: true,
      message: 'Exit survey question updated successfully',
      data,
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteExitSurveyQuestion(req, res, next) {
  try {
    const data = await exitSurveyService.deleteExitSurveyQuestion({
      surveyId: req.params.id,
      questionId: req.params.questionId,
      requesterUserId: req.user?.id,
    });
    return res.status(200).json({
      success: true,
      message: 'Exit survey question deleted successfully',
      data,
    });
  } catch (error) {
    next(error);
  }
}

export async function reorderExitSurveyQuestions(req, res, next) {
  try {
    const data = await exitSurveyService.reorderExitSurveyQuestions({
      surveyId: req.params.id,
      requesterUserId: req.user?.id,
      questionIds: req.body?.question_ids ?? req.body?.questionIds,
    });
    return res.status(200).json({
      success: true,
      message: 'Exit survey question order updated successfully',
      data,
    });
  } catch (error) {
    next(error);
  }
}

