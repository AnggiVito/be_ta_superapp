import { registrationDb } from '../../../config/databases.js';

// Return basic list of study programs (id, name)
export async function listStudyPrograms(req, res) {
  try {
    const q = 'SELECT id, name FROM study_programs ORDER BY name';
    const { rows } = await registrationDb.query(q);
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('listStudyPrograms error', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch study programs' });
  }
}

// Return basic list of laboratories (id, name)
export async function listLaboratories(req, res) {
  try {
    const q = 'SELECT id, name FROM laboratories ORDER BY name';
    const { rows } = await registrationDb.query(q);
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('listLaboratories error', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch laboratories' });
  }
}

export default { listStudyPrograms, listLaboratories };
