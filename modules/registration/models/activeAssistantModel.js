import { registrationDb } from '../../../config/databases.js';
import { logger } from '../../../core/utils/logger.js';

export async function findByPracticumAndPeriodeKey(practicumId, periodeKey) {
  const result = await registrationDb.query(
    `SELECT id, practicum_id, user_id, nim, periode_key, periode_label, periode_snapshot,
            imported_at, imported_by, created_at
     FROM active_assistant_period_assignments
     WHERE practicum_id = $1 AND periode_key = $2
     ORDER BY nim ASC`,
    [practicumId, periodeKey]
  );
  return result.rows;
}

export async function replaceForPracticum(
  practicumId,
  periodeKey,
  periodeLabel,
  periodeSnapshot,
  assignments,
  importedBy,
  client = registrationDb
) {
  await client.query(
    `DELETE FROM active_assistant_period_assignments
     WHERE practicum_id = $1 AND periode_key = $2`,
    [practicumId, periodeKey]
  );

  const rows = [];
  for (const entry of assignments) {
    const result = await client.query(
      `INSERT INTO active_assistant_period_assignments
         (practicum_id, user_id, nim, periode_key, periode_label, periode_snapshot, imported_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, practicum_id, user_id, nim, periode_key, periode_label, imported_at, imported_by`,
      [
        practicumId,
        entry.user_id,
        entry.nim,
        periodeKey,
        periodeLabel,
        periodeSnapshot ? JSON.stringify(periodeSnapshot) : null,
        importedBy,
      ]
    );
    rows.push(result.rows[0]);
  }
  return rows;
}

export async function findActivePracticumAssignmentsWithProfiles(practicumId, periodeKey) {
  try {
    return await findByPracticumAndPeriodeKey(practicumId, periodeKey);
  } catch (error) {
    logger.error('Error finding active assistant assignments:', error);
    throw error;
  }
}
