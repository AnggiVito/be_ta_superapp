import { registrationDb } from '../../../config/databases.js';

export async function findAll() {
  const res = await registrationDb.query('SELECT * FROM laboratories ORDER BY name');
  return res.rows;
}

export async function findById(id) {
  const res = await registrationDb.query('SELECT * FROM laboratories WHERE id=$1', [id]);
  return res.rows[0];
}

export async function findByStudyProgram(studyProgramId) {
  const res = await registrationDb.query('SELECT * FROM laboratories WHERE study_program_id=$1 ORDER BY name', [studyProgramId]);
  return res.rows;
}

export async function create({ study_program_id, code, name }) {
  const res = await registrationDb.query(
    'INSERT INTO laboratories (study_program_id, code, name) VALUES ($1, $2, $3) RETURNING *',
    [study_program_id, code, name]
  );
  return res.rows[0];
}

export async function update(id, { study_program_id, code, name }) {
  const res = await registrationDb.query(
    'UPDATE laboratories SET study_program_id=$1, code=$2, name=$3, updated_at=now() WHERE id=$4 RETURNING *',
    [study_program_id, code, name, id]
  );
  return res.rows[0];
}

export async function remove(id) {
  await registrationDb.query('DELETE FROM laboratories WHERE id=$1', [id]);
  return true;
}

export async function countPracticums(laboratoryId) {
  const res = await registrationDb.query(
    'SELECT COUNT(*)::int AS cnt FROM practicums WHERE laboratory_id=$1',
    [laboratoryId]
  );
  return res.rows[0]?.cnt || 0;
}
