import { registrationDb } from '../../../config/databases.js';

export async function resolveLaboratoriumIntegraLab() {
  const { rows } = await registrationDb.query(
    `SELECT id, name FROM laboratories
     WHERE lower(trim(name)) IN ('laboratorium integra', 'lab integra')
        OR lower(name) LIKE '%integra%'
     ORDER BY
       CASE WHEN lower(trim(name)) = 'laboratorium integra' THEN 0
            WHEN lower(trim(name)) = 'lab integra' THEN 1
            ELSE 2 END
     LIMIT 1`,
  );
  return rows[0] ?? null;
}

export function isTpaOrLaboranRequesterRole(role) {
  const r = String(role || '').trim().toLowerCase();
  return r === 'tpa' || r === 'laboran';
}
