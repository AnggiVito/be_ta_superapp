import * as svc from '../services/inventoryCategoryService.js';
import { logger } from '../../../core/utils/logger.js';
import fs from 'fs';
import path from 'path';

export async function listCategories(req, res) {
  try {
    const rows = await svc.listCategories();
    // Log for debugging frontend behavior: count and sample rows
    try {
      logger.info('inventory/categories -> rows_count=%d sample=%j', rows.length || 0, (rows || []).slice(0, 3));
      // Also write a small JSON file so it can be inspected directly from the host
      try {
        const out = { ts: new Date().toISOString(), rows };
        const p = path.resolve(process.cwd(), 'logs', 'categories_latest.json');
        fs.writeFileSync(p, JSON.stringify(out, null, 2));
      } catch (wf) {
        // ignore file write errors
      }
    } catch (e) {}
    return res.json({ success: true, data: rows });
  } catch (e) {
    console.error('listCategories error', e);
    return res.status(500).json({ success: false, message: e.message || 'Internal error' });
  }
}

export async function createCategory(req, res) {
  try {
    const { name, unit, description } = req.body || {};
    if (!name || String(name).trim() === '') return res.status(400).json({ success: false, message: 'name is required' });
    if (!unit || String(unit).trim() === '') return res.status(400).json({ success: false, message: 'unit is required' });
    const row = await svc.createCategory({ name: String(name).trim(), unit: String(unit).trim(), description });
    try { logger.info('inventory/categories POST -> created=%j', row); } catch (e) {}
    return res.json({ success: true, data: row });
  } catch (e) {
    // Detect duplicate name (Postgres unique_violation)
    try { logger.error('createCategory error', e); } catch (err) {}
    if (e && e.code === '23505') {
      return res.status(409).json({ success: false, message: 'Category already exists' });
    }
    return res.status(500).json({ success: false, message: e.message || 'Internal error' });
  }
}

export async function deleteCategory(req, res) {
  try {
    const id = req.params.id;
    const row = await svc.deleteCategory(id);
    if (!row) return res.status(404).json({ success: false, message: 'Not found' });
    return res.json({ success: true, data: row });
  } catch (e) {
    console.error('deleteCategory error', e);
    return res.status(500).json({ success: false, message: e.message || 'Internal error' });
  }
}
