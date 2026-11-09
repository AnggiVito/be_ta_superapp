/**
 * Validator for practicum schedule sync requests
 */

import Joi from 'joi';

const syncSchema = Joi.object({
  semesterCode: Joi.string().trim().required().messages({
    'any.required': 'semesterCode is required',
    'string.empty': 'semesterCode is required',
  }),
  dryRun: Joi.boolean().default(false),
  forceResync: Joi.boolean().default(false),
});

export function validatePracticumScheduleSync(req, res, next) {
  const { error, value } = syncSchema.validate(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      message: error.details[0].message,
    });
  }
  req.body = value;
  next();
}
