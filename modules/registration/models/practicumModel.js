import { registrationDb } from '../../../config/databases.js';

function buildListQuery({ laboratoryId, periode }) {
  const conditions = [];
  const params = [];
  let n = 1;

  if (laboratoryId) {
    conditions.push(`laboratory_id=$${n++}`);
    params.push(laboratoryId);
  }
  if (periode) {
    conditions.push(`periode=$${n++}`);
    params.push(periode);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `SELECT * FROM practicums ${where} ORDER BY name, periode NULLS LAST`;
  return { sql, params };
}

export async function findAll({ periode } = {}) {
  const { sql, params } = buildListQuery({ periode });
  const res = await registrationDb.query(sql, params);
  return res.rows;
}

export async function findById(id) {
  const res = await registrationDb.query('SELECT * FROM practicums WHERE id=$1', [id]);
  return res.rows[0];
}

export async function findByLaboratory(laboratoryId, { periode } = {}) {
  const { sql, params } = buildListQuery({ laboratoryId, periode });
  const res = await registrationDb.query(sql, params);
  return res.rows;
}

export async function create({ laboratory_id, code, name, description, periode }) {
  const res = await registrationDb.query(
    `INSERT INTO practicums (laboratory_id, code, name, description, periode)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [laboratory_id, code, name, description ?? null, periode]
  );
  return res.rows[0];
}

export async function update(id, { laboratory_id, code, name, description, periode }) {
  const res = await registrationDb.query(
    `UPDATE practicums
     SET laboratory_id=$1, code=$2, name=$3, description=$4, periode=$5, updated_at=now()
     WHERE id=$6 RETURNING *`,
    [laboratory_id, code, name, description ?? null, periode, id]
  );
  return res.rows[0];
}

export async function remove(id) {
  await registrationDb.query('DELETE FROM practicums WHERE id=$1', [id]);
  return true;
}

export async function countModules(practicumId) {
  const res = await registrationDb.query(
    'SELECT COUNT(*)::int AS cnt FROM practicum_modules WHERE practicum_id=$1',
    [practicumId]
  );
  return res.rows[0]?.cnt || 0;
}

export async function countEnrollments(practicumId) {
  const res = await registrationDb.query(
    'SELECT COUNT(*)::int AS cnt FROM practicum_enrollments WHERE practicum_id=$1',
    [practicumId]
  );
  return res.rows[0]?.cnt || 0;
}
