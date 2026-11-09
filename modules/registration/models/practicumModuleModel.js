import { registrationDb } from '../../../config/databases.js';

export async function findAll() {
  const res = await registrationDb.query('SELECT * FROM practicum_modules ORDER BY name');
  return res.rows;
}

export async function findById(id) {
  const res = await registrationDb.query('SELECT * FROM practicum_modules WHERE id=$1', [id]);
  return res.rows[0];
}

export async function findByPracticum(practicumId) {
  const res = await registrationDb.query(
    `SELECT * FROM practicum_modules
     WHERE practicum_id=$1
     ORDER BY sequence ASC, week_number ASC NULLS LAST, name ASC`,
    [practicumId]
  );
  return res.rows;
}

export async function create({
  practicum_id,
  code,
  name,
  description,
  is_individual_mentoring,
  mentoring_duration_minutes,
  required_room_category,
  week_number,
}) {
  const res = await registrationDb.query(
    `INSERT INTO practicum_modules (
      practicum_id, code, name, description,
      is_individual_mentoring, mentoring_duration_minutes, required_room_category,
      week_number
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [
      practicum_id,
      code,
      name,
      description,
      is_individual_mentoring || false,
      mentoring_duration_minutes || null,
      required_room_category,
      week_number,
    ]
  );
  return res.rows[0];
}

export async function update(id, {
  practicum_id,
  code,
  name,
  description,
  is_individual_mentoring,
  mentoring_duration_minutes,
  required_room_category,
  week_number,
}) {
  const updateFields = [];
  const params = [];
  let paramIndex = 1;
  
  if (practicum_id !== undefined) {
    updateFields.push(`practicum_id = $${paramIndex++}`);
    params.push(practicum_id);
  }
  if (code !== undefined) {
    updateFields.push(`code = $${paramIndex++}`);
    params.push(code);
  }
  if (name !== undefined) {
    updateFields.push(`name = $${paramIndex++}`);
    params.push(name);
  }
  if (description !== undefined) {
    updateFields.push(`description = $${paramIndex++}`);
    params.push(description);
  }
  if (is_individual_mentoring !== undefined) {
    updateFields.push(`is_individual_mentoring = $${paramIndex++}`);
    params.push(is_individual_mentoring);
  }
  if (mentoring_duration_minutes !== undefined) {
    updateFields.push(`mentoring_duration_minutes = $${paramIndex++}`);
    params.push(mentoring_duration_minutes);
  }
  if (required_room_category !== undefined) {
    updateFields.push(`required_room_category = $${paramIndex++}`);
    params.push(required_room_category);
  }
  if (week_number !== undefined) {
    updateFields.push(`week_number = $${paramIndex++}`);
    params.push(week_number);
  }

  if (updateFields.length === 0) {
    return await findById(id);
  }
  
  updateFields.push(`updated_at = now()`);
  params.push(id);
  
  const res = await registrationDb.query(
    `UPDATE practicum_modules SET ${updateFields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    params
  );
  return res.rows[0];
}

export async function remove(id) {
  await registrationDb.query('DELETE FROM practicum_modules WHERE id=$1', [id]);
  return true;
}
