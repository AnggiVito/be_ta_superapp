import { conductDb, registrationDb } from '../../../config/databases.js';

/**
 * @param {string[]} moduleIds
 * @returns {Promise<Map<string, { component_type: string, enabled: boolean, weight_percent: number }[]>>}
 */
export async function findComponentsByModuleIds(moduleIds) {
  if (!moduleIds || moduleIds.length === 0) {
    return new Map();
  }
  const res = await registrationDb.query(
    `SELECT module_id, component_type, enabled, weight_percent
     FROM practicum_module_assessment_components
     WHERE module_id = ANY($1::uuid[])
     ORDER BY module_id, component_type`,
    [moduleIds]
  );
  /** @type {Map<string, any[]>} */
  const map = new Map();
  for (const row of res.rows) {
    const list = map.get(row.module_id) || [];
    list.push({
      component_type: row.component_type,
      enabled: row.enabled,
      weight_percent: row.weight_percent,
    });
    map.set(row.module_id, list);
  }
  return map;
}

/**
 * @param {string[]} moduleIds
 * @returns {Promise<Set<string>>} module ids that have at least one grade row
 */
export async function findModuleIdsWithGrades(moduleIds) {
  if (!moduleIds || moduleIds.length === 0) {
    return new Set();
  }
  const registrationGrades = await registrationDb.query(
    `SELECT DISTINCT module_id FROM practicum_module_assessment_grades WHERE module_id = ANY($1::uuid[])`,
    [moduleIds]
  );
  const locked = new Set(registrationGrades.rows.map((r) => String(r.module_id)));

  const conductSchedules = await conductDb.query(
    `SELECT DISTINCT os.registration_schedule_id
     FROM practicum_student_grades g
     JOIN practicum_operational_sessions os ON os.id = g.operational_session_id
     WHERE g.deleted_at IS NULL
       AND g.status = 'submitted'`
  );
  const scheduleIds = conductSchedules.rows
    .map((row) => String(row.registration_schedule_id ?? '').trim())
    .filter(Boolean);
  if (scheduleIds.length > 0) {
    const conductModules = await registrationDb.query(
      `SELECT DISTINCT module_id
       FROM schedules
       WHERE id = ANY($1::uuid[])
         AND module_id = ANY($2::uuid[])`,
      [scheduleIds, moduleIds]
    );
    for (const row of conductModules.rows) {
      if (row.module_id) locked.add(String(row.module_id));
    }
  }
  return locked;
}

/**
 * @param {import('pg').PoolClient} client
 * @param {string} moduleId
 * @param {{ type: string, enabled: boolean, weight_percent: number }[]} rows
 */
export async function replaceComponentsForModule(client, moduleId, rows) {
  await client.query('DELETE FROM practicum_module_assessment_components WHERE module_id = $1', [moduleId]);
  for (const r of rows) {
    await client.query(
      `INSERT INTO practicum_module_assessment_components (module_id, component_type, enabled, weight_percent)
       VALUES ($1, $2, $3, $4)`,
      [moduleId, r.type, r.enabled, r.weight_percent]
    );
  }
}
