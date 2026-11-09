import * as roomCategoryModel from '../models/roomCategoryModel.js';
import {
  REQUIRED_ROOM_CATEGORIES,
  REQUIRED_ROOM_CATEGORY_LABELS,
} from '../constants/roomCategories.js';

const LABEL_MAX = 120;

function badRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

function notFound(message) {
  const err = new Error(message);
  err.statusCode = 404;
  return err;
}

function conflict(message) {
  const err = new Error(message);
  err.statusCode = 409;
  return err;
}

export function normalizeSlug(raw) {
  if (raw === undefined || raw === null) return null;
  const slug = String(raw).trim().toLowerCase();
  if (!slug) return null;
  if (!roomCategoryModel.isValidCategorySlug(slug)) {
    throw badRequest(
      'slug harus snake_case: huruf kecil, angka, underscore; diawali huruf (contoh: lab_komputer)'
    );
  }
  return slug;
}

export function normalizeLabel(raw, { required = false } = {}) {
  if (raw === undefined || raw === null) {
    if (required) throw badRequest('label wajib diisi');
    return null;
  }
  const label = String(raw).trim();
  if (!label) {
    if (required) throw badRequest('label wajib diisi');
    return null;
  }
  if (label.length > LABEL_MAX) {
    throw badRequest(`label maksimal ${LABEL_MAX} karakter`);
  }
  return label;
}

export function normalizeSortOrder(raw, fallback = 0) {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 32767) {
    throw badRequest('sort_order harus bilangan bulat antara 0 dan 32767');
  }
  return n;
}

export async function listCategories() {
  const rows = await roomCategoryModel.findAll();
  if (rows.length > 0) return rows;
  return REQUIRED_ROOM_CATEGORIES.map((slug, index) => ({
    slug,
    label: REQUIRED_ROOM_CATEGORY_LABELS[slug] ?? slug,
    sort_order: index + 1,
  }));
}

export async function getCategoryBySlug(slug) {
  const row = await roomCategoryModel.findBySlug(slug);
  if (!row) throw notFound('Kategori ruangan tidak ditemukan');
  return row;
}

export async function listRequiredRoomCategoryOptions() {
  const rows = await roomCategoryModel.listOptions();
  if (rows.length > 0) {
    return rows.map((row) => ({ value: row.value, label: row.label }));
  }
  return REQUIRED_ROOM_CATEGORIES.map((value) => ({
    value,
    label: REQUIRED_ROOM_CATEGORY_LABELS[value] ?? value,
  }));
}

export async function getValidCategorySlugs() {
  const rows = await roomCategoryModel.findAll();
  if (rows.length > 0) {
    return rows.map((row) => row.slug);
  }
  return [...REQUIRED_ROOM_CATEGORIES];
}

export async function validateRequiredRoomCategory(value, { required = false } = {}) {
  const validSlugs = await getValidCategorySlugs();
  const choices = validSlugs.join(', ');

  if (value === undefined || value === null || value === '') {
    if (required) {
      return {
        ok: false,
        message: `required_room_category wajib diisi. Pilihan: ${choices}`,
      };
    }
    return { ok: true };
  }

  const slug = String(value).trim();
  if (!validSlugs.includes(slug)) {
    return {
      ok: false,
      message: `required_room_category tidak valid. Pilihan: ${choices}`,
    };
  }

  return { ok: true, value: slug };
}

export async function createCategory(payload) {
  const slug = normalizeSlug(payload?.slug);
  if (!slug) throw badRequest('slug wajib diisi');

  const label = normalizeLabel(payload?.label, { required: true });
  const sort_order = normalizeSortOrder(payload?.sort_order, 0);

  const existing = await roomCategoryModel.findBySlug(slug);
  if (existing) {
    throw conflict(`Kategori dengan slug "${slug}" sudah ada`);
  }

  await roomCategoryModel.ensureEnumValue(slug);

  try {
    return await roomCategoryModel.create({ slug, label, sort_order });
  } catch (error) {
    if (error.code === '23505') {
      throw conflict(`Kategori dengan slug "${slug}" sudah ada`);
    }
    throw error;
  }
}

export async function updateCategory(slugParam, payload) {
  const slug = normalizeSlug(slugParam);
  if (!slug) throw badRequest('slug path tidak valid');

  const existing = await roomCategoryModel.findBySlug(slug);
  if (!existing) throw notFound('Kategori ruangan tidak ditemukan');

  const updates = {};
  if (payload?.label !== undefined) {
    updates.label = normalizeLabel(payload.label, { required: true });
  }
  if (payload?.sort_order !== undefined) {
    updates.sort_order = normalizeSortOrder(payload.sort_order);
  }

  if (updates.label === undefined && updates.sort_order === undefined) {
    throw badRequest('Minimal satu field (label atau sort_order) harus dikirim');
  }

  const updated = await roomCategoryModel.update(slug, updates);
  return updated;
}

export async function deleteCategory(slugParam) {
  const slug = normalizeSlug(slugParam);
  if (!slug) throw badRequest('slug path tidak valid');

  const existing = await roomCategoryModel.findBySlug(slug);
  if (!existing) throw notFound('Kategori ruangan tidak ditemukan');

  const usageCount = await roomCategoryModel.countModulesUsingSlug(slug);
  if (usageCount > 0) {
    throw conflict(
      `Kategori "${slug}" masih dipakai oleh ${usageCount} modul praktikum dan tidak dapat dihapus`
    );
  }

  const deleted = await roomCategoryModel.remove(slug);
  return deleted;
}
