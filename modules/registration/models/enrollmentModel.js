import { registrationDb } from '../../../config/databases.js';
import { logger } from '../../../core/utils/logger.js';

/**
 * Practicum Enrollment Model
 * Mengelola operasi pada tabel `practicum_enrollments`
 */

export async function create({
  practicum_id,
  student_id,
  role = 'mahasiswa',
  status = 'enrolled',
  class_group = null,
}) {
  try {
    const res = await registrationDb.query(
      `INSERT INTO practicum_enrollments (practicum_id, student_id, role, status, class_group)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [practicum_id, student_id, role, status, class_group]
    );
    return res.rows[0];
  } catch (error) {
    logger.error('Error creating practicum enrollment:', error);
    throw error;
  }
}

export async function deleteStudentEnrollmentsByPracticum(practicumId, client = registrationDb) {
  try {
    const res = await client.query(
      `DELETE FROM practicum_enrollments
       WHERE practicum_id = $1 AND role IN ('mahasiswa', 'student')`,
      [practicumId]
    );
    return res.rowCount;
  } catch (error) {
    logger.error('Error deleting student enrollments by practicum:', error);
    throw error;
  }
}

export async function findByStudent(studentId) {
  try {
    const res = await registrationDb.query(
      'SELECT * FROM practicum_enrollments WHERE student_id = $1 ORDER BY created_at DESC',
      [studentId]
    );
    return res.rows;
  } catch (error) {
    logger.error('Error finding enrollments by student:', error);
    throw error;
  }
}

export async function findByStudentAndPracticum(studentId, practicumId) {
  try {
    const res = await registrationDb.query(
      'SELECT * FROM practicum_enrollments WHERE student_id = $1 AND practicum_id = $2',
      [studentId, practicumId]
    );
    return res.rows[0] || null;
  } catch (error) {
    logger.error('Error finding enrollment by student and practicum:', error);
    throw error;
  }
}

export async function findById(id) {
  try {
    const res = await registrationDb.query('SELECT * FROM practicum_enrollments WHERE id = $1', [id]);
    return res.rows[0] || null;
  } catch (error) {
    logger.error('Error finding enrollment by id:', error);
    throw error;
  }
}

export async function findByPracticum(practicumId) {
  try {
    const res = await registrationDb.query(
      'SELECT * FROM practicum_enrollments WHERE practicum_id = $1 ORDER BY created_at DESC',
      [practicumId]
    );
    return res.rows;
  } catch (error) {
    logger.error('Error finding enrollments by practicum:', error);
    throw error;
  }
}

export async function remove(id) {
  try {
    await registrationDb.query('DELETE FROM practicum_enrollments WHERE id = $1', [id]);
    return true;
  } catch (error) {
    logger.error('Error removing enrollment:', error);
    throw error;
  }
}
