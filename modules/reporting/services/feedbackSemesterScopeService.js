/**
 * Scope semester laporan feedback — resolve jadwal registrasi per semester_code.
 * Respons exit survey difilter via registration_schedule_id yang terhubung ke schedules.
 */

import { registrationDb } from '../../../config/databases.js';
import { resolveSemesterCodeFilter } from '../../conduct/services/registrationPlotScheduleService.js';

let _schedulesHasSemesterCode;

async function schedulesHasSemesterCode() {
  if (_schedulesHasSemesterCode !== undefined) return _schedulesHasSemesterCode;
  const res = await registrationDb.query(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'schedules'
       AND column_name = 'semester_code'
     LIMIT 1`
  );
  _schedulesHasSemesterCode = res.rowCount > 0;
  return _schedulesHasSemesterCode;
}

/**
 * @returns {Promise<{ semesterCode: string|null, scheduleIds: string[]|null }>}
 * scheduleIds null = tidak ada filter semester (kode kosong & bukan permintaan eksplisit).
 */
export async function resolveFeedbackSemesterScope(semesterCodeInput) {
  const raw = String(semesterCodeInput ?? '').trim();
  const wantsActive = !raw || raw.toLowerCase() === 'active';
  const resolved = await resolveSemesterCodeFilter(raw || 'active');

  if (!resolved) {
    if (wantsActive) {
      return { semesterCode: null, scheduleIds: [] };
    }
    return { semesterCode: raw, scheduleIds: [] };
  }

  const scheduleIds = await fetchScheduleIdsForSemester(resolved);
  return { semesterCode: resolved, scheduleIds };
}

async function fetchScheduleIdsForSemester(semesterCode) {
  const ids = new Set();

  if (await schedulesHasSemesterCode()) {
    const byCol = await registrationDb.query(
      `SELECT s.id::text AS id
       FROM schedules s
       WHERE s.semester_code = $1`,
      [semesterCode]
    );
    for (const row of byCol.rows) ids.add(row.id);
  }

  const byPracticumPeriode = await registrationDb.query(
    `SELECT s.id::text AS id
     FROM schedules s
     INNER JOIN practicum_modules pm ON pm.id = s.module_id
     INNER JOIN practicums p ON p.id = pm.practicum_id
     WHERE p.periode = $1`,
    [semesterCode]
  );
  for (const row of byPracticumPeriode.rows) ids.add(row.id);

  const plotTable = await registrationDb.query(
    `SELECT 1
     FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name = 'practicum_plot_schedules'
     LIMIT 1`
  );
  if (plotTable.rowCount > 0) {
    const byPlot = await registrationDb.query(
      `SELECT DISTINCT s.id::text AS id
       FROM schedules s
       INNER JOIN practicum_plot_schedules pps
         ON pps.registration_module_id = s.module_id
       WHERE pps.semester_code = $1`,
      [semesterCode]
    );
    for (const row of byPlot.rows) ids.add(row.id);
  }

  return [...ids];
}
