import { describe, it, expect } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UploadPosterFromUrlDto } from './film.dto.js';

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
