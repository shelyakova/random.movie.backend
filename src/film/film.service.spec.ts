import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FilmService } from './film.service.js';
import type { GetFilmsQueryDto, CreateFilmDto, EditFilmDto } from './dto/film.dto.js';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/client';

describe('FilmService', () => {
  let filmService: FilmService;
  let prismaMock: any;

  const userId = 1;
  const filmId = 5;
  const page = 1;
  const limit = 10;
  const emptyQuery: GetFilmsQueryDto = {};

  beforeEach(() => {
    prismaMock = {
      film: {
        findMany: vi.fn(),
        create: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
    };
    filmService = new FilmService(prismaMock);
  });

  describe('getAll', () => {
    it('returns the films belonging to the user with no filters', async () => {
      const films = [{ id: filmId, name: 'testname', userId, link: "testlink" }];
      prismaMock.film.findMany.mockResolvedValue(films);

      const result = await filmService.getAll(userId, emptyQuery);

      expect(prismaMock.film.findMany).toHaveBeenCalledWith({
        where: { userId },
        include: { categories: true },
        skip: (page - 1) * limit,
        take: limit,
      });
      expect(result).toEqual(films);
    });

    it('applies the isWatched filter to the where clause', async () => {
      const filteredQuery: GetFilmsQueryDto = { isWatched: true };
      prismaMock.film.findMany.mockResolvedValue([]);

      await filmService.getAll(userId, filteredQuery);

      expect(prismaMock.film.findMany).toHaveBeenCalledWith({
        where: { userId, isWatched: true },
        include: { categories: true },
        skip: (page - 1) * limit,
        take: limit,
      });
    });

    it('applies the search filter to the where clause', async () => {
      const filteredQuery: GetFilmsQueryDto = { search: "gray" };
      prismaMock.film.findMany.mockResolvedValue([]);

      await filmService.getAll(userId, filteredQuery);

      expect(prismaMock.film.findMany).toHaveBeenCalledWith({
        where: { userId, name: { contains: "gray", mode: "insensitive" } },
        include: { categories: true },
        skip: (page - 1) * limit,
        take: limit,
      });
    });

    it('applies the categoryIds filter as an AND of some-matches', async () => {
      const filteredQuery: GetFilmsQueryDto = { categoryIds: [1, 3] };
      prismaMock.film.findMany.mockResolvedValue([]);

      await filmService.getAll(userId, filteredQuery);

      expect(prismaMock.film.findMany).toHaveBeenCalledWith({
        where: {
          userId,
          AND: [
            { categories: { some: { id: 1 } } },
            { categories: { some: { id: 3 } } },
          ],
        },
        include: { categories: true },
        skip: (page - 1) * limit,
        take: limit,
      });
    });

    it('applies the page and the limit', async () => {
      const paginatedFilms = [{ id: 1, name: 'testname', userId, link: "testlink" }, { id: 2, name: 'testname', userId, link: "testlink" }];
      const currentPage = 2;
      const currentLimit = 1;
      const paginationQuery: GetFilmsQueryDto = { page: currentPage, limit: currentLimit };
      prismaMock.film.findMany.mockResolvedValue(paginatedFilms);

      const result = await filmService.getAll(userId, paginationQuery);

      expect(prismaMock.film.findMany).toHaveBeenCalledWith({
        where: { userId },
        include: { categories: true },
        skip: (currentPage - 1) * currentLimit,
        take: currentLimit,
      });
      expect(result).toEqual(paginatedFilms);
    });

    it('returns an empty array when the user has no films', async () => {
      prismaMock.film.findMany.mockResolvedValue([]);

      const result = await filmService.getAll(userId, emptyQuery);

      expect(result).toEqual([]);
    });
  });

  describe('getRandom', () => {
    it('returns one of the matching films when no filters are applied', async () => {
      const films = [{ id: 1 }, { id: 2 }, { id: 3 }];
      prismaMock.film.findMany.mockResolvedValue(films);

      const result = await filmService.getRandom(userId);

      expect(prismaMock.film.findMany).toHaveBeenCalledWith({
        where: { userId, isWatched: false },
        select: { id: true },
      });
      expect(films.map((f) => f.id)).toContain(result.id);
    });

    it('applies the search filter to the where clause', async () => {
      const films = [{ id: 1 }];
      prismaMock.film.findMany.mockResolvedValue(films);

      const result = await filmService.getRandom(userId, 'gray');

      expect(prismaMock.film.findMany).toHaveBeenCalledWith({
        where: {
          userId,
          isWatched: false,
          name: { contains: 'gray', mode: 'insensitive' },
        },
        select: { id: true },
      });
      expect(result).toEqual(films[0]);
    });

    it('applies the categoryIds filter as an AND of some-matches', async () => {
      const films = [{ id: 2 }];
      prismaMock.film.findMany.mockResolvedValue(films);

      const result = await filmService.getRandom(userId, undefined, [1, 3]);

      expect(prismaMock.film.findMany).toHaveBeenCalledWith({
        where: {
          userId,
          isWatched: false,
          AND: [
            { categories: { some: { id: 1 } } },
            { categories: { some: { id: 3 } } },
          ],
        },
        select: { id: true },
      });
      expect(result).toEqual(films[0]);
    });

    it('combines search and categoryIds filters together', async () => {
      const films = [{ id: 5 }];
      prismaMock.film.findMany.mockResolvedValue(films);

      await filmService.getRandom(userId, 'star', [2]);

      expect(prismaMock.film.findMany).toHaveBeenCalledWith({
        where: {
          userId,
          isWatched: false,
          name: { contains: 'star', mode: 'insensitive' },
          AND: [{ categories: { some: { id: 2 } } }],
        },
        select: { id: true },
      });
    });

    it('throws NotFoundException when no unwatched films match the filters', async () => {
      prismaMock.film.findMany.mockResolvedValue([]);

      await expect(filmService.getRandom(userId)).rejects.toThrow(NotFoundException);
    });

    it('always filters by isWatched: false regardless of other filters', async () => {
      prismaMock.film.findMany.mockResolvedValue([{ id: 1 }]);

      await filmService.getRandom(userId, 'anything', [7]);

      const callArgs = prismaMock.film.findMany.mock.calls[0][0];
      expect(callArgs.where.isWatched).toBe(false);
    });
  });

  describe('getById', () => {
    it('returns the film by id belonging to the user', async () => {
      const film = { id: filmId, name: 'testname', userId, link: "testlink" };
      prismaMock.film.findFirst.mockResolvedValue(film);

      const result = await filmService.getById(filmId, userId);

      expect(prismaMock.film.findFirst).toHaveBeenCalledWith({
        where: { id: filmId, userId },
        include: { categories: true },
      });
      expect(result).toEqual(film);
    });

    it('throws NotFoundException when the film does not exist for the user', async () => {
      prismaMock.film.findFirst.mockResolvedValue(null);

      await expect(
        filmService.getById(filmId, userId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('creates a film scoped to the user without categories', async () => {
      const createDto: CreateFilmDto = { name: "testname", link: "testlink" };
      const created = { id: filmId, ...createDto, userId };
      prismaMock.film.create.mockResolvedValue(created);

      const result = await filmService.create(createDto, userId);

      expect(prismaMock.film.create).toHaveBeenCalledWith({
        data: { name: 'testname', link: 'testlink', userId, categories: undefined },
        include: { categories: true },
      });
      expect(result).toEqual(created);
    });

    it('connects categories when categoryIds is provided', async () => {
      const createDto: CreateFilmDto = { name: 'testname', link: 'testlink', categoryIds: [1, 2] };
      prismaMock.film.create.mockResolvedValue({ id: filmId, ...createDto, userId });

      await filmService.create(createDto, userId);

      expect(prismaMock.film.create).toHaveBeenCalledWith({
        data: {
          name: 'testname',
          link: 'testlink',
          userId,
          categories: { connect: [{ id: 1 }, { id: 2 }] },
        },
        include: { categories: true },
      });
    });
  });

  describe('edit', () => {
    const editDto: EditFilmDto = { isWatched: true };

    it('updates the film when it exists and belongs to the user', async () => {
      const existing = { id: filmId, name: 'testname', userId, link: "testlink" };
      const updated = { id: filmId, ...editDto, userId };
      prismaMock.film.findFirst.mockResolvedValue(existing);
      prismaMock.film.update.mockResolvedValue(updated);

      const result = await filmService.edit(editDto, filmId, userId);

      expect(prismaMock.film.findFirst).toHaveBeenCalledWith({
        where: { id: filmId, userId },
      });
      expect(prismaMock.film.update).toHaveBeenCalledWith({
        where: { id: filmId },
        data: { isWatched: true, categories: undefined },
        include: { categories: true },
      });
      expect(result).toEqual(updated);
    });

    it('throws NotFoundException when the film does not exist for the user', async () => {
      prismaMock.film.findFirst.mockResolvedValue(null);

      await expect(
        filmService.edit(editDto, filmId, userId),
      ).rejects.toThrow(NotFoundException);
      expect(prismaMock.film.update).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('deletes the film when it exists and belongs to the user', async () => {
      const existing = { id: filmId, name: 'testname', userId, link: "testlink" };
      const deleted = { id: filmId, userId };
      prismaMock.film.findFirst.mockResolvedValue(existing);
      prismaMock.film.delete.mockResolvedValue(deleted);

      const result = await filmService.delete(filmId, userId);

      expect(prismaMock.film.findFirst).toHaveBeenCalledWith({
        where: { id: filmId, userId }
      });
      expect(prismaMock.film.delete).toHaveBeenCalledWith({
        where: { id: filmId },
      });
      expect(result).toEqual(deleted);
    });

    it('throws NotFoundException when the film does not exist for the user', async () => {
      prismaMock.film.findFirst.mockResolvedValue(null);

      await expect(
        filmService.delete(filmId, userId),
      ).rejects.toThrow(NotFoundException);
      expect(prismaMock.film.delete).not.toHaveBeenCalled();
    });
  });
});
