import { registrationDb } from '../../../config/databases.js';

const SLUG_PATTERN = /^[a-z][a-z0-9_]{0,62}$/;

export function isValidCategorySlug(slug) {
  return typeof slug === 'string' && SLUG_PATTERN.test(slug);
}

export async function findAll() {
  const res = await registrationDb.query(
    `SELECT id, slug, label, sort_order, created_at, updated_at
     FROM room_categories
     ORDER BY sort_order ASC, slug ASC`
  );
  return res.rows;
}

export async function findBySlug(slug) {
  const res = await registrationDb.query(
    `SELECT id, slug, label, sort_order, created_at, updated_at
     FROM room_categories
     WHERE slug = $1`,
    [slug]
  );
  return res.rows[0] ?? null;
}

export async function listOptions() {
  const res = await registrationDb.query(
    `SELECT slug AS value, label
     FROM room_categories
     ORDER BY sort_order ASC, slug ASC`
  );
  return res.rows;
}

export async function countModulesUsingSlug(slug) {
  const res = await registrationDb.query(
    `SELECT COUNT(*)::int AS count
     FROM practicum_modules
     WHERE required_room_category::text = $1`,
    [slug]
  );
  return res.rows[0]?.count ?? 0;
}

export async function ensureEnumValue(slug) {
  if (!isValidCategorySlug(slug)) {
    throw new Error('Invalid slug for enum');
  }
  await registrationDb.query(
    `DO $do$
     BEGIN
       IF NOT EXISTS (
         SELECT 1 FROM pg_enum e
         JOIN pg_type t ON t.oid = e.enumtypid
         WHERE t.typname = 'practicum_room_category' AND e.enumlabel = $1
       ) THEN
         EXECUTE format('ALTER TYPE practicum_room_category ADD VALUE %L', $1);
       END IF;
     END
     $do$`,
    [slug]
  );
}

export async function create({ slug, label, sort_order }) {
  const res = await registrationDb.query(
    `INSERT INTO room_categories (slug, label, sort_order, updated_at)
     VALUES ($1, $2, $3, NOW())
     RETURNING id, slug, label, sort_order, created_at, updated_at`,
    [slug, label, sort_order]
  );
  return res.rows[0];
}

export async function update(slug, { label, sort_order }) {
  const fields = [];
  const params = [];
  let idx = 1;

  if (label !== undefined) {
    fields.push(`label = $${idx++}`);
    params.push(label);
  }
  if (sort_order !== undefined) {
    fields.push(`sort_order = $${idx++}`);
    params.push(sort_order);
  }

  if (fields.length === 0) {
    return findBySlug(slug);
  }

  fields.push('updated_at = NOW()');
  params.push(slug);

  const res = await registrationDb.query(
    `UPDATE room_categories
     SET ${fields.join(', ')}
     WHERE slug = $${idx}
     RETURNING id, slug, label, sort_order, created_at, updated_at`,
    params
  );
  return res.rows[0] ?? null;
}

export async function remove(slug) {
  const res = await registrationDb.query(
    `DELETE FROM room_categories WHERE slug = $1 RETURNING slug`,
    [slug]
  );
  return res.rows[0] ?? null;
}
