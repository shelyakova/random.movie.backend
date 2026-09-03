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
      });
    });

    it('applies the search filter to the where clause', async () => {
      const filteredQuery: GetFilmsQueryDto = { search: "gray" };
      prismaMock.film.findMany.mockResolvedValue([]);

      await filmService.getAll(userId, filteredQuery);

      expect(prismaMock.film.findMany).toHaveBeenCalledWith({
        where: { userId, name: { contains: "gray", mode: "insensitive" } },
        include: { categories: true },
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
      });
    });

    it('returns an empty array when the user has no films', async () => {
      prismaMock.film.findMany.mockResolvedValue([]);

      const result = await filmService.getAll(userId, emptyQuery);

      expect(result).toEqual([]);
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
    it('creates a film scoped to the user without categoriesccccccccc', async () => {
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
