import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TmdbService } from './tmdb.service.js';
import { mapSearchItem, mapMovieDetails, mapTvDetails } from './tmdb.mappers.js';
import { TmdbMediaType } from '../types/enums/tmdb-media-type.js';
import { HttpException, NotFoundException } from '@nestjs/common';
import type {
  TmdbMultiSearchItem,
  TmdbMovieDetails,
  TmdbTvDetails,
  TmdbSeasonDetails,
} from './tmdb-reult-types.js';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function brokenJsonResponse(status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      throw new Error('invalid json');
    },
  } as Response;
}

describe('TmdbService', () => {
  let service: TmdbService;
  let fetchMock: ReturnType<typeof vi.fn>;

  const baseUrl = process.env.TMDB_BASE_URL ?? 'https://api.themoviedb.org/3';
  const apiKey = process.env.TMDB_API_ACESS_TOKEN;

  beforeEach(() => {
    service = new TmdbService();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('search', () => {
    const movieItem: TmdbMultiSearchItem = {
      id: 1,
      media_type: TmdbMediaType.Movie,
      title: 'The Gray Man',
      release_date: '2022-07-15',
      poster_path: '/poster.jpg',
    };
    const tvItem: TmdbMultiSearchItem = {
      id: 2,
      media_type: TmdbMediaType.Tv,
      name: 'Severance',
      first_air_date: '2022-02-18',
      poster_path: null,
    };
    const personItem = {
      id: 3,
      media_type: 'person',
      name: 'Some Actor',
      poster_path: null,
    } as unknown as TmdbMultiSearchItem;

    it('calls fetch with the correct URL and Authorization header, filters out persons and maps the rest', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(200, { results: [movieItem, tvItem, personItem] }),
      );

      const query = 'the gray man';
      const result = await service.search(query);

      expect(fetchMock).toHaveBeenCalledWith(
        `${baseUrl}/search/multi?query=${encodeURIComponent(query)}&include_adult=false`,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            accept: 'application/json',
          },
        },
      );
      expect(result).toEqual([mapSearchItem(movieItem), mapSearchItem(tvItem)]);
    });

    it('encodes special characters in the query', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(200, { results: [] }));

      await service.search('rick & morty');

      expect(fetchMock).toHaveBeenCalledWith(
        `${baseUrl}/search/multi?query=${encodeURIComponent('rick & morty')}&include_adult=false`,
        expect.anything(),
      );
    });
  });

  describe('getDetails', () => {
    it('type "movie": calls fetch only once and maps through mapMovieDetails', async () => {
      const movieDetails: TmdbMovieDetails = {
        id: 55,
        title: 'The Gray Man',
        overview: 'overview',
        release_date: '2022-07-15',
        runtime: 129,
        vote_average: 6.9,
        poster_path: '/poster.jpg',
        genres: [],
      };
      fetchMock.mockResolvedValueOnce(jsonResponse(200, movieDetails));

      const result = await service.getDetails(TmdbMediaType.Movie, 55);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(`${baseUrl}/movie/55`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          accept: 'application/json',
        },
      });
      expect(result).toEqual(mapMovieDetails(movieDetails));
    });

    it('type "tv", finished season: fetches the season and populates latestEpisode', async () => {
      const tvDetails: TmdbTvDetails = {
        id: 77,
        name: 'Severance',
        overview: 'overview',
        first_air_date: '2022-02-18',
        number_of_seasons: 2,
        number_of_episodes: 19,
        episode_run_time: [55],
        vote_average: 8.4,
        poster_path: '/severance.jpg',
        genres: [],
        next_episode_to_air: null,
        last_episode_to_air: null,
      };
      const season: TmdbSeasonDetails = {
        episodes: [
          { episode_number: 1, air_date: '2024-01-01' },
          { episode_number: 2, air_date: '2024-01-08' },
        ],
      };
      fetchMock
        .mockResolvedValueOnce(jsonResponse(200, tvDetails))
        .mockResolvedValueOnce(jsonResponse(200, season));

      const result = await service.getDetails(TmdbMediaType.Tv, 77);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock).toHaveBeenNthCalledWith(1, `${baseUrl}/tv/77`, expect.anything());
      expect(fetchMock).toHaveBeenNthCalledWith(2, `${baseUrl}/tv/77/season/2`, expect.anything());
      expect(result).toEqual(
        mapTvDetails(tvDetails, { newSeason: '2024-01-01', latestEpisode: '2024-01-08' }),
      );
      expect(result.latestEpisode).toBe('2024-01-08');
    });

    it('type "tv", last episode of the season is in the future: latestEpisode is null, newSeason is the first episode date', async () => {
      const tvDetails: TmdbTvDetails = {
        id: 78,
        name: 'Upcoming Show',
        overview: 'overview',
        first_air_date: '2023-01-01',
        number_of_seasons: 3,
        number_of_episodes: 10,
        episode_run_time: [45],
        vote_average: 7.1,
        poster_path: null,
        genres: [],
        next_episode_to_air: null,
        last_episode_to_air: null,
      };
      const season: TmdbSeasonDetails = {
        episodes: [
          { episode_number: 1, air_date: '2024-05-01' },
          { episode_number: 2, air_date: '2099-01-01' },
        ],
      };
      fetchMock
        .mockResolvedValueOnce(jsonResponse(200, tvDetails))
        .mockResolvedValueOnce(jsonResponse(200, season));

      const result = await service.getDetails(TmdbMediaType.Tv, 78);

      expect(result.latestEpisode).toBeNull();
      expect(result.newSeason).toBe('2024-05-01');
    });

    it('type "tv", season episodes have no air_date: falls back to next_episode_to_air.air_date for newSeason', async () => {
      const tvDetails: TmdbTvDetails = {
        id: 79,
        name: 'Dateless Season Show',
        overview: 'overview',
        first_air_date: '2023-01-01',
        number_of_seasons: 1,
        number_of_episodes: 5,
        episode_run_time: [30],
        vote_average: 6.5,
        poster_path: null,
        genres: [],
        next_episode_to_air: { air_date: '2025-09-01' },
        last_episode_to_air: null,
      };
      const season: TmdbSeasonDetails = {
        episodes: [
          { episode_number: 1, air_date: null },
          { episode_number: 2, air_date: null },
        ],
      };
      fetchMock
        .mockResolvedValueOnce(jsonResponse(200, tvDetails))
        .mockResolvedValueOnce(jsonResponse(200, season));

      const result = await service.getDetails(TmdbMediaType.Tv, 79);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(result.newSeason).toBe('2025-09-01');
      expect(result.latestEpisode).toBeNull();
    });

    it('type "tv", number_of_seasons is null: does not request a season and falls back to next_episode_to_air immediately', async () => {
      const tvDetails: TmdbTvDetails = {
        id: 80,
        name: 'No Seasons Yet Show',
        overview: 'overview',
        first_air_date: null,
        number_of_seasons: null,
        number_of_episodes: null,
        episode_run_time: [],
        vote_average: null,
        poster_path: null,
        genres: [],
        next_episode_to_air: { air_date: '2025-11-01' },
        last_episode_to_air: null,
      };
      fetchMock.mockResolvedValueOnce(jsonResponse(200, tvDetails));

      const result = await service.getDetails(TmdbMediaType.Tv, 80);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result.newSeason).toBe('2025-11-01');
      expect(result.latestEpisode).toBeNull();
    });

    it('type "tv", number_of_seasons is 0: does not request a season and falls back to next_episode_to_air immediately', async () => {
      const tvDetails: TmdbTvDetails = {
        id: 81,
        name: 'Zero Seasons Show',
        overview: 'overview',
        first_air_date: null,
        number_of_seasons: 0,
        number_of_episodes: 0,
        episode_run_time: [],
        vote_average: null,
        poster_path: null,
        genres: [],
        next_episode_to_air: { air_date: '2025-12-25' },
        last_episode_to_air: null,
      };
      fetchMock.mockResolvedValueOnce(jsonResponse(200, tvDetails));

      const result = await service.getDetails(TmdbMediaType.Tv, 81);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result.newSeason).toBe('2025-12-25');
      expect(result.latestEpisode).toBeNull();
    });
  });

  describe('fetchTmdb error handling (via search/getDetails)', () => {
    it('throws NotFoundException when the response status is 404', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(404, {}));

      await expect(service.getDetails(TmdbMediaType.Movie, 999)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws an HttpException with the TMDB status_message and matching status when the response is not ok', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(401, { status_message: 'Invalid API key: You must be granted a valid key.', status_code: 7 }),
      );

      const error = await service.search('anything').catch((e) => e);

      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).message).toBe('Invalid API key: You must be granted a valid key.');
      expect((error as HttpException).getStatus()).toBe(401);
    });

    it('throws an HttpException with the default message when the error body is not valid JSON', async () => {
      fetchMock.mockResolvedValueOnce(brokenJsonResponse(500));

      const error = await service.search('anything').catch((e) => e);

      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).message).toBe('Failed to fetch data from TMDB');
      expect((error as HttpException).getStatus()).toBe(500);
    });
  });
});
