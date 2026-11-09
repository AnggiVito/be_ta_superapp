import { procurementDb } from '../../../config/databases.js';

export async function listCategories() {
  const { rows } = await procurementDb.query('SELECT id, name, unit, description, created_at, updated_at FROM procurement_inventory_categories ORDER BY name');
  return rows;
}

export async function createCategory({ name, unit = null, description = null }) {
  const { rows } = await procurementDb.query(
    'INSERT INTO procurement_inventory_categories (name, unit, description, created_at, updated_at) VALUES ($1,$2,$3, now(), now()) RETURNING *',
    [name, unit, description],
  );
  return rows[0];
}

export async function deleteCategory(id) {
  // return deleted row (if exists)
  const { rows } = await procurementDb.query('DELETE FROM procurement_inventory_categories WHERE id = $1 RETURNING *', [id]);
  return rows[0] || null;
}
