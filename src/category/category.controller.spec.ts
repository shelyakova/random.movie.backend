import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CategoryController } from './category.controller.js';
import { CategoryService } from './category.service.js';
import type { CategoryDto } from './dto/category.dto.js';
import { User } from '../generated/prisma/client.js';

describe('CategoryController', () => {
  let controller: CategoryController;
  let categoryServiceMock: { getAll: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; edit: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
  const dto: CategoryDto = { name: 'test category' };
  const user: User = { id: 1, createdAt: new Date(), username: 'test', hash: "testhash" };

  beforeEach(() => {
    categoryServiceMock = {
      getAll: vi.fn().mockResolvedValue({ access_token: 'getAll-token' }),
      create: vi.fn().mockResolvedValue({ access_token: 'create-token' }),
      edit: vi.fn().mockResolvedValue({ access_token: 'edit-token' }),
      delete: vi.fn().mockResolvedValue({ access_token: 'delete-token' }),
    };
    controller = new CategoryController(categoryServiceMock as unknown as CategoryService);
  });

  it('delegates getAll to CategoryService and returns its result', async () => {
    const result = await controller.getAll(user);
    expect(categoryServiceMock.getAll).toHaveBeenCalledWith(user.id);
    expect(result).toEqual({ access_token: 'getAll-token' });
  });

  it('delegates create to CategoryService and returns its result', async () => {
    const result = await controller.create(user, dto);
    expect(categoryServiceMock.create).toHaveBeenCalledWith(dto, user.id);
    expect(result).toEqual({ access_token: 'create-token' });
  });

  it('delegates edit to CategoryService and returns its result', async () => {
    const result = await controller.edit(user, dto, 5);
    expect(categoryServiceMock.edit).toHaveBeenCalledWith(dto, 5, user.id);
    expect(result).toEqual({ access_token: 'edit-token' });
  });

  it('delegates delete to CategoryService and returns its result', async () => {
    const result = await controller.delete(user, 5);
    expect(categoryServiceMock.delete).toHaveBeenCalledWith(5, user.id);
    expect(result).toEqual({ access_token: 'delete-token' });
  });
});
