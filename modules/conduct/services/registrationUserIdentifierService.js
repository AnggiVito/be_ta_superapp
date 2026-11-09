import { registrationDb, userManagementDb } from '../../../config/databases.js';

function addIdentifier(target, value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized) target.add(normalized);
}

async function appendRegistrationStudentIdentifiers(identifiers) {
  if (identifiers.size === 0) return;

  const identifierList = [...identifiers];
  const studentRows = await registrationDb.query(
    `SELECT id, user_id, student_number
     FROM students
     WHERE lower(COALESCE(user_id::text, '')) = ANY($1::text[])
       OR lower(COALESCE(student_number, '')) = ANY($1::text[])
       OR lower(id::text) = ANY($1::text[])`,
    [identifierList]
  );

  for (const row of studentRows.rows) {
    addIdentifier(identifiers, row.id);
    addIdentifier(identifiers, row.user_id);
    addIdentifier(identifiers, row.student_number);
  }

  const enrollmentRows = await registrationDb.query(
    `SELECT DISTINCT pe.student_id
     FROM practicum_enrollments pe
     WHERE lower(pe.student_id::text) = ANY($1::text[])
        OR pe.student_id IN (
          SELECT st.id
          FROM students st
          WHERE lower(COALESCE(st.user_id::text, '')) = ANY($1::text[])
             OR lower(COALESCE(st.student_number, '')) = ANY($1::text[])
        )`,
    [identifierList]
  );

  for (const row of enrollmentRows.rows) {
    addIdentifier(identifiers, row.student_id);
  }
}

export async function resolveUserIdentifiers(userId) {
  const identifiers = new Set();
  addIdentifier(identifiers, userId);
  const raw = String(userId ?? '').trim();
  if (!raw) return [];

  const profile = await userManagementDb.query(
    `SELECT user_id, nipnim
     FROM user_profiles
     WHERE deleted_at IS NULL
       AND (lower(user_id) = lower($1) OR lower(nipnim) = lower($1))`,
    [raw]
  );

  for (const row of profile.rows) {
    addIdentifier(identifiers, row.user_id);
    addIdentifier(identifiers, row.nipnim);
  }

  await appendRegistrationStudentIdentifiers(identifiers);

  return [...identifiers];
}

export async function isScheduleAssistantByIdentifier(registrationDbClient, scheduleId, userId) {
  const identifiers = await resolveUserIdentifiers(userId);
  if (identifiers.length === 0) return false;

  const result = await registrationDbClient.query(
    `SELECT 1
     FROM schedule_assistants
     WHERE schedule_id = $1::uuid
       AND (
         lower(user_id) = ANY($2::text[])
         OR lower(nim) = ANY($2::text[])
       )
     LIMIT 1`,
    [scheduleId, identifiers]
  );
  return result.rowCount > 0;
}
