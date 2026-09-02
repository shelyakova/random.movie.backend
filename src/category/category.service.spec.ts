import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CategoryService } from './category.service.js';
import type { CategoryDto } from './dto/category.dto.js';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/client';

describe('CategoryService', () => {
  let categoryService: CategoryService;
  let prismaMock: any;

  const userId = 1;
  const categoryId = 5;
  const dto: CategoryDto = { name: 'test category' };

  beforeEach(() => {
    prismaMock = {
      category: {
        findMany: vi.fn(),
        create: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
    };
    categoryService = new CategoryService(prismaMock);
  });

  describe('getAll', () => {
    it('returns the categories belonging to the user', async () => {
      const categories = [{ id: categoryId, name: 'action', userId }];
      prismaMock.category.findMany.mockResolvedValue(categories);

      const result = await categoryService.getAll(userId);

      expect(prismaMock.category.findMany).toHaveBeenCalledWith({
        where: { userId },
      });
      expect(result).toEqual(categories);
    });

    it('returns an empty array when the user has no categories', async () => {
      prismaMock.category.findMany.mockResolvedValue([]);

      const result = await categoryService.getAll(userId);

      expect(result).toEqual([]);
    });
  });

  describe('create', () => {
    it('creates a category scoped to the user', async () => {
      const created = { id: categoryId, ...dto, userId };
      prismaMock.category.create.mockResolvedValue(created);

      const result = await categoryService.create(dto, userId);

      expect(prismaMock.category.create).toHaveBeenCalledWith({
        data: { ...dto, userId },
      });
      expect(result).toEqual(created);
    });

    it('throws ForbiddenException when the category name already exists', async () => {
      const duplicateError = new PrismaClientKnownRequestError(
        'Unique constraint failed',
        { code: 'P2002', clientVersion: '0.0.0' },
      );
      prismaMock.category.create.mockRejectedValue(duplicateError);

      await expect(categoryService.create(dto, userId)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('edit', () => {
    it('updates the category when it exists and belongs to the user', async () => {
      const existing = { id: categoryId, name: 'old name', userId };
      const updated = { id: categoryId, ...dto, userId };
      prismaMock.category.findFirst.mockResolvedValue(existing);
      prismaMock.category.update.mockResolvedValue(updated);

      const result = await categoryService.edit(dto, categoryId, userId);

      expect(prismaMock.category.findFirst).toHaveBeenCalledWith({
        where: { id: categoryId, userId },
      });
      expect(prismaMock.category.update).toHaveBeenCalledWith({
        where: { id: categoryId },
        data: { ...dto },
      });
      expect(result).toEqual(updated);
    });

    it('throws NotFoundException when the category does not exist for the user', async () => {
      prismaMock.category.findFirst.mockResolvedValue(null);

      await expect(
        categoryService.edit(dto, categoryId, userId),
      ).rejects.toThrow(NotFoundException);
      expect(prismaMock.category.update).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('deletes the category when it exists, belongs to the user, and has no films', async () => {
      const existing = { id: categoryId, name: 'action', userId, films: [] };
      const deleted = { id: categoryId, name: 'action', userId };
      prismaMock.category.findFirst.mockResolvedValue(existing);
      prismaMock.category.delete.mockResolvedValue(deleted);

      const result = await categoryService.delete(categoryId, userId);

      expect(prismaMock.category.findFirst).toHaveBeenCalledWith({
        where: { id: categoryId, userId },
        include: { films: true },
      });
      expect(prismaMock.category.delete).toHaveBeenCalledWith({
        where: { id: categoryId },
      });
      expect(result).toEqual(deleted);
    });

    it('throws NotFoundException when the category does not exist for the user', async () => {
      prismaMock.category.findFirst.mockResolvedValue(null);

      await expect(
        categoryService.delete(categoryId, userId),
      ).rejects.toThrow(NotFoundException);
      expect(prismaMock.category.delete).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when the category has films attached', async () => {
      const existing = {
        id: categoryId,
        name: 'action',
        userId,
        films: [{ id: 1 }],
      };
      prismaMock.category.findFirst.mockResolvedValue(existing);

      await expect(
        categoryService.delete(categoryId, userId),
      ).rejects.toThrow(ForbiddenException);
      expect(prismaMock.category.delete).not.toHaveBeenCalled();
    });
  });
});
