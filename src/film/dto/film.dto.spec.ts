import { describe, it, expect } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateFilmDto, EditFilmDto, UploadPosterFromUrlDto } from './film.dto.js';

describe('CreateFilmDto', () => {
  const nullableFields = ['seasons', 'episodes', 'duration', 'description', 'year', 'mark', 'newSeason', 'latestEpisode'];

  it('passes validation when all nullable fields are explicitly null', async () => {
    const dto = plainToInstance(CreateFilmDto, {
      name: 'testname',
      link: 'https://example.com/testlink',
      seasons: null,
      episodes: null,
      duration: null,
      description: null,
      year: null,
      mark: null,
      newSeason: null,
      latestEpisode: null,
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it.each(nullableFields)('passes validation when %s alone is explicitly null', async (field) => {
    const dto = plainToInstance(CreateFilmDto, {
      name: 'testname',
      link: 'https://example.com/testlink',
      [field]: null,
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });
});

describe('EditFilmDto', () => {
  const nullableFields = ['seasons', 'episodes', 'duration', 'description', 'year', 'mark', 'newSeason', 'latestEpisode'];

  it('passes validation when all nullable fields are explicitly null', async () => {
    const dto = plainToInstance(EditFilmDto, {
      seasons: null,
      episodes: null,
      duration: null,
      description: null,
      year: null,
      mark: null,
      newSeason: null,
      latestEpisode: null,
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it.each(nullableFields)('passes validation when %s alone is explicitly null', async (field) => {
    const dto = plainToInstance(EditFilmDto, { [field]: null });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });
});

describe('UploadPosterFromUrlDto', () => {
  it('passes validation with a valid https URL', async () => {
    const dto = plainToInstance(UploadPosterFromUrlDto, {
      posterUrl: 'https://example.com/poster.png',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('fails validation when posterUrl is missing', async () => {
    const dto = plainToInstance(UploadPosterFromUrlDto, {});

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('posterUrl');
  });

  it('fails validation when posterUrl is not a valid URL', async () => {
    const dto = plainToInstance(UploadPosterFromUrlDto, {
      posterUrl: 'not-a-valid-url',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('posterUrl');
    expect(errors[0].constraints).toHaveProperty('isUrl');
  });
});
