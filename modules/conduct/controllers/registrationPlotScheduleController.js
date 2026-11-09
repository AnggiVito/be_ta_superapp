import { logger } from '../../../core/utils/logger.js';
import * as roleService from '../../user-management/services/roleService.js';
import * as plotService from '../services/registrationPlotScheduleService.js';

const ASSISTANT_PLOT_SCHEDULE_ROLES = new Set([
  'asisten_praktikum',
  'asisten_praktikum_aktif',
  'koordinator_praktikum',
  'koordinator_asisten',
]);

function parseBooleanQuery(value) {
  return value === true || value === 'true' || value === '1';
}

function normalizeRoleSlug(role) {
  return String(role ?? '')
    .toLowerCase()
    .trim()
    .replace(/-/g, '_')
    .replace(/\s+/g, '_');
}

function collectJwtRoles(user) {
  const roles = new Set();
  const pushRole = (value) => {
    if (!value) return;
    if (typeof value === 'string') {
      roles.add(normalizeRoleSlug(value));
      return;
    }
    roles.add(normalizeRoleSlug(value.role || value.name || value.value));
  };

  pushRole(user?.role);
  pushRole(user?.user_role);
  pushRole(user?.userRole);
  if (Array.isArray(user?.roles)) {
    for (const role of user.roles) pushRole(role);
  }

  return roles;
}

function jwtHasAssistantPlotScheduleRole(user) {
  const roles = collectJwtRoles(user);
  for (const role of roles) {
    if (ASSISTANT_PLOT_SCHEDULE_ROLES.has(role)) return true;
  }
  return false;
}

async function userHasAssistantPlotScheduleRoleInDb(userId) {
  const normalizedUserId = String(userId ?? '').trim();
  if (!normalizedUserId) return false;

  for (const role of ASSISTANT_PLOT_SCHEDULE_ROLES) {
    if (await roleService.userHasRole(normalizedUserId, role)) return true;
  }
  return false;
}

async function shouldFilterPlotSchedulesByEnrollmentOnly(user, mine) {
  if (!mine) return false;
  if (jwtHasAssistantPlotScheduleRole(user)) return false;
  if (await userHasAssistantPlotScheduleRoleInDb(user?.id)) return false;
  return true;
}

async function resolvePlotScheduleScope(req, mine) {
  const enrollmentOnlyRaw = req.query?.enrollment_only;
  const assistantOnlyRaw = req.query?.assistant_only;

  if (parseBooleanQuery(enrollmentOnlyRaw)) {
    return { enrollmentOnly: true, assistantOnly: false };
  }

  if (parseBooleanQuery(assistantOnlyRaw)) {
    return { enrollmentOnly: false, assistantOnly: true };
  }

  return {
    enrollmentOnly: await shouldFilterPlotSchedulesByEnrollmentOnly(req.user, mine),
    assistantOnly: false,
  };
}

export async function listPlottedPracticumSchedules(req, res, next) {
  try {
    const semesterCode = req.query?.semester_code;
    const mineRaw = req.query?.mine;
    const mine = mineRaw === true || mineRaw === 'true' || mineRaw === '1';
    const currentUserId = mine ? req.user?.id : undefined;
    const { enrollmentOnly, assistantOnly } = await resolvePlotScheduleScope(req, mine);
    const groupedRaw = req.query?.grouped;
    const grouped = groupedRaw === true || groupedRaw === 'true' || groupedRaw === '1';

    const params = {
      // When omitted or "active", service resolves from registration_settings.active_periode
      // (set by kaur/laboran; options sourced from Auth FRI Gateway / Igracias GET /periodes).
      semesterCode: semesterCode != null && String(semesterCode).trim() !== ''
        ? String(semesterCode).trim()
        : undefined,
      currentUserId,
      enrollmentOnly,
      assistantOnly,
    };
    const data = grouped
      ? await plotService.listPlottedScheduleGroups(params)
      : await plotService.listPlottedSchedules(params);

    return res.status(200).json({ success: true, data });
  } catch (error) {
    logger.error('Error in listPlottedPracticumSchedules controller:', error);
    next(error);
  }
}

export {
  ASSISTANT_PLOT_SCHEDULE_ROLES,
  collectJwtRoles,
  jwtHasAssistantPlotScheduleRole,
  shouldFilterPlotSchedulesByEnrollmentOnly,
  resolvePlotScheduleScope,
};
