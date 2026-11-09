import * as Model from '../models/laboratoryModel.js';
import * as PracticumModel from '../models/practicumModel.js';

export async function list(req, res, next) {
  try {
    const { study_program_id } = req.query;
    let rows;
    if (study_program_id) rows = await Model.findByStudyProgram(study_program_id);
    else rows = await Model.findAll();
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
}

export async function getById(req, res, next) {
  try {
    const { id } = req.params;
    const row = await Model.findById(id);
    if (!row) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: row });
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const payload = req.body;
    // Basic validation
    if (!payload || !payload.study_program_id || !payload.code || !payload.name) {
      return res.status(400).json({ success: false, message: 'study_program_id, code and name are required' });
    }
    const created = await Model.create(payload);
    res.status(201).json({ success: true, data: created });
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const { id } = req.params;
    const payload = req.body;
    const updated = await Model.update(id, payload);
    if (!updated) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    const { id } = req.params;
    const existing = await Model.findById(id);
    if (!existing) return res.status(404).json({ success: false, message: 'Not found' });

    const practicumCount = await Model.countPracticums(id);
    if (practicumCount > 0) {
      return res.status(400).json({ success: false, message: 'Cannot delete laboratory: it has practicums' });
    }

    await Model.remove(id);
    res.json({ success: true, message: 'Deleted' });
  } catch (err) {
    next(err);
  }
}
