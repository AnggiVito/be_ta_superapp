import * as roomCategoryService from '../services/roomCategoryService.js';

function handleServiceError(err, res, next) {
  if (err.statusCode) {
    return res.status(err.statusCode).json({ success: false, message: err.message });
  }
  return next(err);
}

export async function list(req, res, next) {
  try {
    const data = await roomCategoryService.listCategories();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getBySlug(req, res, next) {
  try {
    const data = await roomCategoryService.getCategoryBySlug(req.params.slug);
    res.json({ success: true, data });
  } catch (err) {
    handleServiceError(err, res, next);
  }
}

export async function create(req, res, next) {
  try {
    const data = await roomCategoryService.createCategory(req.body);
    res.status(201).json({ success: true, data });
  } catch (err) {
    handleServiceError(err, res, next);
  }
}

export async function update(req, res, next) {
  try {
    const data = await roomCategoryService.updateCategory(req.params.slug, req.body);
    res.json({ success: true, data });
  } catch (err) {
    handleServiceError(err, res, next);
  }
}

export async function remove(req, res, next) {
  try {
    await roomCategoryService.deleteCategory(req.params.slug);
    res.json({ success: true, message: 'Kategori ruangan dihapus' });
  } catch (err) {
    handleServiceError(err, res, next);
  }
}
