import { describe, it, expect } from 'vitest';
import { mapSearchItem, mapMovieDetails, mapTvDetails, IMAGE_BASE_URL } from './tmdb.mappers.js';
import { TmdbMediaType } from '../types/enums/tmdb-media-type.js';
import type {
  TmdbMultiSearchItem,
  TmdbMovieDetails,
  TmdbTvDetails,
} from './tmdb-reult-types.js';

describe('tmdb mappers', () => {
  describe('mapSearchItem', () => {
    it('maps a movie item using title and release_date', () => {
      const item: TmdbMultiSearchItem = {
        id: 1,
        media_type: TmdbMediaType.Movie,
        title: 'The Gray Man',
        release_date: '2022-07-15',
        poster_path: '/poster.jpg',
      };

      expect(mapSearchItem(item)).toEqual({
        tmdbId: 1,
        type: TmdbMediaType.Movie,
        name: 'The Gray Man',
        year: 2022,
      });
    });

    it('maps a tv item using name and first_air_date', () => {
      const item: TmdbMultiSearchItem = {
        id: 2,
        media_type: TmdbMediaType.Tv,
        name: 'Severance',
        first_air_date: '2022-02-18',
        poster_path: null,
      };

      expect(mapSearchItem(item)).toEqual({
        tmdbId: 2,
        type: TmdbMediaType.Tv,
        name: 'Severance',
        year: 2022,
      });
    });

    it('derives the year from the date', () => {
      const item: TmdbMultiSearchItem = {
        id: 3,
        media_type: TmdbMediaType.Movie,
        title: 'Old Film',
        release_date: '1994-09-23',
        poster_path: null,
      };

      expect(mapSearchItem(item).year).toBe(1994);
    });

    it('returns null for year when the date is missing', () => {
      const item: TmdbMultiSearchItem = {
        id: 4,
        media_type: TmdbMediaType.Movie,
        title: 'Untitled',
        poster_path: null,
      };

      expect(mapSearchItem(item).year).toBeNull();
    });
  });

  describe('mapMovieDetails', () => {
    const base: TmdbMovieDetails = {
      id: 10,
      title: 'The Gray Man',
      overview: 'A CIA agent works to expose corruption within the agency.',
      release_date: '2022-07-15',
      runtime: 129,
      vote_average: 6.9123,
      poster_path: '/poster.jpg',
      genres: [{ id: 28, name: 'Action' }],
    };

    it('correctly maps all fields', () => {
      expect(mapMovieDetails(base)).toEqual({
        tmdbId: 10,
        type: TmdbMediaType.Movie,
        name: 'The Gray Man',
        description: 'A CIA agent works to expose corruption within the agency.',
        year: 2022,
        duration: 129,
        seasons: null,
        episodes: null,
        newSeason: null,
        latestEpisode: null,
        mark: 6.91,
        posterUrl: `${IMAGE_BASE_URL}/poster.jpg`,
      });
    });

    it('sets duration to null when runtime is null', () => {
      const data: TmdbMovieDetails = { ...base, runtime: null };
      expect(mapMovieDetails(data).duration).toBeNull();
    });

    it('sets duration to null when runtime is 0', () => {
      const data: TmdbMovieDetails = { ...base, runtime: 0 };
      expect(mapMovieDetails(data).duration).toBeNull();
    });

    it('rounds mark to 2 decimal places', () => {
      const data: TmdbMovieDetails = { ...base, vote_average: 7.45678 };
      expect(mapMovieDetails(data).mark).toBe(7.46);
    });

    it('always sets seasons, episodes, newSeason and latestEpisode to null', () => {
      const result = mapMovieDetails(base);
      expect(result.seasons).toBeNull();
      expect(result.episodes).toBeNull();
      expect(result.newSeason).toBeNull();
      expect(result.latestEpisode).toBeNull();
    });
  });

  describe('mapTvDetails', () => {
    const base: TmdbTvDetails = {
      id: 20,
      name: 'Severance',
      overview: 'A team of employees at a mysterious company undergo a procedure.',
      first_air_date: '2022-02-18',
      number_of_seasons: 2,
      number_of_episodes: 19,
      episode_run_time: [55],
      vote_average: 8.4321,
      poster_path: '/severance.jpg',
      genres: [{ id: 18, name: 'Drama' }],
      next_episode_to_air: null,
      last_episode_to_air: null,
    };
    const seasonDates = { newSeason: '2025-01-17', latestEpisode: '2025-03-21' };

    it('correctly maps all fields', () => {
      expect(mapTvDetails(base, seasonDates)).toEqual({
        tmdbId: 20,
        type: TmdbMediaType.Tv,
        name: 'Severance',
        description: 'A team of employees at a mysterious company undergo a procedure.',
        year: 2022,
        duration: 55,
        seasons: 2,
        episodes: 19,
        newSeason: '2025-01-17',
        latestEpisode: '2025-03-21',
        mark: 8.43,
        posterUrl: `${IMAGE_BASE_URL}/severance.jpg`,
      });
    });

    it('takes newSeason and latestEpisode from the passed-in seasonDates argument rather than computing them', () => {
      const customSeasonDates = { newSeason: null, latestEpisode: null };
      const result = mapTvDetails(base, customSeasonDates);

      expect(result.newSeason).toBeNull();
      expect(result.latestEpisode).toBeNull();
    });

    it('does not derive newSeason/latestEpisode from next_episode_to_air or last_episode_to_air on the raw data', () => {
      const dataWithEpisodeInfo: TmdbTvDetails = {
        ...base,
        next_episode_to_air: { air_date: '2099-01-01' },
        last_episode_to_air: { air_date: '2020-01-01' },
      };
      const result = mapTvDetails(dataWithEpisodeInfo, seasonDates);

      expect(result.newSeason).toBe(seasonDates.newSeason);
      expect(result.latestEpisode).toBe(seasonDates.latestEpisode);
    });
  });
});
