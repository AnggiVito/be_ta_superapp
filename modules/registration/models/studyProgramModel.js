import { registrationDb } from '../../../config/databases.js';

export async function findAll() {
  const res = await registrationDb.query('SELECT * FROM study_programs ORDER BY name');
  return res.rows;
}

export async function findById(id) {
  const res = await registrationDb.query('SELECT * FROM study_programs WHERE id=$1', [id]);
  return res.rows[0];
}

export async function create({ code, name }) {
  const res = await registrationDb.query(
    'INSERT INTO study_programs (code, name) VALUES ($1, $2) RETURNING *',
    [code, name]
  );
  return res.rows[0];
}

export async function update(id, { code, name }) {
  const res = await registrationDb.query(
    'UPDATE study_programs SET code=$1, name=$2, updated_at=now() WHERE id=$3 RETURNING *',
    [code, name, id]
  );
  return res.rows[0];
}

export async function remove(id) {
  await registrationDb.query('DELETE FROM study_programs WHERE id=$1', [id]);
  return true;
}

export async function countLaboratories(studyProgramId) {
  const res = await registrationDb.query(
    'SELECT COUNT(*)::int AS cnt FROM laboratories WHERE study_program_id=$1',
    [studyProgramId]
  );
  return res.rows[0]?.cnt || 0;
}
