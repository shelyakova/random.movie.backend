import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FilmController } from './film.controller.js';
import { FilmService } from './film.service.js';
import type { GetFilmsQueryDto, CreateFilmDto, EditFilmDto } from './dto/film.dto.js';
import { User } from '../generated/prisma/client.js';

describe('FilmController', () => {
  let controller: FilmController;
  let filmServiceMock: {
    getAll: ReturnType<typeof vi.fn>;
    getById: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    edit: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>
  };
  const user: User = { id: 1, createdAt: new Date(), username: 'test', hash: "testhash" };

  const film = { id: 1, name: 'The Gray Man', link: 'https://example.com', categories: [] };
  const films = [film];

  beforeEach(() => {
    filmServiceMock = {
      getAll: vi.fn().mockResolvedValue(films),
      getById: vi.fn().mockResolvedValue(film),
      create: vi.fn().mockResolvedValue(film),
      edit: vi.fn().mockResolvedValue({ ...film, isWatched: true }),
      delete: vi.fn().mockResolvedValue(film),
    };
    controller = new FilmController(filmServiceMock as unknown as FilmService);
  });

  it('delegates getAll to FilmService and returns its result', async () => {
    const query: GetFilmsQueryDto = {};
    const result = await controller.getAll(user, query);
    expect(filmServiceMock.getAll).toHaveBeenCalledWith(user.id, query);
    expect(result).toEqual(films);
  });

  it('delegates getById to FilmService and returns its result', async () => {
    const result = await controller.getById(user, 1);
    expect(filmServiceMock.getById).toHaveBeenCalledWith(1, user.id);
    expect(result).toEqual(film);
  });

  it('delegates create to FilmService and returns its result', async () => {
    const createDto: CreateFilmDto = { name: "testname", link: "testlink" };
    const result = await controller.create(user, createDto);
    expect(filmServiceMock.create).toHaveBeenCalledWith(createDto, user.id);
    expect(result).toEqual(film);
  });

  it('delegates edit to FilmService and returns its result', async () => {
    const editDto: EditFilmDto = { isWatched: true };
    const result = await controller.edit(user, editDto, 5);
    expect(filmServiceMock.edit).toHaveBeenCalledWith(editDto, 5, user.id);
    expect(result).toEqual({ ...film, isWatched: true });
  });

  it('delegates delete to FilmService and returns its result', async () => {
    const result = await controller.delete(user, 5);
    expect(filmServiceMock.delete).toHaveBeenCalledWith(5, user.id);
    expect(result).toEqual(film);
  });
});