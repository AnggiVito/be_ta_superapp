import { describe, test, expect, jest, beforeEach } from '@jest/globals';

jest.unstable_mockModule('../models/roomCategoryModel.js', () => ({
  findAll: jest.fn(),
  findBySlug: jest.fn(),
  listOptions: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  countModulesUsingSlug: jest.fn(),
  ensureEnumValue: jest.fn(),
  isValidCategorySlug: jest.fn((slug) => /^[a-z][a-z0-9_]{0,62}$/.test(slug)),
}));

const roomCategoryModel = await import('../models/roomCategoryModel.js');
const {
  normalizeSlug,
  normalizeLabel,
  validateRequiredRoomCategory,
  createCategory,
  updateCategory,
  deleteCategory,
} = await import('../services/roomCategoryService.js');

describe('roomCategoryService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('normalizeSlug', () => {
    test('accepts valid snake_case', () => {
      expect(normalizeSlug('Lab_Komputer')).toBe('lab_komputer');
    });

    test('rejects invalid slug', () => {
      expect(() => normalizeSlug('Lab Komputer')).toThrow(/snake_case/);
    });
  });

  describe('validateRequiredRoomCategory', () => {
    test('accepts slug from database', async () => {
      roomCategoryModel.findAll.mockResolvedValue([
        { slug: 'classroom', label: 'Classroom' },
        { slug: 'lab_komputer', label: 'Lab Komputer' },
      ]);

      const result = await validateRequiredRoomCategory('lab_komputer', { required: true });
      expect(result).toEqual({ ok: true, value: 'lab_komputer' });
    });
  });

  describe('createCategory', () => {
    test('creates category and ensures enum', async () => {
      roomCategoryModel.findBySlug.mockResolvedValue(null);
      roomCategoryModel.create.mockResolvedValue({
        slug: 'lab_custom',
        label: 'Lab Custom',
        sort_order: 10,
      });

      const row = await createCategory({
        slug: 'lab_custom',
        label: 'Lab Custom',
        sort_order: 10,
      });

      expect(roomCategoryModel.ensureEnumValue).toHaveBeenCalledWith('lab_custom');
      expect(row.slug).toBe('lab_custom');
    });
  });

  describe('updateCategory', () => {
    test('updates label', async () => {
      roomCategoryModel.findBySlug.mockResolvedValue({ slug: 'classroom', label: 'Kelas' });
      roomCategoryModel.update.mockResolvedValue({ slug: 'classroom', label: 'Classroom' });

      const row = await updateCategory('classroom', { label: 'Classroom' });
      expect(row.label).toBe('Classroom');
    });
  });

  describe('deleteCategory', () => {
    test('blocks delete when modules still use slug', async () => {
      roomCategoryModel.findBySlug.mockResolvedValue({ slug: 'lab_komputer' });
      roomCategoryModel.countModulesUsingSlug.mockResolvedValue(2);

      await expect(deleteCategory('lab_komputer')).rejects.toMatchObject({
        statusCode: 409,
      });
    });
  });
});
